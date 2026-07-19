"""AI-driven outbound discovery.

Uses OpenAI to turn the fund thesis (+ optional brief) into GitHub search
queries, runs the LIVE GitHub Search API to find real candidate builders, then
syncs + scores each against the thesis and returns a ranked shortlist — so the
investor reviews a curated list instead of searching founder-by-founder.

Honest about scope: it searches the connected source (GitHub), surfaces a top-N
batch per run (GitHub Search rate limits), and never claims to scan the whole
internet. Nothing is auto-contacted.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import services as ai
from app.ai.provider import AIError
from app.connectors.github import GitHubConnector
from app.models.assessment import Opportunity
from app.models.core import InvestmentThesis
from app.models.entities import Founder
from app.models.enums import EntryType, OpportunityStatus, WorkflowStage
from app.models.workflow import WorkflowEvent
from app.services.founder import latest_founder_score
from app.services.github_sync import sync_github_user

_LANG_HINTS = {
    "fintech": "Python", "ai/ml": "Python", "devtools": "Go", "security": "Rust",
    "data": "Python", "infrastructure": "Go", "healthcare": "TypeScript",
}


def _thesis_query_plan(thesis: InvestmentThesis | None, brief: str) -> dict:
    """Deterministic GitHub-query builder from the thesis (no AI needed).

    This is search-query construction from thesis fields — not invented content.
    """
    recent = (datetime.now(UTC) - timedelta(days=180)).strftime("%Y-%m-%d")
    sectors = (thesis.sectors if thesis else []) or ["developer tools"]
    geos = (thesis.geographies if thesis else []) or []
    repo_queries: list[str] = []
    for s in sectors[:3]:
        lang = _LANG_HINTS.get(s.lower(), "Python")
        kw = s.lower().replace("/", " ")
        repo_queries.append(f"{kw} language:{lang} pushed:>{recent} stars:>5")
    user_queries: list[str] = []
    for g in geos[:2]:
        user_queries.append(f"location:{g} language:Python repos:>3")
    if brief.strip():
        repo_queries.insert(0, f"{brief.strip()[:60]} pushed:>{recent}")
    return {
        "repo_queries": repo_queries[:4],
        "user_queries": user_queries[:2],
        "interpretation": "Queries built deterministically from your thesis (AI planner unavailable).",
        "planned_by": "thesis",
    }


def _get_or_create_founder(db: Session, login: str) -> tuple[Founder, bool]:
    existing = db.scalar(select(Founder).where(Founder.github_username == login))
    if existing:
        return existing, False
    f = Founder(
        full_name=login, normalized_name=login.lower(), github_username=login,
        headline=f"GitHub @{login}", is_demo=False,
    )
    db.add(f)
    db.flush()
    return f, True


async def run_ai_discovery(
    db: Session, fund_id: int, brief: str = "", limit: int = 8
) -> dict:
    thesis = db.scalar(
        select(InvestmentThesis)
        .where(InvestmentThesis.fund_id == fund_id, InvestmentThesis.is_active == True)  # noqa: E712
        .order_by(InvestmentThesis.id.desc())
    )
    thesis_dict = (
        {
            "fund_name": thesis.fund_name, "sectors": thesis.sectors, "stages": thesis.stages,
            "geographies": thesis.geographies, "founder_preferences": thesis.founder_preferences,
        }
        if thesis else {}
    )

    # 1. plan the search (AI when available, else deterministic from thesis)
    try:
        plan = ai.plan_github_search(thesis_dict, brief)
    except AIError:
        plan = _thesis_query_plan(thesis, brief)

    connector = GitHubConnector()
    notes: list[str] = []
    logins: list[str] = []
    queries_run: list[str] = []
    rate_remaining: int | None = None

    async def run(qs: list[str], kind: str) -> bool:
        nonlocal rate_remaining
        for q in qs:
            status, found, rem = await connector.search_logins(q, kind=kind)
            rate_remaining = rem if rem is not None else rate_remaining
            queries_run.append(f"{kind}: {q}")
            if status == "rate_limited":
                notes.append("GitHub Search rate limit reached — showing partial results.")
                return False
            if status.startswith("error"):
                notes.append(f"A search query failed ({kind}).")
                continue
            logins.extend(found)
        return True

    ok = await run(plan.get("repo_queries", [])[:3], "repositories")
    if ok:
        await run(plan.get("user_queries", [])[:2], "users")

    # dedupe, preserve order, drop ones already in the pipeline
    seen: set[str] = set()
    existing_gh = {
        f.github_username for f in db.scalars(
            select(Founder).where(Founder.github_username.isnot(None))
        ).all() if f.github_username
    }
    unique: list[str] = []
    for lg in logins:
        key = lg.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(lg)

    # 2. sync + score the top candidates against the thesis
    prospects: list[dict] = []
    for login in unique:
        if len(prospects) >= limit:
            break
        founder, _created = _get_or_create_founder(db, login)
        already = login in existing_gh
        sync = await sync_github_user(db, founder.id, login, thesis, light=True)
        if sync["status"] == "rate_limited":
            notes.append("GitHub rate limit reached while syncing — stopping early.")
            break
        if sync["status"] in ("not_found", "error"):
            continue

        fs = latest_founder_score(db, founder.id)
        opp = db.scalar(select(Opportunity).where(Opportunity.founder_id == founder.id))
        if not opp:
            opp = Opportunity(
                fund_id=fund_id, founder_id=founder.id, entry_type=EntryType.OUTBOUND,
                stage=WorkflowStage.SOURCING, status=OpportunityStatus.PROSPECT,
                first_signal_at=datetime.now(UTC), thesis_fit_score=0.0,
                surfaced_reason=(
                    f"AI Discovery: matched your thesis via public GitHub search. "
                    f"Founder Score {fs.score if fs else 0:.0f}."
                ),
                is_demo=False,
            )
            db.add(opp)
            db.flush()
            db.add(WorkflowEvent(
                opportunity_id=opp.id, event_type="ai_discovery_sourced",
                detail=f"@{login}", occurred_at=datetime.now(UTC),
            ))
        prospects.append({
            "opportunity_id": opp.id,
            "founder_id": founder.id,
            "login": login,
            "name": founder.full_name,
            "github_url": f"https://github.com/{login}",
            "founder_score": round(fs.score, 1) if fs else 0.0,
            "confidence": round(fs.confidence, 2) if fs else 0.0,
            "evidence_added": sync.get("evidence_added", 0),
            "already_in_pipeline": already,
        })

    prospects.sort(key=lambda p: p["founder_score"], reverse=True)
    db.commit()

    return {
        "planned_by": plan.get("planned_by"),
        "interpretation": plan.get("interpretation", ""),
        "queries_run": queries_run,
        "candidates_found": len(unique),
        "prospects": prospects,
        "searched_sources": ["GitHub (live public Search API)"],
        "rate_limit_remaining": rate_remaining,
        "notes": notes,
        "disclaimer": (
            "AI Discovery searches your connected source (GitHub) — not the entire internet. "
            "It surfaces a ranked batch per run; you review and approve any outreach."
        ),
    }
