# Founder Score — Deterministic Scoring Methodology

Source of truth: `backend/app/scoring/founder_score.py`.

The Founder Score is a **0–100 numeric baseline computed in pure Python**. The
language model never invents it. Every component is derived only from stored
evidence, and the roll-up is weighted, confidence-adjusted, and
missingness-aware. The output is fully explainable: each component reports its
weight, value, evidence count, confidence, missingness, contribution, and the
evidence IDs used.

---

## 1. Components and default weights

`DEFAULT_WEIGHTS` (sum ≈ 1.0; renormalized at compute time so weights always
sum to exactly 1):

| Component (`key`) | Label | Default weight |
|-------------------|-------|:---:|
| `execution_consistency` | Execution Consistency | 0.16 |
| `technical_evidence` | Technical Evidence | 0.16 |
| `product_progress` | Product Progress | 0.14 |
| `traction` | Traction | 0.12 |
| `external_validation` | External Validation | 0.10 |
| `leadership_collaboration` | Leadership & Collaboration | 0.10 |
| `learning_velocity` | Learning Velocity | 0.08 |
| `domain_experience` | Domain Experience | 0.08 |
| `evidence_reliability` | Reliability of Evidence | 0.06 |

Rationale: execution and technical evidence are weighted highest because they
are the most independently verifiable signals of a technical founder; traction
matters but is discounted relative to demonstrated building because early
traction is often founder-reported. `evidence_reliability` (the smallest slice)
rewards an evidence base that is independent and verified rather than
self-reported.

---

## 2. Which evidence kinds feed each component

Each component (except `evidence_reliability`) sums points from specific
evidence `kind`s, at a modest per-item point value. Values are intentionally
small so components **saturate** and no single signal dominates
(`_COMPONENT_SIGNALS`):

| Component | Evidence kinds → per-item points |
|-----------|----------------------------------|
| Execution Consistency | `github_commit_activity` 34, `hackathon_followthrough` 30, `github_repo_maintenance` 22, `product_launch` 20 |
| Technical Evidence | `technical_writeup` 18, `github_repo` 16, `github_release` 14, `github_language` 8 |
| Product Progress | `product_launch` 26, `product_iteration` 20, `demo` 18, `github_release` 12 |
| External Validation | `award` 24, `press_mention` 22, `accelerator` 20, `github_outside_contributor` 16 |
| Traction | `user_growth` 30, `revenue` 30, `pilot` 26, `customer` 22 |
| Leadership & Collaboration | `team_growth` 22, `github_outside_contributor` 18, `collaboration` 18, `issue_resolution` 14 |
| Learning Velocity | `new_domain` 20, `product_iteration` 18, `skill_growth` 18, `github_release` 12 |
| Domain Experience | `domain_experience` 30, `prior_startup` 24, `work_history` 18 |
| Reliability of Evidence | computed from provenance/verification mix (no signal kinds) |

Each evidence item's points are scaled by its own confidence
(`per_item * max(0.1, evidence.confidence)`), so low-confidence evidence
contributes less.

---

## 3. Saturation curve

Points are converted to a 0–100 component value through a smooth
diminishing-returns curve (`_saturating`):

```
value = 100 * (1 - e^(-points / (100 * 0.55)))
```

So one strong repo already lifts a component meaningfully, but the tenth adds
little — no single signal type can dominate a component. The curve is monotonic
and returns 0 for zero points.

### Evidence-reliability component

Not signal-driven. From the full evidence set it computes:

```
independence_ratio = independent / n
verification_ratio  = (verified + partially_verified) / n
value      = 100 * (0.5 * independence_ratio + 0.5 * verification_ratio)
confidence = min(1.0, 0.3 + 0.7 * (n / 8))
missingness = max(0.0, 1 - n / 4)
```

---

## 4. Confidence and missingness — fair treatment of missing evidence

Missing evidence is handled **fairly**: a component with no evidence reports
high missingness and low confidence and contributes near-zero. It does **not**
punish the founder with a negative value, and it lowers overall confidence
rather than silently assuming the worst.

For each signal-driven component with evidence count `count`:

- `confidence = min(1.0, avg_item_confidence * min(1.0, 0.4 + count/6))` — so
  confidence rises with both the quality and the amount of evidence.
- `missingness = 1.0` when `count == 0`, else `max(0.0, 1 - count/4)`.
- When `count == 0`: `value = 0`, `confidence = 0`, `missingness = 1`.

Final roll-up:

```
score      = clamp(Σ (normalized_weight_i * value_i), 0, 100)
confidence = clamp(Σ (normalized_weight_i * confidence_i), 0, 1)
```

With no evidence at all, `score = 0.0` and `confidence = 0.0`, and the
explanation reads "Insufficient evidence to compute a confident Founder Score…"
rather than implying the founder scored badly.

---

## 5. Explanation (deterministic, not LLM)

`_build_explanation` produces the human-readable summary in pure Python:

- Names the top-3 contributing components by contribution, e.g.
  *"Founder Score is 61/100 at 48% confidence, driven mainly by Technical
  Evidence (72), Execution Consistency (58), Product Progress (44)."*
- Appends a note listing components with `missingness >= 0.99` ("Confidence is
  limited by missing evidence for: …").

The LLM is never asked to produce or adjust the score; downstream AI services
only *consume* the already-computed score and cite its evidence IDs.

---

## 6. Configurability of weights

`compute_founder_score(evidence, weights=None)` merges caller-supplied weights
over `DEFAULT_WEIGHTS` and renormalizes to sum 1. Per-fund overrides live on
`InvestmentThesis.score_weights` (a JSON dict). The default weights are also
surfaced read-only at `GET /api/settings` (`scoring_weights`) via the
`_default_weights()` helper, so a fund can inspect exactly how the baseline is
composed.

---

## 7. Versioned persistence (history preserved)

Computed scores are stored in the `FounderScore` table with an incrementing
`version` and are **never overwritten**. Each row persists `score`,
`confidence`, the full `components` breakdown, `explanation`, `evidence_ids`,
and `computed_at`. The full series is available at
`GET /api/founders/{id}/score/history`; `POST /api/founders/{id}/score/recompute`
appends a new version rather than mutating the old one.

### Tested guarantees (`tests/test_scoring.py`)

- Deterministic: identical evidence → identical score across calls.
- Bounded: `0 <= score <= 100`; component weights sum to 1.0 (±1e-6).
- Missing evidence is fair: empty evidence → score 0, confidence 0, every
  component `missingness >= 0.99`, and an "Insufficient evidence" explanation.
- More evidence raises confidence.
