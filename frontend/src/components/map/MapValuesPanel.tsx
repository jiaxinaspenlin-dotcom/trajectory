"use client";

import { useState } from "react";
import { AxesLayout, formatMetric, METRICS } from "@/lib/opportunityMap";
import { MapNode } from "@/lib/types";
import { CloseIcon } from "../icons";
import { Segmented } from "../ui";

// Exact values behind the Custom Axes view: every plotted record with its
// actual metric values (records sharing a point are marked), and every record
// that could not be plotted with the reason.
export function MapValuesPanel({
  nodes, axes, selectedId, onSelect, onClose,
}: {
  nodes: MapNode[];
  axes: AxesLayout;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"plotted" | "excluded">("plotted");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const plotted = [...axes.values.entries()].map(([id, vals]) => ({ node: byId.get(id)!, vals })).filter((r) => r.node);
  const sameAs = (id: number) => (axes.overlaps.find((ids) => ids.includes(id)) ?? []).filter((o) => o !== id);
  const sorted = plotted.sort((a, b) => (b.vals[axes.domains[0].key] ?? 0) - (a.vals[axes.domains[0].key] ?? 0));

  return (
    <div data-testid="map-values" role="dialog" aria-label="Plotted Values" className="hud pointer-events-auto flex max-h-[min(440px,60vh)] w-[min(460px,calc(100vw-1rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Segmented
          size="sm"
          label="Values View"
          value={tab}
          onChange={setTab}
          options={[
            { value: "plotted", label: `Plotted ${plotted.length}` },
            { value: "excluded", label: `Not Plotted ${axes.excluded.length}` },
          ]}
        />
        <button type="button" className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close Values"><CloseIcon size={14} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "plotted" ? (
          plotted.length ? (
            <table className="table" data-testid="plotted-list">
              <thead>
                <tr>
                  <th>Opportunity</th>
                  {axes.domains.map((d) => <th key={d.axis} className="text-right" title={METRICS[d.key].label}>{d.axis.toUpperCase()} · {METRICS[d.key].label.split(" (")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ node, vals }) => {
                  const same = sameAs(node.id);
                  return (
                    <tr key={node.id} className={`table-row-link ${node.id === selectedId ? "bg-brand-wash" : ""}`} onClick={() => onSelect(node.id)}>
                      <td>
                        <button type="button" className="text-left font-medium text-ink hover:text-brand" aria-current={node.id === selectedId ? "true" : undefined} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
                          <span data-content>{node.name}</span>
                        </button>
                        {same.length > 0 && (
                          <span className="block text-xs text-signal">Same Point as <span data-content>{same.map((o) => byId.get(o)?.name).join(", ")}</span></span>
                        )}
                      </td>
                      {axes.domains.map((d) => <td key={d.axis} className="num text-right text-ink-soft">{formatMetric(d.key, vals[d.key]!)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="p-4 text-sm text-ink-muted">No records have values for all selected axes.</p>
        ) : axes.excluded.length ? (
          <ul className="divide-y divide-line" data-testid="excluded-list">
            {axes.excluded.map(({ node, reasons }) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  aria-current={node.id === selectedId ? "true" : undefined}
                  className={`w-full px-3 py-2 text-left hover:bg-surface-sunken ${node.id === selectedId ? "bg-brand-wash" : ""}`}
                >
                  <span className="block text-sm font-medium text-ink" data-content>{node.name}</span>
                  {reasons.map((r) => <span key={r} className="block text-xs text-ink-muted">{r}</span>)}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm text-ink-muted">Every record in view is plotted.</p>}
      </div>
    </div>
  );
}
