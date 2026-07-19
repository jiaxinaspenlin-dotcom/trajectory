"""Prioritized 'Action queue' for the investor dashboard.

Replaces the old per-deal 24-hour timers with a single, specific, prioritized
list: for each open opportunity, the ONE concrete next action, sorted so the
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

_OPEN_DILIGENCE = ("open", "requested", "unresolved")


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def build_action_queue(db: Session, fund_id: int, limit: int = 8) -> list[dict]:
    now = datetime.now(UTC)
    opps = db.scalars(select(Opportunity).where(Opportunity.fund_id == fund_id)).all()

    items: list[dict] = []
    for o in opps:
        # Deals already decided drop off the queue.
        if str(o.status) == "decided":
            continue
        # Dismissed prospects aren't actionable.
        if str(o.status) == "dismissed":
            continue

        founder = db.get(Founder, o.founder_id) if o.founder_id else None
        company = db.get(Company, o.company_id) if o.company_id else None
        name = (company.name if company else None) or (founder.full_name if founder else None) or f"Opportunity #{o.id}"
        founder_name = founder.full_name if founder else None

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

        # Determine the single next action + priority (1 = act now).
        is_inbound = str(o.entry_type) == "inbound"
        if rec and not decided:
            action = f"Review recommendation ({rec.action}) & decide"
            priority = 1
        elif is_inbound and not assessment:
            # a founder just applied and is waiting — surface it prominently.
            action = "Review new application"
            priority = 2
        elif open_diligence > 0:
            action = f"Resolve {open_diligence} diligence item{'s' if open_diligence != 1 else ''}"
            priority = 3
        elif not assessment:
            action = "Run analysis"
            priority = 4
        else:
            action = "Generate Arena & memo"
            priority = 5

        start = _aware(o.first_signal_at) or now
        age_days = max(0, (now - start).days)

        items.append(
            {
                "opportunity_id": o.id,
                "name": name,
                "founder_name": founder_name,
                "entry_type": str(o.entry_type),
                "stage": str(o.stage),
                "next_action": action,
                "priority": priority,
                "age_days": age_days,
            }
        )

    # act-now first (lower priority number), then oldest-waiting first
    items.sort(key=lambda x: (x["priority"], -x["age_days"]))
    return items[:limit]
