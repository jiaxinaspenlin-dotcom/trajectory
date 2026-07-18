"""Bridge helpers that call AI services and persist their (validated) output."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.ai import services as ai
from app.models.entities import Company
from app.models.enums import Provenance, SourceType, VerificationStatus
from app.models.sources import Claim, ClaimEvidenceLink, DataSource, Evidence


def interpret_and_store_deck(
    db: Session, company_id: int | None, page_texts: list[dict], stored_name: str
) -> dict:
    """Interpret a pitch deck and store extracted fields as evidence + claims.

    Records the pitch-deck page references. NEVER invents metrics — only what the
    extractor literally found (with page numbers) becomes founder-reported evidence.
    """
    extraction = ai.interpret_pitch_deck(page_texts)
    if company_id is None:
        return extraction

    now = datetime.now(UTC)
    ds = DataSource(name=f"Pitch deck {stored_name[:16]}", source_type=SourceType.PITCH_DECK,
                    url=None, is_live_connector=False, last_synced_at=now)
    db.add(ds)
    db.flush()

    company = db.get(Company, company_id)
    # update company one-liner/sector from deck if we had none (founder-reported)
    if company:
        if not company.one_liner and extraction.get("one_liner"):
            company.one_liner = str(extraction["one_liner"])[:500]
        if not company.sector and extraction.get("sector"):
            company.sector = str(extraction["sector"])[:128]
        if not company.description and extraction.get("problem"):
            company.description = str(extraction.get("problem", ""))[:2000]

    for metric in extraction.get("metrics", []):
        if not isinstance(metric, dict):
            continue
        label = str(metric.get("label", "")).strip()
        value = str(metric.get("value", "")).strip()
        page = metric.get("page")
        if not label or not value:
            continue
        ev = Evidence(
            company_id=company_id, data_source_id=ds.id,
            source_name="Pitch deck", source_type=SourceType.PITCH_DECK,
            source_url=None, kind="deck_metric",
            title=f"{label}: {value}" + (f" (slide {page})" if page else ""),
            raw_value=value,
            structured_value={"label": label, "value": value, "slide": page},
            event_date=now, collected_at=now,
            provenance=Provenance.FOUNDER_REPORTED,
            verification_status=VerificationStatus.FOUNDER_REPORTED, confidence=0.4,
            dedup_key=f"deck_{company_id}_{label}_{page}",
        )
        db.add(ev)
        db.flush()
        claim = Claim(
            company_id=company_id, text=f"{label}: {value} (per pitch deck slide {page}).",
            category=_metric_category(label), owner=company.name if company else "",
            source_name="Pitch deck", source_url=None, collection_date=now, event_date=now,
            excerpt=f"{label}: {value}", structured_value={"metric": label.lower(), "amount": _num(value)},
            provenance=Provenance.FOUNDER_REPORTED,
            verification_status=VerificationStatus.FOUNDER_REPORTED, confidence=0.4, trust_score=42.0,
        )
        db.add(claim)
        db.flush()
        db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, relation="supports"))
    db.flush()
    return extraction


def _metric_category(label: str) -> str:
    low = label.lower()
    if any(k in low for k in ("revenue", "arr", "mrr", "gmv")):
        return "revenue"
    if any(k in low for k in ("user", "customer", "mau", "dau", "signup")):
        return "users"
    if any(k in low for k in ("growth", "retention", "churn")):
        return "traction"
    if any(k in low for k in ("market", "tam", "sam")):
        return "market"
    return "general"


def _num(value: str) -> float | None:
    import re

    m = re.search(r"[\d,.]+", value.replace(",", ""))
    if not m:
        return None
    try:
        n = float(m.group())
    except ValueError:
        return None
    low = value.lower()
    if "k" in low:
        n *= 1_000
    elif "m" in low:
        n *= 1_000_000
    elif "b" in low:
        n *= 1_000_000_000
    return n
