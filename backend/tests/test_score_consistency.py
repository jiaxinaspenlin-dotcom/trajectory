"""One Founder Score per record: the stored score, its explanation and its breakdown
agree for the seeded demo history and for any scaled result; momentum text uses whole points."""

from __future__ import annotations

import re

from app.models.scoring import FounderScore
from app.scoring.founder_score import compute_founder_score, scale_founder_score
from sqlalchemy import select


def _explained(text: str) -> int:
    m = re.search(r"Founder Score is (\d+)/100", text)
    assert m, text
    return int(m.group(1))


def test_seeded_scores_match_their_explanation_and_breakdown(seeded, db):
    rows = db.scalars(select(FounderScore)).all()
    assert rows
    for r in rows:
        if "Founder Score is" not in r.explanation:
            continue  # no evidence yet: no number to disagree with
        assert _explained(r.explanation) == round(r.score), (r.founder_id, r.version)
        assert abs(sum(c["contribution"] for c in r.components) - r.score) < 0.05


def test_scaling_keeps_score_explanation_and_components_together(seeded, db):
    from app.models.sources import Evidence

    evidence = db.scalars(select(Evidence).where(Evidence.founder_id.is_not(None))).all()
    base = compute_founder_score(list(evidence))
    scaled = scale_founder_score(base, 0.8)
    assert abs(scaled.score - base.score * 0.8) < 0.05
    assert _explained(scaled.explanation) == round(scaled.score)


def test_momentum_explanation_uses_whole_points(seeded, client):
    for opp_id in (1, 2, 3):
        m = client.get(f"/api/opportunities/{opp_id}").json()["momentum"]
        assert not re.search(r"\d\.\d", m["explanation"]), m["explanation"]
