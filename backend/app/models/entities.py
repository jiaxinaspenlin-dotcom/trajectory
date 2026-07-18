"""Founder, Company, their relationship, Application, and UploadedDocument."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.scoring import FounderMomentumSnapshot, FounderScore


class Founder(Base):
    """A person. Founder Score persists here — across companies and applications."""

    __tablename__ = "founders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), index=True)
    # normalized name for dedup / spelling-variation matching
    normalized_name: Mapped[str] = mapped_column(String(255), index=True, default="")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_username: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # prestige-linked attributes (masked in prestige-free ranking)
    education: Mapped[list] = mapped_column(default=list)   # [{school, degree, is_elite}]
    work_history: Mapped[list] = mapped_column(default=list)  # [{company, role, is_famous}]
    accelerators: Mapped[list] = mapped_column(default=list)  # [{name, is_elite}]
    prior_funding: Mapped[list] = mapped_column(default=list)  # [{round, amount, investor}]

    relationships: Mapped[list[FounderCompanyRelationship]] = relationship(
        back_populates="founder", cascade="all, delete-orphan"
    )
    scores: Mapped[list[FounderScore]] = relationship(  # noqa: F821
        back_populates="founder", cascade="all, delete-orphan"
    )
    momentum_snapshots: Mapped[list[FounderMomentumSnapshot]] = relationship(  # noqa: F821
        back_populates="founder", cascade="all, delete-orphan"
    )


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    normalized_name: Mapped[str] = mapped_column(String(255), index=True, default="")
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_org: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    geography: Mapped[str | None] = mapped_column(String(128), nullable=True)
    business_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    one_liner: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    relationships: Mapped[list[FounderCompanyRelationship]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class FounderCompanyRelationship(Base):
    __tablename__ = "founder_company_relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    founder_id: Mapped[int] = mapped_column(ForeignKey("founders.id"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    role: Mapped[str] = mapped_column(String(128), default="Founder")
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    founder: Mapped[Founder] = relationship(back_populates="relationships")
    company: Mapped[Company] = relationship(back_populates="relationships")


class Application(Base):
    """An inbound founder application. Minimum inputs: company name + pitch deck."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    company_name: Mapped[str] = mapped_column(String(255))

    founder_names: Mapped[list] = mapped_column(default=list)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    github_profile: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_org: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    demo_link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    geography: Mapped[str | None] = mapped_column(String(128), nullable=True)

    funding_requested: Mapped[float | None] = mapped_column(Float, nullable=True)
    use_of_funds: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_users: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    prior_funding: Mapped[str | None] = mapped_column(Text, nullable=True)
    accelerator_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    team_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    founder_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # first-pass screening
    screen_summary: Mapped[str] = mapped_column(Text, default="")
    missing_fields: Mapped[list] = mapped_column(default=list)
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("uploaded_documents.id"), nullable=True
    )

    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class UploadedDocument(Base):
    """A pitch deck (or other doc) stored OUTSIDE the public static directory."""

    __tablename__ = "uploaded_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    stored_filename: Mapped[str] = mapped_column(String(512))  # sanitized, random
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer)
    num_pages: Mapped[int] = mapped_column(Integer, default=0)
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    # per-page text for slide/page references: [{page:int, text:str}]
    page_texts: Mapped[list] = mapped_column(default=list)
    extraction_status: Mapped[str] = mapped_column(String(32), default="pending")
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
