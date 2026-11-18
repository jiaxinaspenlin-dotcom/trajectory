"""Remove from Shortlist: clears Saved / Monitoring / Dismissed from a record
entirely, at any stage, and never changes the stage."""

from __future__ import annotations

import pytest
from app.models.assessment import Opportunity


def _lead(client) -> int:
    return client.post("/api/applications", json={"company_name": "Shortlist Clear Co", "sector": "fintech"}).json()["opportunity_id"]


@pytest.mark.parametrize("shortlist", ["save", "monitor", "dismiss"])
def test_clearing_a_shortlist_value_keeps_the_stage(client, seeded, db, shortlist):
    opp_id = _lead(client)
    stage_before = client.get(f"/api/opportunities/{opp_id}").json()["stage"]
    client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": shortlist})
    r = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "clear_shortlist"}).json()
    assert r["status"] not in {"saved", "monitoring", "dismissed"}
    assert r["stage"] == stage_before
    assert r["status"] == "applied"  # a screening record's status when nothing shortlists it


def test_clearing_a_lead_in_sourcing_and_a_deal_in_diligence(client, seeded, db):
    opps = db.query(Opportunity).all()
    lead = next(o for o in opps if str(o.stage) == "sourcing")
    deal = next(o for o in opps if str(o.stage) == "diligence")
    for o, expected in ((lead, "prospect"), (deal, "in_diligence")):
        client.post(f"/api/sourcing/prospects/{o.id}/action", json={"action": "save"})
        r = client.post(f"/api/sourcing/prospects/{o.id}/action", json={"action": "clear_shortlist"}).json()
        assert (r["status"], r["stage"]) == (expected, str(o.stage))


def test_a_cleared_dismissal_returns_the_record_to_the_queue(client, seeded):
    opp_id = _lead(client)
    queued = lambda: {x["opportunity_id"] for x in client.get("/api/dashboard").json()["action_queue"]}  # noqa: E731
    client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "dismiss"})
    assert opp_id not in queued()
    client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "clear_shortlist"})
    assert opp_id in queued()


def test_clearing_a_record_that_isnt_shortlisted_changes_nothing(client, seeded):
    opp_id = _lead(client)
    r = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "clear_shortlist"}).json()
    assert (r["status"], r["detail"]) == ("applied", "Not shortlisted; nothing changed.")
