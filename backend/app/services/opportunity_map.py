"""Read model for the investor Map: the same opportunities Founders and Pipeline
show, with grouping, plotting fields, and only nameable relationships."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from itertools import combinations
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import active_thesis, default_fund
from app.models.assessment import Opportunity
from app.models.entities import Company, Founder
from app.models.enums import EntryType, OpportunityStatus, WorkflowStage
from app.models.sources import Evidence
from app.services.action_queue import next_action_for
from app.services.founder import latest_founder_score, momentum_for
from app.services.web_sourcing import new_evidence_count

# Stages that make an opportunity an active deal. Outbound leads still in
# Sourcing live in Founders until an investor moves them to Screening; inbound
# applications enter at Screening, so every application appears in Pipeline.
PIPELINE_STAGES = (WorkflowStage.SCREENING, WorkflowStage.DILIGENCE, WorkflowStage.DECISION)

# A repo topic shared by more founders than this is too generic to be a
# meaningful link (e.g. "python"); it still shows on each node.
MAX_TOPIC_FANOUT = 8

# The plotted momentum is a 30-day score change. compute_momentum falls back to
# the oldest snapshot when none is 30+ days old (two syncs minutes apart still
# yield a "30d" change), so the Map also requires the history to span 30 days.
MIN_MOMENTUM_SPAN_DAYS = 30


def _history_span_days(series: list[dict]) -> int:
    if len(series) < 2:
        return 0
    return (datetime.fromisoformat(series[-1]["date"]) - datetime.fromisoformat(series[0]["date"])).days


def in_pipeline(o: Opportunity) -> bool:
    return str(o.stage) in {str(s) for s in PIPELINE_STAGES} and str(o.status) != OpportunityStatus.DISMISSED


def _github_signals(evidence: list[Evidence]) -> tuple[list[str], str | None, dict | None]:
    """(repo topics, most common repo language, top-starred project)."""
    repos = [e for e in evidence if e.kind == "github_repo"]
    topics = sorted({t for e in repos for t in (e.structured_value or {}).get("topics") or []})
    langs = Counter(
        lang for e in evidence
        if (lang := (e.structured_value or {}).get("language")) and e.kind in ("github_repo", "github_language")
    )
    language = langs.most_common(1)[0][0] if langs else None
    top = max(repos, key=lambda e: (e.structured_value or {}).get("stars") or 0, default=None)
    project = (
        {"name": top.title.removeprefix("Public repository: "), "url": top.source_url,
         "stars": (top.structured_value or {}).get("stars")}
        if top else None
    )
    return topics, language, project


def build_map(db: Session) -> dict:
    fund = default_fund(db)
    has_thesis = active_thesis(db, fund.id) is not None

    # Same membership rules as the two list views: every outbound lead
    # (/api/sourcing/prospects) plus every active deal (/api/pipeline).
    opps = [
        o for o in db.scalars(select(Opportunity).order_by(Opportunity.id)).all()
        if str(o.entry_type) == EntryType.OUTBOUND or in_pipeline(o)
    ]

    founder_ids = {o.founder_id for o in opps if o.founder_id}
    evidence_by_founder: dict[int, list[Evidence]] = defaultdict(list)
    if founder_ids:
        for e in db.scalars(select(Evidence).where(Evidence.founder_id.in_(founder_ids))).all():
            evidence_by_founder[e.founder_id].append(e)  # type: ignore[index]
    # Company-scoped evidence (web sources, decks, org repos) counts too.
    company_ids = {o.company_id for o in opps if o.company_id}
    company_evidence: Counter[int] = Counter()
    if company_ids:
        for e in db.scalars(select(Evidence).where(Evidence.company_id.in_(company_ids))).all():
            company_evidence[e.company_id] += 1  # type: ignore[index]

    items: list[dict] = []
    for o in opps:
        founder = db.get(Founder, o.founder_id) if o.founder_id else None
        company = db.get(Company, o.company_id) if o.company_id else None
        evidence = evidence_by_founder.get(o.founder_id, []) if o.founder_id else []
        topics, language, project = _github_signals(evidence)
        fs = latest_founder_score(db, o.founder_id) if o.founder_id else None

        group: dict[str, str | None]
        if company and company.sector:
            group = {"key": f"sector:{company.sector.lower()}", "label": company.sector, "field": "company.sector"}
        elif language:
            group = {"key": f"language:{language.lower()}", "label": f"{language} projects", "field": "github_repo.language"}
        else:
            group = {"key": "ungrouped", "label": "Not enough data to group", "field": None}

        # Thesis fit is only computed from a company; GitHub-sourced founders
        # without one carry a 0.0 placeholder that must not be plotted.
        fit: dict[str, Any]
        if not has_thesis:
            fit = {"value": None, "reason": "No active thesis to score against"}
        elif not company:
            fit = {"value": None, "reason": "No company yet — thesis fit is a placeholder"}
        else:
            fit = {"value": o.thesis_fit_score, "reason": None}

        mom: dict[str, Any]
        if not o.founder_id:
            mom = {"value": None, "current_score": None, "trajectory": None,
                   "reason": "No linked founder to track momentum for"}
        else:
            m = momentum_for(db, o.founder_id)
            span = _history_span_days(m["series"])
            insufficient = (m["trajectory"] == "insufficient_history" or m["change_30d"] is None
                            or span < MIN_MOMENTUM_SPAN_DAYS)
            reason = None
            if insufficient:
                reason = "Insufficient momentum history (needs 30+ days of score snapshots"
                reason += f"; has {len(m['series'])} spanning {span} days)" if m["series"] else "; has none)"
            mom = {"value": None if insufficient else m["change_30d"], "current_score": m["current_score"],
                   "trajectory": m["trajectory"], "history_days": span, "reason": reason}

        nxt = next_action_for(db, o)
        items.append({
            "id": o.id,
            "name": (company.name if company else None) or (founder.full_name if founder else None) or f"Opportunity #{o.id}",
            "entry_type": str(o.entry_type), "stage": str(o.stage), "status": str(o.status),
            "kind": "deal" if in_pipeline(o) else "lead",
            "in_founders": str(o.entry_type) == EntryType.OUTBOUND,
            "in_pipeline": in_pipeline(o),
            "founder": {"id": founder.id, "full_name": founder.full_name,
                        "github_username": founder.github_username} if founder else None,
            "company": {"id": company.id, "name": company.name, "sector": company.sector,
                        "one_liner": company.one_liner} if company else None,
            "founder_score": fs.score if fs else None,
            "evidence_count": len(evidence) + (company_evidence[o.company_id] if o.company_id else 0),
            "new_evidence_count": new_evidence_count(db, o),
            "top_project": project,
            "topics": topics,
            "group": group,
            "thesis_fit": fit,
            "momentum": mom,
            "next_action": nxt[0] if nxt else None,
            "is_demo": o.is_demo,
        })

    return {"items": items, "links": _links(items, opps), "has_thesis": has_thesis}


def _links(items: list[dict], opps: list[Opportunity]) -> list[dict]:
    """Only relationships we can name. Group membership is drawn by the client
    from each item's `group`, so it isn't repeated here."""
    links: list[dict] = []
    for attr, kind, label in (("founder_id", "same_founder", "Same founder"),
                              ("company_id", "same_company", "Same company")):
        by: dict[int, list[int]] = defaultdict(list)
        for o in opps:
            if getattr(o, attr):
                by[getattr(o, attr)].append(o.id)
        for ids in by.values():
            for a, b in combinations(ids, 2):
                links.append({"source": a, "target": b, "kind": kind, "label": label})

    by_topic: dict[str, list[int]] = defaultdict(list)
    for it in items:
        for t in it["topics"]:
            by_topic[t].append(it["id"])
    shared: dict[tuple[int, int], list[str]] = defaultdict(list)
    for topic, ids in by_topic.items():
        if len(ids) > MAX_TOPIC_FANOUT:
            continue
        for a, b in combinations(sorted(ids), 2):
            shared[(a, b)].append(topic)
    for (a, b), topics in shared.items():
        links.append({"source": a, "target": b, "kind": "shared_topic", "topics": topics,
                      "label": f"Shared project topic{'s' if len(topics) > 1 else ''}: {', '.join(topics[:3])}"})
    return links
