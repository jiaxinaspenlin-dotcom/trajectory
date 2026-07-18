# Prestige Audit — Standard vs Prestige-Free Ranking

Source of truth: `backend/app/scoring/ranking.py`.

Trajectory ranks candidates **two ways** and shows both side by side. The
**standard** ranking may use approved prestige evidence (elite university,
famous employer, top accelerator, prior-investor access, geography-as-proxy).
The **prestige-free** ranking masks those variables while retaining every
substantive signal.

This is explicitly a **bias & sensitivity audit**, not a claim that either
ranking is correct. We do **not** assert that the prestige-free result is
"better" — it is a diagnostic that quantifies how much prestige signals move the
ranking, so a fund can decide with eyes open.

---

## 1. Substantive features (kept in BOTH rankings)

`SUBSTANTIVE_WEIGHTS`:

| Feature | Weight |
|---------|:---:|
| `founder_score` | 0.34 |
| `thesis_fit` | 0.20 |
| `traction` | 0.16 |
| `technical_evidence` | 0.12 |
| `execution` | 0.10 |
| `domain_expertise` | 0.08 |

These describe what was actually built and validated: the persistent
evidence-based Founder Score, fit to the active thesis, real traction, technical
contributions, repeated execution, and domain expertise. They are retained
verbatim in the prestige-free ranking.

## 2. Prestige features (used ONLY in the standard ranking)

`PRESTIGE_WEIGHTS` (masked in prestige-free):

| Feature | Weight | Human label |
|---------|:---:|-------------|
| `elite_education` | 0.30 | elite university brand |
| `famous_employer` | 0.28 | famous employer brand |
| `elite_accelerator` | 0.22 | elite accelerator brand |
| `investor_network` | 0.12 | prior investor-network access |
| `geo_prestige` | 0.08 | geography used as a prestige proxy |

All feature values are on a 0–100 scale.

---

## 3. Scoring: PRESTIGE_SHARE

Both a substantive composite and a prestige composite are computed as
weight-normalized weighted averages (`_weighted`). They combine into the two
scores using `PRESTIGE_SHARE = 0.30`:

```
substantive   = weighted(features, SUBSTANTIVE_WEIGHTS)
prestige      = weighted(features, PRESTIGE_WEIGHTS)

standard      = (1 - 0.30) * substantive + 0.30 * prestige
prestige_free = substantive          # prestige fully masked
```

So in the standard ranking prestige counts for **30%** of the composite and
substance for **70%**; in the prestige-free ranking prestige counts for **0%**.

### Influential prestige variables

For each prestige feature with a positive value, its actual contribution to the
standard score is recorded:

```
contribution = PRESTIGE_SHARE * (weight / Σ prestige_weights) * value
```

These are sorted descending and surfaced per candidate
(`influential_prestige_variables`) so a reviewer can see *which* brand signals
lifted a given candidate and by how much.

---

## 4. Rank delta, sensitivity, and "substantial change"

Candidates are ranked separately by `standard_score` and by
`prestige_free_score` (rank 1 = best), then:

```
rank_delta   = standard_rank - prestige_free_rank
sensitivity  = |standard_score - prestige_free_score| / 100        # 0..1
substantial_change = (|rank_delta| >= 2) OR (sensitivity >= 0.12)
```

- **`rank_delta`** — how many positions the candidate moves when prestige is
  masked. A large positive delta means prestige was inflating the candidate's
  standard rank; a negative delta means prestige was masking underlying
  substance.
- **`sensitivity`** — the fraction of the 0–100 score that is attributable to
  prestige. Since prestige is 30% of the standard score, sensitivity is bounded
  by ~0.30.
- **`substantial_change`** — flags candidates whose position is materially
  driven by prestige (2+ rank positions, or ≥12% score sensitivity). The
  frontend warns when any candidate changes substantially once prestige is
  masked.

---

## 5. API and persistence

- `GET /api/ranking` — both rankings, computed on the fly (not persisted).
- `GET /api/ranking/prestige-audit` — computes and **persists** a
  `PrestigeAudit` row (versioned history of audits).
- `GET /api/ranking/prestige-sensitivity` — the audit plus the top-3
  `most_sensitive` candidates by sensitivity.

Each entry serializes standard/prestige-free ranks and scores, `rank_delta`,
`influential_prestige_variables`, `sensitivity`, and `substantial_change`. Every
response carries a note describing it as a "bias & sensitivity audit".

---

## 6. The explicit stance

Prestige-free is **not automatically superior**. Prestige signals can be
legitimately predictive, and masking them can hide real information. The audit's
purpose is transparency: quantify the influence, surface the specific variables,
flag substantial shifts, and let the human decide. The module docstring states
this directly — the prestige-free result is a sensitivity check, not a verdict.

### Tested guarantees (`tests/test_scoring.py`, `tests/test_endpoints_e2e.py`)

- Masking prestige flips ranks: a high-prestige/weaker-substance candidate loses
  to a low-prestige/strong-substance candidate once prestige is removed, and at
  least one is flagged `substantial_change` with `elite_education` surfaced as
  influential.
- With no prestige on either side, substance ordering is preserved (the
  strongest substance still ranks #1).
- The endpoint returns both ranks for every entry and the "bias & sensitivity
  audit" note.
