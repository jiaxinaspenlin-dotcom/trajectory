// Everything the 3D renderer draws as text, built without WebGL: node names,
// cluster labels, axis titles and ticks, and hover tooltips. MapCanvas hands
// these to MapScene; the copy regression test reads them through rendererStrings().

import { humanStatus } from "@/lib/format";
import {
  AxesLayout, AXIS_LENGTH, formatMetric, groupLabel, MetricKey, METRICS, nodeKindLabel, RelationshipLayout,
} from "@/lib/opportunityMap";
import { MapNode } from "@/lib/types";
import type { SceneLayout } from "./mapScene";

// a line marked content (a name) is shown as typed and skipped by copy checks
export type SceneLine = string | { text: string; content: true };

export function sceneLayout(p: {
  mode: "graph" | "axes";
  axes: AxesLayout;
  relationships: RelationshipLayout;
  colors: Map<string, string>;
}): SceneLayout {
  if (p.mode === "axes") {
    const hasZ = p.axes.domains.length === 3;
    return {
      positions: p.axes.positions,
      clusters: [],
      axes: p.axes.domains.map((d) => ({
        axis: d.axis,
        label: METRICS[d.key].label,
        maxLabel: formatMetric(d.key, d.max),
        ticks: [-1, -0.5, 0.5].map((t) => ({ t, text: formatMetric(d.key, d.min + ((t + 1) / 2) * (d.max - d.min)) })),
      })),
      axisLength: AXIS_LENGTH,
      viewDir: hasZ ? [0.55, 0.34, 1] : [0.16, 0.1, 1],
    };
  }
  return {
    positions: p.relationships.positions,
    clusters: p.relationships.clusters.map((c) => ({ key: c.key, label: c.label, color: p.colors.get(c.key) ?? "#98a2b3", center: c.labelAt })),
    axes: null,
    axisLength: AXIS_LENGTH,
    viewDir: [0.2, 0.42, 1],
  };
}

// The title of an axis as drawn at its end: "X · Thesis Fit 100/100".
export function axisTitle(a: { axis: string; label: string; maxLabel: string }): string {
  return `${a.axis.toUpperCase()} · ${a.label} ${a.maxLabel}`;
}

// Hover tooltip for one node: its name (content) and a few label lines.
export function describeNode(id: number, p: { nodes: MapNode[]; mode: "graph" | "axes"; axes: AxesLayout }): { title: string; lines: SceneLine[] } {
  const n = p.nodes.find((x) => x.id === id);
  if (!n) return { title: "", lines: [] };
  const lines: SceneLine[] = [`${nodeKindLabel(n)} · ${humanStatus(n.entry_type)}`, groupLabel(n.group)];
  if (n.new_evidence_count) lines.unshift(`New Evidence · ${n.new_evidence_count}`);
  if (p.mode === "axes") {
    const vals = p.axes.values.get(id) ?? {};
    lines.push(p.axes.domains.map((d) => `${METRICS[d.key].label}: ${formatMetric(d.key as MetricKey, vals[d.key]!)}`).join(" · "));
    const same = p.axes.overlaps.find((ids) => ids.includes(id))?.filter((o) => o !== id) ?? [];
    if (same.length) lines.push({ text: `Same Point: ${same.map((o) => p.nodes.find((x) => x.id === o)?.name).join(", ")}`, content: true });
  } else {
    lines.push(n.founder_score != null ? `Founder Score ${Math.round(n.founder_score)} · ${n.evidence_count} Evidence` : `Not Scored · ${n.evidence_count} Evidence`);
  }
  return { title: n.name, lines };
}

export interface RendererString {
  text: string;
  kind: "node" | "cluster" | "axis" | "tick" | "tooltip-title" | "tooltip";
  content: boolean;
}

// Every string the renderer would draw for this data in this mode.
export function rendererStrings(p: {
  nodes: MapNode[];
  mode: "graph" | "axes";
  axes: AxesLayout;
  relationships: RelationshipLayout;
  colors: Map<string, string>;
}): RendererString[] {
  const out: RendererString[] = p.nodes.map((n) => ({ text: n.name, kind: "node", content: true }));
  const layout = sceneLayout(p);
  for (const c of layout.clusters) out.push({ text: c.label, kind: "cluster", content: false });
  for (const a of layout.axes ?? []) {
    out.push({ text: axisTitle(a), kind: "axis", content: false });
    for (const t of a.ticks) out.push({ text: t.text, kind: "tick", content: false });
  }
  for (const n of p.nodes) {
    const d = describeNode(n.id, p);
    out.push({ text: d.title, kind: "tooltip-title", content: true });
    for (const l of d.lines) out.push(typeof l === "string" ? { text: l, kind: "tooltip", content: false } : { text: l.text, kind: "tooltip", content: true });
  }
  return out;
}
