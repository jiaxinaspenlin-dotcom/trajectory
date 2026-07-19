"""Health, connector status, settings, and guided-tour progress endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import default_fund, get_db
from app.connectors.base import UnavailableConnector
from app.connectors.github import GitHubConnector
from app.core.config import settings
from app.models.core import Fund
from app.models.sources import ConnectorSync, DataSource
from app.models.workflow import TourProgress
from app.schemas.requests import TourProgressIn

router = APIRouter(tags=["meta"])

# connectors declared but not implemented
_PLANNED_CONNECTORS = [
    "hackathons", "product_launches", "papers", "patents",
    "accelerator_cohorts", "social_signals",
]


@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    db_ok = True
    try:
        db.execute(select(func.count(Fund.id)))
    except Exception:  # noqa: BLE001
        db_ok = False
    return {
        "status": "ok",
        "environment": settings.environment,
        "database": {"connected": db_ok, "url_scheme": settings.resolved_database_url.split(":")[0]},
        "ai": {"provider": "openai", "enabled": settings.ai_enabled, "model": settings.openai_model},
        "github": {"authenticated": bool(settings.github_token)},
    }


@router.get("/api/connectors/status")
async def connector_status(db: Session = Depends(get_db)) -> dict:
    gh = GitHubConnector()
    gh_health = await gh.health()
    live = [gh_health]

    # last sync per connector
    last_github = db.scalar(
        select(ConnectorSync).where(ConnectorSync.connector == "github").order_by(ConnectorSync.id.desc())
    )
    if last_github:
        gh_health["last_sync"] = {
            "status": str(last_github.status), "target": last_github.target,
            "at": last_github.created_at.isoformat(), "items": last_github.items_collected,
            "message": last_github.message,
        }

    planned = []
    for name in _PLANNED_CONNECTORS:
        planned.append(await UnavailableConnector(name).health())

    return {"live": live, "planned_unavailable": planned}


@router.get("/api/settings")
def get_settings_view(db: Session = Depends(get_db)) -> dict:
    """Settings & data sources view. NEVER returns full API keys."""
    def mask(v: str) -> str:
        if not v:
            return ""
        return f"…{v[-4:]}" if len(v) > 4 else "set"

    sources = db.scalars(select(DataSource)).all()
    return {
        "openai": {
            "connected": settings.ai_enabled,
            "model": settings.openai_model,
            "key_hint": mask(settings.openai_api_key),  # masked; never full key
            "note": "Required for all AI features. Without a key, AI endpoints return 503 "
                    "(no fake fallback). Deterministic scoring still works.",
        },
        "github": {
            "connected": True,
            "authenticated": bool(settings.github_token),
            "token_hint": mask(settings.github_token),
            "rate_limit": "5000/hr (token)" if settings.github_token else "60/hr (anonymous)",
        },
        "database": {"connected": True, "scheme": settings.resolved_database_url.split(":")[0]},
        "live_connectors": ["github"],
        "unavailable_connectors": _PLANNED_CONNECTORS,
        "data_sources": [
            {"id": s.id, "name": s.name, "type": str(s.source_type),
             "live": s.is_live_connector, "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None}
            for s in sources
        ],
        "scoring_weights": _default_weights(),
        "upload_limit_mb": settings.max_upload_size_mb,
        "ai_rate_limit_per_minute": settings.ai_rate_limit_per_minute,
        "privacy_and_limitations": [
            "Only public GitHub data is collected. Restricted platforms (LinkedIn, X) are never scraped.",
            "No automatic outreach or investment is performed; humans approve consequential actions.",
            "AI never invents facts. AI features (assessment, arena, memo, diligence, search) require "
            "an OpenAI key; without one they are unavailable (HTTP 503) — there is no fake fallback. "
            "Deterministic scoring (Founder Score, Momentum, ranking, Trust) always works.",
            "Demo data is clearly labeled and never silently mixed with real evidence.",
        ],
    }


def _default_weights() -> list[dict]:
    from app.scoring.founder_score import COMPONENT_LABELS, DEFAULT_WEIGHTS

    return [
        {"key": k, "name": COMPONENT_LABELS[k], "weight": w}
        for k, w in DEFAULT_WEIGHTS.items()
    ]


@router.get("/api/tour")
def get_tour(user_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    tp = db.scalar(select(TourProgress).order_by(TourProgress.id.desc())) if user_id is None else \
        db.scalar(select(TourProgress).where(TourProgress.user_id == user_id))
    if not tp:
        return {"completed": False, "last_step": 0, "skipped": False}
    return {"completed": tp.completed, "last_step": tp.last_step, "skipped": tp.skipped}


@router.put("/api/tour")
def update_tour(body: TourProgressIn, db: Session = Depends(get_db)) -> dict:
    fund = default_fund(db)  # ensures a user exists path; use user_id or fallback
    from app.models.core import User

    user_id = body.user_id
    if user_id is None:
        user = db.scalar(select(User).order_by(User.id))
        if user is None:
            user = User(email="demo@trajectory.vc", name="Demo Investor", fund_id=fund.id)
            db.add(user)
            db.flush()
        user_id = user.id

    tp = db.scalar(select(TourProgress).where(TourProgress.user_id == user_id))
    if not tp:
        tp = TourProgress(user_id=user_id)
        db.add(tp)
    tp.completed = body.completed
    tp.last_step = body.last_step
    tp.skipped = body.skipped
    db.commit()
    return {"completed": tp.completed, "last_step": tp.last_step, "skipped": tp.skipped}
