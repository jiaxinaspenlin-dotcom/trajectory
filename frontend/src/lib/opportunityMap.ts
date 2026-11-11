// Pure helpers for the investor Map. The graph and the scatter both read the
// same MapNode records (stable opportunity IDs) through these functions.

import { humanStatus } from "./format";
import { MapLink, MapNode } from "./types";

export type MapView = "graph" | "axes";
export type MapSource = "all" | "inbound" | "outbound";
export type MapKind = "all" | "lead" | "deal";

export interface MapState {
  view: MapView;
  focus: number | null; // selected opportunity ID — direct-linkable via ?focus=
  q: string;
  source: MapSource;
  kind: MapKind;
}

export function parseMapState(params: URLSearchParams): MapState {
  const view = params.get("view") === "axes" ? "axes" : "graph";
  const focusRaw = Number(params.get("focus"));
  const source = params.get("source");
  const kind = params.get("kind");
  return {
    view,
    focus: Number.isInteger(focusRaw) && focusRaw > 0 ? focusRaw : null,
    q: params.get("q") ?? "",
    source: source === "inbound" || source === "outbound" ? source : "all",
    kind: kind === "lead" || kind === "deal" ? kind : "all",
  };
}

// Defaults are omitted so links stay short (e.g. /vc/map?focus=13).
export function mapStateToQuery(s: MapState): string {
  const p = new URLSearchParams();
  if (s.view !== "graph") p.set("view", s.view);
  if (s.focus != null) p.set("focus", String(s.focus));
  if (s.q) p.set("q", s.q);
  if (s.source !== "all") p.set("source", s.source);
  if (s.kind !== "all") p.set("kind", s.kind);
  return p.toString();
}

// ---- filtering + search ---------------------------------------------------

export function filterNodes(nodes: MapNode[], s: Pick<MapState, "source" | "kind">): MapNode[] {
  return nodes.filter(
    (n) => (s.source === "all" || n.entry_type === s.source) && (s.kind === "all" || n.kind === s.kind)
  );
}

export function matchesSearch(n: MapNode, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [n.name, n.founder?.full_name, n.founder?.github_username, n.company?.name, n.group.label, n.top_project?.name, ...n.topics]
    .some((v) => v?.toLowerCase().includes(t));
}

// ---- Thesis Fit x Founder Momentum ---------------------------------------

export interface PlotPoint {
  id: number;
  fit: number;
  momentum: number;
  node: MapNode;
}

export interface Excluded {
  node: MapNode;
  reasons: string[];
}

// A node is plotted only when BOTH metrics are real values; the backend has
// already turned placeholder fit / insufficient history into null + reason.
export function partitionForPlot(nodes: MapNode[]): { plotted: PlotPoint[]; excluded: Excluded[] } {
  const plotted: PlotPoint[] = [];
  const excluded: Excluded[] = [];
  for (const n of nodes) {
    const fit = n.thesis_fit.value;
    const momentum = n.momentum.value;
    if (fit != null && momentum != null) {
      plotted.push({ id: n.id, fit, momentum, node: n });
    } else {
      const reasons: string[] = [];
      if (fit == null) reasons.push(`Thesis fit unavailable: ${n.thesis_fit.reason ?? "not computed"}`);
      if (momentum == null) reasons.push(`Momentum unavailable: ${n.momentum.reason ?? "not computed"}`);
      excluded.push({ node: n, reasons });
    }
  }
  return { plotted, excluded };
}

// ---- relationship graph ---------------------------------------------------

export interface MapGroup {
  key: string;
  label: string;
  field: string | null;
  ids: number[];
}

export function groupNodes(nodes: MapNode[]): MapGroup[] {
  const by = new Map<string, MapGroup>();
  for (const n of nodes) {
    const g = by.get(n.group.key) ?? { key: n.group.key, label: n.group.label, field: n.group.field, ids: [] };
    g.ids.push(n.id);
    by.set(n.group.key, g);
  }
  // biggest groups first; the "not enough data" bucket always last
  return [...by.values()].sort(
    (a, b) => Number(a.key === "ungrouped") - Number(b.key === "ungrouped") || b.ids.length - a.ids.length || a.label.localeCompare(b.label)
  );
}

export function groupFieldLabel(field: string | null): string {
  if (field === "company.sector") return "Company sector";
  if (field === "github_repo.language") return "GitHub repo language (no company yet)";
  return "No sector or project data yet";
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Layout {
  hubs: Map<string, { x: number; y: number; label: string; count: number }>;
  nodes: Map<number, { x: number; y: number }>;
}

// Deterministic layout keyed by group key + opportunity ID, so a node keeps its
// place across refreshes (and when it moves from lead to deal).
export function layoutGraph(nodes: MapNode[]): Layout {
  const groups = groupNodes(nodes);
  const hubs: Layout["hubs"] = new Map();
  const pos: Layout["nodes"] = new Map();
  const ringR = groups.length <= 1 ? 0 : 150 + groups.length * 30;
  groups.forEach((g, i) => {
    const a = (i / groups.length) * Math.PI * 2 - Math.PI / 2;
    const hx = Math.cos(a) * ringR;
    const hy = Math.sin(a) * ringR * 0.75;
    hubs.set(g.key, { x: hx, y: hy, label: g.label, count: g.ids.length });
    const spread = 45 + Math.sqrt(g.ids.length) * 22;
    for (const id of g.ids) {
      const h = hash(`${g.key}:${id}`);
      const angle = ((h % 3600) / 3600) * Math.PI * 2;
      const r = spread * (0.45 + ((h >>> 12) % 1000) / 1000 * 0.55);
      pos.set(id, { x: hx + Math.cos(angle) * r, y: hy + Math.sin(angle) * r });
    }
  });
  return { hubs, nodes: pos };
}

export function linksFor(id: number, links: MapLink[]): { other: number; link: MapLink }[] {
  return links
    .filter((l) => l.source === id || l.target === id)
    .map((l) => ({ other: l.source === id ? l.target : l.source, link: l }));
}

// ---- visual vocabulary ----------------------------------------------------

export const STAGE_COLORS: Record<string, string> = {
  sourcing: "#047857",
  screening: "#3b82f6",
  diligence: "#1e40af",
  decision: "#0f172a",
};

export function nodeColor(n: MapNode): string {
  if (n.status === "dismissed") return "#94a3b8";
  return n.kind === "lead" ? STAGE_COLORS.sourcing : STAGE_COLORS[n.stage] ?? "#475569";
}

export function nodeKindLabel(n: MapNode): string {
  return n.kind === "lead" ? "Founder lead" : `Active deal · ${humanStatus(n.stage)}`;
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
