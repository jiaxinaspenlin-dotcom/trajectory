"""Thesis-fit scoring. Every opportunity is evaluated through the ACTIVE thesis."""

from __future__ import annotations

from app.models.core import InvestmentThesis
from app.models.entities import Company


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
