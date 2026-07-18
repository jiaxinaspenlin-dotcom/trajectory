"""Inbound application workflow: create application, upload & parse pitch deck."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import active_thesis, default_fund, get_db
from app.models.assessment import Opportunity
from app.models.entities import Application, Company, UploadedDocument
from app.models.enums import (
    EntryType,
    OpportunityStatus,
    Provenance,
    SourceType,
    VerificationStatus,
    WorkflowStage,
)
from app.models.sources import Evidence
from app.models.workflow import WorkflowEvent
from app.schemas.requests import ApplicationIn
from app.services import pdf as pdfsvc
from app.services.ai_helpers import interpret_and_store_deck
from app.services.thesis import compute_thesis_fit

router = APIRouter(tags=["applications"], prefix="/api/applications")

# minimal required inputs: company name + pitch deck
REQUIRED_OPTIONAL_FOR_SCREEN = ["website", "github_profile", "sector", "team_info"]


@router.post("")
def create_application(body: ApplicationIn, db: Session = Depends(get_db)) -> dict:
    """Create an inbound application. Deck can be uploaded next via /upload-deck."""
    fund = default_fund(db)
    company = _get_or_create_company(db, body.company_name, body.website, body.sector,
                                     body.geography, body.github_org)
    missing = _missing_fields(body)
    app = Application(
        company_id=company.id, company_name=body.company_name,
        founder_names=body.founder_names, email=body.email, website=body.website,
        github_profile=body.github_profile, github_org=body.github_org,
        product_link=body.product_link, demo_link=body.demo_link, sector=body.sector,
        geography=body.geography, funding_requested=body.funding_requested,
        use_of_funds=body.use_of_funds, current_revenue=body.current_revenue,
        num_users=body.num_users, customer_info=body.customer_info,
        prior_funding=body.prior_funding, accelerator_history=body.accelerator_history,
        team_info=body.team_info, founder_notes=body.founder_notes,
        missing_fields=missing,
        screen_summary=_first_pass_screen(body, missing),
    )
    db.add(app)
    db.flush()

    # founder-reported evidence for supplied metrics (never invented)
    _store_reported_evidence(db, company.id, body)

    # converge inbound into the same opportunity workflow
    thesis = active_thesis(db, fund.id)
    fit, reasons = compute_thesis_fit(thesis, company) if thesis else (0.0, [])
    opp = Opportunity(
        fund_id=fund.id, company_id=company.id, application_id=app.id,
        entry_type=EntryType.INBOUND, stage=WorkflowStage.SCREENING,
        status=OpportunityStatus.APPLIED,
        first_signal_at=datetime.now(UTC),
        thesis_fit_score=fit, surfaced_reason="Inbound application. " + " ".join(reasons),
    )
    db.add(opp)
    db.flush()
    db.add(WorkflowEvent(opportunity_id=opp.id, event_type="application_received",
                         detail=body.company_name, occurred_at=datetime.now(UTC)))
    db.commit()
    return {
        "application_id": app.id, "company_id": company.id, "opportunity_id": opp.id,
        "missing_fields": missing, "screen_summary": app.screen_summary,
        "thesis_fit_score": fit,
        "next": "Upload a PDF pitch deck to POST /api/applications/{id}/upload-deck",
    }


@router.post("/{application_id}/upload-deck")
async def upload_deck(
    application_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
) -> dict:
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found.")

    content = await file.read()
    try:
        pdfsvc.validate_pdf(file.filename or "upload.pdf", content, file.content_type or "")
    except pdfsvc.PdfValidationError as exc:
        raise HTTPException(422, str(exc)) from exc

    stored_name, path = pdfsvc.store_pdf(content, file.filename or "deck.pdf")
    full_text, page_texts, error = pdfsvc.extract_text(path)

    doc = UploadedDocument(
        original_filename=pdfsvc.sanitize_filename(file.filename or "deck.pdf"),
        stored_filename=stored_name, content_type="application/pdf",
        size_bytes=len(content), num_pages=len(page_texts),
        extracted_text=full_text, page_texts=page_texts,
        extraction_status="failed" if error else "extracted",
        extraction_error=error, company_id=app.company_id,
    )
    db.add(doc)
    db.flush()
    app.document_id = doc.id

    # register the deck as a data source + interpret (structured, evidence-backed)
    extraction = interpret_and_store_deck(db, app.company_id, page_texts, stored_name)
    db.commit()

    return {
        "document_id": doc.id, "num_pages": doc.num_pages,
        "extraction_status": doc.extraction_status, "extraction_error": doc.extraction_error,
        "extracted_fields": extraction,
        "note": "Deck stored outside the public static directory with a sanitized, random name.",
    }


@router.get("/{application_id}")
def get_application(application_id: int, db: Session = Depends(get_db)) -> dict:
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found.")
    doc = db.get(UploadedDocument, app.document_id) if app.document_id else None
    return {
        "id": app.id, "company_id": app.company_id, "company_name": app.company_name,
        "founder_names": app.founder_names, "sector": app.sector, "geography": app.geography,
        "missing_fields": app.missing_fields, "screen_summary": app.screen_summary,
        "current_revenue": app.current_revenue, "num_users": app.num_users,
        "funding_requested": app.funding_requested,
        "document": {
            "id": doc.id, "num_pages": doc.num_pages, "status": doc.extraction_status,
            "page_count": doc.num_pages,
        } if doc else None,
    }


@router.get("")
def list_applications(db: Session = Depends(get_db)) -> dict:
    apps = db.scalars(select(Application).order_by(Application.id.desc())).all()
    return {"items": [
        {"id": a.id, "company_name": a.company_name, "sector": a.sector,
         "missing_fields": a.missing_fields, "has_deck": a.document_id is not None}
        for a in apps
    ]}


# --- helpers ---------------------------------------------------------------

def _get_or_create_company(db, name, website, sector, geography, github_org) -> Company:
    norm = name.strip().lower()
    existing = db.scalar(select(Company).where(Company.normalized_name == norm))
    if existing:
        return existing
    c = Company(name=name, normalized_name=norm, website=website, sector=sector,
                geography=geography, github_org=github_org)
    db.add(c)
    db.flush()
    return c


def _missing_fields(body: ApplicationIn) -> list[str]:
    """Identify genuinely useful missing info — not everything the system can collect."""
    missing = []
    if not body.website and not body.product_link:
        missing.append("website_or_product_link")
    if not body.github_profile and not body.github_org:
        missing.append("github (for independent technical evidence)")
    if body.current_revenue is None and body.num_users is None:
        missing.append("traction_signal (revenue or users)")
    if not body.team_info:
        missing.append("team_info")
    return missing


def _first_pass_screen(body: ApplicationIn, missing: list[str]) -> str:
    have = []
    if body.github_profile or body.github_org:
        have.append("GitHub available for independent verification")
    if body.current_revenue or body.num_users:
        have.append("founder-reported traction present (requires verification)")
    base = f"First-pass screen for {body.company_name}. "
    base += ("Signals: " + "; ".join(have) + ". ") if have else "Limited signals so far. "
    if missing:
        base += "Requesting only what's needed for a confident decision: " + ", ".join(missing) + "."
    return base


def _store_reported_evidence(db, company_id: int, body: ApplicationIn) -> None:
    now = datetime.now(UTC)

    def add(kind, title, value, structured):
        db.add(Evidence(
            company_id=company_id, source_name="Founder application",
            source_type=SourceType.FOUNDER_SUBMITTED, source_url=None, kind=kind,
            title=title, raw_value=str(value), structured_value=structured,
            event_date=now, collected_at=now, provenance=Provenance.FOUNDER_REPORTED,
            verification_status=VerificationStatus.FOUNDER_REPORTED, confidence=0.4,
            dedup_key=f"app_{company_id}_{kind}",
        ))

    if body.current_revenue is not None:
        add("revenue", f"Founder-reported revenue: {body.current_revenue}",
            body.current_revenue, {"metric": "revenue", "amount": body.current_revenue})
    if body.num_users is not None:
        add("user_growth", f"Founder-reported users: {body.num_users}",
            body.num_users, {"metric": "users", "amount": body.num_users})
    db.flush()
