"use client";

import { humanStatus } from "@/lib/format";
import { groupFieldLabel, groupNodes, matchesSearch, nodeColor, nodeKindLabel } from "@/lib/opportunityMap";
import { MapNode } from "@/lib/types";

// Same nodes and grouping as the canvas, as a keyboard-friendly list. Used when
// WebGL is unavailable, and as the "List" view over the canvas.
export function MapList({
  nodes, colors, selectedId, query, onSelect,
}: {
  nodes: MapNode[];
  colors: Map<string, string>;
  selectedId: number | null;
  query: string;
  onSelect: (id: number) => void;
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = nodes.filter((n) => matchesSearch(n, query));
  const groups = groupNodes(visible);
  if (!visible.length) return <p className="p-4 text-sm text-ink-muted">No opportunities match this search.</p>;
  return (
    <div className="space-y-3 p-3" data-testid="map-list">
      {groups.map((g) => (
        <section key={g.key} aria-label={`${g.label} group`}>
          <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colors.get(g.key) }} />
            {g.label} · {g.ids.length}
          </h3>
          <p className="px-1 text-xs text-ink-muted">Grouped by {groupFieldLabel(g.field).toLowerCase()}</p>
          <ul className="mt-1 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {g.ids.map((id) => {
              const n = byId.get(id)!;
              const color = nodeColor(n, colors);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-current={id === selectedId ? "true" : undefined}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-surface-sunken ${id === selectedId ? "bg-brand-wash" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={n.kind === "deal" ? { background: color } : { border: `3px solid ${color}` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">{n.name}</span>
                        {!!n.new_evidence_count && <span className="chip shrink-0 bg-signal-wash text-caution">New evidence · {n.new_evidence_count}</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {nodeKindLabel(n)} · {humanStatus(n.entry_type)}
                        {n.founder_score != null ? ` · score ${Math.round(n.founder_score)}` : " · not scored"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
