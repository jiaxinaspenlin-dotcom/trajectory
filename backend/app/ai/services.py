"""AI service modules.

Each function takes a plain context dict (assembled by the service layer from
stored evidence only) and returns a validated structured result. Every function
has a deterministic, evidence-only FALLBACK used when the AI provider is
disabled or fails — so the whole product works without an API key and never
invents facts.

`generated_by` in each result is "ai" or "fallback" so the UI is always honest
about provenance.
"""

from __future__ import annotations

from typing import Any

from app.ai.provider import AIError, provider
from app.ai.validation import sanitize_points, validate_evidence_ids

# --------------------------------------------------------------------------
# 1. Natural-language multi-attribute search parsing
# --------------------------------------------------------------------------

_STAGE_WORDS = {
    "pre-seed": "pre-seed", "preseed": "pre-seed", "seed": "seed",
    "series a": "series-a", "series-a": "series-a", "series b": "series-b",
}
_SECTOR_WORDS = {
    "fintech": "fintech", "financial infrastructure": "fintech",
    "financial": "fintech", "payments": "fintech", "ai": "ai/ml",
    "artificial intelligence": "ai/ml", "ml": "ai/ml", "machine learning": "ai/ml",
    "developer tools": "devtools", "devtools": "devtools", "infrastructure": "infrastructure",
    "healthcare": "healthcare", "health": "healthcare", "climate": "climate",
    "security": "security", "cybersecurity": "security", "data": "data",
    "saas": "saas", "marketplace": "marketplace", "robotics": "robotics",
}


def parse_search(query: str, connected_sources: list[str]) -> dict[str, Any]:
    """Convert a compound NL query into structured, editable filters."""
    if provider.enabled:
        try:
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
            data["generated_by"] = "ai"
            data.setdefault("searched_sources", connected_sources)
            return data
        except AIError:
            pass
    return _parse_search_fallback(query, connected_sources)


def _parse_search_fallback(query: str, connected_sources: list[str]) -> dict[str, Any]:
    q = query.lower()
    sectors = sorted({v for k, v in _SECTOR_WORDS.items() if k in q})
    stages = sorted({v for k, v in _STAGE_WORDS.items() if k in q})
    # naive geography extraction: capitalized known cities
    geos = []
    for city in ["boston", "san francisco", "new york", "london", "berlin", "austin", "remote"]:
        if city in q:
            geos.append(city.title())
    return {
        "sectors": sectors,
        "stages": stages,
        "geographies": geos,
        "technical_founder": True if ("technical" in q or "engineer" in q) else None,
        "no_prior_institutional_funding": True
        if ("no prior" in q and "funding" in q) or "no institutional" in q
        else None,
        "requires_product_adoption": True
        if ("adoption" in q or "traction" in q or "users" in q)
        else None,
        "keywords": [w for w in ["execution", "recent", "shipping"] if w in q],
        "min_founder_momentum": "improving" if ("strong" in q and "execution" in q) else None,
        "interpretation": (
            "Parsed deterministically (AI disabled). Review and edit filters before searching. "
            "Only connected sources are searched — not the whole internet."
        ),
        "searched_sources": connected_sources,
        "generated_by": "fallback",
    }


# --------------------------------------------------------------------------
# 2. Three independent screening axes
# --------------------------------------------------------------------------

_LABELS = ["Insufficient Evidence", "Weak", "Mixed", "Promising", "Strong"]


def _score_to_label(score: float, evidence_count: int) -> str:
    if evidence_count == 0:
        return "Insufficient Evidence"
    if score >= 75:
        return "Strong"
    if score >= 58:
        return "Promising"
    if score >= 40:
        return "Mixed"
    return "Weak"


def assess_axes(context: dict[str, Any]) -> dict[str, Any]:
    """Produce three INDEPENDENT axes (never averaged into one number)."""
    allowed_ids = {e["id"] for e in context.get("evidence", [])}
    if provider.enabled:
        try:
            result = _assess_axes_ai(context, allowed_ids)
            return result
        except AIError:
            pass
    return _assess_axes_fallback(context)


def _assess_axes_ai(context: dict[str, Any], allowed_ids: set[int]) -> dict[str, Any]:
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
    return {"axes": axes_out, "generated_by": "ai"}


def _assess_axes_fallback(context: dict[str, Any]) -> dict[str, Any]:
    evidence = context.get("evidence", [])
    claims = context.get("claims", [])
    founder_score = context.get("founder_score", {})
    momentum = context.get("momentum", {})
    thesis_fit = context.get("thesis_fit_score", 0.0)

    # FOUNDER axis: driven by persistent Founder Score + momentum (independent input)
    fscore = float(founder_score.get("score", 0.0))
    f_ev = founder_score.get("evidence_ids", [])
    traj = momentum.get("trajectory", "insufficient_history")
    f_conf = float(founder_score.get("confidence", 0.3))
    founder_axis = {
        "axis": "founder",
        "display_score": round(fscore, 1),
        "label": _score_to_label(fscore, len(f_ev)),
        "confidence": round(f_conf, 2),
        "outlook": "neutral",
        "supporting_points": [
            {"text": founder_score.get("explanation", "Founder Score computed from evidence."),
             "evidence_ids": f_ev[:8], "unverified": len(f_ev) == 0},
            {"text": f"Founder Momentum trajectory: {traj}.", "evidence_ids": [], "unverified": True},
        ],
        "supporting_evidence_ids": f_ev[:8],
        "risks": [] if f_ev else ["Limited independent evidence on the founder."],
        "missing_information": [c["name"] for c in founder_score.get("components", [])
                                if c.get("missingness", 0) >= 0.99][:5],
        "contradictions": [],
        "narrative": (
            "Founder axis reflects the persistent, evidence-based Founder Score and "
            "momentum trajectory. It is one independent axis and is not averaged with market."
        ),
    }

    # MARKET axis: from market-category claims/evidence only
    market_claims = [c for c in claims if c.get("category") in ("market", "traction")]
    m_ev = [e["id"] for e in evidence if e.get("kind") in ("market_signal", "user_growth", "revenue")]
    m_score = 55.0 if market_claims else (35.0 if evidence else 0.0)
    market_axis = {
        "axis": "market",
        "display_score": round(m_score, 1),
        "label": _score_to_label(m_score, len(market_claims) + len(m_ev)),
        "confidence": 0.4 if market_claims else 0.25,
        "outlook": "neutral",
        "supporting_points": [
            {"text": c["text"], "evidence_ids": c.get("evidence_ids", []),
             "unverified": not c.get("evidence_ids")}
            for c in market_claims[:3]
        ] or [{"text": "Insufficient independent market evidence collected.",
               "evidence_ids": [], "unverified": True}],
        "supporting_evidence_ids": m_ev,
        "risks": ["Market sizing not independently verified at this stage."],
        "missing_information": ["Market size", "Growth rate", "Competitive landscape"],
        "contradictions": [],
        "narrative": "Market axis assessed independently; deterministic fallback is conservative "
                     "where independent market evidence is thin.",
    }

    # IDEA vs MARKET axis
    tech_ev = [e["id"] for e in evidence if e.get("kind") in ("github_repo", "github_release", "demo")]
    iv_score = min(70.0, 40.0 + thesis_fit * 0.3) if evidence else 0.0
    idea_axis = {
        "axis": "idea_vs_market",
        "display_score": round(iv_score, 1),
        "label": _score_to_label(iv_score, len(tech_ev)),
        "confidence": 0.35,
        "outlook": "neutral",
        "supporting_points": [
            {"text": "Technical feasibility supported by public repositories/releases.",
             "evidence_ids": tech_ev[:6], "unverified": len(tech_ev) == 0}
        ],
        "supporting_evidence_ids": tech_ev[:6],
        "risks": ["Differentiation and distribution strategy need validation."],
        "missing_information": ["Competitive wedge", "Distribution strategy", "Business-model credibility"],
        "contradictions": [],
        "narrative": "Idea-vs-Market axis assessed independently based on thesis fit and "
                     "technical evidence. Disagreement across axes is preserved.",
    }

    return {"axes": [founder_axis, market_axis, idea_axis], "generated_by": "fallback"}


# --------------------------------------------------------------------------
# 3. Diligence & missing-information questions
# --------------------------------------------------------------------------

def generate_diligence_questions(context: dict[str, Any]) -> dict[str, Any]:
    if provider.enabled:
        try:
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
            return {"questions": [q for q in qs if q["question"]], "generated_by": "ai"}
        except AIError:
            pass
    return _diligence_fallback(context)


def _diligence_fallback(context: dict[str, Any]) -> dict[str, Any]:
    questions: list[dict] = []
    claims = context.get("claims", [])
    contradictions = context.get("contradictions", [])

    for c in claims:
        status = c.get("verification_status")
        if status in ("founder_reported", "unverified") and c.get("category") in (
            "traction", "revenue", "users", "funding",
        ):
            questions.append({
                "question": f"Please provide independent verification for: \"{c['text']}\".",
                "category": "verification",
                "rationale": f"This claim is {status} and material to the decision.",
                "related_claim_ids": [c["id"]],
            })
    for con in contradictions:
        questions.append({
            "question": f"Please reconcile the following discrepancy: {con.get('description', '')}",
            "category": "contradiction",
            "rationale": "Contradictory evidence must be resolved before a confident decision.",
            "related_claim_ids": [i for i in [con.get("claim_a_id"), con.get("claim_b_id")] if i],
        })
    # generic gaps
    have_categories = {c.get("category") for c in claims}
    for cat, question in [
        ("traction", "Provide monthly cohort retention for the last six months."),
        ("team", "Clarify whether repository contributors are employees or independent contributors."),
        ("revenue", "Confirm whether current pilots are paid or unpaid, with amounts."),
    ]:
        if cat not in have_categories:
            questions.append({
                "question": question, "category": cat,
                "rationale": f"No {cat} evidence has been collected yet.",
                "related_claim_ids": [],
            })
    return {"questions": questions[:12], "generated_by": "fallback"}


# --------------------------------------------------------------------------
# 4. Investment Arena: Bull, Bear, Referee
# --------------------------------------------------------------------------

def generate_bull(context: dict[str, Any]) -> dict[str, Any]:
    return _generate_side(context, "bull")


def generate_bear(context: dict[str, Any]) -> dict[str, Any]:
    return _generate_side(context, "bear")


def _generate_side(context: dict[str, Any], side: str) -> dict[str, Any]:
    allowed_ids = {e["id"] for e in context.get("evidence", [])}
    if provider.enabled:
        try:
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
                "generated_by": "ai",
            }
        except AIError:
            pass
    return _side_fallback(context, side)


def _side_fallback(context: dict[str, Any], side: str) -> dict[str, Any]:
    evidence = context.get("evidence", [])
    fscore = float(context.get("founder_score", {}).get("score", 0))
    momentum = context.get("momentum", {})
    thesis_fit = float(context.get("thesis_fit_score", 0))
    contradictions = context.get("contradictions", [])
    weak_claims = [c for c in context.get("claims", [])
                   if c.get("verification_status") in ("founder_reported", "unverified")]

    if side == "bull":
        points = []
        strong_ev = [e["id"] for e in evidence if e.get("confidence", 0) >= 0.7][:5]
        if fscore >= 55:
            points.append({"text": f"Founder Score is {fscore:.0f}/100 with independent evidence.",
                           "evidence_ids": context.get("founder_score", {}).get("evidence_ids", [])[:5],
                           "unverified": False})
        if momentum.get("trajectory") in ("accelerating", "improving"):
            points.append({"text": f"Founder Momentum is {momentum.get('trajectory')}: "
                                   f"{momentum.get('explanation', '')}",
                           "evidence_ids": [], "unverified": True})
        if thesis_fit >= 55:
            points.append({"text": f"Thesis fit is {thesis_fit:.0f}/100 against the active thesis.",
                           "evidence_ids": [], "unverified": True})
        if strong_ev:
            points.append({"text": "Multiple high-confidence independent evidence items on record.",
                           "evidence_ids": strong_ev, "unverified": False})
        if not points:
            points.append({"text": "Insufficient positive evidence to make a strong bull case yet.",
                           "evidence_ids": [], "unverified": True})
        return {
            "role": "bull",
            "headline": "Evidence-backed case to advance",
            "speech_bubble": "Momentum and thesis fit look promising — worth a closer look.",
            "points": points,
            "referenced_evidence_ids": sorted({e for p in points for e in p["evidence_ids"]}),
            "generated_by": "fallback",
        }
    else:
        points = []
        for con in contradictions[:3]:
            points.append({"text": f"Contradiction: {con.get('description', '')}",
                           "evidence_ids": [], "unverified": True})
        if weak_claims:
            points.append({"text": f"{len(weak_claims)} material claim(s) are founder-reported or "
                                   "unverified and lack independent corroboration.",
                           "evidence_ids": [], "unverified": True})
        if float(context.get("founder_score", {}).get("confidence", 0)) < 0.5:
            points.append({"text": "Founder Score confidence is low due to missing evidence.",
                           "evidence_ids": [], "unverified": True})
        if not points:
            points.append({"text": "Primary risk is thin evidence coverage; more diligence needed.",
                           "evidence_ids": [], "unverified": True})
        return {
            "role": "bear",
            "headline": "Evidence-backed case for caution",
            "speech_bubble": "Key claims are unverified and contradictions remain open.",
            "points": points,
            "referenced_evidence_ids": [],
            "generated_by": "fallback",
        }


def generate_referee(
    context: dict[str, Any], bull: dict[str, Any], bear: dict[str, Any]
) -> dict[str, Any]:
    """Referee judges evidence QUALITY, not persuasiveness of writing."""
    if provider.enabled:
        try:
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
            data["generated_by"] = "ai"
            data["recommended_action"] = _normalize_action(data.get("recommended_action"))
            return data
        except AIError:
            pass
    return _referee_fallback(context, bull, bear)


VALID_ACTIONS = {
    "Invite to Apply", "Schedule Interview", "Request Information",
    "Continue Diligence", "Monitor", "Invest", "Pass",
}


def _normalize_action(action: Any) -> str:
    a = str(action or "").strip()
    return a if a in VALID_ACTIONS else "Continue Diligence"


def _referee_fallback(
    context: dict[str, Any], bull: dict[str, Any], bear: dict[str, Any]
) -> dict[str, Any]:
    fscore = float(context.get("founder_score", {}).get("score", 0))
    conf = float(context.get("founder_score", {}).get("confidence", 0))
    thesis_fit = float(context.get("thesis_fit_score", 0))
    contradictions = context.get("contradictions", [])
    entry_type = context.get("entry_type", "outbound")
    independent_evidence = [e for e in context.get("evidence", [])
                            if e.get("provenance") == "independent"]

    # Deterministic decision policy based on EVIDENCE QUALITY, not prose.
    supportable = False
    if contradictions:
        action = "Continue Diligence"
    elif conf < 0.45 or len(independent_evidence) < 3:
        action = "Invite to Apply" if entry_type == "outbound" else "Request Information"
    elif fscore >= 68 and thesis_fit >= 60 and conf >= 0.6:
        action = "Schedule Interview"
        supportable = fscore >= 75 and conf >= 0.7 and thesis_fit >= 65
    elif fscore >= 50:
        action = "Continue Diligence"
    else:
        action = "Monitor"

    bull_pts = bull.get("points", [])
    bear_pts = bear.get("points", [])
    return {
        "recommended_action": action,
        "confidence": round(min(0.9, conf + 0.1), 2),
        "strongest_bull_point": bull_pts[0]["text"] if bull_pts else "No strong bull point.",
        "strongest_bear_point": bear_pts[0]["text"] if bear_pts else "No strong bear point.",
        "unresolved_questions": [con.get("description", "") for con in contradictions][:4]
        or ["Independent verification of key traction claims."],
        "required_diligence": [
            "Corroborate founder-reported metrics with independent sources.",
            "Resolve any open contradictions.",
        ],
        "evidence_that_would_change": (
            "Independent verification of traction (paying customers, retention) and "
            "resolution of contradictions would materially change this recommendation."
        ),
        "final_decision_supportable": supportable,
        "rationale": (
            f"Recommendation is based on evidence quality: Founder Score {fscore:.0f} at "
            f"{conf * 100:.0f}% confidence, thesis fit {thesis_fit:.0f}, "
            f"{len(independent_evidence)} independent evidence items, "
            f"{len(contradictions)} open contradiction(s). The referee weighs independence and "
            "verification over rhetorical strength."
        ),
        "speech_bubble": f"My call: {action}. Evidence quality drives this, not who argued harder.",
        "generated_by": "fallback",
    }


# --------------------------------------------------------------------------
# 5. Investment memo
# --------------------------------------------------------------------------

def generate_memo(context: dict[str, Any]) -> dict[str, Any]:
    if provider.enabled:
        try:
            system = (
                "You write an evidence-backed VC investment memo. Every factual claim must "
                "reference evidence_ids. Label unavailable info as 'Not disclosed', 'Not verified', "
                "'Insufficient evidence', or 'Unavailable at this stage'. Never invent content."
            )
            user = _context_prompt(context) + (
                "\n\nReturn JSON: {\"sections\":[{\"key\":str,\"title\":str,\"body\":str,"
                "\"evidence_ids\":[int],\"unavailable_label\":str|null}],"
                "\"recommended_action\":str,\"confidence\":0-1}"
            )
            data = provider.generate_json(system, user, max_tokens=3000)
            allowed = {e["id"] for e in context.get("evidence", [])}
            for s in data.get("sections", []):
                valid, _ = validate_evidence_ids(s.get("evidence_ids", []), allowed)
                s["evidence_ids"] = valid
            data["recommended_action"] = _normalize_action(data.get("recommended_action"))
            data["generated_by"] = "ai"
            return data
        except AIError:
            pass
    return _memo_fallback(context)


def _memo_fallback(context: dict[str, Any]) -> dict[str, Any]:
    company = context.get("company", {})
    context.get("founder", {})
    evidence = context.get("evidence", [])
    claims = context.get("claims", [])
    context.get("axes", [])
    fscore = context.get("founder_score", {})
    referee = context.get("referee", {})

    def ev_ids_for(kinds):
        return [e["id"] for e in evidence if e.get("kind") in kinds][:6]

    sections = [
        {
            "key": "snapshot", "title": "Company Snapshot",
            "body": (
                f"{company.get('name', 'Company')} — {company.get('one_liner') or 'Not disclosed'}. "
                f"Sector: {company.get('sector') or 'Not disclosed'}. "
                f"Stage: {company.get('stage') or 'Not disclosed'}. "
                f"Geography: {company.get('geography') or 'Not disclosed'}."
            ),
            "evidence_ids": ev_ids_for(["github_profile", "github_repo"]),
            "unavailable_label": None,
        },
        {
            "key": "hypotheses", "title": "Investment Hypotheses",
            "body": (
                f"Founder axis and momentum suggest execution capability (Founder Score "
                f"{fscore.get('score', 0):.0f}/100). Thesis fit {context.get('thesis_fit_score', 0):.0f}/100. "
                "Core hypotheses require independent traction verification before conviction."
            ),
            "evidence_ids": fscore.get("evidence_ids", [])[:6],
            "unavailable_label": None,
        },
        {
            "key": "swot", "title": "SWOT",
            "body": _swot_text(context),
            "evidence_ids": [],
            "unavailable_label": None,
        },
        {
            "key": "problem_product", "title": "Problem & Product",
            "body": company.get("description") or "Insufficient evidence at this stage.",
            "evidence_ids": ev_ids_for(["github_repo", "demo"]),
            "unavailable_label": None if company.get("description") else "Insufficient evidence",
        },
        {
            "key": "traction", "title": "Traction & KPIs",
            "body": _traction_text(claims),
            "evidence_ids": [c["id"] for c in claims if c.get("category") in ("traction", "revenue", "users")][:6],
            "unavailable_label": None if any(c.get("category") in ("traction", "revenue", "users") for c in claims)
            else "Not verified",
        },
        {
            "key": "financials", "title": "Financials & Round Structure",
            "body": "Round structure and financials not disclosed at this stage.",
            "evidence_ids": [], "unavailable_label": "Not disclosed",
        },
        {
            "key": "cap_table", "title": "Cap Table",
            "body": "Cap table not disclosed.", "evidence_ids": [], "unavailable_label": "Not disclosed",
        },
        {
            "key": "referee", "title": "Referee Assessment & Recommendation",
            "body": referee.get("rationale", "Recommendation pending diligence."),
            "evidence_ids": [], "unavailable_label": None,
        },
    ]
    return {
        "sections": sections,
        "recommended_action": _normalize_action(referee.get("recommended_action", "Continue Diligence")),
        "confidence": float(referee.get("confidence", fscore.get("confidence", 0.4))),
        "generated_by": "fallback",
    }


def _swot_text(context: dict[str, Any]) -> str:
    axes = {a.get("axis"): a for a in context.get("axes", [])}
    strengths, weaknesses = [], []
    for name, ax in axes.items():
        if ax.get("label") in ("Strong", "Promising"):
            strengths.append(f"{name}: {ax.get('label')}")
        elif ax.get("label") in ("Weak", "Insufficient Evidence"):
            weaknesses.append(f"{name}: {ax.get('label')}")
    return (
        f"Strengths: {', '.join(strengths) or 'To be established'}. "
        f"Weaknesses: {', '.join(weaknesses) or 'None flagged'}. "
        f"Opportunities: thesis-aligned market entry. "
        f"Threats: unverified claims and competitive uncertainty."
    )


def _traction_text(claims: list[dict]) -> str:
    tr = [c for c in claims if c.get("category") in ("traction", "revenue", "users")]
    if not tr:
        return "No independently verified traction metrics at this stage."
    return " ".join(
        f"{c['text']} (status: {c.get('verification_status')}, trust {c.get('trust_score', 0):.0f})."
        for c in tr[:5]
    )


# --------------------------------------------------------------------------
# 6. Contradiction interpretation & evidence summarization & pitch extraction
# --------------------------------------------------------------------------

def interpret_pitch_deck(page_texts: list[dict]) -> dict[str, Any]:
    """Interpret extracted pitch-deck text into structured fields + slide refs.

    Fallback uses simple keyword heuristics; never fabricates metrics.
    """
    joined = "\n".join(f"[p{p['page']}] {p['text']}" for p in page_texts)[:6000]
    if provider.enabled and joined.strip():
        try:
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
            data["generated_by"] = "ai"
            return data
        except AIError:
            pass
    return _pitch_fallback(page_texts)


def _pitch_fallback(page_texts: list[dict]) -> dict[str, Any]:
    text = " ".join(p["text"] for p in page_texts).lower()
    missing = []
    for field, kws in [
        ("revenue", ["revenue", "arr", "mrr"]),
        ("users", ["users", "customers", "mau", "dau"]),
        ("team", ["team", "founder", "ceo", "cto"]),
        ("market", ["market", "tam", "sam"]),
        ("ask", ["raising", "seeking", "round", "ask"]),
    ]:
        if not any(k in text for k in kws):
            missing.append(field)
    return {
        "company_name": None,
        "one_liner": None,
        "sector": None,
        "problem": None,
        "product": None,
        "metrics": [],
        "team": [],
        "ask": None,
        "missing": missing,
        "note": "Deterministic extraction (AI disabled): structured fields require review. "
                "No metrics were inferred to avoid inventing data.",
        "generated_by": "fallback",
    }


def summarize_evidence(evidence: list[dict]) -> dict[str, Any]:
    if not evidence:
        return {"summary": "No evidence collected yet.", "generated_by": "fallback"}
    if provider.enabled:
        try:
            system = "Summarize the evidence factually. Cite evidence_ids. No speculation."
            listing = "\n".join(
                f"[{e['id']}] {e.get('kind')}: {e.get('title')}" for e in evidence[:40]
            )
            data = provider.generate_json(
                system,
                f"Evidence:\n{listing}\n\nReturn JSON: {{\"summary\":str,\"evidence_ids\":[int]}}",
                max_tokens=800,
            )
            allowed = {e["id"] for e in evidence}
            valid, _ = validate_evidence_ids(data.get("evidence_ids", []), allowed)
            return {"summary": str(data.get("summary", "")), "evidence_ids": valid, "generated_by": "ai"}
        except AIError:
            pass
    kinds: dict[str, int] = {}
    for e in evidence:
        kinds[e.get("kind", "other")] = kinds.get(e.get("kind", "other"), 0) + 1
    summary = "Evidence base: " + ", ".join(f"{v}× {k}" for k, v in sorted(kinds.items()))
    return {"summary": summary, "evidence_ids": [e["id"] for e in evidence[:20]], "generated_by": "fallback"}


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
