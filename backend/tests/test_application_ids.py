"""The applications list carries ids, so a record finds its own application even
when two applications name the same company."""

from __future__ import annotations


def test_two_applications_for_companies_with_the_same_name(client, seeded):
    a = client.post("/api/applications", json={"company_name": "Twin Name Labs", "sector": "fintech", "num_users": 10}).json()
    b = client.post("/api/applications", json={"company_name": "Twin Name Labs", "sector": "fintech", "num_users": 99}).json()
    assert a["opportunity_id"] != b["opportunity_id"]

    items = {x["id"]: x for x in client.get("/api/applications").json()["items"]}
    for created in (a, b):
        listed = items[created["application_id"]]
        assert listed["opportunity_id"] == created["opportunity_id"]
        assert listed["company_id"] == created["company_id"]

    # each record's application, found by its opportunity id, is its own
    by_opp = {x["opportunity_id"]: x["id"] for x in items.values()}
    assert client.get(f"/api/applications/{by_opp[a['opportunity_id']]}").json()["num_users"] == 10
    assert client.get(f"/api/applications/{by_opp[b['opportunity_id']]}").json()["num_users"] == 99


def test_seeded_applications_are_linked_to_their_records(client, seeded):
    items = client.get("/api/applications").json()["items"]
    seeded_apps = [x for x in items if x["company_name"] in {"TerraSignal", "ChainWarden", "LedgerLoop"}]
    assert seeded_apps
    for x in seeded_apps:
        opp = client.get(f"/api/opportunities/{x['opportunity_id']}").json()
        assert opp["company"]["name"] == x["company_name"]
        assert opp["entry_type"] == "inbound"
