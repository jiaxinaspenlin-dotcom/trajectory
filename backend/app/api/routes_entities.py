"""Founder, Company, Evidence, Claim, Founder Score & Momentum endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.entities import Company, Founder
from app.models.sources import Claim, ClaimContradiction, Evidence
from app.services.founder import compute_and_store_founder_score, latest_founder_score, momentum_for
from app.services.serializers import (
    claim_out,
    company_out,
    evidence_out,
    founder_out,
    founder_score_out,
)

router = APIRouter(tags=["entities"], prefix="/api")


@router.get("/founders")
def list_founders(
    include_demo: bool = True, db: Session = Depends(get_db)
) -> dict:
    q = select(Founder)
    if not include_demo:
        q = q.where(Founder.is_demo == False)  # noqa: E712
    founders = db.scalars(q).all()
    out = []
    for f in founders:
        fs = latest_founder_score(db, f.id)
        d = founder_out(f)
        d["founder_score"] = founder_score_out(fs)
        out.append(d)
    return {"items": out}


@router.get("/founders/{founder_id}")
def get_founder(founder_id: int, db: Session = Depends(get_db)) -> dict:
    f = db.get(Founder, founder_id)
    if not f:
        raise HTTPException(404, "Founder not found.")
    fs = latest_founder_score(db, founder_id)
    evidence = db.scalars(select(Evidence).where(Evidence.founder_id == founder_id)).all()
    d = founder_out(f)
    d["founder_score"] = founder_score_out(fs)
    d["momentum"] = momentum_for(db, founder_id)
    d["evidence"] = [evidence_out(e) for e in evidence]
    return d


@router.get("/founders/{founder_id}/score")
def founder_score(founder_id: int, db: Session = Depends(get_db)) -> dict:
    fs = latest_founder_score(db, founder_id)
    if not fs:
        raise HTTPException(404, "No score computed for this founder.")
    return founder_score_out(fs) or {}


@router.post("/founders/{founder_id}/score/recompute")
def recompute_score(founder_id: int, db: Session = Depends(get_db)) -> dict:
    if not db.get(Founder, founder_id):
        raise HTTPException(404, "Founder not found.")
    fs = compute_and_store_founder_score(db, founder_id)
    db.commit()
    return founder_score_out(fs) or {}


@router.get("/founders/{founder_id}/score/history")
def founder_score_history(founder_id: int, db: Session = Depends(get_db)) -> dict:
    from app.models.scoring import FounderScore

    scores = db.scalars(
        select(FounderScore).where(FounderScore.founder_id == founder_id).order_by(FounderScore.version)
    ).all()
    return {"items": [founder_score_out(s) for s in scores]}


@router.get("/founders/{founder_id}/momentum")
def founder_momentum(founder_id: int, db: Session = Depends(get_db)) -> dict:
    if not db.get(Founder, founder_id):
        raise HTTPException(404, "Founder not found.")
    return momentum_for(db, founder_id)


@router.get("/companies")
def list_companies(db: Session = Depends(get_db)) -> dict:
    return {"items": [company_out(c) for c in db.scalars(select(Company)).all()]}


@router.get("/companies/{company_id}")
def get_company(company_id: int, db: Session = Depends(get_db)) -> dict:
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(404, "Company not found.")
    d = company_out(c)
    d["evidence"] = [evidence_out(e) for e in db.scalars(select(Evidence).where(Evidence.company_id == company_id)).all()]
    d["claims"] = [claim_out(db, cl) for cl in db.scalars(select(Claim).where(Claim.company_id == company_id)).all()]
    return d


@router.get("/evidence")
def list_evidence(
    founder_id: int | None = None, company_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict:
    q = select(Evidence)
    if founder_id is not None:
        q = q.where(Evidence.founder_id == founder_id)
    if company_id is not None:
        q = q.where(Evidence.company_id == company_id)
    return {"items": [evidence_out(e) for e in db.scalars(q).all()]}


@router.get("/evidence/{evidence_id}")
def get_evidence(evidence_id: int, db: Session = Depends(get_db)) -> dict:
    e = db.get(Evidence, evidence_id)
    if not e:
        raise HTTPException(404, "Evidence not found.")
    return evidence_out(e)


@router.get("/claims")
def list_claims(
    founder_id: int | None = None, company_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict:
    q = select(Claim)
    if founder_id is not None:
        q = q.where(Claim.founder_id == founder_id)
    if company_id is not None:
        q = q.where(Claim.company_id == company_id)
    return {"items": [claim_out(db, c) for c in db.scalars(q).all()]}


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int, db: Session = Depends(get_db)) -> dict:
    c = db.get(Claim, claim_id)
    if not c:
        raise HTTPException(404, "Claim not found.")
    return claim_out(db, c)


@router.get("/contradictions")
def list_contradictions(
    company_id: int | None = None, founder_id: int | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """List contradictions, scoped to a company or founder.

    Scoping matters: a founder with no company must not see other founders'
    contradictions. When neither scope is given, returns all (admin/global).
    """
    items = db.scalars(select(ClaimContradiction)).all()
    result = []
    for con in items:
        ca = db.get(Claim, con.claim_a_id)
        if company_id is not None and (not ca or ca.company_id != company_id):
            continue
        if founder_id is not None and (not ca or ca.founder_id != founder_id):
            continue
        result.append({
            "id": con.id, "claim_a_id": con.claim_a_id, "claim_b_id": con.claim_b_id,
            "description": con.description, "severity": con.severity,
            "detected_by": con.detected_by, "resolved": con.resolved,
        })
    return {"items": result}
