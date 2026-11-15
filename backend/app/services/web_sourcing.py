"""Web sourcing: search the web for leads, structure the pages with AI, and
keep only what the retrieved sources support.

Flow: plan queries (AI) -> live web search (Tavily) -> structure (AI) ->
validate against the schema AND the source texts -> match existing leads by
reliable identifiers -> append genuinely new evidence to leads already saved.
Saving a result is a separate investor action (`save_web_result`), and moving
a lead to Screening stays a separate investor action after that.

Validation rules (enforced here, not trusted to the model):
- Every material claim (what they're building, why it matched, each evidence
  item) must cite a retrieved source, and evidence quotes must appear in that
  source's text.
- The company name must appear in a cited source.
- Dates are kept only when the quoted date text appears in the source (or the
  search provider reports a published date, labeled as such); otherwise the
  date is explicitly unknown.
- A founder name is kept only when it appears in a cited source, and stays
  "unverified" unless a GitHub account linking to the company's website
  confirms it.
- A company website is kept only when a cited source is on that domain or
  links to it. Dedup uses that domain, a verified GitHub login, or (with no
  domain) the canonical launch-page URLs.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime, timedelta
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.ai import services as ai
from app.connectors.base import NormalizedEvidence
from app.connectors.github import GitHubConnector
from app.connectors.web_search import (
    TavilySearch,
    WebSearchError,
    WebSource,
    canonical_url,
    domain_of,
    launch_queries,
)
from app.db.base import utcnow
from app.models.assessment import Opportunity
from app.models.core import InvestmentThesis
from app.models.entities import Company, Founder, FounderCompanyRelationship
from app.models.enums import (
    EntryType,
    OpportunityStatus,
    Provenance,
    SourceType,
    VerificationStatus,
    WorkflowStage,
)
from app.models.sources import Evidence
from app.models.web_sourcing import LeadEvidenceReview, LeadIdentifier, WebSearch
from app.models.workflow import WorkflowEvent
from app.services.evidence import persist_evidence
from app.services.github_sync import sync_github_user
from app.services.thesis import compute_thesis_fit

MATCH_KINDS = ("domain", "github", "url")
WEB_EVIDENCE_PREFIX = "web_"
EVIDENCE_KINDS = ("launch", "release", "changelog", "company_site", "press", "other")

# Launch platforms and blogs host many companies, so their domain is never a
# company's identity (a launch page URL can be, when no domain is known).
SHARED_HOSTS = {
    "news.ycombinator.com", "ycombinator.com", "producthunt.com", "medium.com", "substack.com",
    "dev.to", "hashnode.dev", "techcrunch.com", "betalist.com", "indiehackers.com",
    "launchingnext.com", "notion.site", "notion.so", "vercel.app", "netlify.app",
    "github.io", "gitbook.io", "beehiiv.com",
}


def is_shared_host(domain: str | None) -> bool:
    if not domain:
        return False
    return any(domain == h or domain.endswith("." + h) for h in SHARED_HOSTS)


# ---------------------------------------------------------------------------
# Raw model output schema (lenient on shape, strict on types)
# ---------------------------------------------------------------------------

class _Cited(BaseModel):
    text: str = Field(min_length=3, max_length=600)
    source_ids: list[str] = []


class _RawEvidence(BaseModel):
    source_id: str
    kind: str = "other"
    claim: str = Field(min_length=3, max_length=400)
    quote: str | None = None
    event_date: str | None = None
    date_text: str | None = None

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        v = (v or "other").strip().lower()
        return v if v in EVIDENCE_KINDS else "other"


class _RawResult(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    website: str | None = None
    founder_name: str | None = Field(default=None, max_length=200)
    github_handle: str | None = Field(default=None, max_length=100)
    sector: str | None = Field(default=None, max_length=80)
    building: _Cited
    why_matched: _Cited
    evidence: list[_RawEvidence] = []
    unknowns: list[str] = []


class WebResult(BaseModel):
    """A validated shortlist entry, as stored on WebSearch.results and returned to the UI."""

    key: str
    company_name: str
    website: str | None
    domain: str | None
    website_basis: str | None = None
    sector: str | None
    building: dict
    why_matched: dict
    founder: dict  # {name, status: unknown|named_unverified|verified_github, source_url, profile_url}
    github: dict | None  # {login, type, url, verified, basis}
    evidence: list[dict]
    unknowns: list[str]
    identifiers: list[dict]  # [{kind, value, verified}]
    existing: dict | None = None  # {opportunity_id, name, stage, evidence_added, evidence_known}
    saved_opportunity_id: int | None = None


# ---------------------------------------------------------------------------
# Text checks
# ---------------------------------------------------------------------------

_QUOTE_CHARS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                              "–": "-", "—": "-", " ": " "})


def _norm_text(s: str | None) -> str:
    return " ".join((s or "").translate(_QUOTE_CHARS).lower().split())


def text_supports(quote: str | None, text: str, *, min_ratio: float = 0.85) -> bool:
    """True when `quote` appears in `text` verbatim (normalized), or nearly so
    (a contiguous match covering `min_ratio` of the quote, for minor edits)."""
    q = _norm_text(quote)
    t = _norm_text(text)
    if len(q) < 3 or not t:
        return False
    if q in t:
        return True
    m = SequenceMatcher(None, t, q, autojunk=False).find_longest_match(0, len(t), 0, len(q))
    return m.size >= max(12, int(len(q) * min_ratio))


def _name_in(name: str, text: str) -> bool:
    n = _norm_text(name)
    t = _norm_text(text)
    return bool(n) and (n in t or n.replace(" ", "") in t.replace(" ", ""))


def parse_event_date(value: str | None) -> tuple[datetime | None, str | None]:
    """'YYYY-MM-DD' -> (date, 'day'); 'YYYY-MM' -> (first of month, 'month')."""
    v = (value or "").strip()
    for fmt, n, precision in (("%Y-%m-%d", 10, "day"), ("%Y-%m", 7, "month")):
        try:
            return datetime.strptime(v[:n], fmt).replace(tzinfo=UTC), precision
        except ValueError:
            continue
    return None, None


def parse_provider_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            d = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def _states_day(date_text: str, event: datetime) -> bool:
    rest = date_text.replace(str(event.year), " ")
    return re.search(rf"(?<!\d)0?{event.day}(st|nd|rd|th)?(?!\d)", rest) is not None


def _date_supported(event: datetime, date_text: str | None, source_text: str) -> bool:
    # The quoted date must be in the source and must state the year itself.
    if not date_text or not text_supports(date_text, source_text, min_ratio=1.0):
        return False
    return str(event.year) in date_text


# ---------------------------------------------------------------------------
# Validation (pure: unit-tested with fixtures)
# ---------------------------------------------------------------------------

def _key(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:12]


def validate_web_results(
    raw: dict[str, Any], sources: list[WebSource], *, now: datetime | None = None
) -> tuple[list[WebResult], list[dict]]:
    """Validate model output against the schema and the retrieved sources.

    Returns (results, rejected) where rejected is [{company_name, reason}].
    """
    now = now or datetime.now(UTC)
    by_id = {s.id: s for s in sources}
    items = raw.get("results") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return [], [{"company_name": None, "reason": "The model's output did not match the result schema."}]

    results: list[WebResult] = []
    rejected: list[dict] = []
    seen_keys: set[str] = set()
    for item in items[:10]:
        try:
            r = _RawResult.model_validate(item)
        except ValidationError:
            name = item.get("company_name") if isinstance(item, dict) else None
            rejected.append({"company_name": name, "reason": "Did not match the result schema."})
            continue
        name = r.company_name.strip()
        claimed = domain_of(r.website)
        # Only company sites and launch pages can back a claim in this pass.
        roles = {sid: source_role(src, name, claimed) for sid, src in by_id.items()}

        def cited(ids: list[str]) -> list[str]:
            return [i for i in dict.fromkeys(x.strip().upper() for x in ids) if i in by_id]

        building_ids = [i for i in cited(r.building.source_ids) if roles[i]]
        why_ids = [i for i in cited(r.why_matched.source_ids) if roles[i]]
        if not building_ids or not why_ids:
            any_cited = cited(r.building.source_ids) and cited(r.why_matched.source_ids)
            rejected.append({"company_name": name, "reason": (
                "Its sources aren't the company's site or a launch page (e.g. a directory or news article)."
                if any_cited else "A claim was not tied to a retrieved source."
            )})
            continue

        evidence: list[dict] = []
        used_sources: set[str] = set()
        for ev in r.evidence:
            sid = ev.source_id.strip().upper()
            src = by_id.get(sid)
            if not src or sid in used_sources or not roles[sid]:
                continue
            haystack = f"{src.title} {src.text}"
            if not text_supports(ev.quote, haystack):
                continue
            event, precision = parse_event_date(ev.event_date)
            basis: str | None = None
            if event and event <= now + timedelta(days=2) and _date_supported(event, ev.date_text, haystack):
                basis = "stated_in_source"
                if precision == "day" and not _states_day(ev.date_text or "", event):
                    # "January 2026" is a month, not January 1st
                    event, precision = event.replace(day=1), "month"
            else:
                event, precision = None, None
                provider_date = parse_provider_date(src.published_date)
                if provider_date and provider_date <= now + timedelta(days=2):
                    event, precision, basis = provider_date, "day", "search_provider"
            evidence.append({
                "source_id": sid, "url": src.url, "canonical_url": canonical_url(src.url),
                "title": src.title, "domain": src.domain, "kind": ev.kind, "source_role": roles[sid],
                "claim": ev.claim.strip(), "quote": (ev.quote or "").strip()[:240],
                "event_date": event.date().isoformat() if event else None,
                "date_precision": precision, "date_basis": basis,
                "date_text": (ev.date_text or "").strip()[:80] if basis == "stated_in_source" else None,
            })
            used_sources.add(sid)
        if not evidence:
            rejected.append({"company_name": name, "reason": "No evidence quote could be found in its sources."})
            continue

        cited_sources = [by_id[i] for i in dict.fromkeys(building_ids + why_ids + [e["source_id"] for e in evidence])]
        if not any(_name_in(name, f"{s.title} {s.text}") or _name_in(name, s.domain) for s in cited_sources):
            rejected.append({"company_name": name, "reason": "The company name does not appear in its sources."})
            continue

        # The model's own gaps, as readable phrases; founder and website gaps are
        # decided by the checks below, not by the model.
        unknowns = [
            u.strip() for u in r.unknowns
            if isinstance(u, str) and " " in u.strip() and not re.search(r"founder|website", u, re.I)
        ][:4]

        # Website: only when a cited source is on that domain or links to it.
        domain = domain_of(r.website)
        if domain and (is_shared_host(domain) or not any(
            s.domain == domain or s.domain.endswith("." + domain) or domain in _norm_text(s.text)
            for s in cited_sources
        )):
            domain = None
        if not domain:
            unknowns.append("Company website not confirmed by the sources")

        # Founder: named on a cited source, unverified until GitHub confirms.
        founder: dict[str, Any] = {"name": None, "status": "unknown", "source_url": None, "profile_url": None}
        if r.founder_name and r.founder_name.strip():
            src = next((s for s in cited_sources if _name_in(r.founder_name, s.text)), None)
            if src:
                founder = {"name": r.founder_name.strip(), "status": "named_unverified",
                           "source_url": src.url, "profile_url": None}
        if founder["status"] == "unknown":
            unknowns.append("Founder not identified in the sources")
        else:
            unknowns.append("Founder identity not verified")

        handle = (r.github_handle or "").strip().lstrip("@").split("/")[0]
        if handle and not any(f"github.com/{handle.lower()}" in s.text.lower() for s in sources):
            handle = ""

        if all(e["event_date"] is None for e in evidence):
            unknowns.append("No dated signal in the sources")

        # The domain is the primary identity; launch-page URLs about this company
        # are kept too, so a later search that only finds the launch page still
        # resolves to the same lead.
        identifiers: list[dict] = []
        if domain:
            identifiers.append({"kind": "domain", "value": domain, "verified": True})
        for e in evidence:
            if e["domain"] != domain and not (domain and e["domain"].endswith("." + domain)):
                identifiers.append({"kind": "url", "value": e["canonical_url"], "verified": True})

        key = _key(identifiers[0]["kind"], identifiers[0]["value"])
        if key in seen_keys:
            continue  # the model listed the same company twice
        seen_keys.add(key)

        results.append(WebResult(
            key=key, company_name=name, website=f"https://{domain}" if domain else None, domain=domain,
            website_basis="A cited source is on this domain or links to it" if domain else None,
            sector=(r.sector or "").strip() or None,
            building={"text": r.building.text.strip(), "source_ids": building_ids},
            why_matched={"text": r.why_matched.text.strip(), "source_ids": why_ids},
            founder=founder,
            github={"login": handle, "type": None, "url": f"https://github.com/{handle}",
                    "verified": False, "basis": "Linked from a retrieved source; not yet verified"}
            if handle else None,
            evidence=evidence,
            unknowns=list(dict.fromkeys(unknowns)),
            identifiers=identifiers,
        ))
    return results, rejected


# ---------------------------------------------------------------------------
# Company sites: launch pages rarely carry the company's own URL, so look it up
# and accept a page only when its domain is the company's name and it names it.
# ---------------------------------------------------------------------------

def _compact(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def domain_matches_name(domain: str, name: str) -> bool:
    """`ledgerly.dev`, `getledgerly.com`, `ledgerlyhq.com` match "Ledgerly";
    `ledger.io` and `docs.ledgerly.dev` do not."""
    if is_shared_host(domain) or domain.count(".") > 1:
        return False
    compact = _compact(name)
    if len(compact) < 3:
        return False
    label = domain.split(".")[0].replace("-", "")
    if label == compact:
        return True
    stripped = re.sub(r"(hq|app|labs|ai|dev|inc|tech)$", "", re.sub(r"^(get|try|use|join|go)", "", label))
    return stripped == compact


def is_launch_page(src: WebSource) -> bool:
    """A single product's launch: a Product Hunt product/post page, a Show HN or
    Launch HN post, a YC Launches page, or a BetaList startup page."""
    path = urlsplit(src.url).path
    if src.domain == "producthunt.com":
        return path.startswith(("/products/", "/posts/", "/p/"))
    if src.domain == "news.ycombinator.com":
        return re.match(r"\s*(show|launch) hn\b", src.title, re.I) is not None
    if src.domain == "ycombinator.com":
        return path.startswith("/launches/")
    if src.domain == "betalist.com":
        return path.startswith("/startups/")
    return False


def source_role(src: WebSource, name: str, claimed_domain: str | None) -> str | None:
    """company_site | launch_page | None (directories, news, listicles, docs of
    other companies). Deterministic, so the model can't promote a source."""
    if domain_matches_name(src.domain, name):
        return "company_site"
    if (claimed_domain and src.domain == claimed_domain and claimed_domain.count(".") == 1
            and not is_shared_host(claimed_domain) and _name_in(name, f"{src.title} {src.text}")):
        return "company_site"
    if is_launch_page(src):
        return "launch_page"
    return None


def _sentence_with(name: str, text: str) -> str | None:
    i = text.lower().find(name.lower())
    if i < 0:
        return None
    j = text.rfind(". ", 0, i)
    start = j + 2 if j >= 0 else 0
    return text[start:start + 200].strip()


async def resolve_company_sites(
    results: list[WebResult], search: TavilySearch, sources: list[WebSource], notes: list[str], *, limit: int = 5
) -> None:
    for r in [r for r in results if not r.domain][:limit]:
        try:
            run = await search.search([f'"{r.company_name}" official website'], per_query=4, max_sources=4)
        except WebSearchError as exc:
            notes.append(f"Couldn't look up company websites: {exc.message}")
            return
        for site in run.sources:
            if not domain_matches_name(site.domain, r.company_name):
                continue
            text = site.title if _name_in(r.company_name, site.title) else site.text
            quote = _sentence_with(r.company_name, text)
            if not quote:
                continue
            site.id = f"S{len(sources) + 1}"
            sources.append(site)
            r.domain, r.website = site.domain, f"https://{site.domain}"
            r.website_basis = "Domain matches the company name and the page names the company"
            r.evidence.insert(0, {
                "source_id": site.id, "url": site.url, "canonical_url": canonical_url(site.url),
                "title": site.title, "domain": site.domain, "kind": "company_site", "source_role": "company_site",
                "claim": f"Company site: {site.title}"[:300] if site.title else f"{r.company_name} company site",
                "quote": quote, "event_date": None,
                "date_precision": None, "date_basis": None, "date_text": None,
            })
            r.identifiers.insert(0, {"kind": "domain", "value": site.domain, "verified": True})
            r.unknowns = [u for u in r.unknowns if u != "Company website not confirmed by the sources"]
            break


# ---------------------------------------------------------------------------
# GitHub enrichment: a verified match only when the account links to the domain
# ---------------------------------------------------------------------------

def _github_candidates(r: WebResult) -> list[str]:
    cands: list[str] = []
    if r.github and r.github.get("login"):
        cands.append(r.github["login"])
    compact = re.sub(r"[^a-z0-9-]", "", r.company_name.lower().replace(" ", ""))
    if compact:
        cands.append(compact)
    if r.domain:
        cands.append(r.domain.split(".")[0])
    return list(dict.fromkeys(c for c in cands if c))[:2]


async def verify_github(results: list[WebResult], notes: list[str]) -> None:
    """For results with a company domain, look up likely GitHub accounts and
    mark a match verified only if the account's website is that domain."""
    connector = GitHubConnector()
    for r in results:
        if not r.domain:
            continue
        for login in _github_candidates(r):
            status, account = await connector.fetch_account(login)
            if status == "rate_limited":
                notes.append("GitHub rate limit reached; some results were not checked against GitHub.")
                return
            if status != "ok" or not account:
                continue
            if domain_of(account.get("blog")) == r.domain:
                r.github = {
                    "login": account["login"], "type": account.get("type"), "url": account.get("html_url"),
                    "verified": True,
                    "basis": f"GitHub {str(account.get('type') or 'account').lower()} lists {r.domain} as its website",
                }
                r.identifiers.append({"kind": "github", "value": account["login"].lower(), "verified": True})
                if account.get("type") == "User":
                    r.founder = {
                        "name": account.get("name") or account["login"], "status": "verified_github",
                        "source_url": account.get("html_url"), "profile_url": account.get("html_url"),
                    }
                    r.unknowns = [u for u in r.unknowns if not u.startswith("Founder ")]
                break


# ---------------------------------------------------------------------------
# Matching existing leads
# ---------------------------------------------------------------------------

def find_existing(db: Session, identifiers: list[dict]) -> Opportunity | None:
    """Resolve a result to an existing opportunity by reliable identifiers:
    stored lead identifiers first, then existing company websites and GitHub
    logins already in Trajectory (e.g. an inbound application's website)."""
    for ident in identifiers:
        if ident["kind"] not in MATCH_KINDS:
            continue
        li = db.scalar(select(LeadIdentifier).where(
            LeadIdentifier.kind == ident["kind"], LeadIdentifier.value == ident["value"]
        ).order_by(LeadIdentifier.id))
        if li:
            opp = db.get(Opportunity, li.opportunity_id)
            if opp:
                return opp
    for ident in identifiers:
        if ident["kind"] == "domain":
            for c in db.scalars(select(Company).where(Company.website.isnot(None))).all():
                if domain_of(c.website) == ident["value"]:
                    opp = db.scalar(select(Opportunity).where(Opportunity.company_id == c.id).order_by(Opportunity.id))
                    if opp:
                        return opp
        elif ident["kind"] == "github":
            f = db.scalar(select(Founder).where(Founder.github_username.ilike(ident["value"])))
            if f:
                opp = db.scalar(select(Opportunity).where(Opportunity.founder_id == f.id).order_by(Opportunity.id))
                if opp:
                    return opp
    return None


def _evidence_scope(o: Opportunity) -> dict:
    return {"company_id": o.company_id} if o.company_id else {"founder_id": o.founder_id}


def opportunity_evidence_query(o: Opportunity):
    conds = []
    if o.founder_id:
        conds.append(Evidence.founder_id == o.founder_id)
    if o.company_id:
        conds.append(Evidence.company_id == o.company_id)
    return select(Evidence).where(or_(*conds)) if conds else None


def _known_dedup_keys(db: Session, o: Opportunity) -> set[str]:
    q = opportunity_evidence_query(o)
    return {e.dedup_key for e in db.scalars(q).all()} if q is not None else set()


def _dedup_key(e: dict) -> str:
    return hashlib.sha256(f"web|{e['canonical_url']}".encode()).hexdigest()[:32]


def _normalized_evidence(r: WebResult | dict, e: dict) -> NormalizedEvidence:
    domain: str | None = r["domain"] if isinstance(r, dict) else r.domain
    own_site = domain is not None and (e["domain"] == domain or e["domain"].endswith("." + domain))
    event = datetime.fromisoformat(e["event_date"]).replace(tzinfo=UTC) if e.get("event_date") else None
    return NormalizedEvidence(
        source_name=e["title"][:250] or e["domain"],
        source_type=SourceType.COMPANY_WEBSITE if own_site else SourceType.PRODUCT_LAUNCH,
        source_url=e["url"],
        kind=f"{WEB_EVIDENCE_PREFIX}{e['kind']}",
        title=e["claim"][:500],
        raw_value=e.get("quote") or "",
        structured_value={
            "quote": e.get("quote"), "domain": e["domain"], "date_basis": e.get("date_basis"),
            "date_precision": e.get("date_precision"), "date_text": e.get("date_text"),
            "found_by": "web_search",
        },
        event_date=event,
        # A company's own site is company-reported; a third-party page is not
        # independently verified either, just not self-published.
        provenance=Provenance.FOUNDER_REPORTED if own_site else Provenance.INDEPENDENT,
        verification_status=VerificationStatus.FOUNDER_REPORTED if own_site else VerificationStatus.UNVERIFIED,
        confidence=0.5,
        dedup_key=_dedup_key(e),
    )


def _ensure_review(db: Session, opp_id: int) -> None:
    if not db.scalar(select(LeadEvidenceReview).where(LeadEvidenceReview.opportunity_id == opp_id)):
        db.add(LeadEvidenceReview(opportunity_id=opp_id, reviewed_at=utcnow()))
        db.flush()


def append_new_evidence(db: Session, o: Opportunity, r: WebResult | dict, search_id: int | None) -> tuple[int, int]:
    """Append evidence this lead doesn't already have. Returns (added, known)."""
    evidence = r["evidence"] if isinstance(r, dict) else r.evidence
    known = _known_dedup_keys(db, o)
    fresh = [e for e in evidence if _dedup_key(e) not in known]
    for e in evidence:
        e["status"] = "new" if e in fresh else "known"
    if fresh:
        _ensure_review(db, o.id)
        items = [_normalized_evidence(r, e) for e in fresh]
        for it in items:
            it.structured_value["search_id"] = search_id
        persist_evidence(db, items, **_evidence_scope(o), is_demo=False)
        db.add(WorkflowEvent(
            opportunity_id=o.id, event_type="web_evidence_added",
            detail=f"{len(fresh)} new source{'s' if len(fresh) != 1 else ''} from web search",
            occurred_at=datetime.now(UTC),
        ))
    return len(fresh), len(evidence) - len(fresh)


def _add_identifiers(db: Session, opp_id: int, identifiers: list[dict], source_url: str | None) -> None:
    for ident in identifiers:
        exists = db.scalar(select(LeadIdentifier).where(
            LeadIdentifier.kind == ident["kind"], LeadIdentifier.value == ident["value"],
            *( [LeadIdentifier.opportunity_id == opp_id] if ident["kind"] not in MATCH_KINDS else [] ),
        ))
        if not exists:
            db.add(LeadIdentifier(opportunity_id=opp_id, kind=ident["kind"], value=ident["value"],
                                  verified=bool(ident.get("verified")), source_url=source_url))
    db.flush()


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def thesis_request(t: InvestmentThesis | None) -> str:
    """A plain-English starting request built from the fund thesis, which the
    investor can edit before searching."""
    if not t:
        return ""
    parts = [f"{' or '.join(t.stages) if t.stages else 'Early-stage'} startups"]
    if t.sectors:
        parts.append(f"building in {', '.join(t.sectors)}")
    if t.geographies:
        parts.append(f"based in {', '.join(t.geographies)}")
    text = " ".join(parts) + " that recently launched or shipped a product release."
    if t.excluded_sectors:
        text += f" Exclude {', '.join(t.excluded_sectors)}."
    return text[0].upper() + text[1:]


def thesis_dict(t: InvestmentThesis | None) -> dict:
    if not t:
        return {}
    return {"fund_name": t.fund_name, "sectors": t.sectors, "stages": t.stages,
            "geographies": t.geographies, "founder_preferences": t.founder_preferences,
            "description": t.custom_description, "excluded_sectors": t.excluded_sectors}


def focused_plan(db: Session, o: Opportunity) -> dict:
    """Deterministic queries for one lead: its name, its own site's release
    pages (when a domain is known), and launch sites by name."""
    company = db.get(Company, o.company_id) if o.company_id else None
    founder = db.get(Founder, o.founder_id) if o.founder_id else None
    name = company.name if company else (founder.full_name if founder else "")
    if not name:
        raise LookupError("This lead has no company or founder name to search for.")
    domain = domain_of(company.website) if company and company.website else None
    queries = [f"{name} {(company.one_liner if company else '')[:80]}".strip()]
    targeted: list[tuple[str, list[str]]] = []
    if domain:
        targeted.append((f"{name} changelog release launch announcement", [domain]))
    targeted += launch_queries(name)
    return {"request": f"New releases, launches, or changelog updates from {name}" + (f" ({domain})" if domain else ""),
            "queries": queries, "targeted": targeted, "interpretation": "", "planned_by": "lead"}


async def run_web_search(
    db: Session, fund_id: int, request: str, thesis: InvestmentThesis | None,
    *, search: TavilySearch | None = None, focus: Opportunity | None = None,
) -> dict:
    """Search, structure, validate, and match. Raises WebSearchError (search
    could not run) or AIError (structuring unavailable).

    With `focus`, this is a check for one saved lead: queries come from the
    lead's own name and domain (its changelog/release pages and launch sites)
    instead of the planner, and results are matched and appended as usual."""
    search = search or TavilySearch()
    if not search.configured:
        raise WebSearchError("not_configured", "Web search is not configured. Set TAVILY_API_KEY on the backend.")
    td = thesis_dict(thesis)
    if focus is not None:
        plan = focused_plan(db, focus)
        request = plan["request"]
        run = await search.search(plan["queries"], targeted=plan["targeted"])
    else:
        plan = ai.plan_web_search(td, request)
        keywords = plan.get("launch_keywords")
        run = await search.search(plan["queries"], targeted=launch_queries(keywords) if keywords else None)
    notes = list(run.notes)

    record = WebSearch(fund_id=fund_id, request=request, provider=search.name, queries=run.queries_run,
                       source_count=len(run.sources), sources=[s.as_dict() for s in run.sources], notes=notes)
    db.add(record)
    db.flush()

    results: list[WebResult] = []
    rejected: list[dict] = []
    if not run.sources:
        record.status = "no_sources"
    else:
        raw = ai.structure_web_leads(td, request, [
            {"id": s.id, "url": s.url, "title": s.title, "text": s.text, "published_date": s.published_date}
            for s in run.sources
        ])
        results, rejected = validate_web_results(raw, run.sources)
        await resolve_company_sites(results, search, run.sources, notes)
        await verify_github(results, notes)
        record.status = "success" if results else "no_results"

    updated: list[dict] = []
    for r in results:
        opp = find_existing(db, r.identifiers)
        if not opp:
            continue
        added, known = append_new_evidence(db, opp, r, record.id)
        _add_identifiers(db, opp.id, r.identifiers, r.evidence[0]["url"])
        r.existing = {"opportunity_id": opp.id, "name": _opp_name(db, opp), "stage": str(opp.stage),
                      "evidence_added": added, "evidence_known": known}
        if added:
            updated.append({"opportunity_id": opp.id, "name": r.existing["name"], "evidence_added": added})

    record.sources = [s.as_dict() for s in run.sources]
    record.source_count = len(run.sources)
    record.results = [r.model_dump() for r in results]
    record.rejected = rejected
    record.notes = notes
    db.commit()
    return search_out(record, plan=plan, updated=updated)


def _opp_name(db: Session, o: Opportunity) -> str:
    c = db.get(Company, o.company_id) if o.company_id else None
    f = db.get(Founder, o.founder_id) if o.founder_id else None
    return (c.name if c else None) or (f.full_name if f else None) or f"Opportunity #{o.id}"


def search_out(record: WebSearch, *, plan: dict | None = None, updated: list[dict] | None = None) -> dict:
    return {
        "search_id": record.id,
        "request": record.request,
        "status": record.status,
        "provider": record.provider,
        "queries": record.queries,
        "interpretation": (plan or {}).get("interpretation", ""),
        "source_count": record.source_count,
        "sources": record.sources,
        "results": record.results,
        "rejected": record.rejected,
        "notes": record.notes,
        "updated_leads": updated or [],
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


# ---------------------------------------------------------------------------
# Save (investor action)
# ---------------------------------------------------------------------------

SaveStatus = Literal["saved", "monitoring"]


async def save_web_result(
    db: Session, fund_id: int, record: WebSearch, key: str, status: SaveStatus,
    thesis: InvestmentThesis | None,
) -> dict:
    """Create or update a lead from a stored, validated result. Never moves a
    lead to Screening; that stays a separate investor action."""
    idx = next((i for i, r in enumerate(record.results) if r["key"] == key), None)
    if idx is None:
        raise LookupError("Result not found in this search.")
    r = dict(record.results[idx])
    now = datetime.now(UTC)

    opp = find_existing(db, r["identifiers"])
    created = opp is None
    company: Company | None = None
    if opp and opp.company_id:
        company = db.get(Company, opp.company_id)
    if company is None:
        company = Company(name=r["company_name"], normalized_name=r["company_name"].strip().lower(),
                          website=r["website"], sector=r["sector"], one_liner=r["building"]["text"][:500],
                          description="", is_demo=False)
        db.add(company)
        db.flush()
    else:
        company.website = company.website or r["website"]
        company.sector = company.sector or r["sector"]
        company.one_liner = company.one_liner or r["building"]["text"][:500]

    status_enum = OpportunityStatus.SAVED if status == "saved" else OpportunityStatus.MONITORING
    if opp is None:
        fit = compute_thesis_fit(thesis, company)[0] if thesis else 0.0
        opp = Opportunity(
            fund_id=fund_id, company_id=company.id, entry_type=EntryType.OUTBOUND,
            stage=WorkflowStage.SOURCING, status=status_enum, first_signal_at=now,
            thesis_fit_score=fit, surfaced_reason=f"Web search: {r['why_matched']['text']}"[:2000],
            is_demo=False,
        )
        db.add(opp)
        db.flush()
        db.add(WorkflowEvent(opportunity_id=opp.id, event_type="web_lead_saved",
                             detail=f"{r['company_name']} ({status})", actor="investor", occurred_at=now))
    else:
        if opp.company_id is None:
            opp.company_id = company.id
            if thesis:
                opp.thesis_fit_score = compute_thesis_fit(thesis, company)[0]
        # Only a prospect's shared status changes; a deal is never moved.
        if str(opp.stage) == WorkflowStage.SOURCING and str(opp.status) in (
            OpportunityStatus.PROSPECT, OpportunityStatus.SAVED, OpportunityStatus.MONITORING
        ):
            opp.status = status_enum
        db.add(WorkflowEvent(opportunity_id=opp.id, event_type="web_lead_updated",
                             detail=f"{r['company_name']} ({status})", actor="investor", occurred_at=now))

    if created:
        items = [_normalized_evidence(r, e) for e in r["evidence"]]
        for it in items:
            it.structured_value["search_id"] = record.id
        added, _ = persist_evidence(db, items, company_id=company.id, is_demo=False)
        known = 0
        for e in r["evidence"]:
            e["status"] = "new"
    else:
        added, known = append_new_evidence(db, opp, r, record.id)

    identifiers = list(r["identifiers"])
    if r["founder"]["status"] == "named_unverified":
        identifiers.append({"kind": "founder_name", "value": r["founder"]["name"], "verified": False})
    _add_identifiers(db, opp.id, identifiers, r["evidence"][0]["url"])

    gh_note = await _enrich_from_github(db, opp, company, r, thesis)

    if created:
        # Everything saved now is the baseline; later searches add "New evidence".
        db.flush()
        db.add(LeadEvidenceReview(opportunity_id=opp.id, reviewed_at=utcnow()))

    r["saved_opportunity_id"] = opp.id
    r["existing"] = {"opportunity_id": opp.id, "name": company.name, "stage": str(opp.stage),
                     "evidence_added": added, "evidence_known": known}
    results = list(record.results)
    results[idx] = r
    record.results = results  # reassign so the JSON column is marked dirty
    db.commit()
    return {"opportunity_id": opp.id, "created": created, "status": str(opp.status), "stage": str(opp.stage),
            "evidence_added": added, "evidence_known": known, "github": gh_note}


async def _enrich_from_github(db: Session, opp: Opportunity, company: Company, r: dict,
                              thesis: InvestmentThesis | None) -> str | None:
    gh = r.get("github")
    if not gh or not gh.get("verified"):
        return None
    login = gh["login"]
    if gh.get("type") == "Organization":
        company.github_org = company.github_org or login
        result = await GitHubConnector().fetch_org(login, max_repos=10)
        if result.evidence:
            persist_evidence(db, result.evidence, company_id=company.id, is_demo=False)
        return f"GitHub org @{login}: {result.message}"
    founder = db.scalar(select(Founder).where(Founder.github_username.ilike(login)))
    if not founder:
        name = str(r["founder"].get("name") or login)
        founder = Founder(full_name=name, normalized_name=name.lower(), github_username=login,
                          headline=f"GitHub @{login} · {company.name}", is_demo=False)
        db.add(founder)
        db.flush()
    if opp.founder_id is None:
        opp.founder_id = founder.id
    if not db.scalar(select(FounderCompanyRelationship).where(
        FounderCompanyRelationship.founder_id == founder.id, FounderCompanyRelationship.company_id == company.id
    )):
        db.add(FounderCompanyRelationship(founder_id=founder.id, company_id=company.id, role="Founder"))
    sync = await sync_github_user(db, founder.id, login, thesis, light=True)
    return f"GitHub @{login}: {sync.get('message', sync.get('status'))}"


# ---------------------------------------------------------------------------
# New evidence
# ---------------------------------------------------------------------------

def new_evidence_count(db: Session, o: Opportunity) -> int:
    review = db.scalar(select(LeadEvidenceReview).where(LeadEvidenceReview.opportunity_id == o.id))
    q = opportunity_evidence_query(o)
    if not review or q is None:
        return 0
    return len(db.scalars(q.where(
        Evidence.kind.startswith(WEB_EVIDENCE_PREFIX), Evidence.created_at > review.reviewed_at
    )).all())


def new_evidence_ids(db: Session, o: Opportunity) -> list[int]:
    review = db.scalar(select(LeadEvidenceReview).where(LeadEvidenceReview.opportunity_id == o.id))
    q = opportunity_evidence_query(o)
    if not review or q is None:
        return []
    return [e.id for e in db.scalars(q.where(
        Evidence.kind.startswith(WEB_EVIDENCE_PREFIX), Evidence.created_at > review.reviewed_at
    )).all()]


def mark_evidence_reviewed(db: Session, o: Opportunity) -> None:
    review = db.scalar(select(LeadEvidenceReview).where(LeadEvidenceReview.opportunity_id == o.id))
    if review:
        review.reviewed_at = utcnow()
    else:
        db.add(LeadEvidenceReview(opportunity_id=o.id, reviewed_at=utcnow()))
    db.commit()


def lead_identity(db: Session, o: Opportunity) -> dict:
    """Identity facts for list views: an unverified founder named on a source,
    and the verified identifiers this lead is deduplicated on."""
    ids = db.scalars(select(LeadIdentifier).where(LeadIdentifier.opportunity_id == o.id)).all()
    named = next((i for i in ids if i.kind == "founder_name"), None)
    return {
        "founder_named": named.value if named else None,
        "founder_named_source": named.source_url if named else None,
        "identifiers": [{"kind": i.kind, "value": i.value} for i in ids if i.kind in MATCH_KINDS],
    }
