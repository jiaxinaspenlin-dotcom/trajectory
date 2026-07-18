# Founder Momentum — Direction & Rate of Change

Source of truth: `backend/app/scoring/momentum.py`.

The Founder Score answers *how strong is the evidence today*. **Founder
Momentum** answers *which way is it moving, and how fast*. It is a deterministic
computation over the historical `FounderMomentumSnapshot` series and produces:
current/previous score, 30-day and 90-day change, an overall trajectory label,
per-signal trends, an evidence-grounded explanation, and the full series for
charting.

---

## 1. Tracked signals

Each snapshot stores a `signals` dict of per-signal values at that point in
time. Human-readable names (`SIGNAL_LABELS`):

| Signal key | Label |
|------------|-------|
| `commit_activity` | contribution activity |
| `repo_creation` | repository creation |
| `repo_maintenance` | repository maintenance |
| `release_frequency` | release frequency |
| `outside_contributors` | outside contributors |
| `issue_resolution` | issue-resolution activity |
| `project_consistency` | project consistency |
| `product_launches` | product launches |
| `user_growth` | user growth |
| `revenue_growth` | revenue growth |
| `pilot_milestones` | pilot / customer milestones |
| `team_growth` | team growth |
| `product_iteration` | product iteration |

---

## 2. GitHub stars are NOT commercial traction

By deliberate design, GitHub **stars are never treated as commercial
traction**. There is no `stars` momentum signal, and the connector labels stars
and followers as "external interest, NOT commercial traction". Momentum's
traction-oriented signals (`user_growth`, `revenue_growth`, `pilot_milestones`)
come from user/revenue/pilot evidence — not from repository popularity. Stars
may at most register as weak external interest, never as revenue or users.

---

## 3. 30-day and 90-day change

Snapshots are sorted ascending by `snapshot_date`. The current score is the
latest snapshot; the previous score is the second-to-last.

For the 30-day and 90-day windows, `_nearest_before` finds the latest snapshot
at or before `now - 30d` / `now - 90d` (falling back to the earliest snapshot
when only sparse history exists). Then:

```
change_30d = round(current - ref_30.score, 2)   # None if no reference
change_90d = round(current - ref_90.score, 2)
```

### Signal trends

Each signal in the latest snapshot is compared against its value in the ~30-day
reference snapshot. `change = current - previous`, and `direction` is `up` when
`change > 0.01`, `down` when `change < -0.01`, else `flat`.

---

## 4. The five trajectory labels

`TrajectoryLabel` (from `app/models/enums.py`) and the exact thresholds in
`_trajectory_label(n, change_30, change_90)`:

| Label | Condition |
|-------|-----------|
| `insufficient_history` | fewer than 2 snapshots, or `change_30` is None |
| `accelerating` | `change_30 >= 4.0` **and** `change_30 > (change_90 / 3) + 1.0` |
| `improving` | `change_30 >= 1.5` (and not accelerating) |
| `declining` | `change_30 <= -2.0` |
| `stable` | none of the above |

The **accelerating** test compares the recent 30-day change against the average
30-day slice of the 90-day change (`change_90 / 3`). It only fires when recent
movement genuinely outpaces the longer-run pace by more than a point — so a
steady climb reads as `improving`, and a climb that is itself speeding up reads
as `accelerating`.

Worked example (`tests/test_scoring.py::test_momentum_trajectory_and_explanation`):
snapshots at 90/60/30/0 days ago with scores 20 → 25 → 30 → 45 give
`change_30d = 15.0`, `change_90d = 25.0`. Since `15 >= 4` and
`15 > 25/3 + 1 ≈ 9.33`, the trajectory is **accelerating**.

---

## 5. Explanation generation

`_explain` builds the sentence deterministically from the signal trends:

- Picks a lead phrase from the trajectory ("Founder Momentum is accelerating /
  improving / stable / declining").
- Lists up to 3 signals whose values rose ("because release frequency, outside
  contributors increased") and up to 2 that fell ("while … decreased"), sorted
  by magnitude of change.
- Appends the signed 30-day delta, e.g. `(30-day change +15.0)`.

For `insufficient_history` it returns a plain "Insufficient history to
characterize momentum; more snapshots are needed."

---

## 6. Snapshot history & series output

`MomentumResult.series` returns every snapshot as
`{date, score, signals}` (dates ISO-8601, tz-aware), which the frontend
`MomentumChart` (Recharts) plots. Snapshots are point-in-time rows in
`FounderMomentumSnapshot` and are never overwritten — the trajectory is a true
historical record, not a recomputed estimate.

Exposed at `GET /api/founders/{id}/momentum`; also summarized on the dashboard's
`highest_momentum` list (sorted by `change_30d`).

Empty history returns `current_score = 0.0`, all changes `None`, trajectory
`insufficient_history` — verified by
`tests/test_scoring.py::test_momentum_insufficient_history`.
