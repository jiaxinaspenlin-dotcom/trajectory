"""Pytest fixtures: isolated in-memory-ish SQLite DB + TestClient."""

from __future__ import annotations

import os
import tempfile

import pytest

# Force a throwaway SQLite DB and disable AI before app import.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_tmp.name}"
os.environ["ANTHROPIC_API_KEY"] = ""  # force deterministic fallback in tests
os.environ["AI_RATE_LIMIT_PER_MINUTE"] = "1000"

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
