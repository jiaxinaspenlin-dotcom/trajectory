"""Web sourcing: stored searches, reliable lead identifiers, and evidence review state."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebSearch(Base):
    """One investor web search and its validated shortlist.

    Saving reads the result from here (by key), never from the client, so a
    saved lead only ever carries evidence the server retrieved and validated.
    """

    __tablename__ = "web_searches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.id"), index=True)
    request: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(32), default="tavily")
    queries: Mapped[list] = mapped_column(default=list)
    status: Mapped[str] = mapped_column(String(32), default="success")  # success|no_sources|no_results
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    sources: Mapped[list] = mapped_column(default=list)  # [{id,url,title,domain,published_date,query}]
    results: Mapped[list] = mapped_column(default=list)  # validated results (see services.web_sourcing)
    rejected: Mapped[list] = mapped_column(default=list)  # [{company_name, reason}]
    notes: Mapped[list] = mapped_column(default=list)


class LeadIdentifier(Base):
    """A reliable identifier that resolves to exactly one opportunity.

    kinds: `domain` (company website host), `github` (verified GitHub login),
    `url` (canonical launch-page URL, used only when no domain is known).
    `founder_name` records a founder named on a source but not verified; it is
    shown as unverified and never used for matching. Uniqueness of the matching
    kinds is enforced by the service (one opportunity per identifier).
    """

    __tablename__ = "lead_identifiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    value: Mapped[str] = mapped_column(String(512), index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)


class LeadEvidenceReview(Base):
    """When an investor last reviewed a lead's evidence. Web evidence created
    after `reviewed_at` is "New evidence" in Founders and on the Map."""

    __tablename__ = "lead_evidence_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), unique=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
