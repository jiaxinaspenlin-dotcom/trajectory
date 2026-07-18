"use client";

import { WorkflowStatus } from "@/lib/types";
import { Badge } from "./ui";

export function WorkflowTimer({ w }: { w: WorkflowStatus }) {
  const overdue = w.remaining_seconds <= 0 && w.target_met !== true;
  const pct = Math.max(0, Math.min(100, ((86400 - Math.max(0, w.remaining_seconds)) / 86400) * 100));
  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid="workflow-timer">
      <div className="flex items-center justify-between">
        <span className="label">24-hour decision status</span>
        {w.target_met === true ? (
          <Badge tone="bg-positive-wash text-positive">recommendation ready</Badge>
        ) : overdue ? (
          <Badge tone="bg-negative-wash text-negative">overdue</Badge>
        ) : (
          <Badge tone="bg-brand-wash text-brand">in progress</Badge>
        )}
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${overdue ? "bg-negative" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-ink-muted">Elapsed</dt><dd className="font-medium text-ink">{w.elapsed_human}</dd></div>
        <div><dt className="text-xs text-ink-muted">Remaining</dt><dd className="font-medium text-ink">{w.remaining_human}</dd></div>
      </dl>
      {w.current_recommendation ? (
        <p className="mt-2 text-sm text-ink-soft">
          Current recommendation: <strong>{w.current_recommendation.action}</strong>
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No recommendation yet.</p>
      )}
      {w.blockers.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-caution">
          {w.blockers.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}
