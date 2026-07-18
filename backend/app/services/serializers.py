"""ORM -> dict serializers for API responses (kept explicit and honest)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity, OpportunityAssessment
from app.models.core import InvestmentThesis
from app.models.entities import Company, Founder
from app.models.sources import Claim, Evidence
from app.models.workflow import Debate, DiligenceQuestion, InvestmentMemo, RecommendedAction
from app.services.founder import latest_founder_score, momentum_for


def iso(dt):
    return dt.isoformat() if dt else None


def thesis_out(t: InvestmentThesis) -> dict:
    return {
        "id": t.id, "fund_id": t.fund_id, "is_active": t.is_active, "fund_name": t.fund_name,
        "sectors": t.sectors, "stages": t.stages, "geographies": t.geographies,
        "min_check_size": t.min_check_size, "max_check_size": t.max_check_size,
        "target_ownership": t.target_ownership, "risk_tolerance": t.risk_tolerance,
        "traction_preferences": t.traction_preferences, "founder_preferences": t.founder_preferences,
        "excluded_sectors": t.excluded_sectors, "excluded_geographies": t.excluded_geographies,
        "excluded_business_models": t.excluded_business_models,
        "custom_description": t.custom_description, "custom_scoring_criteria": t.custom_scoring_criteria,
        "score_weights": t.score_weights, "updated_at": iso(t.updated_at),
    }


def founder_out(f: Founder) -> dict:
    return {
        "id": f.id, "full_name": f.full_name, "email": f.email,
        "github_username": f.github_username, "location": f.location, "headline": f.headline,
        "bio": f.bio, "is_demo": f.is_demo, "education": f.education, "work_history": f.work_history,
        "accelerators": f.accelerators, "prior_funding": f.prior_funding,
    }


def company_out(c: Company) -> dict:
    return {
        "id": c.id, "name": c.name, "website": c.website, "github_org": c.github_org,
        "sector": c.sector, "stage": c.stage, "geography": c.geography,
        "business_model": c.business_model, "one_liner": c.one_liner, "description": c.description,
        "is_demo": c.is_demo,
    }


def evidence_out(e: Evidence) -> dict:
    return {
        "id": e.id, "founder_id": e.founder_id, "company_id": e.company_id,
        "source_name": e.source_name, "source_type": str(e.source_type), "source_url": e.source_url,
        "kind": e.kind, "title": e.title, "raw_value": e.raw_value,
        "structured_value": e.structured_value, "event_date": iso(e.event_date),
        "collected_at": iso(e.collected_at), "provenance": str(e.provenance),
        "verification_status": str(e.verification_status), "confidence": e.confidence,
        "is_stale": e.is_stale, "is_demo": e.is_demo,
    }


def claim_out(db: Session, c: Claim) -> dict:
    supports = [ln.evidence_id for ln in c.evidence_links if ln.relation == "supports"]
    contradicts = [ln.evidence_id for ln in c.evidence_links if ln.relation == "contradicts"]
    return {
        "id": c.id, "founder_id": c.founder_id, "company_id": c.company_id, "text": c.text,
        "category": c.category, "owner": c.owner, "source_name": c.source_name,
        "source_url": c.source_url, "collection_date": iso(c.collection_date),
        "event_date": iso(c.event_date), "excerpt": c.excerpt, "structured_value": c.structured_value,
        "provenance": str(c.provenance), "verification_status": str(c.verification_status),
        "confidence": c.confidence, "trust_score": c.trust_score,
        "supporting_evidence_ids": supports, "contradictory_evidence_ids": contradicts,
        "is_demo": c.is_demo,
    }


def founder_score_out(fs) -> dict | None:
    if not fs:
        return None
    return {
        "id": fs.id, "founder_id": fs.founder_id, "version": fs.version, "score": fs.score,
        "confidence": fs.confidence, "components": fs.components, "explanation": fs.explanation,
        "evidence_ids": fs.evidence_ids, "computed_at": iso(fs.computed_at),
    }


def assessment_out(a: OpportunityAssessment) -> dict:
    return {
        "id": a.id, "opportunity_id": a.opportunity_id, "version": a.version,
        "generated_by": a.generated_by, "computed_at": iso(a.computed_at),
        "axes": [
            {
                "axis": str(ax.axis), "display_score": ax.display_score, "label": str(ax.label),
                "confidence": ax.confidence, "trend": str(ax.trend), "outlook": ax.outlook,
                "supporting_points": ax.supporting_points,
                "supporting_evidence_ids": ax.supporting_evidence_ids,
                "risks": ax.risks, "missing_information": ax.missing_information,
                "contradictions": ax.contradictions, "narrative": ax.narrative,
            }
            for ax in a.axes
        ],
    }


def debate_out(d: Debate) -> dict:
    r = d.referee_decision
    return {
        "id": d.id, "opportunity_id": d.opportunity_id, "version": d.version,
        "generated_by": d.generated_by, "computed_at": iso(d.computed_at),
        "arguments": [
            {
                "role": str(a.role), "headline": a.headline, "points": a.points,
                "speech_bubble": a.speech_bubble, "referenced_evidence_ids": a.referenced_evidence_ids,
            }
            for a in d.arguments
        ],
        "referee": (
            {
                "recommended_action": str(r.recommended_action), "confidence": r.confidence,
                "strongest_bull_point": r.strongest_bull_point,
                "strongest_bear_point": r.strongest_bear_point,
                "unresolved_questions": r.unresolved_questions,
                "required_diligence": r.required_diligence,
                "evidence_that_would_change": r.evidence_that_would_change,
                "final_decision_supportable": r.final_decision_supportable,
                "rationale": r.rationale, "speech_bubble": r.speech_bubble,
            }
            if r else None
        ),
    }


def memo_out(m: InvestmentMemo) -> dict:
    return {
        "id": m.id, "opportunity_id": m.opportunity_id, "version": m.version,
        "generated_by": m.generated_by, "computed_at": iso(m.computed_at),
        "sections": m.sections, "recommended_action": m.recommended_action, "confidence": m.confidence,
    }


def diligence_out(q: DiligenceQuestion) -> dict:
    return {
        "id": q.id, "opportunity_id": q.opportunity_id, "question": q.question,
        "category": q.category, "rationale": q.rationale, "related_claim_ids": q.related_claim_ids,
        "status": str(q.status), "generated_by": q.generated_by,
        "responses": [
            {"id": r.id, "answer": r.answer, "answered_by": r.answered_by, "evidence_ids": r.evidence_ids}
            for r in q.responses
        ],
    }


def opportunity_out(db: Session, o: Opportunity, *, detail: bool = False) -> dict:
    founder = db.get(Founder, o.founder_id) if o.founder_id else None
    company = db.get(Company, o.company_id) if o.company_id else None
    fs = latest_founder_score(db, o.founder_id) if o.founder_id else None
    base = {
        "id": o.id, "fund_id": o.fund_id, "entry_type": str(o.entry_type),
        "stage": str(o.stage), "status": str(o.status),
        "founder": founder_out(founder) if founder else None,
        "company": company_out(company) if company else None,
        "thesis_fit_score": o.thesis_fit_score, "surfaced_reason": o.surfaced_reason,
        "first_signal_at": iso(o.first_signal_at), "recommendation_at": iso(o.recommendation_at),
        "founder_score": founder_score_out(fs), "is_demo": o.is_demo,
    }
    if o.founder_id:
        base["momentum"] = momentum_for(db, o.founder_id)
    if detail:
        rec = db.scalar(
            select(RecommendedAction).where(
                RecommendedAction.opportunity_id == o.id,
                RecommendedAction.superseded == False,  # noqa: E712
            ).order_by(RecommendedAction.id.desc())
        )
        base["current_recommendation"] = (
            {"action": str(rec.action), "confidence": rec.confidence, "rationale": rec.rationale}
            if rec else None
        )
    return base
