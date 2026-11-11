"use client";

import { humanStatus } from "@/lib/format";
import { groupFieldLabel, groupNodes, matchesSearch, nodeColor, nodeKindLabel } from "@/lib/opportunityMap";
import { MapNode } from "@/lib/types";

// Same nodes and grouping as the graph, as a keyboard-friendly list. Used when
// WebGL is unavailable, or when the investor picks the list layout.
export function MapList({
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
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = nodes.filter((n) => matchesSearch(n, query));
  const groups = groupNodes(visible);
  if (!visible.length) return <p className="p-4 text-sm text-ink-muted">No opportunities match this search.</p>;
  return (
    <div className="space-y-4 p-4" data-testid="map-list">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="label">{g.label} · {g.ids.length}</h3>
          <p className="text-[11px] text-ink-muted">Grouped by: {groupFieldLabel(g.field)}</p>
          <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line bg-white">
            {g.ids.map((id) => {
              const n = byId.get(id)!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-current={id === selectedId ? "true" : undefined}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-sunken ${id === selectedId ? "bg-brand-wash" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={n.kind === "deal" ? { background: nodeColor(n) } : { border: `3px solid ${nodeColor(n)}` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{n.name}</span>
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
