"""Founder Score & Momentum computation + versioned persistence."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core import InvestmentThesis
from app.models.scoring import FounderMomentumSnapshot, FounderScore
from app.models.sources import Evidence
from app.scoring.founder_score import compute_founder_score
from app.scoring.momentum import compute_momentum


def compute_and_store_founder_score(
    db: Session, founder_id: int, thesis: InvestmentThesis | None = None
) -> FounderScore:
    """Compute the deterministic Founder Score and store a NEW version.

    Never overwrites prior versions — history is preserved.
    """
    evidence = list(
        db.scalars(select(Evidence).where(Evidence.founder_id == founder_id)).all()
    )
    weights = (thesis.score_weights if thesis and thesis.score_weights else None)
    result = compute_founder_score(evidence, weights=weights)

    last = db.scalar(
        select(FounderScore)
        .where(FounderScore.founder_id == founder_id)
        .order_by(FounderScore.version.desc())
    )
    version = (last.version + 1) if last else 1

    score = FounderScore(
        founder_id=founder_id,
        version=version,
        score=result.score,
        confidence=result.confidence,
        components=result.components_as_dict(),
        explanation=result.explanation,
        evidence_ids=result.evidence_ids,
        computed_at=datetime.now(UTC),
    )
    db.add(score)
    db.flush()
    return score


def latest_founder_score(db: Session, founder_id: int) -> FounderScore | None:
    return db.scalar(
        select(FounderScore)
        .where(FounderScore.founder_id == founder_id)
        .order_by(FounderScore.version.desc())
    )


def momentum_for(db: Session, founder_id: int) -> dict:
    snaps = list(
        db.scalars(
            select(FounderMomentumSnapshot).where(
                FounderMomentumSnapshot.founder_id == founder_id
            )
        ).all()
    )
    result = compute_momentum(snaps)
    return {
        "current_score": result.current_score,
        "previous_score": result.previous_score,
        "change_30d": result.change_30d,
        "change_90d": result.change_90d,
        "change_30d_window_days": result.change_30d_window_days,
        "change_90d_window_days": result.change_90d_window_days,
        "trajectory": result.trajectory.value if hasattr(result.trajectory, "value") else str(result.trajectory),
        "signal_trends": [
            {
                "key": t.key, "label": t.label, "current": t.current,
                "previous": t.previous, "change": t.change, "direction": t.direction,
            }
            for t in result.signal_trends
        ],
        "explanation": result.explanation,
        "series": result.series,
    }
