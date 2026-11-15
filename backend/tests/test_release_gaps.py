"""Release gaps: deliberate stage moves, honest momentum windows, stale thesis
fit, and a production start without demo data."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.core.config import Settings, get_settings
from app.models.assessment import Opportunity
from app.models.entities import Company, Founder
from app.models.enums import EntryType, OpportunityStatus, WorkflowStage
from app.models.scoring import FounderMomentumSnapshot
from app.scoring.momentum import compute_momentum
from sqlalchemy import select


def _pipeline_ids(client) -> list[int]:
    return [o["id"] for o in client.get("/api/pipeline").json()["items"]]


# ---- 1. Run analysis must not skip Screening --------------------------------


def test_analysis_leaves_a_sourcing_lead_in_sourcing(client, seeded, stub_github, mock_ai):
    opp_id = client.post("/api/sourcing/github/sync", json={"username": "solo-builder"}).json()["opportunity_id"]
    assert client.get(f"/api/opportunities/{opp_id}").json()["stage"] == "sourcing"

    r = client.post(f"/api/opportunities/{opp_id}/analyze")
    assert r.status_code == 200
    assert r.json()["stage"] == "sourcing"
    assert client.get(f"/api/opportunities/{opp_id}").json()["stage"] == "sourcing"
    assert opp_id not in _pipeline_ids(client)

    # Move to Screening stays the way into the Pipeline.
    act = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "invite_to_apply"})
    assert act.json()["stage"] == "screening"
    assert opp_id in _pipeline_ids(client)


def test_analysis_moves_a_screening_deal_to_diligence(client, seeded, mock_ai):
    screening = client.get("/api/opportunities", params={"stage": "screening"}).json()["items"]
    opp_id = screening[0]["id"]
    r = client.post(f"/api/opportunities/{opp_id}/analyze")
    assert r.status_code == 200
    assert r.json()["stage"] == "diligence"
    assert client.get(f"/api/opportunities/{opp_id}").json()["stage"] == "diligence"


# ---- 2. Momentum names the window it really covers --------------------------


def _snaps(days_ago: list[int], scores: list[float], now: datetime) -> list[FounderMomentumSnapshot]:
    return [
        FounderMomentumSnapshot(founder_id=1, snapshot_date=now - timedelta(days=d), score=s, signals={})
        for d, s in zip(days_ago, scores, strict=True)
    ]


def test_three_day_history_reports_a_three_day_window():
    now = datetime.now(UTC)
    m = compute_momentum(_snaps([3, 0], [50.0, 56.0], now), now=now)
    assert m.change_30d_window_days == 3
    assert m.change_90d_window_days == 3
    assert "change over 3 days" in m.explanation
    assert "30-day change" not in m.explanation


def test_long_history_reports_a_thirty_day_change():
    now = datetime.now(UTC)
    m = compute_momentum(_snaps([45, 20, 0], [50.0, 53.0, 56.0], now), now=now)
    assert m.change_30d_window_days == 45
    assert "30-day change" in m.explanation


# ---- 3. Thesis edits flag stale fit scores ----------------------------------


def test_thesis_edit_flags_stale_fit_and_recalculate_updates_it(client, seeded, db):
    thesis = client.get("/api/thesis").json()["thesis"]
    # Make stored fits agree with the current thesis first.
    client.post("/api/thesis/recalculate-fit")

    opp = db.scalar(
        select(Opportunity).join(Company, Opportunity.company_id == Company.id)
        .where(Company.sector == "fintech")
    )
    assert opp is not None
    opp_id, before, stage = opp.id, opp.thesis_fit_score, str(opp.stage)
    assert client.get(f"/api/opportunities/{opp_id}").json()["thesis_fit_stale"] is False

    body = {k: v for k, v in thesis.items() if k not in ("id", "fund_id", "is_active", "updated_at")}
    body["sectors"] = ["healthcare"]
    saved = client.put(f"/api/thesis/{thesis['id']}", json=body)
    assert saved.status_code == 200
    assert saved.json()["stale_fit_count"] >= 1

    # Saving never rewrites stored scores; it flags them.
    detail = client.get(f"/api/opportunities/{opp_id}").json()
    assert detail["thesis_fit_score"] == before
    assert detail["thesis_fit_stale"] is True
    assert client.get("/api/thesis").json()["stale_fit_count"] >= 1

    r = client.post("/api/thesis/recalculate-fit", params={"opportunity_id": opp_id})
    assert r.status_code == 200
    assert r.json()["updated"] == 1
    item = r.json()["items"][0]
    assert item["opportunity_id"] == opp_id and item["previous"] == before
    assert item["current"] < before

    detail = client.get(f"/api/opportunities/{opp_id}").json()
    assert detail["thesis_fit_score"] == item["current"]
    assert detail["thesis_fit_stale"] is False
    assert detail["stage"] == stage


# ---- 4. Production starts empty; demo cleanup keeps real records ------------


@pytest.mark.parametrize(
    ("environment", "seed", "expected"),
    [
        ("production", None, False),
        ("production", "true", True),
        ("development", None, True),
        ("development", "false", False),
        ("production", "", False),
    ],
)
def test_should_seed_demo(monkeypatch, environment, seed, expected):
    monkeypatch.setenv("ENVIRONMENT", environment)
    if seed is None:
        monkeypatch.delenv("SEED_DEMO_DATA", raising=False)
    else:
        monkeypatch.setenv("SEED_DEMO_DATA", seed)
    assert Settings(_env_file=None).should_seed_demo is expected


def test_run_seed_refuses_in_production_without_force(monkeypatch):
    from app.seed.seed import run_seed

    monkeypatch.setattr(get_settings(), "environment", "production")
    with pytest.raises(RuntimeError, match="Refusing to seed"):
        run_seed()


def test_clear_demo_all_removes_demo_and_keeps_real_records(client, seeded, db):
    from app.seed.clear_demo import clear_demo

    fund_id = client.get("/api/thesis").json()["fund_id"]
    real = Founder(full_name="Real Person", is_demo=False)
    db.add(real)
    db.flush()
    lead = Opportunity(
        fund_id=fund_id, founder_id=real.id, entry_type=EntryType.OUTBOUND,
        stage=WorkflowStage.SOURCING, status=OpportunityStatus.PROSPECT, is_demo=False,
        first_signal_at=datetime.now(UTC),
    )
    db.add(lead)
    db.commit()
    lead_id = lead.id

    result = clear_demo(keep_company=None)
    assert result["removed_demo_thesis"] is True

    db.expire_all()
    assert db.scalars(select(Opportunity).where(Opportunity.is_demo == True)).all() == []  # noqa: E712
    assert db.get(Opportunity, lead_id) is not None
    assert client.get("/api/thesis").json()["thesis"] is None
    assert [o["id"] for o in client.get("/api/opportunities").json()["items"]] == [lead_id]
