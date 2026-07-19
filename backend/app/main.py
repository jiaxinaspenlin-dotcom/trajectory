"""Trajectory FastAPI application."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai.provider import AIError
from app.api import (
    routes_applications,
    routes_auth,
    routes_entities,
    routes_meta,
    routes_opportunities,
    routes_sourcing,
    routes_thesis,
)
from app.core.config import settings
from app.db.base import init_db

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Trajectory API",
    version="0.1.0",
    description=(
        "AI venture-capital operating system: Sourcing → Screening → Diligence → Decision. "
        "The VC fund is the client. Humans approve all consequential actions."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Also allow any Vercel deployment (production + preview URLs) so the frontend
    # works without pinning an exact origin in BACKEND_CORS_ORIGINS.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AIError)
async def _ai_error_handler(request: Request, exc: AIError) -> JSONResponse:
    """AI unavailable/failed -> 503. No fake fallback."""
    return JSONResponse(
        status_code=503,
        content={
            "detail": str(exc),
            "ai_unavailable": True,
            "hint": "Set OPENAI_API_KEY to enable AI features (assessment, arena, memo, diligence, search).",
        },
    )


@app.on_event("startup")
def _startup() -> None:
    # For SQLite/dev, ensure tables exist. Postgres uses Alembic migrations.
    if settings.resolved_database_url.startswith("sqlite"):
        init_db()


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "name": "Trajectory API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "ai_enabled": settings.ai_enabled,
    }


app.include_router(routes_auth.router)
app.include_router(routes_meta.router)
app.include_router(routes_thesis.router)
app.include_router(routes_entities.router)
app.include_router(routes_applications.router)
app.include_router(routes_opportunities.router)
app.include_router(routes_sourcing.router)
