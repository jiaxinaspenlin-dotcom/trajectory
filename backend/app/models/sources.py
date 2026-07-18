"""Memory layer: DataSource, ConnectorSync, Evidence, Claim, links, contradictions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    Provenance,
    SourceType,
    SyncStatus,
    VerificationStatus,
)


class DataSource(Base):
    """A logical source (a GitHub profile, a website, an uploaded deck, ...)."""

    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[SourceType] = mapped_column(String(48))
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_live_connector: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    syncs: Mapped[list[ConnectorSync]] = relationship(
        back_populates="data_source", cascade="all, delete-orphan"
    )
    evidence: Mapped[list[Evidence]] = relationship(back_populates="data_source")


class ConnectorSync(Base):
    """A single sync attempt against a connector; captures rate-limit/errors."""

    __tablename__ = "connector_syncs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("data_sources.id"), nullable=True
    )
    connector: Mapped[str] = mapped_column(String(64))  # e.g. "github"
    target: Mapped[str] = mapped_column(String(512))
    status: Mapped[SyncStatus] = mapped_column(String(32))
    items_collected: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    rate_limit_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rate_limit_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    data_source: Mapped[DataSource | None] = relationship(back_populates="syncs")


class Evidence(Base):
    """A single normalized, timestamped, attributed piece of collected data."""

    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    founder_id: Mapped[int | None] = mapped_column(ForeignKey("founders.id"), nullable=True, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True, index=True)

    data_source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id"), nullable=True)
    data_source: Mapped[DataSource | None] = relationship(back_populates="evidence")

    source_name: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[SourceType] = mapped_column(String(48))
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    kind: Mapped[str] = mapped_column(String(64), index=True)  # e.g. github_repo, deck_metric
    title: Mapped[str] = mapped_column(String(512), default="")
    raw_value: Mapped[str] = mapped_column(Text, default="")
    structured_value: Mapped[dict] = mapped_column(default=dict)

    event_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    provenance: Mapped[Provenance] = mapped_column(String(32))
    verification_status: Mapped[VerificationStatus] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1

    # content hash for dedup across syncs
    dedup_key: Mapped[str] = mapped_column(String(128), index=True, default="")
    is_stale: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class Claim(Base):
    """A discrete factual claim with a per-claim Trust Score."""

    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    founder_id: Mapped[int | None] = mapped_column(ForeignKey("founders.id"), nullable=True, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True, index=True)

    text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64))  # traction, technical, team, market...
    owner: Mapped[str] = mapped_column(String(255), default="")  # who asserts it

    source_name: Mapped[str] = mapped_column(String(255), default="")
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    collection_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    event_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    excerpt: Mapped[str] = mapped_column(Text, default="")
    structured_value: Mapped[dict] = mapped_column(default=dict)

    provenance: Mapped[Provenance] = mapped_column(String(32))
    verification_status: Mapped[VerificationStatus] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    trust_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..100, per claim
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    evidence_links: Mapped[list[ClaimEvidenceLink]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class ClaimEvidenceLink(Base):
    """Links a claim to supporting or contradictory evidence."""

    __tablename__ = "claim_evidence_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidence.id"), index=True)
    relation: Mapped[str] = mapped_column(String(32), default="supports")  # supports|contradicts

    claim: Mapped[Claim] = relationship(back_populates="evidence_links")


class ClaimContradiction(Base):
    """A detected contradiction between two claims (or a claim and evidence)."""

    __tablename__ = "claim_contradictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_a_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), index=True)
    claim_b_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), default="medium")  # low|medium|high
    detected_by: Mapped[str] = mapped_column(String(32), default="rule")  # rule|ai
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
