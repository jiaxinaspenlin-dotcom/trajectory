"""Founder Score, Momentum, ranking/masking, trust, contradiction unit tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as S

from app.scoring.founder_score import compute_founder_score
from app.scoring.momentum import compute_momentum
from app.scoring.trust import compute_trust_score, detect_numeric_contradictions


def _ev(id, kind, conf=0.8, prov="independent", status="verified"):
    return S(id=id, kind=kind, confidence=conf, provenance=prov, verification_status=status)


def test_founder_score_deterministic_and_bounded():
    ev = [_ev(1, "github_repo"), _ev(2, "github_commit_activity"), _ev(3, "github_release")]
    r1 = compute_founder_score(ev)
    r2 = compute_founder_score(ev)
    assert r1.score == r2.score  # deterministic
    assert 0 <= r1.score <= 100
    assert abs(sum(c.weight for c in r1.components) - 1.0) < 1e-6  # weights normalized


def test_founder_score_missing_evidence_is_fair():
    r = compute_founder_score([])
    assert r.score == 0.0
    assert r.confidence == 0.0
    # every component reports full missingness rather than a negative penalty
    assert all(c.missingness >= 0.99 for c in r.components)
    assert "Insufficient evidence" in r.explanation


def test_more_evidence_raises_confidence():
    few = compute_founder_score([_ev(1, "github_repo")])
    many = compute_founder_score([_ev(i, "github_repo") for i in range(1, 8)]
                                 + [_ev(20, "github_release"), _ev(21, "user_growth")])
    assert many.confidence > few.confidence


def test_momentum_trajectory_and_explanation():
    now = datetime.now(UTC)
    snaps = [
        S(snapshot_date=now - timedelta(days=90), score=20.0, signals={"release_frequency": 0}),
        S(snapshot_date=now - timedelta(days=60), score=25.0, signals={"release_frequency": 1}),
        S(snapshot_date=now - timedelta(days=30), score=30.0, signals={"release_frequency": 2}),
        S(snapshot_date=now, score=45.0, signals={"release_frequency": 5, "outside_contributors": 2}),
    ]
    r = compute_momentum(snaps, now=now)
    assert r.current_score == 45.0
    assert r.change_30d == 15.0
    assert r.trajectory.value == "accelerating"
    assert "release frequency" in r.explanation.lower()


def test_momentum_insufficient_history():
    r = compute_momentum([])
    assert r.trajectory.value == "insufficient_history"


def test_trust_score_independent_beats_founder_reported():
    claim = S(verification_status="verified", provenance="independent", event_date=None)
    high = compute_trust_score(claim, [S(provenance="independent"), S(provenance="independent")], [])
    low_claim = S(verification_status="founder_reported", provenance="founder_reported", event_date=None)
    low = compute_trust_score(low_claim, [], [])
    assert high > low
    assert 0 <= low <= 100 and 0 <= high <= 100


def test_trust_score_contradiction_penalized():
    claim = S(verification_status="verified", provenance="independent", event_date=None)
    clean = compute_trust_score(claim, [S(provenance="independent")], [])
    contradicted = compute_trust_score(claim, [S(provenance="independent")], [S(provenance="independent")])
    assert contradicted < clean


def test_numeric_contradiction_detection():
    claims = [
        S(id=1, structured_value={"metric": "users", "amount": 2000}),
        S(id=2, structured_value={"metric": "users", "amount": 800}),
        S(id=3, structured_value={"metric": "revenue", "amount": 100000}),
    ]
    findings = detect_numeric_contradictions(claims)
    assert len(findings) == 1
    assert findings[0]["severity"] == "high"  # >50% apart
    assert {findings[0]["claim_a_id"], findings[0]["claim_b_id"]} == {1, 2}
