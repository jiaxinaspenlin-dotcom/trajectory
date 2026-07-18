"""Diligence, Arena debate, memo, recommendations, human decisions, events, tour."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    DebateRole,
    DiligenceStatus,
    HumanDecisionType,
    RecommendedActionType,
)

if TYPE_CHECKING:
    from app.models.core import User


class DiligenceQuestion(Base):
    __tablename__ = "diligence_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="general")
    rationale: Mapped[str] = mapped_column(Text, default="")
    related_claim_ids: Mapped[list] = mapped_column(default=list)
    status: Mapped[DiligenceStatus] = mapped_column(String(24), default=DiligenceStatus.OPEN)
    generated_by: Mapped[str] = mapped_column(String(16), default="ai")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    responses: Mapped[list[DiligenceResponse]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class DiligenceResponse(Base):
    __tablename__ = "diligence_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("diligence_questions.id"), index=True)
    answer: Mapped[str] = mapped_column(Text)
    answered_by: Mapped[str] = mapped_column(String(255), default="founder")
    evidence_ids: Mapped[list] = mapped_column(default=list)

    question: Mapped[DiligenceQuestion] = relationship(back_populates="responses")


class Debate(Base):
    """An Investment Arena debate. Versioned — regeneration never overwrites."""

    __tablename__ = "debates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    generated_by: Mapped[str] = mapped_column(String(16), default="ai")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    arguments: Mapped[list[DebateArgument]] = relationship(
        back_populates="debate", cascade="all, delete-orphan"
    )
    referee_decision: Mapped[RefereeDecision | None] = relationship(
        back_populates="debate", cascade="all, delete-orphan", uselist=False
    )


class DebateArgument(Base):
    __tablename__ = "debate_arguments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    debate_id: Mapped[int] = mapped_column(ForeignKey("debates.id"), index=True)
    role: Mapped[DebateRole] = mapped_column(String(16))  # bull|bear
    headline: Mapped[str] = mapped_column(String(512), default="")
    points: Mapped[list] = mapped_column(default=list)  # [{text, evidence_ids:[...]}]
    speech_bubble: Mapped[str] = mapped_column(Text, default="")  # short hover/tap text
    referenced_evidence_ids: Mapped[list] = mapped_column(default=list)

    debate: Mapped[Debate] = relationship(back_populates="arguments")


class RefereeDecision(Base):
    __tablename__ = "referee_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    debate_id: Mapped[int] = mapped_column(ForeignKey("debates.id"), index=True, unique=True)
    recommended_action: Mapped[RecommendedActionType] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    strongest_bull_point: Mapped[str] = mapped_column(Text, default="")
    strongest_bear_point: Mapped[str] = mapped_column(Text, default="")
    unresolved_questions: Mapped[list] = mapped_column(default=list)
    required_diligence: Mapped[list] = mapped_column(default=list)
    evidence_that_would_change: Mapped[str] = mapped_column(Text, default="")
    final_decision_supportable: Mapped[bool] = mapped_column(Boolean, default=False)
    rationale: Mapped[str] = mapped_column(Text, default="")
    speech_bubble: Mapped[str] = mapped_column(Text, default="")

    debate: Mapped[Debate] = relationship(back_populates="referee_decision")


class InvestmentMemo(Base):
    """Versioned, evidence-backed investment memo (history preserved)."""

    __tablename__ = "investment_memos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    generated_by: Mapped[str] = mapped_column(String(16), default="ai")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # sections: [{key, title, body, claims:[...], evidence_ids:[...],
    #             unavailable_label: str|null}]
    sections: Mapped[list] = mapped_column(default=list)
    recommended_action: Mapped[RecommendedActionType | None] = mapped_column(String(32), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class RecommendedAction(Base):
    """A system recommendation. Never auto-executed; requires human approval."""

    __tablename__ = "recommended_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    action: Mapped[RecommendedActionType] = mapped_column(String(32))
    rationale: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    source: Mapped[str] = mapped_column(String(24), default="referee")
    created_from_debate_id: Mapped[int | None] = mapped_column(
        ForeignKey("debates.id"), nullable=True
    )
    superseded: Mapped[bool] = mapped_column(Boolean, default=False)


class HumanDecision(Base):
    """The human's decision, recorded SEPARATELY from the system recommendation."""

    __tablename__ = "human_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    recommended_action_id: Mapped[int | None] = mapped_column(
        ForeignKey("recommended_actions.id"), nullable=True
    )
    decided_by: Mapped[str] = mapped_column(String(255))
    decision: Mapped[HumanDecisionType] = mapped_column(String(24))
    chosen_action: Mapped[RecommendedActionType] = mapped_column(String(32))
    system_recommended_action: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WorkflowEvent(Base):
    """Audit trail of everything that happens to an opportunity."""

    __tablename__ = "workflow_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(64), default="system")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TourProgress(Base):
    __tablename__ = "tour_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    last_step: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="tour_progress")  # noqa: F821
