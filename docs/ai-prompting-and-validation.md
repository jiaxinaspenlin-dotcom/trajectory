# AI Prompting, Provenance & Validation

Sources of truth: `backend/app/ai/provider.py`, `backend/app/ai/services.py`,
`backend/app/ai/validation.py`.

Trajectory uses an LLM only to *interpret and organize stored evidence* — never
to source facts. Every AI service is grounded in stored evidence, validated
against real evidence IDs, and tagged with its provenance. There is **no AI text
fallback**: when no key is configured or the provider fails, AI services raise
`AIError`, which a global handler turns into an HTTP **503** response. The
deterministic scoring engines (Founder Score, momentum, ranking, Trust) are a
separate, pure-Python core that always works — they are not AI and were never a
"fallback."

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

- Uses the OpenAI Chat Completions API in **JSON mode**
  (`response_format={"type": "json_object"}`); the client is created lazily so
  tests run without network. Provider and model come from config
  (`OPENAI_API_KEY`, `OPENAI_MODEL`, default `gpt-4o`).
- Client configured with an explicit timeout (`AI_TIMEOUT_SECONDS`, default 60s)
  and no SDK-level retries — retries are handled in-app with exponential backoff
  (`0.6 * 2^attempt` seconds).
- `_extract_json` tolerates code fences and surrounding prose, extracting the
  first `{ … }` object; if none parses, it raises `AIError`.
- Only metadata is logged (model, token counts, elapsed) — never the API key,
  never full evidence. If no `OPENAI_API_KEY` is set, or the call fails after
  retries, it raises `AIError` (never the raw provider exception).

---

## 4. No AI fallback — `AIError` becomes HTTP 503

There is **no deterministic AI text fallback**. If `OPENAI_API_KEY` is not set,
or the provider fails after retries, `provider.generate_json` raises `AIError`,
and every AI service in `app/ai/services.py` lets it propagate. A global
exception handler in `app/main.py` turns `AIError` into an HTTP **503** JSON
response:

```json
{"detail": "...", "ai_unavailable": true, "hint": "Set OPENAI_API_KEY ..."}
```

So AI endpoints (`/analyze`, `/assessment`, `/diligence`, `/arena`, `/memo`,
`/search/parse`) require a key and fail honestly with 503 rather than returning
fabricated output.

**The deterministic engines are unaffected.** The Founder Score, momentum,
ranking, and Trust engines in `app/scoring/` are pure Python and always work
with or without a key. These were never "AI fallback" — they are the product's
substantive core.

**Pitch-deck upload still works without AI.** The deck is validated, stored, and
its text extracted regardless; only the AI structured interpretation is skipped.
`interpret_pitch_deck` catches `AIError` and returns `{"ai_available": false,
...}` rather than failing the upload.

**The seed uses static demo fixtures, not AI.** `app/seed/seed.py` no longer
calls the AI pipeline. `_seed_static_analysis` writes static, clearly-labeled
demo fixtures (`generated_by="demo"`, `is_demo=True`) for the
assessment/debate/referee/diligence/memo of the first three opportunities, so
the demo is fully browsable **without an OpenAI key**. These are fixtures, not a
disguised fallback.

---

## 5. `generated_by` keeps provenance honest

Real AI output always carries `generated_by: "openai"`, persisted on
`OpportunityAssessment`, `Debate`, `InvestmentMemo`, and `DiligenceQuestion`,
and shown in the UI (e.g. the Investment Arena header renders
`v{version} · {generated_by}`). Seeded demo fixtures carry `generated_by:
"demo"` so browsable demo data is never mistaken for live model output.

---

## 6. Provider abstraction

The rest of the codebase depends only on `AIProvider.generate_json(...)`. The
sole implemented provider is OpenAI, but a second provider could be added behind
the same method without rewriting any service or route — the prompt
construction, JSON extraction, and validation logic are all provider-agnostic.

---

## 7. Tested guarantees (`tests/test_ai_and_validation.py`)

- `validate_evidence_ids` keeps `[1,2,"3"]` from `{1,2,3}` and rejects `999`.
- `sanitize_points` flags all-invalid and empty points as `unverified`.
- `_extract_json` handles fenced JSON and prose-wrapped JSON, and raises on
  garbage.
- Services **raise `AIError` when no key is configured**
  (`test_services_raise_without_api_key`).
- With the `mock_ai` fixture stubbing `provider.generate_json`: the three axes
  stay independent (never averaged), hallucinated evidence IDs are stripped, an
  invalid referee action is normalized, and pitch extraction works.
