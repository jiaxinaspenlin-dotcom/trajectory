"""Assemble the evidence-only context dict passed to AI services.

The model only ever sees STORED evidence and submitted information — nothing
else. This is the single choke point that enforces that rule.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity
from app.models.core import InvestmentThesis
from app.models.entities import Company, Founder
from app.models.sources import Claim, ClaimContradiction, Evidence
from app.services.founder import latest_founder_score, momentum_for
from app.services.thesis import compute_thesis_fit


def _evidence_dict(e: Evidence) -> dict:
    return {
        "id": e.id,
        "kind": e.kind,
        "title": e.title,
        "confidence": round(float(e.confidence), 2),
        "provenance": str(e.provenance),
        "verification_status": str(e.verification_status),
        "source_url": e.source_url,
    }


def _claim_dict(db: Session, c: Claim) -> dict:
    ev_ids = [ln.evidence_id for ln in c.evidence_links if ln.relation == "supports"]
    return {
        "id": c.id,
        "text": c.text,
        "category": c.category,
        "verification_status": str(c.verification_status),
        "trust_score": round(float(c.trust_score), 1),
        "evidence_ids": ev_ids,
    }


def build_opportunity_context(db: Session, opportunity: Opportunity) -> dict:
    thesis = db.get(InvestmentThesis, _active_thesis_id(db, opportunity.fund_id))
    founder = db.get(Founder, opportunity.founder_id) if opportunity.founder_id else None
    company = db.get(Company, opportunity.company_id) if opportunity.company_id else None

    evidence: list[Evidence] = []
    if founder:
        evidence += list(db.scalars(select(Evidence).where(Evidence.founder_id == founder.id)).all())
    if company:
        evidence += list(db.scalars(select(Evidence).where(Evidence.company_id == company.id)).all())
    # de-dup by id
    seen: dict[int, Evidence] = {e.id: e for e in evidence}
    evidence = list(seen.values())

    claims: list[Claim] = []
    if company:
        claims += list(db.scalars(select(Claim).where(Claim.company_id == company.id)).all())
    if founder:
        claims += list(db.scalars(select(Claim).where(Claim.founder_id == founder.id)).all())
    claims = list({c.id: c for c in claims}.values())

    claim_ids = [c.id for c in claims]
    contradictions = (
        list(db.scalars(select(ClaimContradiction).where(ClaimContradiction.claim_a_id.in_(claim_ids))).all())
        if claim_ids else []
    )

    fscore = latest_founder_score(db, founder.id) if founder else None
    momentum = momentum_for(db, founder.id) if founder else {}
    thesis_fit, _reasons = compute_thesis_fit(thesis, company) if thesis else (0.0, [])

    return {
        "opportunity_id": opportunity.id,
        "entry_type": str(opportunity.entry_type),
        "thesis": _thesis_dict(thesis),
        "founder": _founder_dict(founder),
        "company": _company_dict(company),
        "evidence": [_evidence_dict(e) for e in evidence],
        "claims": [_claim_dict(db, c) for c in claims],
        "contradictions": [
            {
                "id": c.id, "claim_a_id": c.claim_a_id, "claim_b_id": c.claim_b_id,
                "description": c.description, "severity": c.severity,
            }
            for c in contradictions
        ],
        "founder_score": {
            "score": fscore.score if fscore else 0.0,
            "confidence": fscore.confidence if fscore else 0.0,
            "explanation": fscore.explanation if fscore else "No score computed.",
            "components": fscore.components if fscore else [],
            "evidence_ids": fscore.evidence_ids if fscore else [],
        },
        "momentum": momentum,
        "thesis_fit_score": thesis_fit,
    }


def _active_thesis_id(db: Session, fund_id: int) -> int | None:
    t = db.scalar(
        select(InvestmentThesis)
        .where(InvestmentThesis.fund_id == fund_id, InvestmentThesis.is_active == True)  # noqa: E712
        .order_by(InvestmentThesis.id.desc())
    )
    return t.id if t else None


def _thesis_dict(t: InvestmentThesis | None) -> dict:
    if not t:
        return {}
    return {
        "fund_name": t.fund_name, "sectors": t.sectors, "stages": t.stages,
        "geographies": t.geographies, "risk_tolerance": t.risk_tolerance,
        "custom_description": t.custom_description,
    }


def _founder_dict(f: Founder | None) -> dict:
    if not f:
        return {}
    return {
        "id": f.id, "full_name": f.full_name, "headline": f.headline,
        "github_username": f.github_username, "location": f.location,
    }


def _company_dict(c: Company | None) -> dict:
    if not c:
        return {}
    return {
        "id": c.id, "name": c.name, "one_liner": c.one_liner, "description": c.description,
        "sector": c.sector, "stage": c.stage, "geography": c.geography,
        "business_model": c.business_model, "website": c.website,
    }
