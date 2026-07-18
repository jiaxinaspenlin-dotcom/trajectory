# AI Prompting, Provenance & Validation

Sources of truth: `backend/app/ai/provider.py`, `backend/app/ai/services.py`,
`backend/app/ai/validation.py`.

Trajectory uses an LLM only to *interpret and organize stored evidence* — never
to source facts. Every AI service is grounded in stored evidence, validated
against real evidence IDs, tagged with its provenance, and backed by a
deterministic fallback so the whole product runs with no API key.

---

## 1. The AI service modules

All live in `app/ai/services.py`. Each takes a plain context dict assembled by
the service layer from **stored evidence only**, and returns validated
structured JSON with a `generated_by` field.

| Service | Function | What it produces |
|---------|----------|------------------|
| Search parsing | `parse_search` | Compound NL query → structured, editable filters (sectors, stages, geographies, technical/funding/adoption flags, keywords, interpretation) |
| Three-axis assessment | `assess_axes` | Three **independent** axes — `founder`, `market`, `idea_vs_market` — never averaged; each with score, label, confidence, outlook, evidence-cited supporting points, risks, missing info, contradictions, narrative |
| Diligence questions | `generate_diligence_questions` | Targeted questions resolving unsupported claims, contradictions, and gaps (with `related_claim_ids`) |
| Bull | `generate_bull` | Strongest evidence-backed case FOR advancing |
| Bear | `generate_bear` | Strongest evidence-backed case AGAINST advancing |
| Referee | `generate_referee` | Judges evidence QUALITY (not prose); recommends one action from a fixed set |
| Investment memo | `generate_memo` | Evidence-backed memo sections, each with evidence IDs and explicit "unavailable" labels |
| Pitch-deck interpretation | `interpret_pitch_deck` | Structured facts from page-tagged deck text; each metric tagged with its page; nothing invented |
| Evidence summarization | `summarize_evidence` | Factual summary citing evidence IDs |
| Contradiction interpretation | (surfaced via context + diligence/bear) | Explains detected numeric contradictions |

Labels for axes: `Strong` (≥75), `Promising` (≥58), `Mixed` (≥40), `Weak`,
`Insufficient Evidence` (0 evidence). The Referee's recommended action is
normalized to one of: *Invite to Apply, Schedule Interview, Request Information,
Continue Diligence, Monitor, Invest, Pass* (defaults to Continue Diligence if
the model returns anything else).

---

## 2. Rules enforced

### Only stored evidence reaches the model
`_context_prompt` serializes only stored evidence and claims — nothing else.
Evidence lines are tagged `[E{id}]` and the prompt states explicitly "EVIDENCE
(only these IDs may be cited)". The model never receives the open internet.

### Never invent facts; evidence IDs required for factual conclusions
Every `generate_json` call appends a hard guard instructing the model to:
respond with a single JSON object (no markdown/prose), **not reveal
step-by-step reasoning** (no hidden chain-of-thought — only final structured
conclusions), and never invent facts, citations, URLs, metrics, or evidence
IDs, referencing only IDs present in the context. Prompts require supporting
points to cite `evidence_ids`.

### Separate evidence / inference / uncertainty
Assessment and memo outputs keep these apart structurally: `supporting_points`
(with evidence IDs) vs `risks`, `missing_information`, and `contradictions`.
Memo sections carry an `unavailable_label` ("Not disclosed", "Not verified",
"Insufficient evidence", "Unavailable at this stage") so absence of data is
labeled, never fabricated.

### Validation layer rejects nonexistent evidence IDs
`app/ai/validation.py` is applied to every factual AI output:

- `validate_evidence_ids(referenced, allowed)` → `(valid, rejected)`.
  Non-integer and unknown IDs are dropped from `valid` and returned in
  `rejected`.
- `sanitize_points(points, allowed)` cleans `{text, evidence_ids}` points: a
  point whose IDs are all invalid is **kept but flagged `unverified: True`** so
  it cannot masquerade as evidence-backed; rejected IDs are recorded on the
  point.

This runs on assessment supporting points, bull/bear points, memo section
evidence IDs, diligence `related_claim_ids`, and summarization IDs. It is also
exposed directly at `POST /api/opportunities/{id}/validate-evidence-refs`, which
returns `{valid_evidence_ids, rejected_evidence_ids, all_valid}`.

---

## 3. Structured JSON, retries, timeouts

`AIProvider.generate_json(system, user, max_tokens, retries=2)`:

- Uses the Anthropic Messages API; the client is created lazily so tests run
  without network.
- SDK configured with an explicit timeout (`AI_TIMEOUT_SECONDS`, default 60s)
  and `max_retries=0` — retries are handled in-app with exponential backoff
  (`0.6 * 2^attempt` seconds).
- `_extract_json` tolerates code fences and surrounding prose, extracting the
  first `{ … }` object; if none parses, it raises `AIError`.
- Only metadata is logged (model, token counts, elapsed) — never the API key,
  never full evidence. On failure it raises `AIError` (never the raw provider
  exception) so the caller applies its fallback.

---

## 4. Deterministic fallback for every service

When the provider is disabled (`ai_enabled` False — no `ANTHROPIC_API_KEY`) or
any call fails, each service runs an evidence-only fallback that invents
nothing:

- **Search** parses sectors/stages/geographies with keyword maps and notes it is
  deterministic and that only connected sources are searched.
- **Axes** derives the Founder axis from the persistent Founder Score + momentum,
  the Market axis from market/traction claims, and Idea-vs-Market from thesis
  fit + technical evidence — keeping the three independent and conservative when
  evidence is thin.
- **Bull/Bear** build points from the Founder Score, momentum, thesis fit,
  high-confidence evidence, contradictions, and unverified claims.
- **Referee** applies a deterministic decision policy based on **evidence
  quality** (contradictions → Continue Diligence; thin/low-confidence evidence →
  Invite to Apply / Request Information; strong evidence → Schedule Interview),
  and sets `final_decision_supportable` only when the bar is met.
- **Pitch deck** extracts nothing numeric — it only lists which fields are
  *missing* ("No metrics were inferred to avoid inventing data").
- **Memo / diligence / summarization** all have conservative, evidence-linked
  fallbacks.

---

## 5. `generated_by` keeps provenance honest

Every AI result carries `generated_by: "ai" | "fallback"`, persisted on
`OpportunityAssessment`, `Debate`, `InvestmentMemo`, and `DiligenceQuestion`,
and shown in the UI (e.g. the Investment Arena header renders
`v{version} · {generated_by}`). The user always knows whether output came from
the model or the deterministic fallback.

---

## 6. Provider abstraction

The rest of the codebase depends only on `AIProvider.generate_json(...)`. The
sole implemented provider is Anthropic, but a second provider could be added
behind the same method without rewriting any service or route — the prompt
construction, JSON extraction, validation, and fallback logic are all
provider-agnostic.

---

## 7. Tested guarantees (`tests/test_ai_and_validation.py`)

- `validate_evidence_ids` keeps `[1,2,"3"]` from `{1,2,3}` and rejects `999`.
- `sanitize_points` flags all-invalid and empty points as `unverified`.
- `_extract_json` handles fenced JSON and prose-wrapped JSON, and raises on
  garbage.
- Search fallback is honest (`generated_by == "fallback"`) and correctly parses
  fintech / pre-seed / Boston / technical / product-adoption.
- Axes are never averaged and always independent (three distinct scores).
- Referee judges on quality: contradictions force "Continue Diligence"; thin
  evidence yields `final_decision_supportable = False`.
- Pitch fallback invents no metrics and reports missing fields.
