"use client";

import { Assessment, AxisAssessment } from "@/lib/types";
import { Badge, ConfidenceBar } from "./ui";
import { labelTone, pct } from "@/lib/format";

const AXIS_TITLES: Record<string, string> = {
  founder: "Founder",
  market: "Market",
  idea_vs_market: "Idea vs Market",
};

function AxisCard({ axis }: { axis: AxisAssessment }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">{AXIS_TITLES[axis.axis] || axis.axis}</h4>
        <Badge tone={labelTone(axis.label)}>{axis.label}</Badge>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink">{Math.round(axis.display_score)}</span>
        <span className="text-xs text-ink-muted">/ 100</span>
        {axis.axis === "market" && (
          <span className="ml-auto text-xs capitalize text-ink-muted">outlook: {axis.outlook}</span>
        )}
      </div>
      <div className="mt-2"><ConfidenceBar value={axis.confidence} /></div>
      <p className="mt-2 text-sm text-ink-soft">{axis.narrative}</p>

      {axis.supporting_points.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {axis.supporting_points.slice(0, 3).map((p, i) => (
            <li key={i}>
              • {p.text}
              {p.evidence_ids.length > 0 ? (
                <span className="ml-1 text-[11px] text-ink-muted">
                  {p.evidence_ids.slice(0, 4).map((id) => <span key={id} className="mr-1 rounded bg-surface-sunken px-1 font-mono">E{id}</span>)}
                </span>
              ) : (
                <span className="ml-1 text-[11px] text-caution">unverified</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {axis.risks.length > 0 && (
        <p className="mt-2 text-xs text-caution"><strong>Risks:</strong> {axis.risks.slice(0, 3).join("; ")}</p>
      )}
      {axis.missing_information.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted"><strong>Missing:</strong> {axis.missing_information.slice(0, 3).join("; ")}</p>
      )}
      {axis.contradictions.length > 0 && (
        <p className="mt-1 text-xs text-negative"><strong>Contradictions:</strong> {axis.contradictions.slice(0, 2).join("; ")}</p>
      )}
    </div>
  );
}

export function ThreeAxes({ assessment }: { assessment: Assessment }) {
  const order = ["founder", "market", "idea_vs_market"];
  const axes = [...assessment.axes].sort((a, b) => order.indexOf(a.axis) - order.indexOf(b.axis));
  return (
    <div data-testid="three-axes">
      <p className="mb-3 text-xs text-ink-muted">
        Three independent axes — deliberately not averaged. Disagreement between them is preserved.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {axes.map((a) => <AxisCard key={a.axis} axis={a} />)}
      </div>
    </div>
  );
}
