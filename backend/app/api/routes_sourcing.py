"""Outbound sourcing: GitHub sync, NL search, prospect actions, dashboard."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import services as ai
from app.api.deps import active_thesis, default_fund, get_db
from app.core.rate_limit import ai_rate_limit
from app.core.security import parse_github_repo_url
from app.models.assessment import Opportunity
from app.models.entities import Company, Founder
from app.models.enums import EntryType, OpportunityStatus, WorkflowStage
from app.models.sources import Evidence
from app.models.workflow import RecommendedAction, WorkflowEvent
from app.schemas.requests import DiscoverIn, GitHubSyncIn, ProspectActionIn, SearchIn
from app.services.discovery import run_ai_discovery
from app.services.github_sync import sync_github_user
from app.services.serializers import opportunity_out

router = APIRouter(tags=["sourcing"], prefix="/api")


def _norm(s: str) -> str:
    return s.strip().lower()


def _get_or_create_founder(db: Session, name: str, github_username: str | None) -> Founder:
    if github_username:
        existing = db.scalar(select(Founder).where(Founder.github_username == github_username))
        if existing:
            return existing
    norm = _norm(name)
    existing = db.scalar(select(Founder).where(Founder.normalized_name == norm))
    if existing:
        if github_username and not existing.github_username:
            existing.github_username = github_username
        return existing
    f = Founder(full_name=name, normalized_name=norm, github_username=github_username,
                headline=f"GitHub @{github_username}" if github_username else None)
    db.add(f)
    db.flush()
    return f


@router.post("/sourcing/github/sync", dependencies=[Depends(ai_rate_limit)])
async def github_sync(body: GitHubSyncIn, db: Session = Depends(get_db)) -> dict:
    """Sync a real public GitHub profile/org/repo into evidence and create/update
    an outbound opportunity. This is a LIVE connector."""
    fund = default_fund(db)
    thesis = active_thesis(db, fund.id)

    username = body.username
    if body.repo_url:
        parsed = parse_github_repo_url(body.repo_url)
        if not parsed:
            raise HTTPException(422, "Not a valid GitHub repo URL.")
        username = username or parsed[0]
    if body.org and not username:
        username = body.org
    if not username:
        raise HTTPException(422, "Provide a GitHub username, org, or repo_url.")

    # founder
    if body.founder_id:
        founder = db.get(Founder, body.founder_id)
        if not founder:
            raise HTTPException(404, "Founder not found.")
        if not founder.github_username:
            founder.github_username = username
    else:
        founder = _get_or_create_founder(db, body.create_founder_name or username, username)

    result = await sync_github_user(db, founder.id, username, thesis)

    # create/update an outbound opportunity that converges into the same workflow
    opp = db.scalar(select(Opportunity).where(Opportunity.founder_id == founder.id))
    from app.services.founder import latest_founder_score

    fs = latest_founder_score(db, founder.id)
    if not opp:
        opp = Opportunity(
            fund_id=fund.id, founder_id=founder.id,
            entry_type=EntryType.OUTBOUND, stage=WorkflowStage.SOURCING,
            status=OpportunityStatus.PROSPECT,
            first_signal_at=datetime.now(UTC),
            thesis_fit_score=0.0,
            surfaced_reason=f"Surfaced from public GitHub activity (@{username}). "
                            f"Founder Score {fs.score if fs else 0:.0f}.",
        )
        db.add(opp)
        db.flush()
        db.add(WorkflowEvent(opportunity_id=opp.id, event_type="prospect_sourced",
                             detail=f"GitHub @{username}", occurred_at=datetime.now(UTC)))
    db.commit()

    return {
        "sync": result,
        "founder_id": founder.id,
        "opportunity_id": opp.id,
        "founder_score": fs.score if fs else None,
        "note": "Live GitHub public-data sync. No cold outreach sent — humans approve outreach.",
    }


@router.post("/sourcing/discover", dependencies=[Depends(ai_rate_limit)])
async def ai_discover(body: DiscoverIn, db: Session = Depends(get_db)) -> dict:
    """AI-driven outbound discovery: plan a GitHub search from the thesis/brief,
    run the live GitHub Search API, then sync + score a ranked shortlist of real
    candidate founders. No manual founder-by-founder searching required."""
    fund = default_fund(db)
    return await run_ai_discovery(db, fund.id, brief=body.brief, limit=body.limit)


@router.post("/search/parse", dependencies=[Depends(ai_rate_limit)])
def parse_search(body: SearchIn, db: Session = Depends(get_db)) -> dict:
    """Convert an NL compound query into editable structured filters."""
    connected = ["Internal indexed dataset", "GitHub (live public API)"]
    filters = ai.parse_search(body.query, connected)
    return {
        "query": body.query,
        "filters": filters,
        "searched_sources": connected,
        "disclaimer": "Only connected sources are searched — not the entire internet. "
                      "Review and edit the interpreted filters before applying.",
    }


@router.post("/search/apply")
def apply_search(payload: dict, db: Session = Depends(get_db)) -> dict:
    """Apply (possibly edited) filters against the internal indexed dataset."""
    filters = payload.get("filters", {})
    sectors = {_norm(s) for s in filters.get("sectors", [])}
    geos = {_norm(s) for s in filters.get("geographies", [])}
    stages = {_norm(s) for s in filters.get("stages", [])}

    opps = db.scalars(select(Opportunity)).all()
    results = []
    for o in opps:
        company = db.get(Company, o.company_id) if o.company_id else None
        db.get(Founder, o.founder_id) if o.founder_id else None
        if sectors and company and _norm(company.sector or "") not in sectors:
            continue
        if geos and company and _norm(company.geography or "") not in geos:
            continue
        if stages and company and _norm(company.stage or "") not in stages:
            continue
        results.append(opportunity_out(db, o))
    return {"count": len(results), "results": results,
            "searched_sources": ["Internal indexed dataset"]}


@router.get("/sourcing/prospects")
def list_prospects(db: Session = Depends(get_db)) -> dict:
    opps = db.scalars(
        select(Opportunity).where(Opportunity.entry_type == EntryType.OUTBOUND)
    ).all()
    return {"items": [opportunity_out(db, o) for o in opps]}


@router.post("/sourcing/prospects/{opp_id}/action")
def prospect_action(opp_id: int, body: ProspectActionIn, db: Session = Depends(get_db)) -> dict:
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found.")
    action = body.action
    mapping = {
        "save": OpportunityStatus.SAVED,
        "dismiss": OpportunityStatus.DISMISSED,
        "monitor": OpportunityStatus.MONITORING,
    }
    if action in mapping:
        o.status = mapping[action]
        detail = f"Prospect {action}"
    elif action == "recommend_outreach":
        # prepare/recommend — does NOT send. Human must approve.
        for prev in db.scalars(select(RecommendedAction).where(
            RecommendedAction.opportunity_id == opp_id,
            RecommendedAction.superseded == False)).all():  # noqa: E712
            prev.superseded = True
        db.add(RecommendedAction(
            opportunity_id=opp_id, action="Invite to Apply",
            rationale="Outreach prepared for human approval. Nothing is sent automatically.",
            confidence=0.6, source="sourcing",
        ))
        detail = "Outreach recommended (pending human approval)"
    elif action == "invite_to_apply":
        o.status = OpportunityStatus.APPLIED
        o.stage = WorkflowStage.SCREENING
        detail = "Invited to apply (human-approved). Converges into inbound workflow."
    else:
        raise HTTPException(422, "Unknown action.")

    db.add(WorkflowEvent(opportunity_id=opp_id, event_type="prospect_action",
                         detail=detail, actor="investor", occurred_at=datetime.now(UTC)))
    db.commit()
    return {"ok": True, "status": str(o.status), "detail": detail,
            "note": "No automated outreach is ever sent; consequential actions require human approval."}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict:
    fund = default_fund(db)
    thesis = active_thesis(db, fund.id)
    opps = db.scalars(select(Opportunity).where(Opportunity.fund_id == fund.id)).all()

    from app.services.action_queue import build_action_queue
    from app.services.founder import momentum_for

    stage_counts: dict[str, int] = {}
    for o in opps:
        stage_counts[str(o.stage)] = stage_counts.get(str(o.stage), 0) + 1

    # top momentum
    momentum_ranked = []
    for o in opps:
        if o.founder_id:
            m = momentum_for(db, o.founder_id)
            founder = db.get(Founder, o.founder_id)
            company = db.get(Company, o.company_id) if o.company_id else None
            momentum_ranked.append({"opportunity_id": o.id, "founder_id": o.founder_id,
                                    "founder_name": founder.full_name if founder else None,
                                    "company_name": company.name if company else None,
                                    "trajectory": m["trajectory"], "change_30d": m["change_30d"],
                                    "current_score": m["current_score"]})
    momentum_ranked.sort(key=lambda x: (x["change_30d"] or -999), reverse=True)

    inbound = [
        opportunity_out(db, o) for o in sorted(
            (o for o in opps if str(o.entry_type) == "inbound"), key=lambda o: -o.id
        )
    ][:6]

    # Outbound prospects: return the newest-sourced. Pipeline state (Saved /
    # Monitoring / Dismissed) is per-browser (client-side workspace), so the
    # dashboard does NOT pin or hide by the shared status here — the client
    # applies its own overlay. We return a generous slice so the client can
    # pin its saved prospects to the top before trimming to the display count.
    outbound_opps = [o for o in opps if str(o.entry_type) == "outbound"]
    outbound_opps.sort(key=lambda o: -o.id)
    outbound = [opportunity_out(db, o) for o in outbound_opps[:24]]

    # prioritized action queue (replaces the old per-deal 24h timers)
    action_queue = build_action_queue(db, fund.id, limit=8)

    from app.services.ranking_service import compute_rankings
    ranking = compute_rankings(db, fund.id, persist=False)
    largest_changes = sorted(ranking["entries"], key=lambda e: abs(e["rank_delta"]), reverse=True)[:5]

    recent_evidence = db.scalars(
        select(Evidence).order_by(Evidence.collected_at.desc()).limit(8)
    ).all()

    return {
        "thesis": {"fund_name": thesis.fund_name, "sectors": thesis.sectors,
                   "stages": thesis.stages, "geographies": thesis.geographies} if thesis else None,
        "stage_counts": stage_counts,
        "top_outbound_prospects": outbound,
        "recent_inbound_applications": inbound,
        "highest_momentum": momentum_ranked[:5],
        "largest_prestige_changes": largest_changes,
        "action_queue": action_queue,
        "recent_evidence": [
            {"id": e.id, "kind": e.kind, "title": e.title, "source_name": e.source_name,
             "collected_at": e.collected_at.isoformat()}
            for e in recent_evidence
        ],
        "connectors": {"live": ["github"], "planned": ["hackathons", "papers", "patents"]},
    }
