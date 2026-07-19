"""Per-claim Trust Score and rule-based contradiction detection.

Trust Score belongs to the *individual claim*, not the company as one vague
number. It is deterministic and derived from: verification status, provenance
(founder-reported vs independent), quantity and independence of supporting
evidence, presence of contradictory evidence, and recency.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.enums import Provenance, VerificationStatus
from app.models.sources import Claim, Evidence

_STATUS_BASE: dict[str, float] = {
    VerificationStatus.VERIFIED.value: 82.0,
    VerificationStatus.PARTIALLY_VERIFIED.value: 62.0,
    VerificationStatus.FOUNDER_REPORTED.value: 42.0,
    VerificationStatus.UNVERIFIED.value: 34.0,
    VerificationStatus.INSUFFICIENT_EVIDENCE.value: 20.0,
    VerificationStatus.CONTRADICTED.value: 14.0,
}


def compute_trust_score(
    claim: Claim,
    supporting: list[Evidence],
    contradicting: list[Evidence],
    now: datetime | None = None,
) -> float:
    """Return a 0..100 Trust Score for a single claim."""
    now = now or datetime.now(UTC)
    status = str(claim.verification_status)
    base = _STATUS_BASE.get(status, 30.0)

    # independent supporting evidence lifts trust; founder-only support lifts less
    independent = sum(1 for e in supporting if str(e.provenance) == Provenance.INDEPENDENT.value)
    founder_only = len(supporting) - independent
    base += min(18.0, independent * 9.0)
    base += min(6.0, founder_only * 2.0)

    # contradictions sharply reduce trust
    base -= min(40.0, len(contradicting) * 18.0)

    # provenance of the claim itself
    if str(claim.provenance) == Provenance.FOUNDER_REPORTED.value and independent == 0:
        base -= 6.0

    # recency: stale event dates lose a little trust
    if claim.event_date:
        ed = claim.event_date if claim.event_date.tzinfo else claim.event_date.replace(tzinfo=UTC)
        age_days = (now - ed).days
        if age_days > 365:
            base -= 8.0
        elif age_days > 180:
            base -= 4.0

    return round(max(0.0, min(100.0, base)), 1)


# --- rule-based contradiction detection ---------------------------------------

_NUMERIC_CATEGORIES = {"traction", "revenue", "users", "funding"}


def detect_numeric_contradictions(claims: list[Claim]) -> list[dict]:
    """Detect conflicting numeric claims in the same category.

    Compares structured_value['metric'] + ['amount'] across claims. If two claims
    describe the same metric with materially different numbers (>25% apart), flag.
    """
    findings: list[dict] = []
    buckets: dict[str, list[Claim]] = {}
    for c in claims:
        sv = c.structured_value or {}
        metric = str(sv.get("metric", "")).lower().strip()
        if metric and sv.get("amount") is not None:
            buckets.setdefault(metric, []).append(c)

    for metric, group in buckets.items():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                av = float((a.structured_value or {}).get("amount", 0) or 0)
                bv = float((b.structured_value or {}).get("amount", 0) or 0)
                if av <= 0 or bv <= 0:
                    continue
                hi, lo = max(av, bv), min(av, bv)
                if (hi - lo) / hi > 0.25:
                    findings.append(
                        {
                            "claim_a_id": a.id,
                            "claim_b_id": b.id,
                            "description": (
                                f"The reported {metric} figures don't match: {av:g} vs {bv:g} — "
                                f"a {round((hi - lo) / hi * 100)}% discrepancy in the same metric "
                                "across sources. Reconcile before relying on this number."
                            ),
                            "severity": "high" if (hi - lo) / hi > 0.5 else "medium",
                        }
                    )
    return findings
