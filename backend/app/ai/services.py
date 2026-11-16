"""AI service modules (OpenAI).

Each function takes a plain context dict (assembled by the service layer from
STORED evidence only) and returns a validated structured result. There is NO
deterministic fallback: if the provider is not configured or fails, the
underlying `provider.generate_json` raises `AIError`, which propagates to the
API and becomes an HTTP 503. The model is only ever given stored
evidence, is instructed never to invent facts, and every referenced evidence ID
is validated against the real evidence set (hallucinated IDs are rejected).

`generated_by` is always "openai" so the UI is explicit about provenance.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.ai.provider import AIError, provider
from app.ai.validation import sanitize_points, validate_evidence_ids

VALID_ACTIONS = {
    "Invite to Apply", "Schedule Interview", "Request Information",
    "Continue Diligence", "Monitor", "Invest", "Pass",
}


def _normalize_action(action: Any) -> str:
    a = str(action or "").strip()
    return a if a in VALID_ACTIONS else "Continue Diligence"


# --------------------------------------------------------------------------
# 1. Natural-language multi-attribute search parsing
# --------------------------------------------------------------------------

def parse_search(query: str, connected_sources: list[str]) -> dict[str, Any]:
    """Convert a compound NL query into structured, editable filters."""
    system = (
        "You convert a venture-capital natural-language search into structured "
        "filters. Only extract filters explicitly implied by the query."
    )
    user = (
        f"Query: {query}\n\n"
        f"Connected/searchable sources: {connected_sources}\n\n"
        "Return JSON with keys: sectors (list), stages (list), geographies (list), "
        "technical_founder (bool|null), no_prior_institutional_funding (bool|null), "
        "requires_product_adoption (bool|null), keywords (list), "
        "min_founder_momentum (string|null), interpretation (short string)."
    )
    data = provider.generate_json(system, user, max_tokens=800)
    data["generated_by"] = "openai"
    data.setdefault("searched_sources", connected_sources)
    return data


# --------------------------------------------------------------------------
# 1b. AI-driven sourcing: plan GitHub search queries from the thesis/brief
# --------------------------------------------------------------------------

def plan_github_search(thesis: dict[str, Any], brief: str) -> dict[str, Any]:
    """Turn a fund thesis + optional brief into concrete GitHub search queries.

    Returns repo_queries and user_queries using GitHub search qualifiers
    (language:, location:, topic keywords, pushed:>YYYY-MM-DD). Raises AIError
    when the provider is unavailable — the caller falls back to a deterministic
    thesis-derived query builder (that is search-query construction, not invented
    facts).
    """
    system = (
        "You help a VC find builder-founders on GitHub. Convert the fund thesis and brief "
        "into GitHub SEARCH queries that surface active individual builders (not orgs). "
        "Use real GitHub qualifiers: language:, location:, pushed:>YYYY-MM-DD, and topic/"
        "keyword terms for the sectors. Prefer repository searches (their owners are the "
        "builders) plus a couple of user searches by location+language. Keep queries concise."
    )
    user = (
        f"Thesis: {thesis}\nInvestor brief (optional): {brief or '(none — use the thesis)'}\n\n"
        "Return JSON: {\"repo_queries\":[str], \"user_queries\":[str], \"interpretation\":str}. "
        "2-4 repo_queries and 1-3 user_queries."
    )
    data = provider.generate_json(system, user, max_tokens=700)
    return {
        "repo_queries": [str(q) for q in data.get("repo_queries", [])][:4],
        "user_queries": [str(q) for q in data.get("user_queries", [])][:3],
        "interpretation": str(data.get("interpretation", "")),
        "planned_by": "openai",
    }


# --------------------------------------------------------------------------
# 1c. Web sourcing: plan web queries, then structure retrieved pages
# --------------------------------------------------------------------------

def plan_web_search(thesis: dict[str, Any], request: str) -> dict[str, Any]:
    """Turn the investor's request (or the thesis) into 2-3 web search queries
    aimed at company sites, launch posts, and changelogs."""
    system = (
        "You help a VC find early-stage startups on the open web. Write web search queries "
        "that surface primary sources about specific young companies: their own websites, "
        "launch announcements (e.g. Show HN, Product Hunt, YC launches, launch blog posts), "
        "and product changelogs or release notes. Avoid queries that return listicles, "
        "funding databases, or big incumbents."
    )
    today = date.today().isoformat()
    user = (
        f"Today is {today}. Investor request: {request or '(none — use the thesis)'}\nThesis: {thesis or '(none)'}\n\n"
        "If the request names a specific company or product, put that name in site_queries and launch_keywords. "
        "site_queries: 1 query phrased the way a founder announces on their own site, e.g. "
        "\"we just launched an open-source tool for ...\", \"introducing <category> for ...\". "
        "launch_keywords: 2-4 plain words for the product category (e.g. \"developer tools\", "
        "\"payments infrastructure\"); they are searched on launch sites. No site: operators, no years.\n"
        "Return JSON: {\"site_queries\":[str], \"launch_keywords\":str, \"interpretation\":str}."
    )
    data = provider.generate_json(system, user, max_tokens=400)
    # search operators (site:, intitle:, ...) and exact-phrase quotes narrow the
    # provider's matching too much; the targeted launch searches handle sites
    clean = lambda q: " ".join(re.sub(r"\b[a-z]+:\S*|[\"“”]", " ", str(q)).split())  # noqa: E731
    queries = [q for q in (clean(x) for x in data.get("site_queries", [])) if q][:1]
    # the launch templates add their own verbs; keep only the category words
    filler = {"launch", "launches", "launched", "release", "releases", "new", "startup", "startups", "product", "products"}
    keywords = " ".join([w for w in clean(data.get("launch_keywords") or "").split() if w.lower() not in filler][:4])
    if not queries and not keywords:
        raise AIError("The model returned no web search queries.")
    return {"queries": queries, "launch_keywords": keywords,
            "interpretation": str(data.get("interpretation", "")), "planned_by": "openai"}


def structure_web_leads(thesis: dict[str, Any], request: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
    """Extract candidate companies from retrieved pages. The output is raw: the
    caller validates it against the schema and the source texts."""
    system = (
        "You turn retrieved web pages into a shortlist of early-stage companies for a VC. "
        "Use ONLY the provided sources. Every statement must cite source ids (S1, S2, ...) whose "
        "text supports it. Quote dates and founder names exactly as they appear in the source text; "
        "if a source does not state a date or a founder, use null. Skip large incumbents, "
        "investors, directories, and listicles that are not about one company."
    )
    listing = "\n\n".join(
        f"[{s['id']}] {s['title']}\nURL: {s['url']}\n"
        f"Search-provider published date: {s.get('published_date') or 'unknown'}\nTEXT: {s['text']}"
        for s in sources
    )
    user = (
        f"Investor request: {request or '(from thesis)'}\nThesis: {thesis or '(none)'}\n\n"
        f"SOURCES:\n{listing}\n\n"
        "Return JSON: {\"results\":[{"
        "\"company_name\":str, "
        "\"website\":str|null (the company's own site, only if one of the cited sources is on it or links it), "
        "\"founder_name\":str|null (exact text from a cited source), "
        "\"github_handle\":str|null (only if a github.com/<handle> link appears in a source), "
        "\"sector\":str|null (pick from the thesis sectors when one fits), "
        "\"building\":{\"text\":str,\"source_ids\":[str]}, "
        "\"why_matched\":{\"text\":str,\"source_ids\":[str]}, "
        "\"evidence\":[{\"source_id\":str, \"kind\":\"launch\"|\"release\"|\"changelog\"|\"company_site\"|\"press\"|\"other\", "
        "\"claim\":str, \"quote\":str (verbatim from the source text, under 200 chars), "
        "\"event_date\":\"YYYY-MM-DD\"|\"YYYY-MM\"|null, \"date_text\":str|null (verbatim date text from the source)}], "
        "\"unknowns\":[str] (short plain-English gaps an investor would care about, e.g. \"Pricing not stated\")}]}. "
        "At most 8 results, best matches first."
    )
    return provider.generate_json(system, user, max_tokens=3500)


# --------------------------------------------------------------------------
# 2. Three independent screening axes
# --------------------------------------------------------------------------

def assess_axes(context: dict[str, Any]) -> dict[str, Any]:
    """Produce three INDEPENDENT axes (never averaged into one number)."""
    allowed_ids = {e["id"] for e in context.get("evidence", [])}
    system = (
        "You are a VC analyst. Assess an opportunity on THREE INDEPENDENT axes: "
        "founder, market, idea_vs_market. Do NOT average them. Preserve disagreement. "
        "Every supporting point must cite evidence_ids from the provided evidence."
    )
    user = _context_prompt(context) + (
        "\n\nReturn JSON: {\"axes\":[{\"axis\":\"founder|market|idea_vs_market\","
        "\"display_score\":0-100,\"label\":\"Strong|Promising|Mixed|Weak|Insufficient Evidence\","
        "\"confidence\":0-1,\"outlook\":\"bullish|neutral|bearish\","
        "\"supporting_points\":[{\"text\":str,\"evidence_ids\":[int]}],"
        "\"risks\":[str],\"missing_information\":[str],\"contradictions\":[str],"
        "\"narrative\":str}]}"
    )
    data = provider.generate_json(system, user, max_tokens=2500)
    axes_out = []
    for ax in data.get("axes", []):
        points, _ = sanitize_points(ax.get("supporting_points", []), allowed_ids)
        ev_ids = sorted({eid for p in points for eid in p["evidence_ids"]})
        axes_out.append(
            {
                "axis": ax.get("axis"),
                "display_score": float(ax.get("display_score", 0)),
                "label": ax.get("label", "Insufficient Evidence"),
                "confidence": float(ax.get("confidence", 0.4)),
                "outlook": ax.get("outlook", "neutral"),
                "supporting_points": points,
                "supporting_evidence_ids": ev_ids,
                "risks": [str(r) for r in ax.get("risks", [])][:6],
                "missing_information": [str(m) for m in ax.get("missing_information", [])][:6],
                "contradictions": [str(c) for c in ax.get("contradictions", [])][:6],
                "narrative": str(ax.get("narrative", "")),
            }
        )
    return {"axes": axes_out, "generated_by": "openai"}


# --------------------------------------------------------------------------
# 3. Diligence & missing-information questions
# --------------------------------------------------------------------------

def generate_diligence_questions(context: dict[str, Any]) -> dict[str, Any]:
    system = (
        "You are a VC diligence analyst. Generate targeted diligence questions that "
        "resolve unsupported claims, contradictions, and missing information."
    )
    user = _context_prompt(context) + (
        "\n\nReturn JSON: {\"questions\":[{\"question\":str,\"category\":str,"
        "\"rationale\":str,\"related_claim_ids\":[int]}]}"
    )
    data = provider.generate_json(system, user, max_tokens=1500)
    qs = []
    allowed_claims = {c["id"] for c in context.get("claims", [])}
    for q in data.get("questions", [])[:12]:
        valid, _ = validate_evidence_ids(q.get("related_claim_ids", []), allowed_claims)
        qs.append({
            "question": str(q.get("question", "")).strip(),
            "category": str(q.get("category", "general")),
            "rationale": str(q.get("rationale", "")),
            "related_claim_ids": valid,
        })
    return {"questions": [q for q in qs if q["question"]], "generated_by": "openai"}


# --------------------------------------------------------------------------
# 4. Investment Arena: Bull, Bear, Referee
# --------------------------------------------------------------------------

def generate_bull(context: dict[str, Any]) -> dict[str, Any]:
    return _generate_side(context, "bull")


def generate_bear(context: dict[str, Any]) -> dict[str, Any]:
    return _generate_side(context, "bear")


def _generate_side(context: dict[str, Any], side: str) -> dict[str, Any]:
    allowed_ids = {e["id"] for e in context.get("evidence", [])}
    stance = (
        "the strongest EVIDENCE-BACKED case FOR advancing/investing"
        if side == "bull"
        else "the strongest EVIDENCE-BACKED case AGAINST advancing/investing"
    )
    system = (
        f"You are the {side.upper()} in an investment debate. Make {stance}. "
        "Every point must cite real evidence_ids. Be concise. No hidden reasoning."
    )
    user = _context_prompt(context) + (
        "\n\nReturn JSON: {\"headline\":str,\"speech_bubble\":str(<=160 chars),"
        "\"points\":[{\"text\":str,\"evidence_ids\":[int]}]}"
    )
    data = provider.generate_json(system, user, max_tokens=1400)
    points, _ = sanitize_points(data.get("points", []), allowed_ids)
    ev_ids = sorted({eid for p in points for eid in p["evidence_ids"]})
    return {
        "role": side,
        "headline": str(data.get("headline", "")),
        "speech_bubble": str(data.get("speech_bubble", ""))[:200],
        "points": points,
        "referenced_evidence_ids": ev_ids,
        "generated_by": "openai",
    }


def generate_referee(
    context: dict[str, Any], bull: dict[str, Any], bear: dict[str, Any]
) -> dict[str, Any]:
    """Referee judges evidence QUALITY, not persuasiveness of writing."""
    system = (
        "You are the REFEREE. Judge the QUALITY and INDEPENDENCE of the Bull and Bear "
        "evidence, Trust Scores, contradictions, missing info, thesis fit, and the three "
        "axes. Do NOT pick the side with better prose. Recommend one actionable next step."
    )
    user = (
        _context_prompt(context)
        + f"\n\nBULL points: {[p['text'] for p in bull.get('points', [])]}"
        + f"\nBEAR points: {[p['text'] for p in bear.get('points', [])]}"
        + "\n\nReturn JSON: {\"recommended_action\":\"Invite to Apply|Schedule Interview|"
        "Request Information|Continue Diligence|Monitor|Invest|Pass\",\"confidence\":0-1,"
        "\"strongest_bull_point\":str,\"strongest_bear_point\":str,"
        "\"unresolved_questions\":[str],\"required_diligence\":[str],"
        "\"evidence_that_would_change\":str,\"final_decision_supportable\":bool,"
        "\"rationale\":str,\"speech_bubble\":str(<=160)}"
    )
    data = provider.generate_json(system, user, max_tokens=1600)
    data["generated_by"] = "openai"
    data["recommended_action"] = _normalize_action(data.get("recommended_action"))
    return data


# --------------------------------------------------------------------------
# 5. Investment memo
# --------------------------------------------------------------------------

# The canonical, always-present memo sections (key, title, what it should cover).
MEMO_SECTIONS: list[tuple[str, str, str]] = [
    ("snapshot", "Company snapshot",
     "One-paragraph nutshell: market size, the structural problem, why it's urgent, and how the product solves it."),
    ("hypotheses", "Investment hypotheses",
     "The explicit 'why we want to invest' bullets: team quality, market wedge, stickiness/retention, traction signal, defensibility, expansion path."),
    ("swot", "SWOT",
     "Strengths, weaknesses, opportunities, risks — each as short, evidence-backed bullets."),
    ("team", "Team & history",
     "Founder background, exec pedigree, why the fund is comfortable with any red flags, company timeline from founding to today."),
    ("problem_product", "Problem & product",
     "The core problem(s) in plain language, then the step-by-step product/process solving it."),
    ("technology", "Technology & defensibility",
     "What's proprietary vs commoditizable, the data moat, model/architecture choices, why the advantage compounds over time."),
    ("market", "Market sizing",
     "Top-down and/or bottom-up TAM/SAM/SOM, with the assumptions stated explicitly."),
    ("competition", "Competition",
     "Named competitor clusters, how each differs from the company, and who could become a threat later."),
    ("traction", "Traction & KPIs",
     "Customer count, ARR/revenue, growth trajectory, unit economics (CAC, sales cycle, churn), usage metrics."),
    ("financials", "Financials & round structure",
     "Historical + projected P&L (revenue, EBITDA, opex, COGS), round size, runway, next-round timing."),
    ("cap_table", "Cap table",
     "Pre- and post-round ownership by party, dilution assumptions, VSOP allocation."),
    ("diligence_log", "Due diligence log",
     "What was checked (commercial, people, financial, legal, technical) and what's still open."),
    ("exit", "Exit perspective",
     "Plausible exit paths (strategic acquirers, PE roll-up, category comparables) and why they'd pay a premium."),
]


def generate_memo(context: dict[str, Any]) -> dict[str, Any]:
    section_spec = "\n".join(f"- {k} | {t}: {g}" for k, t, g in MEMO_SECTIONS)
    system = (
        "You write an evidence-backed VC investment memo. You MUST produce EVERY section "
        "listed, in the given order, using the exact keys. Fill each section only from the "
        "provided stored evidence. Every factual claim must reference evidence_ids. When a "
        "section has no supporting evidence, still include it with a short note and set "
        "unavailable_label to one of 'Not disclosed', 'Not verified', 'Insufficient evidence', "
        "or 'Unavailable at this stage'. NEVER invent numbers, customers, financials, cap "
        "tables, or projections."
    )
    user = _context_prompt(context) + (
        "\n\nProduce these sections (key | title: guidance):\n" + section_spec +
        "\n\nReturn JSON: {\"sections\":[{\"key\":str,\"title\":str,\"body\":str,"
        "\"evidence_ids\":[int],\"unavailable_label\":str|null}],"
        "\"recommended_action\":str,\"confidence\":0-1}"
    )
    data = provider.generate_json(system, user, max_tokens=3500)
    allowed = {e["id"] for e in context.get("evidence", [])}
    by_key = {}
    for s in data.get("sections", []):
        valid, _ = validate_evidence_ids(s.get("evidence_ids", []), allowed)
        s["evidence_ids"] = valid
        if s.get("key"):
            by_key[s["key"]] = s

    # guarantee every canonical section is present, in order
    ordered: list[dict[str, Any]] = []
    for key, title, _guide in MEMO_SECTIONS:
        s = by_key.get(key)
        if s:
            s["title"] = title  # normalize the title
            ordered.append(s)
        else:
            ordered.append({
                "key": key, "title": title,
                "body": "Not disclosed — insufficient evidence at this stage.",
                "evidence_ids": [], "unavailable_label": "Insufficient evidence",
            })
    data["sections"] = ordered
    data["recommended_action"] = _normalize_action(data.get("recommended_action"))
    data["generated_by"] = "openai"
    return data


# --------------------------------------------------------------------------
# 6. Pitch-deck interpretation & evidence summarization
# --------------------------------------------------------------------------

def interpret_pitch_deck(page_texts: list[dict]) -> dict[str, Any]:
    """Interpret extracted pitch-deck text into structured fields + slide refs.

    Only extracts what is literally present; never fabricates metrics.
    """
    joined = "\n".join(f"[p{p['page']}] {p['text']}" for p in page_texts)[:6000]
    system = (
        "Extract structured facts from pitch-deck text. Only extract what is literally "
        "present. For every extracted metric, include the page number it came from. "
        "If a field is absent, use null. Never invent numbers."
    )
    user = (
        f"Deck text (page-tagged):\n{joined}\n\n"
        "Return JSON: {\"company_name\":str|null,\"one_liner\":str|null,\"sector\":str|null,"
        "\"problem\":str|null,\"product\":str|null,\"metrics\":[{\"label\":str,\"value\":str,"
        "\"page\":int}],\"team\":[str],\"ask\":str|null,\"missing\":[str]}"
    )
    data = provider.generate_json(system, user, max_tokens=1600)
    data["generated_by"] = "openai"
    return data


def summarize_evidence(evidence: list[dict]) -> dict[str, Any]:
    if not evidence:
        return {"summary": "No evidence collected yet.", "evidence_ids": [], "generated_by": "openai"}
    system = "Summarize the evidence factually. Cite evidence_ids. No speculation."
    listing = "\n".join(f"[{e['id']}] {e.get('kind')}: {e.get('title')}" for e in evidence[:40])
    data = provider.generate_json(
        system,
        f"Evidence:\n{listing}\n\nReturn JSON: {{\"summary\":str,\"evidence_ids\":[int]}}",
        max_tokens=800,
    )
    allowed = {e["id"] for e in evidence}
    valid, _ = validate_evidence_ids(data.get("evidence_ids", []), allowed)
    return {"summary": str(data.get("summary", "")), "evidence_ids": valid, "generated_by": "openai"}


# --------------------------------------------------------------------------
# shared context prompt builder
# --------------------------------------------------------------------------

def _context_prompt(context: dict[str, Any]) -> str:
    """Serialize STORED evidence/claims only — the model gets nothing else."""
    company = context.get("company", {})
    founder = context.get("founder", {})
    thesis = context.get("thesis", {})
    evidence = context.get("evidence", [])
    claims = context.get("claims", [])
    contradictions = context.get("contradictions", [])

    ev_lines = "\n".join(
        f"[E{e['id']}] kind={e.get('kind')} conf={e.get('confidence')} "
        f"prov={e.get('provenance')} status={e.get('verification_status')} :: {e.get('title')}"
        for e in evidence[:60]
    )
    claim_lines = "\n".join(
        f"[C{c['id']}] ({c.get('category')}, {c.get('verification_status')}, "
        f"trust={c.get('trust_score')}) {c.get('text')}"
        for c in claims[:40]
    )
    con_lines = "\n".join(f"- {c.get('description')}" for c in contradictions[:20])

    return (
        f"THESIS: {thesis.get('fund_name')} | sectors={thesis.get('sectors')} "
        f"stages={thesis.get('stages')} geos={thesis.get('geographies')} "
        f"risk={thesis.get('risk_tolerance')}\n"
        f"COMPANY: {company.get('name')} | {company.get('one_liner')} | "
        f"sector={company.get('sector')} stage={company.get('stage')}\n"
        f"FOUNDER: {founder.get('full_name')} | {founder.get('headline')}\n"
        f"FOUNDER_SCORE: {context.get('founder_score', {}).get('score')} "
        f"(confidence {context.get('founder_score', {}).get('confidence')})\n"
        f"THESIS_FIT: {context.get('thesis_fit_score')}\n\n"
        f"EVIDENCE (only these IDs may be cited):\n{ev_lines or 'none'}\n\n"
        f"CLAIMS:\n{claim_lines or 'none'}\n\n"
        f"CONTRADICTIONS:\n{con_lines or 'none'}\n"
    )
