"""Opportunity workflow: detail, assessment, diligence, arena, memo,
human decisions, contradiction validation."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.validation import validate_evidence_ids
from app.api.deps import get_db
from app.core.rate_limit import ai_rate_limit
from app.models.assessment import Opportunity, OpportunityAssessment
from app.models.enums import DiligenceStatus, WorkflowStage
from app.models.sources import Evidence
from app.models.workflow import (
    Debate,
    DiligenceQuestion,
    DiligenceResponse,
    HumanDecision,
    InvestmentMemo,
    RecommendedAction,
    WorkflowEvent,
)
from app.schemas.requests import DiligenceResponseIn, DiligenceStatusIn, HumanDecisionIn
from app.services import analysis
from app.services.serializers import (
    assessment_out,
    debate_out,
    diligence_out,
    evidence_out,
    memo_out,
    opportunity_out,
)

router = APIRouter(tags=["opportunities"], prefix="/api")


def _get_opp(db: Session, opp_id: int) -> Opportunity:
    o = db.get(Opportunity, opp_id)
    if not o:
        raise HTTPException(404, "Opportunity not found.")
    return o


@router.get("/opportunities")
def list_opportunities(
    stage: str | None = None, status: str | None = None,
    entry_type: str | None = None, db: Session = Depends(get_db),
) -> dict:
    q = select(Opportunity)
    if stage:
        q = q.where(Opportunity.stage == stage)
    if status:
        q = q.where(Opportunity.status == status)
    if entry_type:
        q = q.where(Opportunity.entry_type == entry_type)
    opps = db.scalars(q.order_by(Opportunity.id)).all()
    return {"items": [opportunity_out(db, o) for o in opps]}


@router.get("/opportunities/{opp_id}")
def get_opportunity(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    base = opportunity_out(db, o, detail=True)
    base["assessment"] = _latest_assessment(db, opp_id)
    base["debate"] = _latest_debate(db, opp_id)
    base["memo"] = _latest_memo(db, opp_id)
    base["diligence"] = [diligence_out(q) for q in db.scalars(
        select(DiligenceQuestion).where(DiligenceQuestion.opportunity_id == opp_id)
    ).all()]

    # Surface the collected evidence (founder + company) so the profile's
    # Evidence Timeline shows the real GitHub/pitch-deck data.
    ev: dict[int, Evidence] = {}
    if o.founder_id:
        for e in db.scalars(select(Evidence).where(Evidence.founder_id == o.founder_id)).all():
            ev[e.id] = e
    if o.company_id:
        for e in db.scalars(select(Evidence).where(Evidence.company_id == o.company_id)).all():
            ev[e.id] = e
    ordered = sorted(ev.values(), key=lambda e: (e.event_date or e.collected_at), reverse=True)
    base["evidence"] = [evidence_out(e) for e in ordered]
    return base


# ---- analysis (AI, rate-limited) -----------------------------------------

@router.post("/opportunities/{opp_id}/analyze", dependencies=[Depends(ai_rate_limit)])
def analyze(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    result = analysis.run_full_pipeline(db, o)
    if str(o.stage) in ("sourcing", "screening"):
        o.stage = WorkflowStage.DILIGENCE
    db.commit()
    return {"ok": True, **result}


@router.post("/opportunities/{opp_id}/assessment", dependencies=[Depends(ai_rate_limit)])
def gen_assessment(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    a = analysis.run_assessment(db, o)
    db.commit()
    return assessment_out(a)


@router.get("/opportunities/{opp_id}/assessment")
def get_assessment(opp_id: int, db: Session = Depends(get_db)) -> dict:
    a = _latest_assessment_obj(db, opp_id)
    if not a:
        raise HTTPException(404, "No assessment yet. POST to generate one.")
    return assessment_out(a)


@router.post("/opportunities/{opp_id}/diligence", dependencies=[Depends(ai_rate_limit)])
def gen_diligence(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    created = analysis.run_diligence(db, o)
    db.commit()
    return {"created": len(created), "items": [diligence_out(q) for q in created]}


@router.get("/opportunities/{opp_id}/diligence")
def get_diligence(opp_id: int, db: Session = Depends(get_db)) -> dict:
    items = db.scalars(
        select(DiligenceQuestion).where(DiligenceQuestion.opportunity_id == opp_id)
    ).all()
    return {"items": [diligence_out(q) for q in items]}


@router.put("/diligence/{question_id}/status")
def set_diligence_status(question_id: int, body: DiligenceStatusIn, db: Session = Depends(get_db)) -> dict:
    q = db.get(DiligenceQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found.")
    valid = {"open", "requested", "answered", "verified", "unresolved", "not_applicable"}
    if body.status not in valid:
        raise HTTPException(422, f"Invalid status. Must be one of {sorted(valid)}.")
    q.status = DiligenceStatus(body.status)
    db.commit()
    return diligence_out(q)


@router.post("/diligence/{question_id}/respond")
def respond_diligence(question_id: int, body: DiligenceResponseIn, db: Session = Depends(get_db)) -> dict:
    q = db.get(DiligenceQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found.")
    db.add(DiligenceResponse(
        question_id=question_id, answer=body.answer, answered_by=body.answered_by,
        evidence_ids=body.evidence_ids,
    ))
    q.status = DiligenceStatus.ANSWERED
    db.commit()
    db.refresh(q)
    return diligence_out(q)


@router.post("/opportunities/{opp_id}/arena", dependencies=[Depends(ai_rate_limit)])
def gen_arena(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    d = analysis.run_arena(db, o)
    db.commit()
    return debate_out(d)


@router.get("/opportunities/{opp_id}/arena")
def get_arena(opp_id: int, db: Session = Depends(get_db)) -> dict:
    d = _latest_debate_obj(db, opp_id)
    if not d:
        raise HTTPException(404, "No debate yet. POST to generate one.")
    return debate_out(d)


@router.post("/opportunities/{opp_id}/memo", dependencies=[Depends(ai_rate_limit)])
def gen_memo(opp_id: int, db: Session = Depends(get_db)) -> dict:
    o = _get_opp(db, opp_id)
    m = analysis.run_memo(db, o)
    db.commit()
    return memo_out(m)


@router.get("/opportunities/{opp_id}/memo")
def get_memo(opp_id: int, db: Session = Depends(get_db)) -> dict:
    m = _latest_memo_obj(db, opp_id)
    if not m:
        raise HTTPException(404, "No memo yet. POST to generate one.")
    return memo_out(m)


# ---- human decision (recorded SEPARATELY from system recommendation) ------

@router.post("/opportunities/{opp_id}/decision")
def record_decision(opp_id: int, body: HumanDecisionIn, db: Session = Depends(get_db)) -> dict:
    _get_opp(db, opp_id)  # validate existence (404 if missing)
    valid_dec = {"approved", "rejected", "deferred", "overridden"}
    if body.decision not in valid_dec:
        raise HTTPException(422, f"Invalid decision. Must be one of {sorted(valid_dec)}.")
    rec = db.scalar(
        select(RecommendedAction).where(
            RecommendedAction.opportunity_id == opp_id,
            RecommendedAction.superseded == False,  # noqa: E712
        ).order_by(RecommendedAction.id.desc())
    )
    hd = HumanDecision(
        opportunity_id=opp_id,
        recommended_action_id=rec.id if rec else None,
        decided_by=body.decided_by, decision=body.decision, chosen_action=body.chosen_action,
        system_recommended_action=str(rec.action) if rec else None,
        notes=body.notes, decided_at=datetime.now(UTC),
    )
    db.add(hd)
    # The HumanDecision row above is the durable, auditable record (real data,
    # not demo-only). We intentionally do NOT flip the shared opportunity
    # status/stage here: a decision is scoped to the investor who made it
    # (tracked per-browser on the client), so it must not change what every
    # other investor sees on the shared pipeline.
    db.add(WorkflowEvent(
        opportunity_id=opp_id, event_type="human_decision",
        detail=f"{body.decision}: {body.chosen_action} (system rec: {hd.system_recommended_action})",
        actor=body.decided_by, occurred_at=datetime.now(UTC),
    ))
    db.commit()
    return {
        "ok": True,
        "human_decision": {
            "decision": hd.decision, "chosen_action": hd.chosen_action,
            "system_recommended_action": hd.system_recommended_action,
            "decided_by": hd.decided_by, "decided_at": hd.decided_at.isoformat(),
            "notes": hd.notes,
        },
        "note": "Recorded as a human decision, kept separate from the system recommendation. "
                "No outreach or investment is executed automatically.",
    }


@router.get("/opportunities/{opp_id}/decisions")
def list_decisions(opp_id: int, db: Session = Depends(get_db)) -> dict:
    items = db.scalars(
        select(HumanDecision).where(HumanDecision.opportunity_id == opp_id).order_by(HumanDecision.id)
    ).all()
    return {"items": [
        {"decision": h.decision, "chosen_action": h.chosen_action,
         "system_recommended_action": h.system_recommended_action, "decided_by": h.decided_by,
         "decided_at": h.decided_at.isoformat(), "notes": h.notes}
        for h in items
    ]}


# ---- contradiction validation (reject nonexistent evidence IDs) -----------

@router.post("/opportunities/{opp_id}/validate-evidence-refs")
def validate_evidence_refs(opp_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    """Validate that referenced evidence IDs actually exist for this opportunity.

    Guards against AI output citing nonexistent evidence.
    """
    o = _get_opp(db, opp_id)
    allowed: set[int] = set()
    if o.founder_id:
        allowed |= {e.id for e in db.scalars(select(Evidence).where(Evidence.founder_id == o.founder_id)).all()}
    if o.company_id:
        allowed |= {e.id for e in db.scalars(select(Evidence).where(Evidence.company_id == o.company_id)).all()}
    valid, rejected = validate_evidence_ids(payload.get("evidence_ids", []), allowed)
    return {"valid_evidence_ids": valid, "rejected_evidence_ids": rejected,
            "all_valid": len(rejected) == 0}


# ---- helpers --------------------------------------------------------------

def _latest_assessment_obj(db: Session, opp_id: int) -> OpportunityAssessment | None:
    return db.scalar(
        select(OpportunityAssessment).where(OpportunityAssessment.opportunity_id == opp_id)
        .order_by(OpportunityAssessment.version.desc())
    )


def _latest_assessment(db: Session, opp_id: int) -> dict | None:
    a = _latest_assessment_obj(db, opp_id)
    return assessment_out(a) if a else None


def _latest_debate_obj(db: Session, opp_id: int) -> Debate | None:
    return db.scalar(
        select(Debate).where(Debate.opportunity_id == opp_id).order_by(Debate.version.desc())
    )


def _latest_debate(db: Session, opp_id: int) -> dict | None:
    d = _latest_debate_obj(db, opp_id)
    return debate_out(d) if d else None


def _latest_memo_obj(db: Session, opp_id: int) -> InvestmentMemo | None:
    return db.scalar(
        select(InvestmentMemo).where(InvestmentMemo.opportunity_id == opp_id)
        .order_by(InvestmentMemo.version.desc())
    )


def _latest_memo(db: Session, opp_id: int) -> dict | None:
    m = _latest_memo_obj(db, opp_id)
    return memo_out(m) if m else None
