"""Persistent Founder Score and Founder Momentum snapshots (history preserved)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.entities import Founder


class FounderScore(Base):
    """A versioned Founder Score snapshot. Never overwritten — history preserved."""

    __tablename__ = "founder_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    founder_id: Mapped[int] = mapped_column(ForeignKey("founders.id"), index=True)
    founder: Mapped[Founder] = relationship(back_populates="scores")  # noqa: F821

    version: Mapped[int] = mapped_column(Integer, default=1)
    score: Mapped[float] = mapped_column(Float)  # 0..100 deterministic baseline
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    # component breakdown: [{name, weight, value, evidence_count, confidence,
    #                        missingness, contribution}]
    components: Mapped[list] = mapped_column(default=list)
    explanation: Mapped[str] = mapped_column(Text, default="")
    evidence_ids: Mapped[list] = mapped_column(default=list)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class FounderMomentumSnapshot(Base):
    """Point-in-time momentum snapshot; a series forms the trajectory chart."""

    __tablename__ = "founder_momentum_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    founder_id: Mapped[int] = mapped_column(ForeignKey("founders.id"), index=True)
    founder: Mapped[Founder] = relationship(back_populates="momentum_snapshots")  # noqa: F821

    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    score: Mapped[float] = mapped_column(Float)  # founder score at this point
    # per-signal values at this snapshot: {commit_activity, releases, contributors, ...}
    signals: Mapped[dict] = mapped_column(default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
