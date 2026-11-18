"use client";

import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { AxesLayout, nodeColor, nodeSize, RelationshipLayout } from "@/lib/opportunityMap";
import { MapLink, MapNode } from "@/lib/types";
import { MapScene, SceneLayout, SceneLink, SceneNode } from "./mapScene";
import { describeNode, sceneLayout } from "./sceneText";

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
  // changes whenever HUD panels open/close, so their footprint is re-measured
  insetsKey?: string;
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
        describe: (id) => describeNode(id, live.current),
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
  const layout: SceneLayout = useMemo(() => sceneLayout({ mode, axes, relationships, colors }), [mode, axes, relationships, colors]);

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

  // Measure the controls drawn over the canvas (elements marked data-map-inset
  // in the same workspace) and hand the covered edges to the scene for framing.
  const firstInsets = useRef(true);
  useEffect(() => {
    const container = containerRef.current;
    const root = container?.closest("main") ?? document.body;
    if (!container) return;
    let raf = 0;
    const measure = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const c = container.getBoundingClientRect();
      const ins = { top: 0, right: 0, bottom: 0, left: 0 };
      root.querySelectorAll<HTMLElement>("[data-map-inset]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        let side = el.dataset.mapInset;
        if (side === "auto") {
          // tall panels cover a side; wide sheets (phone drawer) cover the bottom
          side = r.height > c.height * 0.6
            ? (r.left + r.width / 2 > c.left + c.width / 2 ? "right" : "left")
            : (r.top + r.height / 2 > c.top + c.height / 2 ? "bottom" : "top");
        }
        if (side === "top") ins.top = Math.max(ins.top, r.bottom - c.top);
        else if (side === "bottom") ins.bottom = Math.max(ins.bottom, c.bottom - r.top);
        else if (side === "right") ins.right = Math.max(ins.right, c.right - r.left);
        else if (side === "left") ins.left = Math.max(ins.left, r.right - c.left);
      });
      scene.setInsets(ins, { animate: !firstInsets.current });
      firstInsets.current = false;
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    root.querySelectorAll("[data-map-inset]").forEach((el) => ro.observe(el));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [props.insetsKey]);

  return (
    <div className="absolute inset-0" data-testid="map-canvas">
      <div ref={containerRef} className="absolute inset-0" aria-label={`3D Map of ${nodes.length} Opportunities`} />
      <div ref={labelRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <div ref={tooltipRef} data-testid="map-tooltip" className="pointer-events-none absolute z-20 hidden max-w-[240px] rounded-md border border-line bg-white px-2.5 py-1.5 shadow-raised" />
    </div>
  );
}
