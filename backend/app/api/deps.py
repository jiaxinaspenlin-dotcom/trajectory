"""Shared API dependencies."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db  # re-export
from app.models.core import Fund, InvestmentThesis

__all__ = ["get_db", "default_fund", "active_thesis"]


def default_fund(db: Session) -> Fund:
    """Return the first fund, creating a placeholder if none exists.

    Single-tenant convenience for the demo; multi-fund is fully modeled.
    """
    fund = db.scalar(select(Fund).order_by(Fund.id))
    if fund is None:
        fund = Fund(name="Demo Fund")
        db.add(fund)
        db.flush()
    return fund


def active_thesis(db: Session, fund_id: int) -> InvestmentThesis | None:
    return db.scalar(
        select(InvestmentThesis)
        .where(InvestmentThesis.fund_id == fund_id, InvestmentThesis.is_active == True)  # noqa: E712
        .order_by(InvestmentThesis.id.desc())
    )
