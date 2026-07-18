"""24-hour recommendation tracker + workflow status computation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity
from app.models.workflow import DiligenceQuestion, RecommendedAction

TARGET = timedelta(hours=24)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def workflow_status(db: Session, opportunity: Opportunity, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    start = _aware(opportunity.first_signal_at) or now
    elapsed = now - start
    rec_at = _aware(opportunity.recommendation_at)

    if rec_at:
        time_to_rec = rec_at - start
        remaining = TARGET - time_to_rec
        met = time_to_rec <= TARGET
    else:
        remaining = TARGET - elapsed
        time_to_rec = None
        met = None

    open_diligence = db.scalars(
        select(DiligenceQuestion).where(
            DiligenceQuestion.opportunity_id == opportunity.id,
            DiligenceQuestion.status.in_(["open", "requested", "unresolved"]),
        )
    ).all()

    rec = db.scalar(
        select(RecommendedAction).where(
            RecommendedAction.opportunity_id == opportunity.id,
            RecommendedAction.superseded == False,  # noqa: E712
        ).order_by(RecommendedAction.id.desc())
    )

    blockers = []
    if not rec:
        blockers.append("No recommendation generated yet.")
    if open_diligence:
        blockers.append(f"{len(open_diligence)} open diligence item(s).")

    return {
        "opportunity_id": opportunity.id,
        "stage": str(opportunity.stage),
        "status": str(opportunity.status),
        "first_signal_at": start.isoformat(),
        "recommendation_at": rec_at.isoformat() if rec_at else None,
        "elapsed_seconds": int(elapsed.total_seconds()),
        "elapsed_human": _human(elapsed),
        "remaining_seconds": int(remaining.total_seconds()),
        "remaining_human": _human(remaining) if remaining.total_seconds() > 0 else "overdue",
        "target_hours": 24,
        "target_met": met,
        "time_to_recommendation_human": _human(time_to_rec) if time_to_rec else None,
        "open_diligence_count": len(open_diligence),
        "blockers": blockers,
        "current_recommendation": (
            {"action": str(rec.action), "confidence": rec.confidence, "rationale": rec.rationale}
            if rec else None
        ),
    }


def _human(delta: timedelta) -> str:
    total = int(abs(delta.total_seconds()))
    h, rem = divmod(total, 3600)
    m, _ = divmod(rem, 60)
    sign = "-" if delta.total_seconds() < 0 else ""
    return f"{sign}{h}h {m}m"
