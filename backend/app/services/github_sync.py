"""Sync a public GitHub profile/org/repo into normalized evidence + snapshots."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.github import GitHubConnector
from app.db.base import utcnow
from app.models.enums import SourceType, SyncStatus
from app.models.scoring import FounderMomentumSnapshot
from app.models.sources import ConnectorSync, DataSource
from app.services.evidence import persist_evidence
from app.services.founder import compute_and_store_founder_score


async def sync_github_user(
    db: Session, founder_id: int, username: str, thesis=None
) -> dict:
    connector = GitHubConnector()
    result = await connector.fetch_user(username)

    ds = _get_or_create_source(db, f"GitHub @{username}", SourceType.GITHUB_PROFILE,
                               result.profile.get("html_url") if result.profile else None)
    if result.status in (SyncStatus.SUCCESS, SyncStatus.PARTIAL):
        ds.last_synced_at = utcnow()

    sync = ConnectorSync(
        data_source_id=ds.id, connector="github", target=username,
        status=result.status, items_collected=len(result.evidence), message=result.message,
        rate_limit_remaining=result.rate_limit_remaining,
        rate_limit_reset_at=result.rate_limit_reset_at,
    )
    db.add(sync)
    db.flush()

    added = skipped = 0
    if result.evidence:
        added, skipped = persist_evidence(
            db, result.evidence, founder_id=founder_id, data_source_id=ds.id, is_demo=False
        )
        # recompute founder score (new version) and append a momentum snapshot
        score = compute_and_store_founder_score(db, founder_id, thesis)
        db.add(FounderMomentumSnapshot(
            founder_id=founder_id, snapshot_date=datetime.now(UTC),
            score=score.score, signals=_signals_from_evidence(result.evidence),
        ))
        db.flush()

    return {
        "status": result.status.value if hasattr(result.status, "value") else str(result.status),
        "message": result.message,
        "evidence_added": added,
        "evidence_updated": skipped,
        "rate_limit_remaining": result.rate_limit_remaining,
        "profile": result.profile,
    }


def _signals_from_evidence(evidence) -> dict:
    signals = {
        "commit_activity": 0, "repo_creation": 0, "repo_maintenance": 0,
        "release_frequency": 0, "outside_contributors": 0,
    }
    for e in evidence:
        if e.kind == "github_repo":
            signals["repo_creation"] += 1
        elif e.kind == "github_repo_maintenance":
            signals["repo_maintenance"] += 1
        elif e.kind == "github_release":
            signals["release_frequency"] += int((e.structured_value or {}).get("release_count", 1))
        elif e.kind == "github_outside_contributor":
            signals["outside_contributors"] += int((e.structured_value or {}).get("outside_contributors", 0))
    return signals


def _get_or_create_source(db: Session, name: str, stype: SourceType, url: str | None) -> DataSource:
    ds = db.scalar(select(DataSource).where(DataSource.name == name))
    if ds:
        return ds
    ds = DataSource(name=name, source_type=stype, url=url, is_live_connector=True)
    db.add(ds)
    db.flush()
    return ds
