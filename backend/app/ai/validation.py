"""Validation layer: reject/flag AI output that cites nonexistent evidence IDs.

Every AI-produced factual conclusion must reference evidence IDs that actually
exist in the provided context. This module strips or flags any hallucinated IDs
so they never reach the UI as if they were real.
"""

from __future__ import annotations


def validate_evidence_ids(
    referenced: list, allowed_ids: set[int]
) -> tuple[list[int], list[int]]:
    """Return (valid_ids, rejected_ids). Non-int / unknown IDs are rejected."""
    valid: list[int] = []
    rejected: list[int] = []
    for r in referenced or []:
        try:
            rid = int(r)
        except (ValueError, TypeError):
            continue
        if rid in allowed_ids:
            valid.append(rid)
        else:
            rejected.append(rid)
    return sorted(set(valid)), sorted(set(rejected))


def sanitize_points(points: list[dict], allowed_ids: set[int]) -> tuple[list[dict], list[int]]:
    """Sanitize a list of {text, evidence_ids} points, dropping bad IDs.

    Returns (clean_points, all_rejected_ids). A point whose evidence IDs are all
    invalid is kept but flagged as unverified so it cannot masquerade as backed.
    """
    clean: list[dict] = []
    rejected_all: list[int] = []
    for p in points or []:
        if not isinstance(p, dict):
            continue
        valid, rejected = validate_evidence_ids(p.get("evidence_ids", []), allowed_ids)
        rejected_all.extend(rejected)
        clean.append(
            {
                "text": str(p.get("text", "")).strip(),
                "evidence_ids": valid,
                "unverified": len(valid) == 0,
                **({"rejected_evidence_ids": rejected} if rejected else {}),
            }
        )
    return clean, sorted(set(rejected_all))
