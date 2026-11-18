"""Dashboard queue order is stable: priority, then exact waiting time, then id."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.assessment import Opportunity
from app.services.action_queue import build_action_queue


def test_same_day_ties_break_by_exact_waiting_time_then_id(client, seeded, db):
    ids = [
        client.post("/api/applications", json={"company_name": f"Queue Order {n}", "sector": "fintech"}).json()["opportunity_id"]
        for n in range(4)
    ]
    now = datetime.now(UTC)
    # all four have waited 3 whole days; only the hours differ, and two are identical
    waited = {ids[0]: timedelta(days=3, hours=1), ids[1]: timedelta(days=3, hours=9),
              ids[2]: timedelta(days=3, hours=5), ids[3]: timedelta(days=3, hours=5)}
    for opp_id, delta in waited.items():
        db.get(Opportunity, opp_id).first_signal_at = now - delta
    db.commit()

    fund_id = db.get(Opportunity, ids[0]).fund_id
    for _ in range(3):  # the same order every time
        queue = [i for i in build_action_queue(db, fund_id, limit=None) if i["opportunity_id"] in waited]
        assert {i["age_days"] for i in queue} == {3}
        assert {i["priority"] for i in queue} == {2}
        assert [i["opportunity_id"] for i in queue] == [ids[1], ids[2], ids[3], ids[0]]
