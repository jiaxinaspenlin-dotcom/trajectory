// Pure helpers for the investor Map. Both modes (Relationships and Custom Axes)
// position the same MapNode records (stable opportunity IDs) in one 3D scene;
// these functions decide where, without touching WebGL.

import { humanStatus, titleCase } from "./format";
import { MapLink, MapNode } from "./types";

export type MapView = "graph" | "axes";
export type MapSource = "all" | "inbound" | "outbound";
export type MapKind = "all" | "lead" | "deal";
export type MetricKey = "fit" | "momentum" | "score" | "evidence";
export type AxisChoice = MetricKey | "none";

export interface MapState {
  view: MapView;
  focus: number | null; // selected opportunity ID — direct-linkable via ?focus=
  q: string;
  source: MapSource;
  kind: MapKind;
  x: MetricKey;
  y: MetricKey;
  z: AxisChoice;
}

export const DEFAULT_AXES = { x: "fit", y: "momentum", z: "score" } as const;
const METRIC_KEYS: MetricKey[] = ["fit", "momentum", "score", "evidence"];
const isMetric = (v: string | null): v is MetricKey => !!v && (METRIC_KEYS as string[]).includes(v);

export function parseMapState(params: URLSearchParams): MapState {
  const view = params.get("view") === "axes" ? "axes" : "graph";
  const focusRaw = Number(params.get("focus"));
  const source = params.get("source");
  const kind = params.get("kind");
  const x = isMetric(params.get("x")) ? (params.get("x") as MetricKey) : DEFAULT_AXES.x;
  let y = isMetric(params.get("y")) ? (params.get("y") as MetricKey) : DEFAULT_AXES.y;
  if (y === x) y = METRIC_KEYS.find((k) => k !== x)!;
  const zRaw = params.get("z");
  let z: AxisChoice = zRaw === "none" ? "none" : isMetric(zRaw) ? zRaw : DEFAULT_AXES.z;
  if (z === x || z === y) z = "none";
  return {
    view,
    focus: Number.isInteger(focusRaw) && focusRaw > 0 ? focusRaw : null,
    q: params.get("q") ?? "",
    source: source === "inbound" || source === "outbound" ? source : "all",
    kind: kind === "lead" || kind === "deal" ? kind : "all",
    x, y, z,
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
  if (s.x !== DEFAULT_AXES.x) p.set("x", s.x);
  if (s.y !== DEFAULT_AXES.y) p.set("y", s.y);
  if (s.z !== DEFAULT_AXES.z) p.set("z", s.z);
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

// ---- metrics (Custom Axes) ------------------------------------------------

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  value: (n: MapNode) => number | null;
  reason: (n: MapNode) => string;
  format: (v: number) => string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export const METRICS: Record<MetricKey, MetricDef> = {
  fit: {
    key: "fit", label: "Thesis Fit", short: "Thesis Fit", unit: "/100",
    value: (n) => n.thesis_fit.value,
    reason: (n) => titleCase(n.thesis_fit.reason ?? "Not computed"),
    format: (v) => `${Math.round(v)}`,
  },
  momentum: {
    key: "momentum", label: "Founder Momentum (30d)", short: "Momentum", unit: "pts",
    value: (n) => n.momentum.value,
    reason: (n) => titleCase(n.momentum.reason ?? "Not computed"),
    format: (v) => `${v > 0 ? "+" : ""}${round1(v)}`,
  },
  score: {
    key: "score", label: "Founder Score", short: "Founder Score", unit: "/100",
    value: (n) => n.founder_score,
    reason: (n) => (n.founder ? "Founder Not Scored Yet" : "No Linked Founder to Score"),
    format: (v) => `${Math.round(v)}`,
  },
  evidence: {
    key: "evidence", label: "Evidence Items", short: "Evidence", unit: "items",
    value: (n) => n.evidence_count,
    reason: () => "",
    format: (v) => `${Math.round(v)}`,
  },
};

export function formatMetric(key: MetricKey, v: number): string {
  const m = METRICS[key];
  return m.unit === "items" ? `${m.format(v)} Items` : m.unit === "pts" ? `${m.format(v)} pts` : `${m.format(v)}${m.unit}`;
}

// A metric is offered on an axis only when at least two records have a real value.
export function availableMetrics(nodes: MapNode[]): MetricKey[] {
  return METRIC_KEYS.filter((k) => nodes.filter((n) => METRICS[k].value(n) != null).length >= 2);
}

export function metricDomain(key: MetricKey, values: number[]): [number, number] {
  if (key === "fit" || key === "score") return [0, 100];
  if (key === "momentum") {
    // symmetric so 0 (no change) sits on the axis crossing
    const m = Math.max(5, Math.ceil(Math.max(0, ...values.map(Math.abs)) / 5) * 5);
    return [-m, m];
  }
  const max = Math.max(1, ...values);
  const step = max <= 10 ? 2 : max <= 50 ? 10 : 25;
  return [0, Math.ceil(max / step) * step];
}

export interface Excluded {
  node: MapNode;
  reasons: string[];
}

export interface AxisDomain {
  axis: "x" | "y" | "z";
  key: MetricKey;
  label: string;
  min: number;
  max: number;
}

export interface AxesLayout {
  positions: Map<number, [number, number, number]>;
  values: Map<number, Partial<Record<MetricKey, number>>>;
  domains: AxisDomain[];
  excluded: Excluded[];
  // records that land on exactly the same point, keyed by the shared position
  overlaps: number[][];
}

export const AXIS_LENGTH = 200;

export function axesLayout(nodes: MapNode[], axes: { x: MetricKey; y: MetricKey; z: AxisChoice }, L = AXIS_LENGTH): AxesLayout {
  const keys: { axis: "x" | "y" | "z"; key: MetricKey }[] = [
    { axis: "x", key: axes.x },
    { axis: "y", key: axes.y },
    ...(axes.z !== "none" ? [{ axis: "z" as const, key: axes.z }] : []),
  ];
  const plotted: MapNode[] = [];
  const excluded: Excluded[] = [];
  for (const n of nodes) {
    const missing = keys.filter(({ key }) => METRICS[key].value(n) == null);
    if (missing.length) excluded.push({ node: n, reasons: missing.map(({ key }) => `${METRICS[key].label} Unavailable: ${METRICS[key].reason(n)}`) });
    else plotted.push(n);
  }
  const domains: AxisDomain[] = keys.map(({ axis, key }) => {
    const [min, max] = metricDomain(key, plotted.map((n) => METRICS[key].value(n)!));
    return { axis, key, label: METRICS[key].label, min, max };
  });
  const positions = new Map<number, [number, number, number]>();
  const values = new Map<number, Partial<Record<MetricKey, number>>>();
  const byPoint = new Map<string, number[]>();
  for (const n of plotted) {
    const p: [number, number, number] = [0, 0, 0];
    const vals: Partial<Record<MetricKey, number>> = {};
    domains.forEach((d, i) => {
      const v = METRICS[d.key].value(n)!;
      vals[d.key] = v;
      const center = (d.min + d.max) / 2;
      const half = (d.max - d.min) / 2 || 1;
      p[i] = ((v - center) / half) * L;
    });
    positions.set(n.id, p);
    values.set(n.id, vals);
    const k = p.map((c) => c.toFixed(3)).join("|");
    byPoint.set(k, [...(byPoint.get(k) ?? []), n.id]);
  }
  return { positions, values, domains, excluded, overlaps: [...byPoint.values()].filter((ids) => ids.length > 1) };
}

// ---- Relationships: 3D cluster layout -------------------------------------

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

// Sector groups are named by the companies themselves (content, shown as typed);
// language and "ungrouped" group labels are generated, so they're labels.
export function isContentGroup(field: string | null): boolean {
  return field === "company.sector";
}

export function groupFieldLabel(field: string | null): string {
  if (field === "company.sector") return "Company Sector";
  if (field === "github_repo.language") return "GitHub Repo Language (No Company Yet)";
  return "No Sector or Project Data Yet";
}

// Mid-tone cluster colors that read on white (Meridian-style), assigned by a
// stable hash of the group key so a sector keeps its color as data changes.
export const CLUSTER_PALETTE = ["#4f8fc4", "#c0669f", "#4fa877", "#c58a3b", "#7d6bc9", "#c96565", "#3f9c9c", "#8a7a52"];
export const UNGROUPED_COLOR = "#98a2b3";
export const DISMISSED_COLOR = "#c3c9d3";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clusterColors(nodes: MapNode[]): Map<string, string> {
  const colors = new Map<string, string>();
  const used = new Set<number>();
  for (const g of groupNodes(nodes)) {
    if (g.key === "ungrouped") { colors.set(g.key, UNGROUPED_COLOR); continue; }
    let i = hash(g.key) % CLUSTER_PALETTE.length;
    // avoid two clusters sharing a color while unused colors remain
    for (let step = 0; step < CLUSTER_PALETTE.length && used.has(i); step++) i = (i + 1) % CLUSTER_PALETTE.length;
    used.add(i);
    colors.set(g.key, CLUSTER_PALETTE[i]);
  }
  return colors;
}

export function nodeColor(n: MapNode, colors: Map<string, string>): string {
  if (n.status === "dismissed") return DISMISSED_COLOR;
  return colors.get(n.group.key) ?? UNGROUPED_COLOR;
}

// deterministic pseudo-random in [-1, 1] per (id, salt)
function jitter(id: string, salt: string): number {
  return ((hash(`${id}:${salt}`) % 20001) / 10000) - 1;
}

export interface ClusterAnchor {
  key: string;
  label: string;
  field: string | null;
  count: number;
  center: [number, number, number];
  labelAt: [number, number, number]; // just above the cluster's highest member
}

export interface RelationshipLayout {
  positions: Map<number, [number, number, number]>;
  clusters: ClusterAnchor[];
}

// Groups sit on a Fibonacci sphere; members scatter in 3D around their anchor.
// Keyed by group + opportunity ID, so a node keeps its place across refreshes
// and when it moves from lead to deal.
export function relationshipLayout(nodes: MapNode[]): RelationshipLayout {
  const groups = groupNodes(nodes);
  const k = groups.length;
  const R = k <= 1 ? 0 : 70 + 48 * Math.sqrt(k);
  const positions = new Map<number, [number, number, number]>();
  const clusters: ClusterAnchor[] = groups.map((g, i) => {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(k, 1));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const center: [number, number, number] = [
      Math.sin(phi) * Math.cos(theta) * R,
      Math.cos(phi) * R * 0.7,
      Math.sin(phi) * Math.sin(theta) * R,
    ];
    const spread = 26 + 13 * Math.sqrt(g.ids.length);
    let top = center[1];
    for (const id of g.ids) {
      const s = `${g.key}:${id}`;
      const p: [number, number, number] = [
        center[0] + jitter(s, "x") * spread,
        center[1] + jitter(s, "y") * spread * 0.8,
        center[2] + jitter(s, "z") * spread,
      ];
      top = Math.max(top, p[1]);
      positions.set(id, p);
    }
    return { key: g.key, label: g.label, field: g.field, count: g.ids.length, center, labelAt: [center[0], top + 16, center[2]] };
  });
  return { positions, clusters };
}

export function linksFor(id: number, links: MapLink[]): { other: number; link: MapLink }[] {
  return links
    .filter((l) => l.source === id || l.target === id)
    .map((l) => ({ other: l.source === id ? l.target : l.source, link: l }));
}

export function nodeKindLabel(n: MapNode): string {
  return n.kind === "lead" ? "Founder Lead" : `Active Deal · ${humanStatus(n.stage)}`;
}

// Point size (px at the framing distance): founder score when known.
export function nodeSize(n: MapNode): number {
  return 18 + ((n.founder_score ?? 0) / 100) * 14;
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
