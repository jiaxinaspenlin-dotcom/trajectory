"use client";

import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { humanStatus } from "@/lib/format";
import {
  AxesLayout, AXIS_LENGTH, formatMetric, MetricKey, METRICS, nodeColor, nodeKindLabel, nodeSize, RelationshipLayout,
} from "@/lib/opportunityMap";
import { MapLink, MapNode } from "@/lib/types";
import { MapScene, SceneLayout, SceneLink, SceneNode } from "./mapScene";

export interface MapCanvasHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}

const LINK_COLORS: Record<MapLink["kind"], string> = {
  shared_topic: "#c58a3b",
  same_founder: "#7d6bc9",
  same_company: "#7d6bc9",
};

// Owns the single Three.js scene for both Map modes. Mode switches hand the same
// nodes a new layout; the scene is never rebuilt. (next/dynamic doesn't forward
// refs, so camera controls are exposed through `apiRef`.)
export function MapCanvas(props: {
  nodes: MapNode[];
  links: MapLink[];
  colors: Map<string, string>;
  mode: "graph" | "axes";
  relationships: RelationshipLayout;
  axes: AxesLayout;
  selectedId: number | null;
  highlight: Set<number> | null;
  onSelect: (id: number | null) => void;
  onUnavailable: () => void;
  apiRef?: MutableRefObject<MapCanvasHandle | null>;
}) {
  const { nodes, links, colors, mode, relationships, axes, selectedId, highlight } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene | null>(null);
  const firstLayout = useRef(true);
  // latest props for callbacks the scene invokes, without rebuilding it
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    if (!props.apiRef) return;
    props.apiRef.current = {
      zoom: (f) => sceneRef.current?.zoom(f),
      reset: () => sceneRef.current?.reset(),
    };
  }, [props.apiRef]);

  useEffect(() => {
    const container = containerRef.current;
    const labels = labelRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !labels || !tooltip) return;
    let scene: MapScene;
    try {
      scene = new MapScene(container, labels, tooltip, {
        onSelect: (id) => live.current.onSelect(id),
        describe: (id) => describe(id, live.current),
      });
    } catch {
      live.current.onUnavailable();
      return;
    }
    const onLost = () => live.current.onUnavailable();
    scene.canvas.addEventListener("webglcontextlost", onLost);
    sceneRef.current = scene;
    firstLayout.current = true;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __trajectoryMap?: MapScene }).__trajectoryMap = scene;
    return () => {
      scene.canvas.removeEventListener("webglcontextlost", onLost);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const sceneNodes: SceneNode[] = useMemo(
    () => nodes.map((n) => ({
      id: n.id, label: n.name, color: nodeColor(n, colors), kind: n.kind, size: nodeSize(n), flagged: !!n.new_evidence_count,
    })),
    [nodes, colors]
  );
  const sceneLinks: SceneLink[] = useMemo(
    () => links.map((l) => ({ source: l.source, target: l.target, color: LINK_COLORS[l.kind] })),
    [links]
  );
  const layout: SceneLayout = useMemo(() => {
    if (mode === "axes") {
      const hasZ = axes.domains.length === 3;
      return {
        positions: axes.positions,
        clusters: [],
        axes: axes.domains.map((d) => ({
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
      positions: relationships.positions,
      clusters: relationships.clusters.map((c) => ({ key: c.key, label: c.label, color: colors.get(c.key) ?? "#98a2b3", center: c.labelAt })),
      axes: null,
      axisLength: AXIS_LENGTH,
      viewDir: [0.2, 0.42, 1],
    };
  }, [mode, axes, relationships, colors]);

  // data + layout first, so a ?focus= selection below lands on placed nodes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setData(sceneNodes, sceneLinks);
    scene.setLayout(layout, { animate: !firstLayout.current });
    firstLayout.current = false;
  }, [sceneNodes, sceneLinks, layout]);

  const firstSelect = useRef(true);
  useEffect(() => {
    sceneRef.current?.setSelected(selectedId, { animate: !firstSelect.current });
    firstSelect.current = false;
  }, [selectedId]);

  useEffect(() => {
    sceneRef.current?.setHighlight(highlight);
  }, [highlight]);

  return (
    <div className="absolute inset-0" data-testid="map-canvas">
      <div ref={containerRef} className="absolute inset-0" aria-label={`3D map of ${nodes.length} opportunities`} />
      <div ref={labelRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <div ref={tooltipRef} data-testid="map-tooltip" className="pointer-events-none absolute z-20 hidden max-w-[240px] rounded-md border border-line bg-white px-2.5 py-1.5 shadow-raised" />
    </div>
  );
}

function describe(id: number, p: { nodes: MapNode[]; mode: "graph" | "axes"; axes: AxesLayout }) {
  const n = p.nodes.find((x) => x.id === id);
  if (!n) return { title: "", lines: [] };
  const lines = [`${nodeKindLabel(n)} · ${humanStatus(n.entry_type)}`, n.group.label];
  if (n.new_evidence_count) lines.unshift(`New evidence · ${n.new_evidence_count}`);
  if (p.mode === "axes") {
    const vals = p.axes.values.get(id) ?? {};
    lines.push(p.axes.domains.map((d) => `${METRICS[d.key].label}: ${formatMetric(d.key as MetricKey, vals[d.key]!)}`).join(" · "));
    const same = p.axes.overlaps.find((ids) => ids.includes(id))?.filter((o) => o !== id) ?? [];
    if (same.length) lines.push(`Same point: ${same.map((o) => p.nodes.find((x) => x.id === o)?.name).join(", ")}`);
  } else {
    lines.push(n.founder_score != null ? `Founder score ${Math.round(n.founder_score)} · ${n.evidence_count} evidence` : `Not scored · ${n.evidence_count} evidence`);
  }
  return { title: n.name, lines };
}
