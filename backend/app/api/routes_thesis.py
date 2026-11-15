"""Configurable investment thesis endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import active_thesis, default_fund, get_db
from app.models.core import InvestmentThesis
from app.schemas.requests import ThesisIn
from app.services.serializers import thesis_out
from app.services.thesis import recalculate_fit, stale_fit_count

router = APIRouter(tags=["thesis"], prefix="/api/thesis")


@router.get("")
def get_active_thesis(db: Session = Depends(get_db)) -> dict:
    fund = default_fund(db)
    t = active_thesis(db, fund.id)
    if not t:
        return {
            "thesis": None, "fund_id": fund.id, "message": "No thesis configured yet.",
            "stale_fit_count": 0,
        }
    return {
        "thesis": thesis_out(t), "fund_id": fund.id, "impact": _impact_summary(t),
        "stale_fit_count": stale_fit_count(db, fund.id, t),
    }


@router.get("/list")
def list_theses(db: Session = Depends(get_db)) -> dict:
    fund = default_fund(db)
    ts = db.scalars(select(InvestmentThesis).where(InvestmentThesis.fund_id == fund.id)).all()
    return {"items": [thesis_out(t) for t in ts]}


@router.post("")
def create_thesis(body: ThesisIn, db: Session = Depends(get_db)) -> dict:
    fund = default_fund(db)
    # deactivate previous active theses (keep history)
    for t in db.scalars(
        select(InvestmentThesis).where(
            InvestmentThesis.fund_id == fund.id, InvestmentThesis.is_active == True  # noqa: E712
        )
    ).all():
        t.is_active = False
    t = InvestmentThesis(fund_id=fund.id, is_active=True, **body.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    # Stored fit scores are left as they are; the count tells the investor
    # how many now differ from this thesis.
    return {
        "thesis": thesis_out(t), "impact": _impact_summary(t),
        "stale_fit_count": stale_fit_count(db, fund.id, t),
    }


@router.put("/{thesis_id}")
def update_thesis(thesis_id: int, body: ThesisIn, db: Session = Depends(get_db)) -> dict:
    t = db.get(InvestmentThesis, thesis_id)
    if not t:
        raise HTTPException(404, "Thesis not found.")
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return {
        "thesis": thesis_out(t), "impact": _impact_summary(t),
        "stale_fit_count": stale_fit_count(db, t.fund_id, t),
    }


@router.post("/recalculate-fit")
def recalculate_thesis_fit(opportunity_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    """Rescore stale thesis fits. Never changes stage, status or shortlists."""
    fund = default_fund(db)
    t = active_thesis(db, fund.id)
    if not t:
        raise HTTPException(409, "No thesis configured yet. Create one first.")
    items = recalculate_fit(db, fund.id, t, opportunity_id)
    db.commit()
    return {"updated": len(items), "items": items, "stale_fit_count": stale_fit_count(db, fund.id, t)}


def _impact_summary(t: InvestmentThesis) -> dict:
    return {
        "summary": (
            f"Sourcing, screening, ranking and recommendations are evaluated through "
            f"'{t.fund_name}'. Companies in {t.sectors or 'any sector'} at "
            f"{t.stages or 'any stage'} in {t.geographies or 'any geography'} score higher; "
            f"excluded sectors/geographies/business models are floored."
        ),
        "affects": ["thesis_fit", "sourcing_rank", "referee_recommendation", "founder_score_weights"],
    }
