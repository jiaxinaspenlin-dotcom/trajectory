"""Deterministic Founder Momentum — direction and rate of change over time.

Consumes the historical FounderMomentumSnapshot series and produces:
- current / previous score
- 30-day and 90-day change
- an overall trajectory label
- signal-level trends
- an evidence-grounded explanation of *why* the score changed

Note: GitHub stars are deliberately NOT treated as commercial traction. They
may appear as a weak external-interest signal only, never as revenue/users.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.models.enums import TrajectoryLabel
from app.models.scoring import FounderMomentumSnapshot

# Human-readable names for the signals we track over time.
SIGNAL_LABELS: dict[str, str] = {
    "commit_activity": "contribution activity",
    "repo_creation": "repository creation",
    "repo_maintenance": "repository maintenance",
    "release_frequency": "release frequency",
    "outside_contributors": "outside contributors",
    "issue_resolution": "issue-resolution activity",
    "project_consistency": "project consistency",
    "product_launches": "product launches",
    "user_growth": "user growth",
    "revenue_growth": "revenue growth",
    "pilot_milestones": "pilot / customer milestones",
    "team_growth": "team growth",
    "product_iteration": "product iteration",
}


@dataclass
class SignalTrend:
    key: str
    label: str
    current: float
    previous: float
    change: float
    direction: str  # up | down | flat


@dataclass
class MomentumResult:
    current_score: float
    previous_score: float | None
    change_30d: float | None
    change_90d: float | None
    trajectory: TrajectoryLabel
    signal_trends: list[SignalTrend]
    explanation: str
    series: list[dict] = field(default_factory=list)  # [{date, score, signals}]


def _nearest_before(
    snapshots: list[FounderMomentumSnapshot], cutoff: datetime
) -> FounderMomentumSnapshot | None:
    """Latest snapshot at or before cutoff (snapshots sorted ascending by date)."""
    chosen = None
    for s in snapshots:
        if _aware(s.snapshot_date) <= cutoff:
            chosen = s
        else:
            break
    return chosen


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def compute_momentum(
    snapshots: list[FounderMomentumSnapshot],
    now: datetime | None = None,
) -> MomentumResult:
    now = now or datetime.now(UTC)
    snaps = sorted(snapshots, key=lambda s: _aware(s.snapshot_date))

    if not snaps:
        return MomentumResult(
            current_score=0.0,
            previous_score=None,
            change_30d=None,
            change_90d=None,
            trajectory=TrajectoryLabel.INSUFFICIENT_HISTORY,
            signal_trends=[],
            explanation="Insufficient history to compute momentum. No snapshots recorded yet.",
            series=[],
        )

    latest = snaps[-1]
    current = float(latest.score)
    previous = float(snaps[-2].score) if len(snaps) >= 2 else None

    ref_30 = _nearest_before(snaps[:-1], now - timedelta(days=30)) or (
        snaps[0] if len(snaps) >= 2 else None
    )
    ref_90 = _nearest_before(snaps[:-1], now - timedelta(days=90)) or (
        snaps[0] if len(snaps) >= 2 else None
    )
    change_30 = round(current - float(ref_30.score), 2) if ref_30 else None
    change_90 = round(current - float(ref_90.score), 2) if ref_90 else None

    # signal trends: compare latest vs the ~30d reference (or previous)
    ref_for_signals = ref_30 or (snaps[-2] if len(snaps) >= 2 else None)
    trends: list[SignalTrend] = []
    if ref_for_signals:
        cur_sig = latest.signals or {}
        prev_sig = ref_for_signals.signals or {}
        for key in sorted(set(cur_sig) | set(prev_sig)):
            cv = float(cur_sig.get(key, 0) or 0)
            pv = float(prev_sig.get(key, 0) or 0)
            change = round(cv - pv, 2)
            direction = "up" if change > 0.01 else "down" if change < -0.01 else "flat"
            trends.append(
                SignalTrend(
                    key=key,
                    label=SIGNAL_LABELS.get(key, key.replace("_", " ")),
                    current=cv,
                    previous=pv,
                    change=change,
                    direction=direction,
                )
            )

    trajectory = _trajectory_label(len(snaps), change_30, change_90)
    explanation = _explain(trajectory, change_30, trends)

    series = [
        {
            "date": _aware(s.snapshot_date).isoformat(),
            "score": round(float(s.score), 2),
            "signals": s.signals or {},
        }
        for s in snaps
    ]

    return MomentumResult(
        current_score=round(current, 2),
        previous_score=round(previous, 2) if previous is not None else None,
        change_30d=change_30,
        change_90d=change_90,
        trajectory=trajectory,
        signal_trends=trends,
        explanation=explanation,
        series=series,
    )


def _trajectory_label(
    n: int, change_30: float | None, change_90: float | None
) -> TrajectoryLabel:
    if n < 2 or change_30 is None:
        return TrajectoryLabel.INSUFFICIENT_HISTORY
    # accelerating: recent 30d change outpaces the average 30d slice of the 90d change
    avg_90_per_30 = (change_90 / 3.0) if change_90 is not None else change_30
    if change_30 >= 4.0 and change_30 > avg_90_per_30 + 1.0:
        return TrajectoryLabel.ACCELERATING
    if change_30 >= 1.5:
        return TrajectoryLabel.IMPROVING
    if change_30 <= -2.0:
        return TrajectoryLabel.DECLINING
    return TrajectoryLabel.STABLE


def _explain(
    trajectory: TrajectoryLabel, change_30: float | None, trends: list[SignalTrend]
) -> str:
    ups = [t for t in trends if t.direction == "up"]
    downs = [t for t in trends if t.direction == "down"]
    ups.sort(key=lambda t: t.change, reverse=True)
    downs.sort(key=lambda t: t.change)

    if trajectory == TrajectoryLabel.INSUFFICIENT_HISTORY:
        return "Insufficient history to characterize momentum; more snapshots are needed."

    lead = {
        TrajectoryLabel.ACCELERATING: "Founder Momentum is accelerating",
        TrajectoryLabel.IMPROVING: "Founder Momentum is improving",
        TrajectoryLabel.STABLE: "Founder Momentum is stable",
        TrajectoryLabel.DECLINING: "Founder Momentum is declining",
    }[trajectory]

    reasons = []
    if ups:
        reasons.append(
            "because " + ", ".join(t.label for t in ups[:3]) + " increased"
        )
    if downs:
        reasons.append(
            ("while " if ups else "because ")
            + ", ".join(t.label for t in downs[:2])
            + " decreased"
        )
    delta = f" (30-day change {change_30:+.1f})" if change_30 is not None else ""
    if reasons:
        return f"{lead} {' '.join(reasons)}{delta}."
    return f"{lead}{delta}."
