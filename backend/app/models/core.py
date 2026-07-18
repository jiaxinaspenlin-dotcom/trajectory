"""Core account models: User, Fund, InvestmentThesis."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.workflow import TourProgress


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(64), default="investor")

    fund_id: Mapped[int | None] = mapped_column(ForeignKey("funds.id"), nullable=True)
    fund: Mapped[Fund | None] = relationship(back_populates="users")

    tour_progress: Mapped[list[TourProgress]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)

    users: Mapped[list[User]] = relationship(back_populates="fund")
    theses: Mapped[list[InvestmentThesis]] = relationship(
        back_populates="fund", cascade="all, delete-orphan"
    )


class InvestmentThesis(Base):
    """A fully configurable, per-fund investment thesis.

    Every sourcing result, assessment, ranking, and recommendation is evaluated
    through the *active* thesis for the fund. Not hardcoded to any single fund.
    """

    __tablename__ = "investment_theses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id"), index=True)
    fund: Mapped[Fund] = relationship(back_populates="theses")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    fund_name: Mapped[str] = mapped_column(String(255))
    # list[str] columns stored as JSON — portable across SQLite/Postgres
    sectors: Mapped[list] = mapped_column(default=list)
    stages: Mapped[list] = mapped_column(default=list)
    geographies: Mapped[list] = mapped_column(default=list)

    min_check_size: Mapped[float] = mapped_column(Float, default=0.0)
    max_check_size: Mapped[float] = mapped_column(Float, default=0.0)
    target_ownership: Mapped[float] = mapped_column(Float, default=0.0)  # percent

    risk_tolerance: Mapped[str] = mapped_column(String(32), default="balanced")
    traction_preferences: Mapped[str] = mapped_column(Text, default="")
    founder_preferences: Mapped[str] = mapped_column(Text, default="")

    excluded_sectors: Mapped[list] = mapped_column(default=list)
    excluded_geographies: Mapped[list] = mapped_column(default=list)
    excluded_business_models: Mapped[list] = mapped_column(default=list)

    custom_description: Mapped[str] = mapped_column(Text, default="")
    # optional custom scoring criteria: [{"name":..., "weight":..., "description":...}]
    custom_scoring_criteria: Mapped[list] = mapped_column(default=list)

    # configurable Founder Score component weights (overrides defaults when set)
    score_weights: Mapped[dict] = mapped_column(default=dict)
