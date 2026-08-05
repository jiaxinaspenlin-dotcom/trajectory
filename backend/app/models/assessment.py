"""Opportunity and three-axis assessments."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    AssessmentLabel,
    AxisKind,
    EntryType,
    OpportunityStatus,
    TrajectoryLabel,
    WorkflowStage,
)


class Opportunity(Base):
    """The convergence point: inbound + outbound flow into one workflow object."""

    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id"), index=True)
    founder_id: Mapped[int | None] = mapped_column(ForeignKey("founders.id"), nullable=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("applications.id"), nullable=True
    )

    entry_type: Mapped[EntryType] = mapped_column(String(16))
    stage: Mapped[WorkflowStage] = mapped_column(String(24), default=WorkflowStage.SOURCING)
    status: Mapped[OpportunityStatus] = mapped_column(String(24), default=OpportunityStatus.PROSPECT)

    # first-signal -> recommendation timing
    first_signal_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recommendation_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    thesis_fit_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..100
    surfaced_reason: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    assessments: Mapped[list[OpportunityAssessment]] = relationship(
        back_populates="opportunity", cascade="all, delete-orphan"
    )


class OpportunityAssessment(Base):
    """A versioned screening pass. Contains three independent axes (never averaged)."""

    __tablename__ = "opportunity_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    opportunity: Mapped[Opportunity] = relationship(back_populates="assessments")

    version: Mapped[int] = mapped_column(Integer, default=1)
    generated_by: Mapped[str] = mapped_column(String(16), default="ai")  # ai|fallback
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    axes: Mapped[list[AxisAssessment]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


class AxisAssessment(Base):
    """One of the three independent axes: founder / market / idea_vs_market."""

    __tablename__ = "axis_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("opportunity_assessments.id"), index=True
    )
    assessment: Mapped[OpportunityAssessment] = relationship(back_populates="axes")

    axis: Mapped[AxisKind] = mapped_column(String(24))
    display_score: Mapped[float] = mapped_column(Float)  # 0..100 (per-axis, NOT averaged)
    label: Mapped[AssessmentLabel] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    trend: Mapped[TrajectoryLabel] = mapped_column(String(32), default=TrajectoryLabel.STABLE)

    supporting_evidence_ids: Mapped[list] = mapped_column(default=list)
    supporting_points: Mapped[list] = mapped_column(default=list)
    risks: Mapped[list] = mapped_column(default=list)
    missing_information: Mapped[list] = mapped_column(default=list)
    contradictions: Mapped[list] = mapped_column(default=list)
    outlook: Mapped[str] = mapped_column(String(32), default="neutral")  # market: bull/neutral/bear
    narrative: Mapped[str] = mapped_column(Text, default="")


