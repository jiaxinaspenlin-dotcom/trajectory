"""Prioritized 'Action queue' for the investor dashboard.

A single, specific, prioritized list: for each open opportunity, the ONE
concrete next action, sorted so the
things the investor can act on now come first. Every row is named (company +
founder), never a bare opportunity id.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity, OpportunityAssessment
from app.models.entities import Company, Founder
from app.models.workflow import DiligenceQuestion, HumanDecision, RecommendedAction
from app.services.copy import title_case

_OPEN_DILIGENCE = ("open", "requested", "unresolved")


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def action_label(action: str) -> str:
    """A recommended action as Title Case display text (docs/copy-style.md).

    Display only: never store the result.
    """
    return title_case(str(action))


def next_action_info(db: Session, o: Opportunity) -> dict | None:
    """The ONE concrete next action for an open opportunity.

    Returns {key, label, detail, priority} (priority 1 = act now) or None for
    decided or dismissed opportunities. `key` is stable so the UI can link the
    action to where it's done; `label` is short, plain language.
    """
    # Deals already decided drop off the queue.
    if str(o.status) == "decided":
        return None
    # Dismissed prospects aren't actionable.
    if str(o.status) == "dismissed":
        return None

    assessment = db.scalar(
        select(OpportunityAssessment).where(OpportunityAssessment.opportunity_id == o.id)
    )
    rec = db.scalar(
        select(RecommendedAction).where(
            RecommendedAction.opportunity_id == o.id,
            RecommendedAction.superseded == False,  # noqa: E712
        ).order_by(RecommendedAction.id.desc())
    )
    decided = db.scalar(
        select(HumanDecision).where(HumanDecision.opportunity_id == o.id)
    )
    open_diligence = len(
        db.scalars(
            select(DiligenceQuestion).where(
                DiligenceQuestion.opportunity_id == o.id,
                DiligenceQuestion.status.in_(_OPEN_DILIGENCE),
            )
        ).all()
    )

    def action(key: str, label: str, priority: int, detail: str | None = None) -> dict:
        return {"key": key, "label": label, "detail": detail, "priority": priority}

    is_inbound = str(o.entry_type) == "inbound"
    if rec and not decided:
        # awaiting the investor's review — not the same as the Decision stage
        return action("review_recommendation", "Review Recommendation", 1, f"Recommended: {action_label(rec.action)}")
    if is_inbound and not assessment:
        # a founder just applied and is waiting — surface it prominently.
        return action("review_application", "Review Application", 2, "New Inbound Application")
    if open_diligence > 0:
        plural = "s" if open_diligence != 1 else ""
        return action("resolve_diligence", f"Resolve {open_diligence} Diligence Question{plural}", 3)
    if not assessment:
        return action("run_analysis", "Run Analysis", 4, "Scores the Three Screening Axes")
    return action("generate_memo", "Generate Debate & Memo", 5)


def next_action_for(db: Session, o: Opportunity) -> tuple[str, int] | None:
    """(label, priority) form of next_action_info, for list views."""
    info = next_action_info(db, o)
    return (info["label"], info["priority"]) if info else None


def opportunity_age_days(o: Opportunity, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    start = _aware(o.first_signal_at) or now
    return max(0, (now - start).days)


def build_action_queue(db: Session, fund_id: int, limit: int | None = 8) -> list[dict]:
    now = datetime.now(UTC)
    opps = db.scalars(select(Opportunity).where(Opportunity.fund_id == fund_id)).all()

    items: list[dict] = []
    waiting_since: dict[int, datetime] = {}
    for o in opps:
        nxt = next_action_info(db, o)
        if nxt is None:
            continue

        founder = db.get(Founder, o.founder_id) if o.founder_id else None
        company = db.get(Company, o.company_id) if o.company_id else None
        name = (company.name if company else None) or (founder.full_name if founder else None) or f"Opportunity #{o.id}"
        founder_name = founder.full_name if founder else None
        waiting_since[o.id] = _aware(o.first_signal_at) or now

        items.append(
            {
                "opportunity_id": o.id,
                "name": name,
                "founder_name": founder_name,
                "entry_type": str(o.entry_type),
                "stage": str(o.stage),
                "next_action": nxt["label"],
                "next_action_key": nxt["key"],
                "next_action_detail": nxt["detail"],
                "priority": nxt["priority"],
                "age_days": opportunity_age_days(o, now),
            }
        )

    # act-now first (lower priority number), then oldest-waiting first. Whole days
    # tie often, so the exact waiting time and then the id keep the order stable.
    items.sort(key=lambda x: (x["priority"], waiting_since[x["opportunity_id"]], x["opportunity_id"]))
    return items if limit is None else items[:limit]
