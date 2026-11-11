"use client";

import {
  CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { humanStatus } from "@/lib/format";
import { matchesSearch, nodeColor, nodeKindLabel, partitionForPlot, PlotPoint } from "@/lib/opportunityMap";
import { MapNode } from "@/lib/types";

// Thesis Fit (x) x Founder Momentum (y, 30-day score change). Only records with
// BOTH real values are plotted; everything else is listed with its reason.
export function FitMomentumScatter({
  nodes,
  selectedId,
  query,
  onSelect,
}: {
  nodes: MapNode[];
  selectedId: number | null;
  query: string;
  onSelect: (id: number) => void;
}) {
  const { plotted, excluded } = partitionForPlot(nodes);
  // Records with identical values stack on one spot (common for seeded data);
  // badge the count, list them all in the tooltip, and draw the selection on top.
  const stacks = new Map<string, PlotPoint[]>();
  for (const p of plotted) stacks.set(stackKey(p), [...(stacks.get(stackKey(p)) ?? []), p]);
  const rest = plotted.filter((p) => p.id !== selectedId);
  const leads = rest.filter((p) => p.node.kind === "lead");
  const deals = rest.filter((p) => p.node.kind === "deal");
  const selectedPoint = plotted.filter((p) => p.id === selectedId);
  const lo = Math.min(-5, ...plotted.map((p) => p.momentum));
  const hi = Math.max(5, ...plotted.map((p) => p.momentum));
  // round the momentum axis out to multiples of 5 so ticks land on whole numbers
  const yMin = Math.floor((lo - 1) / 5) * 5;
  const yMax = Math.ceil((hi + 1) / 5) * 5;

  const shape = (hollow: boolean) =>
    function Dot(props: unknown) {
      const { cx = 0, cy = 0, payload } = props as { cx?: number; cy?: number; payload?: PlotPoint };
      if (!payload) return <g />;
      const n = payload.node;
      const selected = n.id === selectedId;
      const dim = query.trim() !== "" && !matchesSearch(n, query);
      const r = selected ? 9 : 6;
      const stacked = stacks.get(stackKey(payload))!.length;
      return (
        <g
          data-testid={`plot-point-${n.id}`}
          style={{ cursor: "pointer", opacity: dim ? 0.2 : 1 }}
          onClick={() => onSelect(n.id)}
        >
          {selected && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#1e40af" strokeWidth={2} />}
          <circle cx={cx} cy={cy} r={r} fill={hollow ? "#ffffff" : nodeColor(n)} stroke={nodeColor(n)} strokeWidth={hollow ? 3 : 1} />
          {stacked > 1 && (
            <g aria-label={`${stacked} records at this point`}>
              <circle cx={cx + r + 3} cy={cy - r - 3} r={7} fill="#0f172a" />
              <text x={cx + r + 3} y={cy - r} textAnchor="middle" fontSize={9} fontWeight={700} fill="#ffffff">{stacked}</text>
            </g>
          )}
          {(selected || (query.trim() !== "" && !dim)) && (
            <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={11} fontWeight={selected ? 700 : 500} fill="#0f172a">{n.name}</text>
          )}
        </g>
      );
    };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-soft" data-testid="plot-count">
          <span className="font-semibold text-ink">{plotted.length}</span> of {nodes.length} opportunit{nodes.length === 1 ? "y" : "ies"} plotted
          {excluded.length > 0 && <> · {excluded.length} not plotted (listed below with the reason)</>}
        </p>
        <p className="text-xs text-ink-muted">Ring = founder lead · filled = active deal (color = stage)</p>
      </div>

      {plotted.length ? (
        <div className="h-[460px] w-full" role="img" aria-label={`Scatter of thesis fit against founder momentum for ${plotted.length} opportunities`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 24, bottom: 36, left: 12 }}>
              <CartesianGrid stroke="#e2e8f0" />
              <XAxis
                type="number" dataKey="fit" domain={[0, 100]} tickCount={6} stroke="#64748b" fontSize={12}
                label={{ value: "Thesis fit (0–100)", position: "insideBottom", offset: -20, fill: "#334155", fontSize: 12 }}
              />
              <YAxis
                type="number" dataKey="momentum" domain={[yMin, yMax]} tickCount={(yMax - yMin) / 5 + 1} allowDecimals={false} stroke="#64748b" fontSize={12}
                label={{ value: "Founder momentum (score change, 30 days)", angle: -90, position: "insideLeft", offset: 10, dy: 120, fill: "#334155", fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Tooltip cursor={false} content={<PointTooltip stacks={stacks} />} />
              <Scatter name="Active deals" data={deals} shape={shape(false)} isAnimationActive={false} />
              <Scatter name="Founder leads" data={leads} shape={shape(true)} isAnimationActive={false} />
              {selectedPoint.length > 0 && (
                <Scatter name="Selected" data={selectedPoint} shape={shape(selectedPoint[0].node.kind === "lead")} isAnimationActive={false} />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-surface-sunken p-8 text-center text-sm text-ink-muted">
          None of these opportunities have both a real thesis fit and enough momentum history to plot yet.
        </div>
      )}

      {plotted.length > 0 && (
        <details className="rounded-lg border border-line bg-white" open={stacks.size < plotted.length}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-soft">
            Plotted values ({plotted.length}){stacks.size < plotted.length && " — some records share a point"}
          </summary>
          <table className="w-full border-t border-line text-left text-xs" data-testid="plotted-list">
            <thead><tr className="text-ink-muted"><th className="px-3 py-1.5 font-medium">Opportunity</th><th className="px-3 py-1.5 font-medium">Thesis fit</th><th className="px-3 py-1.5 font-medium">Momentum (30d)</th></tr></thead>
            <tbody>
              {[...plotted].sort((a, b) => b.fit - a.fit || b.momentum - a.momentum).map((p) => (
                <tr key={p.id} className={`border-t border-line ${p.id === selectedId ? "bg-brand-wash" : ""}`}>
                  <td className="px-3 py-1.5">
                    <button type="button" className="font-medium text-ink hover:text-brand" aria-current={p.id === selectedId ? "true" : undefined} onClick={() => onSelect(p.id)}>{p.node.name}</button>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-soft">{Math.round(p.fit)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-soft">{fmtMomentum(p.momentum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {excluded.length > 0 && (
        <div>
          <p className="label mb-2">Not plotted</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white" data-testid="excluded-list">
            {excluded.map(({ node, reasons }) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  aria-current={node.id === selectedId ? "true" : undefined}
                  className={`flex w-full flex-wrap items-start justify-between gap-2 px-3 py-2 text-left hover:bg-surface-sunken ${node.id === selectedId ? "bg-brand-wash" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{node.name}</span>
                    <span className="block text-xs text-ink-muted">{nodeKindLabel(node)} · {humanStatus(node.entry_type)}</span>
                  </span>
                  <span className="text-right text-xs text-ink-soft">
                    {reasons.map((r) => <span key={r} className="block">{r}</span>)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const stackKey = (p: PlotPoint) => `${p.fit}|${p.momentum}`;
const fmtMomentum = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 10) / 10}`;

function PointTooltip({ active, payload, stacks }: { active?: boolean; payload?: { payload: PlotPoint }[]; stacks: Map<string, PlotPoint[]> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const m = p.node.momentum;
  const others = (stacks.get(stackKey(p)) ?? []).filter((o) => o.id !== p.id);
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-raised">
      <p className="text-sm font-semibold text-ink">{p.node.name}</p>
      <p className="text-ink-muted">{nodeKindLabel(p.node)}</p>
      <p className="mt-1 text-ink-soft">Thesis fit {Math.round(p.fit)} / 100</p>
      <p className="text-ink-soft">
        Momentum {fmtMomentum(p.momentum)} pts in 30d
        {m.trajectory && ` (${humanStatus(m.trajectory)})`}
        {m.current_score != null && ` · now ${Math.round(m.current_score)}`}
      </p>
      {others.length > 0 && (
        <p className="mt-1 border-t border-line pt-1 text-ink-muted">Same values: {others.map((o) => o.node.name).join(", ")}</p>
      )}
    </div>
  );
}
