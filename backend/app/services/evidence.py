"""Evidence & Claim persistence: dedup, timestamps, attribution, trust recompute."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import NormalizedEvidence
from app.db.base import utcnow
from app.models.enums import VerificationStatus
from app.models.sources import (
    Claim,
    ClaimContradiction,
    ClaimEvidenceLink,
    Evidence,
)
from app.scoring.trust import compute_trust_score, detect_numeric_contradictions


def persist_evidence(
    db: Session,
    items: list[NormalizedEvidence],
    *,
    founder_id: int | None = None,
    company_id: int | None = None,
    data_source_id: int | None = None,
    is_demo: bool = False,
) -> tuple[int, int]:
    """Persist normalized evidence with dedup. Returns (added, skipped)."""
    added = skipped = 0
    for item in items:
        # dedup within the same founder/company scope by dedup_key
        exists = db.scalar(
            select(Evidence).where(
                Evidence.dedup_key == item.dedup_key,
                Evidence.founder_id == founder_id,
                Evidence.company_id == company_id,
            )
        )
        if exists:
            # refresh timestamp / structured value; keep history but mark not stale
            exists.collected_at = utcnow()
            exists.is_stale = False
            exists.structured_value = item.structured_value
            skipped += 1
            continue
        db.add(
            Evidence(
                founder_id=founder_id,
                company_id=company_id,
                data_source_id=data_source_id,
                source_name=item.source_name,
                source_type=item.source_type,
                source_url=item.source_url,
                kind=item.kind,
                title=item.title,
                raw_value=item.raw_value,
                structured_value=item.structured_value,
                event_date=item.event_date,
                collected_at=utcnow(),
                provenance=item.provenance,
                verification_status=item.verification_status,
                confidence=item.confidence,
                dedup_key=item.dedup_key,
                is_demo=is_demo,
            )
        )
        added += 1
    db.flush()
    return added, skipped


def recompute_claim_trust(db: Session, claim: Claim, now: datetime | None = None) -> float:
    """Recompute and store a claim's Trust Score from its linked evidence."""
    now = now or datetime.now(UTC)
    links = db.scalars(
        select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id)
    ).all()
    supporting_ids = [ln.evidence_id for ln in links if ln.relation == "supports"]
    contra_ids = [ln.evidence_id for ln in links if ln.relation == "contradicts"]
    supporting = (
        db.scalars(select(Evidence).where(Evidence.id.in_(supporting_ids))).all()
        if supporting_ids else []
    )
    contra = (
        db.scalars(select(Evidence).where(Evidence.id.in_(contra_ids))).all()
        if contra_ids else []
    )
    score = compute_trust_score(claim, list(supporting), list(contra), now=now)
    claim.trust_score = score
    return score


def run_contradiction_detection(
    db: Session, *, founder_id: int | None = None, company_id: int | None = None,
    is_demo: bool = False,
) -> int:
    """Run rule-based numeric contradiction detection and persist findings."""
    q = select(Claim)
    if company_id is not None:
        q = q.where(Claim.company_id == company_id)
    elif founder_id is not None:
        q = q.where(Claim.founder_id == founder_id)
    claims = list(db.scalars(q).all())
    findings = detect_numeric_contradictions(claims)
    created = 0
    for f in findings:
        exists = db.scalar(
            select(ClaimContradiction).where(
                ClaimContradiction.claim_a_id == f["claim_a_id"],
                ClaimContradiction.claim_b_id == f["claim_b_id"],
            )
        )
        if exists:
            continue
        db.add(
            ClaimContradiction(
                claim_a_id=f["claim_a_id"],
                claim_b_id=f["claim_b_id"],
                description=f["description"],
                severity=f["severity"],
                detected_by="rule",
                is_demo=is_demo,
            )
        )
        # mark affected claims contradicted
        for cid in (f["claim_a_id"], f["claim_b_id"]):
            c = db.get(Claim, cid)
            if c:
                c.verification_status = VerificationStatus.CONTRADICTED
        created += 1
    db.flush()
    return created
