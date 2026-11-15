"""Thesis-fit scoring. Every opportunity is evaluated through the ACTIVE thesis."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity
from app.models.core import InvestmentThesis
from app.models.entities import Company
from app.models.workflow import WorkflowEvent


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def compute_thesis_fit(thesis: InvestmentThesis, company: Company | None) -> tuple[float, list[str]]:
    """Return (fit_score 0..100, reasons) for a company against a thesis.

    Hard exclusions (excluded sector/geo/business model) drive the score to a
    floor. Otherwise sector/stage/geography alignment build the score up.
    """
    if company is None:
        return 0.0, ["No company associated yet."]

    reasons: list[str] = []
    sector = _norm(company.sector)
    geo = _norm(company.geography)
    stage = _norm(company.stage)
    bmodel = _norm(company.business_model)

    excluded_sectors = {_norm(s) for s in (thesis.excluded_sectors or [])}
    excluded_geos = {_norm(s) for s in (thesis.excluded_geographies or [])}
    excluded_bm = {_norm(s) for s in (thesis.excluded_business_models or [])}

    if sector and sector in excluded_sectors:
        return 5.0, [f"Excluded sector: {company.sector}."]
    if geo and geo in excluded_geos:
        return 5.0, [f"Excluded geography: {company.geography}."]
    if bmodel and bmodel in excluded_bm:
        return 8.0, [f"Excluded business model: {company.business_model}."]

    score = 30.0  # baseline for a non-excluded company

    sectors = {_norm(s) for s in (thesis.sectors or [])}
    if not sectors:
        score += 12
    elif sector and sector in sectors:
        score += 34
        reasons.append(f"Sector '{company.sector}' matches thesis.")
    elif sector:
        score += 4
        reasons.append(f"Sector '{company.sector}' is outside primary thesis sectors.")

    stages = {_norm(s) for s in (thesis.stages or [])}
    if not stages or (stage and stage in stages):
        score += 20
        if stage:
            reasons.append(f"Stage '{company.stage}' matches thesis.")
    elif stage:
        score += 4
        reasons.append(f"Stage '{company.stage}' is outside thesis stages.")

    geos = {_norm(s) for s in (thesis.geographies or [])}
    if not geos or (geo and geo in geos):
        score += 16
        if geo:
            reasons.append(f"Geography '{company.geography}' matches thesis.")
    elif geo:
        score += 4

    score = max(0.0, min(100.0, score))
    if not reasons:
        reasons.append("Partial alignment with thesis; review details.")
    return round(score, 1), reasons


# ---- Stale fit -------------------------------------------------------------
# Editing a thesis never rewrites stored fit scores. A stored score is stale
# when the active thesis would now score the company differently; the investor
# chooses when to recalculate.


def fit_is_stale(thesis: InvestmentThesis | None, company: Company | None, stored: float | None) -> bool:
    if thesis is None or company is None:
        return False
    current, _ = compute_thesis_fit(thesis, company)
    return stored is None or abs(current - float(stored)) > 1e-6


def _scored_opportunities(
    db: Session, fund_id: int, opportunity_id: int | None = None
) -> list[tuple[Opportunity, Company]]:
    q = select(Opportunity, Company).join(Company, Opportunity.company_id == Company.id).where(
        Opportunity.fund_id == fund_id
    )
    if opportunity_id is not None:
        q = q.where(Opportunity.id == opportunity_id)
    return [(o, c) for o, c in db.execute(q).all()]


def stale_fit_count(db: Session, fund_id: int, thesis: InvestmentThesis | None) -> int:
    if thesis is None:
        return 0
    return sum(
        fit_is_stale(thesis, c, o.thesis_fit_score) for o, c in _scored_opportunities(db, fund_id)
    )


def recalculate_fit(
    db: Session, fund_id: int, thesis: InvestmentThesis, opportunity_id: int | None = None
) -> list[dict]:
    """Rescore stale fits against the thesis. Touches only thesis_fit_score."""
    changes: list[dict] = []
    for o, c in _scored_opportunities(db, fund_id, opportunity_id):
        if not fit_is_stale(thesis, c, o.thesis_fit_score):
            continue
        previous = o.thesis_fit_score
        current, _ = compute_thesis_fit(thesis, c)
        o.thesis_fit_score = current
        db.add(WorkflowEvent(
            opportunity_id=o.id, event_type="thesis_fit_recalculated",
            detail=f"Thesis fit {previous} -> {current} ('{thesis.fund_name}')",
            actor="investor", occurred_at=datetime.now(UTC),
        ))
        changes.append({"opportunity_id": o.id, "previous": previous, "current": current})
    return changes
