"""Analysis orchestration: run assessment, diligence, arena, memo — versioned.

Regeneration NEVER overwrites prior assessments, debates, or memos; each run
creates a new version. This module ties the deterministic engines and AI
services together and persists evidence-linked results.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import services as ai
from app.models.assessment import AxisAssessment, Opportunity, OpportunityAssessment
from app.models.workflow import (
    Debate,
    DebateArgument,
    DiligenceQuestion,
    InvestmentMemo,
    RecommendedAction,
    RefereeDecision,
    WorkflowEvent,
)
from app.services.context import build_opportunity_context


def _now() -> datetime:
    return datetime.now(UTC)


def _next_version(db: Session, model, opportunity_id: int) -> int:
    last = db.scalar(
        select(model).where(model.opportunity_id == opportunity_id).order_by(model.version.desc())
    )
    return (last.version + 1) if last else 1


def _log(db: Session, opp_id: int, event: str, detail: str = "", actor: str = "system") -> None:
    db.add(WorkflowEvent(opportunity_id=opp_id, event_type=event, detail=detail,
                         actor=actor, occurred_at=_now()))


def run_assessment(db: Session, opportunity: Opportunity, context: dict | None = None) -> OpportunityAssessment:
    context = context or build_opportunity_context(db, opportunity)
    result = ai.assess_axes(context)
    version = _next_version(db, OpportunityAssessment, opportunity.id)
    assessment = OpportunityAssessment(
        opportunity_id=opportunity.id, version=version,
        generated_by=result.get("generated_by", "fallback"), computed_at=_now(),
    )
    db.add(assessment)
    db.flush()
    for ax in result.get("axes", []):
        db.add(AxisAssessment(
            assessment_id=assessment.id,
            axis=ax.get("axis"),
            display_score=float(ax.get("display_score", 0)),
            label=ax.get("label", "Insufficient Evidence"),
            confidence=float(ax.get("confidence", 0.4)),
            trend="stable",
            supporting_evidence_ids=ax.get("supporting_evidence_ids", []),
            supporting_points=ax.get("supporting_points", []),
            risks=ax.get("risks", []),
            missing_information=ax.get("missing_information", []),
            contradictions=ax.get("contradictions", []),
            outlook=ax.get("outlook", "neutral"),
            narrative=ax.get("narrative", ""),
        ))
    _log(db, opportunity.id, "assessment_generated", f"v{version} ({result.get('generated_by')})")
    db.flush()
    return assessment


def run_diligence(db: Session, opportunity: Opportunity, context: dict | None = None) -> list[DiligenceQuestion]:
    context = context or build_opportunity_context(db, opportunity)
    result = ai.generate_diligence_questions(context)
    created: list[DiligenceQuestion] = []
    existing = {
        q.question.strip().lower()
        for q in db.scalars(
            select(DiligenceQuestion).where(DiligenceQuestion.opportunity_id == opportunity.id)
        ).all()
    }
    for q in result.get("questions", []):
        if q["question"].strip().lower() in existing:
            continue
        dq = DiligenceQuestion(
            opportunity_id=opportunity.id, question=q["question"], category=q.get("category", "general"),
            rationale=q.get("rationale", ""), related_claim_ids=q.get("related_claim_ids", []),
            generated_by=result.get("generated_by", "fallback"),
        )
        db.add(dq)
        created.append(dq)
    _log(db, opportunity.id, "diligence_generated", f"{len(created)} questions ({result.get('generated_by')})")
    db.flush()
    return created


def run_arena(db: Session, opportunity: Opportunity, context: dict | None = None) -> Debate:
    context = context or build_opportunity_context(db, opportunity)
    bull = ai.generate_bull(context)
    bear = ai.generate_bear(context)
    dict(context)
    # include latest axes + referee context
    referee = ai.generate_referee(context, bull, bear)

    version = _next_version(db, Debate, opportunity.id)
    debate = Debate(
        opportunity_id=opportunity.id, version=version,
        generated_by=bull.get("generated_by", "fallback"), computed_at=_now(),
    )
    db.add(debate)
    db.flush()

    for side in (bull, bear):
        db.add(DebateArgument(
            debate_id=debate.id, role=side["role"], headline=side.get("headline", ""),
            points=side.get("points", []), speech_bubble=side.get("speech_bubble", ""),
            referenced_evidence_ids=side.get("referenced_evidence_ids", []),
        ))

    db.add(RefereeDecision(
        debate_id=debate.id,
        recommended_action=referee.get("recommended_action", "Continue Diligence"),
        confidence=float(referee.get("confidence", 0.4)),
        strongest_bull_point=referee.get("strongest_bull_point", ""),
        strongest_bear_point=referee.get("strongest_bear_point", ""),
        unresolved_questions=referee.get("unresolved_questions", []),
        required_diligence=referee.get("required_diligence", []),
        evidence_that_would_change=referee.get("evidence_that_would_change", ""),
        final_decision_supportable=bool(referee.get("final_decision_supportable", False)),
        rationale=referee.get("rationale", ""),
        speech_bubble=referee.get("speech_bubble", ""),
    ))

    # supersede prior recommendations, create the new one (never auto-executed)
    for prev in db.scalars(
        select(RecommendedAction).where(
            RecommendedAction.opportunity_id == opportunity.id,
            RecommendedAction.superseded == False,  # noqa: E712
        )
    ).all():
        prev.superseded = True
    db.add(RecommendedAction(
        opportunity_id=opportunity.id, action=referee.get("recommended_action", "Continue Diligence"),
        rationale=referee.get("rationale", ""), confidence=float(referee.get("confidence", 0.4)),
        source="referee", created_from_debate_id=debate.id,
    ))

    # record recommendation timestamp for the 24h tracker
    if opportunity.recommendation_at is None:
        opportunity.recommendation_at = _now()
    _log(db, opportunity.id, "arena_generated",
         f"v{version} recommended={referee.get('recommended_action')} ({bull.get('generated_by')})")
    db.flush()
    return debate


def run_memo(db: Session, opportunity: Opportunity, context: dict | None = None) -> InvestmentMemo:
    context = context or build_opportunity_context(db, opportunity)
    # enrich context with latest axes + referee for the memo
    context = dict(context)
    context["axes"] = _latest_axes(db, opportunity.id)
    context["referee"] = _latest_referee(db, opportunity.id)
    result = ai.generate_memo(context)
    version = _next_version(db, InvestmentMemo, opportunity.id)
    memo = InvestmentMemo(
        opportunity_id=opportunity.id, version=version,
        generated_by=result.get("generated_by", "fallback"), computed_at=_now(),
        sections=result.get("sections", []),
        recommended_action=result.get("recommended_action"),
        confidence=float(result.get("confidence", 0.4)),
    )
    db.add(memo)
    _log(db, opportunity.id, "memo_generated", f"v{version} ({result.get('generated_by')})")
    db.flush()
    return memo


def run_full_pipeline(db: Session, opportunity: Opportunity) -> dict:
    """Screening -> Diligence -> Arena -> Memo in one pass (versioned)."""
    context = build_opportunity_context(db, opportunity)
    assessment = run_assessment(db, opportunity, context)
    diligence = run_diligence(db, opportunity, context)
    debate = run_arena(db, opportunity, context)
    memo = run_memo(db, opportunity, context)
    return {
        "assessment_id": assessment.id,
        "diligence_created": len(diligence),
        "debate_id": debate.id,
        "memo_id": memo.id,
    }


def _latest_axes(db: Session, opp_id: int) -> list[dict]:
    a = db.scalar(
        select(OpportunityAssessment)
        .where(OpportunityAssessment.opportunity_id == opp_id)
        .order_by(OpportunityAssessment.version.desc())
    )
    if not a:
        return []
    return [
        {"axis": str(ax.axis), "label": str(ax.label), "display_score": ax.display_score}
        for ax in a.axes
    ]


def _latest_referee(db: Session, opp_id: int) -> dict:
    debate = db.scalar(
        select(Debate).where(Debate.opportunity_id == opp_id).order_by(Debate.version.desc())
    )
    if not debate or not debate.referee_decision:
        return {}
    r = debate.referee_decision
    return {
        "recommended_action": str(r.recommended_action),
        "confidence": r.confidence,
        "rationale": r.rationale,
    }
