"""Connector interfaces and shared result types.

A clean connector interface so future integrations (hackathons, product
launches, papers, patents, accelerators, approved social signals) can be added
without rewriting the app. Only GitHub is implemented and *live* in this
version — all others are declared but explicitly report themselves as
unavailable. We never claim an unimplemented connector is live.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.models.enums import Provenance, SourceType, SyncStatus, VerificationStatus


@dataclass
class NormalizedEvidence:
    """A source-agnostic normalized evidence record ready to persist."""

    source_name: str
    source_type: SourceType
    source_url: str | None
    kind: str
    title: str
    raw_value: str
    structured_value: dict
    event_date: datetime | None
    provenance: Provenance
    verification_status: VerificationStatus
    confidence: float
    dedup_key: str


@dataclass
class ConnectorResult:
    status: SyncStatus
    connector: str
    target: str
    evidence: list[NormalizedEvidence] = field(default_factory=list)
    message: str = ""
    rate_limit_remaining: int | None = None
    rate_limit_reset_at: datetime | None = None
    # optional profile-level metadata (name, bio, location, ...)
    profile: dict = field(default_factory=dict)


class Connector:
    """Base connector interface."""

    name: str = "base"
    is_live: bool = False

    async def health(self) -> dict:
        raise NotImplementedError


class UnavailableConnector(Connector):
    """Declared-but-not-implemented connector. Honestly reports itself unavailable."""

    def __init__(self, name: str):
        self.name = name
        self.is_live = False

    async def health(self) -> dict:
        return {
            "connector": self.name,
            "live": False,
            "status": "not_implemented",
            "message": f"The {self.name} connector is planned but not implemented in this version.",
        }
