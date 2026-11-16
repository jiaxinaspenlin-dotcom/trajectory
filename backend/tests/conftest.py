"""Pytest fixtures: isolated in-memory-ish SQLite DB + TestClient."""

from __future__ import annotations

import os
import tempfile

import pytest

# Force a throwaway SQLite DB and disable AI before app import.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_tmp.name}"
os.environ["OPENAI_API_KEY"] = ""  # AI disabled by default; use the mock_ai fixture to enable
os.environ["AI_RATE_LIMIT_PER_MINUTE"] = "1000"
os.environ["TAVILY_API_KEY"] = ""  # web search off by default; tests replace the provider

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.db.base import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def seeded():
    """Seed demo data once for endpoint tests."""
    from app.seed.seed import run_seed

    run_seed()
    yield


def _stub_generate_json(system: str, user: str, **_kw) -> dict:
    """Canned OpenAI responses keyed off the system prompt, for tests without a key.

    Deliberately includes a hallucinated evidence_id (999999) so tests can prove
    the validation layer strips references to nonexistent evidence.
    """
    s = system.lower()
    if "three independent axes" in s:
        return {"axes": [
            {"axis": "founder", "display_score": 72, "label": "Promising", "confidence": 0.7,
             "outlook": "neutral", "supporting_points": [{"text": "strong execution", "evidence_ids": [1, 999999]}],
             "risks": ["thin market data"], "missing_information": ["references"], "contradictions": [], "narrative": "Founder axis."},
            {"axis": "market", "display_score": 40, "label": "Mixed", "confidence": 0.4, "outlook": "neutral",
             "supporting_points": [], "risks": [], "missing_information": ["TAM"], "contradictions": [], "narrative": "Market axis."},
            {"axis": "idea_vs_market", "display_score": 65, "label": "Promising", "confidence": 0.5, "outlook": "neutral",
             "supporting_points": [], "risks": [], "missing_information": [], "contradictions": [], "narrative": "Idea axis."},
        ]}
    if "you are the bull" in s:
        return {"headline": "Advance", "speech_bubble": "Strong.", "points": [{"text": "high score", "evidence_ids": [1]}]}
    if "you are the bear" in s:
        return {"headline": "Caution", "speech_bubble": "Unverified.", "points": [{"text": "unverified traction", "evidence_ids": []}]}
    if "you are the referee" in s:
        return {"recommended_action": "not-a-real-action", "confidence": 0.6, "strongest_bull_point": "x",
                "strongest_bear_point": "y", "unresolved_questions": ["q"], "required_diligence": ["d"],
                "evidence_that_would_change": "z", "final_decision_supportable": False, "rationale": "r", "speech_bubble": "b"}
    if "diligence analyst" in s:
        return {"questions": [{"question": "Provide retention.", "category": "traction", "rationale": "gap", "related_claim_ids": []}]}
    if "investment memo" in s:
        return {"sections": [{"key": "snapshot", "title": "Company snapshot", "body": "…", "evidence_ids": [1], "unavailable_label": None}],
                "recommended_action": "Continue Diligence", "confidence": 0.5}
    if "natural-language search" in s:
        return {"sectors": ["fintech"], "stages": ["seed"], "geographies": ["Boston"], "technical_founder": True,
                "no_prior_institutional_funding": None, "requires_product_adoption": True, "keywords": [],
                "min_founder_momentum": None, "interpretation": "parsed"}
    if "pitch-deck" in s:
        return {"company_name": None, "one_liner": None, "sector": None, "problem": None, "product": None,
                "metrics": [], "team": [], "ask": None, "missing": ["revenue"]}
    return {"summary": "ok", "evidence_ids": [1]}


@pytest.fixture
def mock_ai(monkeypatch):
    """Enable the AI provider with a deterministic stub (no network, no key)."""
    from app.ai.provider import provider

    monkeypatch.setattr(provider, "enabled", True)
    monkeypatch.setattr(provider, "generate_json", _stub_generate_json)
    yield


@pytest.fixture
def stub_github(monkeypatch):
    """Replace the live GitHub fetch with one public-repo evidence item, so the
    real sync route (founder + outbound opportunity creation) runs offline.
    Every stubbed profile gets a Rust repo tagged with GITHUB_STUB_TOPICS."""
    from datetime import UTC, datetime

    from app.models.enums import Provenance, SourceType, VerificationStatus
    from app.models.sources import Evidence

    async def fake_sync(db, founder_id, username, thesis):
        db.add(Evidence(
            founder_id=founder_id, source_name=f"GitHub {username}/ledgerkit",
            source_type=SourceType.GITHUB_REPO, source_url=f"https://github.com/{username}/ledgerkit",
            kind="github_repo", title="Public repository: ledgerkit", raw_value="",
            structured_value={"stars": 42, "language": "Rust", "topics": list(GITHUB_STUB_TOPICS)},
            collected_at=datetime.now(UTC),
            provenance=Provenance.INDEPENDENT, verification_status=VerificationStatus.VERIFIED,
        ))
        db.flush()
        return {"status": "success", "message": "stubbed", "evidence_added": 1}

    monkeypatch.setattr("app.api.routes_sourcing.sync_github_user", fake_sync)


GITHUB_STUB_TOPICS = ("ledger", "payments")
