"""Inbound application workflow: create application, upload & parse pitch deck."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import active_thesis, default_fund, get_db
from app.models.assessment import Opportunity
from app.models.entities import (
    Application,
    Company,
    Founder,
    FounderCompanyRelationship,
    UploadedDocument,
)
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
from app.schemas.requests import ApplicationIn, ApplicationUpdateIn
from app.services import pdf as pdfsvc
from app.services.ai_helpers import interpret_and_store_deck
from app.services.github_sync import sync_github_user
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


def _application_out(db, app: Application) -> dict:
    doc = db.get(UploadedDocument, app.document_id) if app.document_id else None
    # recompute for display so wording/requests always reflect the current state
    missing = _missing_fields(app)
    return {
        "id": app.id, "company_id": app.company_id, "company_name": app.company_name,
        "founder_names": app.founder_names, "sector": app.sector, "geography": app.geography,
        "website": app.website, "product_link": app.product_link, "github_profile": app.github_profile,
        "team_info": app.team_info, "missing_fields": missing,
        "screen_summary": _first_pass_screen(app, missing), "current_revenue": app.current_revenue,
        "num_users": app.num_users, "funding_requested": app.funding_requested,
        "document": {
            "id": doc.id, "num_pages": doc.num_pages, "status": doc.extraction_status,
            "page_count": doc.num_pages,
        } if doc else None,
    }


@router.get("/{application_id}")
def get_application(application_id: int, db: Session = Depends(get_db)) -> dict:
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found.")
    return _application_out(db, app)


@router.patch("/{application_id}")
async def update_application(
    application_id: int, body: ApplicationUpdateIn, db: Session = Depends(get_db)
) -> dict:
    """Founder provides the additional info the fund requested. Re-screens the
    application, and if a GitHub profile is supplied, syncs real public evidence
    and attaches a founder — so the investor sees the new info immediately."""
    app = db.get(Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found.")
    fund = default_fund(db)
    thesis = active_thesis(db, fund.id)

    # apply the non-empty provided fields to the application
    for field in (
        "website", "product_link", "demo_link", "github_profile", "github_org", "sector",
        "geography", "funding_requested", "use_of_funds", "current_revenue", "num_users",
        "customer_info", "prior_funding", "accelerator_history", "team_info", "founder_notes",
    ):
        val = getattr(body, field)
        if val is not None and val != "":
            setattr(app, field, val)

    company = db.get(Company, app.company_id) if app.company_id else None
    if company:
        if body.website:
            company.website = body.website
        if body.sector:
            company.sector = body.sector
        if body.geography:
            company.geography = body.geography
        if body.github_org:
            company.github_org = body.github_org

    # store/refresh founder-reported traction evidence (idempotent)
    if app.company_id:
        _store_reported_evidence(db, app.company_id, app)

    opp = db.scalar(select(Opportunity).where(Opportunity.application_id == app.id))

    # if a GitHub profile was provided, attach a founder + sync real evidence
    if body.github_profile and app.company_id:
        login = body.github_profile.strip().lstrip("@")
        founder = db.scalar(select(Founder).where(Founder.github_username == login))
        if not founder:
            founder = Founder(
                full_name=(app.founder_names[0] if app.founder_names else login),
                normalized_name=(app.founder_names[0].lower() if app.founder_names else login.lower()),
                github_username=login, headline=f"GitHub @{login}", is_demo=False,
            )
            db.add(founder)
            db.flush()
        exists_rel = db.scalar(select(FounderCompanyRelationship).where(
            FounderCompanyRelationship.founder_id == founder.id,
            FounderCompanyRelationship.company_id == app.company_id,
        ))
        if not exists_rel:
            db.add(FounderCompanyRelationship(
                founder_id=founder.id, company_id=app.company_id, role="Founder", is_current=True,
            ))
        if opp and not opp.founder_id:
            opp.founder_id = founder.id
        try:
            await sync_github_user(db, founder.id, login, thesis, light=True)
        except Exception:  # noqa: BLE001 — provision must not fail on a GitHub hiccup
            pass

    # re-screen and refresh thesis fit now that we know more
    app.missing_fields = _missing_fields(app)
    app.screen_summary = _first_pass_screen(app, app.missing_fields)
    if opp and company:
        fit, _ = compute_thesis_fit(thesis, company) if thesis else (0.0, [])
        opp.thesis_fit_score = fit
        db.add(WorkflowEvent(
            opportunity_id=opp.id, event_type="application_updated",
            detail="Founder provided additional info.", actor="founder",
            occurred_at=datetime.now(UTC),
        ))
    db.commit()
    db.refresh(app)
    return _application_out(db, app)


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


def _missing_fields(body: ApplicationIn | Application) -> list[str]:
    """Identify genuinely useful missing info — not everything the system can collect."""
    missing = []
    if not body.website and not body.product_link:
        missing.append("Website or Product Link")
    if not body.github_profile and not body.github_org:
        missing.append("GitHub Profile")
    if body.current_revenue is None and body.num_users is None:
        missing.append("Traction Signal (Revenue or Users)")
    if not body.team_info:
        missing.append("Team Introduction")
    return missing


# founder-facing phrasing for each requested item (no internal field names)
_FRIENDLY_REQUEST = {
    "Website or Product Link": "a website or product link",
    "GitHub Profile": "your GitHub username (so we can verify your work with public activity)",
    "Traction Signal (Revenue or Users)": "an early traction signal (revenue or active users)",
    "Team Introduction": "a short introduction to your team",
}


def _join_phrases(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def _first_pass_screen(body: ApplicationIn | Application, missing: list[str]) -> str:
    """Professional, founder-facing summary shown on the application status page."""
    name = body.company_name
    strengths = []
    if body.github_profile or body.github_org:
        strengths.append("a public GitHub profile we can verify independently")
    if body.current_revenue or body.num_users:
        strengths.append("early traction figures")
    if getattr(body, "website", None) or getattr(body, "product_link", None):
        strengths.append("a live product link")

    if strengths:
        text = f"We've completed an automated first-pass review of {name}. So far we can see {_join_phrases(strengths)}."
    else:
        text = f"We've completed an automated first-pass review of {name}."

    if missing:
        friendly = [_FRIENDLY_REQUEST.get(m, m) for m in missing]
        text += f" To help us reach a confident decision, please add {_join_phrases(friendly)} below."
    else:
        text += " We have what we need to begin a closer review — thank you."
    return text


def _store_reported_evidence(db, company_id: int, body) -> None:
    now = datetime.now(UTC)

    def add(kind, title, value, structured):
        dedup = f"app_{company_id}_{kind}"
        existing = db.scalar(select(Evidence).where(Evidence.dedup_key == dedup))
        if existing:  # idempotent: update the founder-reported value in place
            existing.title = title
            existing.raw_value = str(value)
            existing.structured_value = structured
            existing.collected_at = now
            return
        db.add(Evidence(
            company_id=company_id, source_name="Founder application",
            source_type=SourceType.FOUNDER_SUBMITTED, source_url=None, kind=kind,
            title=title, raw_value=str(value), structured_value=structured,
            event_date=now, collected_at=now, provenance=Provenance.FOUNDER_REPORTED,
            verification_status=VerificationStatus.FOUNDER_REPORTED, confidence=0.4,
            dedup_key=dedup,
        ))

    if body.current_revenue is not None:
        add("revenue", f"Founder-reported revenue: {body.current_revenue}",
            body.current_revenue, {"metric": "revenue", "amount": body.current_revenue})
    if body.num_users is not None:
        add("user_growth", f"Founder-reported users: {body.num_users}",
            body.num_users, {"metric": "users", "amount": body.num_users})
    db.flush()
