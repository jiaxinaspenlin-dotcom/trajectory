"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { humanStatus } from "@/lib/format";
import { layoutGraph, matchesSearch, nodeColor, nodeKindLabel } from "@/lib/opportunityMap";
import { MapLink, MapNode } from "@/lib/types";

// Meridian-style relationship graph, flattened to a pannable / zoomable plane:
// topic hubs anchor clusters, deals are filled discs (colored by stage), leads
// are hollow rings, and only named relationships are drawn as links.

const LINK_COLORS: Record<MapLink["kind"], string> = {
  shared_topic: "#b45309",
  same_founder: "#7c3aed",
  same_company: "#7c3aed",
};
const SPOKE_COLOR = "#cbd5e1";
const SELECT_COLOR = "#1e40af";

interface SceneNode {
  node: MapNode;
  x: number;
  y: number;
  r: number;
  fills: THREE.MeshBasicMaterial[];
  hit: THREE.Mesh;
}

export function RelationshipGraph({
  nodes,
  links,
  selectedId,
  query,
  onSelect,
  onUnavailable,
}: {
  nodes: MapNode[];
  links: MapLink[];
  selectedId: number | null;
  query: string;
  onSelect: (id: number | null) => void;
  // WebGL context could not be created (or was lost): parent swaps in the list
  onUnavailable: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // live values read by the render loop without rebuilding the scene
  const live = useRef({ selectedId, query, onSelect, onUnavailable });
  live.current = { selectedId, query, onSelect, onUnavailable };
  const api = useRef<{ applyStyles: () => void; focus: (id: number) => void; zoom: (f: number) => void; reset: () => void } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const labelLayer = labelLayerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !labelLayer || !tooltip) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      live.current.onUnavailable();
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", `Relationship map of ${nodes.length} opportunities`);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);
    const onContextLost = () => live.current.onUnavailable();
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.12;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

    // ---- layout + geometry ----
    const layout = layoutGraph(nodes);
    let radius = 120;
    for (const p of layout.nodes.values()) radius = Math.max(radius, Math.hypot(p.x, p.y) + 40);
    const fitZ = radius / Math.tan(THREE.MathUtils.degToRad(22.5)) * 1.05;
    controls.minDistance = 60;
    controls.maxDistance = fitZ * 3;
    const home = () => {
      camera.position.set(0, 0, fitZ);
      controls.target.set(0, 0, 0);
      controls.update();
    };
    home();

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(d: T) => { disposables.push(d); return d; };

    const sceneNodes: SceneNode[] = [];
    const byId = new Map<number, SceneNode>();
    const hitMeshes: THREE.Mesh[] = [];
    const hitMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    for (const n of nodes) {
      const p = layout.nodes.get(n.id)!;
      const r = 8 + ((n.founder_score ?? 0) / 100) * 10;
      const color = new THREE.Color(nodeColor(n));
      const fills: THREE.MeshBasicMaterial[] = [];
      const g = new THREE.Group();
      g.position.set(p.x, p.y, 0);
      if (n.kind === "deal") {
        const m = track(new THREE.MeshBasicMaterial({ color, transparent: true }));
        fills.push(m);
        g.add(new THREE.Mesh(track(new THREE.CircleGeometry(r, 32)), m));
      } else {
        // hollow ring with a white core so leads read differently from deals
        const ring = track(new THREE.MeshBasicMaterial({ color, transparent: true }));
        const core = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        fills.push(ring, core);
        g.add(new THREE.Mesh(track(new THREE.RingGeometry(r * 0.58, r, 32)), ring));
        const c = new THREE.Mesh(track(new THREE.CircleGeometry(r * 0.58, 32)), core);
        c.position.z = 0.1;
        g.add(c);
      }
      const hit = new THREE.Mesh(track(new THREE.CircleGeometry(r + 5, 16)), hitMat);
      hit.userData.id = n.id;
      g.add(hit);
      hitMeshes.push(hit);
      scene.add(g);
      const sn = { node: n, x: p.x, y: p.y, r, fills, hit };
      sceneNodes.push(sn);
      byId.set(n.id, sn);
    }

    // group spokes (hub -> member), faint
    const spokePts: number[] = [];
    for (const sn of sceneNodes) {
      const h = layout.hubs.get(sn.node.group.key)!;
      spokePts.push(h.x, h.y, -1, sn.x, sn.y, -1);
    }
    const spokeGeo = track(new THREE.BufferGeometry());
    spokeGeo.setAttribute("position", new THREE.Float32BufferAttribute(spokePts, 3));
    const spokeMat = track(new THREE.LineBasicMaterial({ color: SPOKE_COLOR, transparent: true, opacity: 0.7 }));
    scene.add(new THREE.LineSegments(spokeGeo, spokeMat));

    // named relationships
    const linkPts: number[] = [];
    const linkCols: number[] = [];
    for (const l of links) {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (!a || !b) continue;
      const c = new THREE.Color(LINK_COLORS[l.kind]);
      linkPts.push(a.x, a.y, -0.5, b.x, b.y, -0.5);
      linkCols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const linkGeo = track(new THREE.BufferGeometry());
    linkGeo.setAttribute("position", new THREE.Float32BufferAttribute(linkPts, 3));
    linkGeo.setAttribute("color", new THREE.Float32BufferAttribute(linkCols, 3));
    const linkMat = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    scene.add(new THREE.LineSegments(linkGeo, linkMat));

    // selection halo
    const haloMat = track(new THREE.MeshBasicMaterial({ color: SELECT_COLOR, transparent: true }));
    const halo = new THREE.Mesh(track(new THREE.RingGeometry(1.35, 1.65, 48)), haloMat);
    halo.position.z = 0.2;
    halo.visible = false;
    scene.add(halo);

    // ---- HTML labels (textContent only: names come from public profiles) ----
    const hubLabels = [...layout.hubs.values()].map((h) => {
      const el = document.createElement("div");
      el.className = "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted";
      el.textContent = `${h.label} · ${h.count}`;
      labelLayer.appendChild(el);
      return { el, x: h.x, y: h.y };
    });
    const nodeLabels = new Map<number, HTMLDivElement>();
    for (const sn of sceneNodes) {
      const el = document.createElement("div");
      el.className = "absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink";
      el.textContent = sn.node.name;
      el.style.display = "none";
      labelLayer.appendChild(el);
      nodeLabels.set(sn.node.id, el);
    }

    // ---- styles driven by selection / search ----
    let hoveredId: number | null = null;
    function applyStyles() {
      const { selectedId: sel, query: q } = live.current;
      for (const sn of sceneNodes) {
        const dim = q.trim() !== "" && !matchesSearch(sn.node, q);
        for (const m of sn.fills) m.opacity = dim ? 0.15 : 1;
      }
      const s = sel != null ? byId.get(sel) : undefined;
      halo.visible = !!s;
      if (s) {
        halo.position.set(s.x, s.y, 0.2);
        halo.scale.setScalar(s.r);
      }
      spokeMat.opacity = q.trim() ? 0.25 : 0.7;
      linkMat.opacity = q.trim() ? 0.3 : 0.85;
    }

    // ---- camera helpers ----
    let tween: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number } | null = null;
    function moveTo(x: number, y: number, z: number) {
      const to = new THREE.Vector3(x, y, z);
      const toT = new THREE.Vector3(x, y, 0);
      if (reducedMotion) {
        camera.position.copy(to);
        controls.target.copy(toT);
        controls.update();
        return;
      }
      tween = { from: camera.position.clone(), to, fromT: controls.target.clone(), toT, t0: performance.now() };
    }
    function focus(id: number) {
      const s = byId.get(id);
      if (s) moveTo(s.x, s.y, Math.min(camera.position.z, fitZ * 0.55));
    }
    api.current = {
      applyStyles,
      focus,
      zoom: (f) => moveTo(controls.target.x, controls.target.y, THREE.MathUtils.clamp(camera.position.z * f, controls.minDistance, controls.maxDistance)),
      reset: () => moveTo(0, 0, fitZ),
    };
    applyStyles();
    if (live.current.selectedId != null && byId.has(live.current.selectedId)) {
      const s = byId.get(live.current.selectedId)!;
      camera.position.set(s.x, s.y, fitZ * 0.55);
      controls.target.set(s.x, s.y, 0);
      controls.update();
    }

    // ---- pointer: hover tooltip + click-to-select (not on drag) ----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    function pick(ev: PointerEvent): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(hitMeshes, false)[0];
      return hit ? (hit.object.userData.id as number) : null;
    }
    function showTooltip(id: number | null, ev: PointerEvent) {
      if (!tooltip) return;
      const sn = id != null ? byId.get(id) : undefined;
      if (!sn) {
        tooltip.style.display = "none";
        return;
      }
      const n = sn.node;
      tooltip.replaceChildren();
      const title = document.createElement("div");
      title.className = "text-sm font-semibold text-ink";
      title.textContent = n.name;
      const meta = document.createElement("div");
      meta.className = "text-xs text-ink-muted";
      meta.textContent = `${nodeKindLabel(n)} · ${humanStatus(n.entry_type)}`;
      const sig = document.createElement("div");
      sig.className = "mt-0.5 text-xs text-ink-soft";
      sig.textContent = [
        n.founder_score != null ? `Founder score ${Math.round(n.founder_score)}` : "Not scored",
        `${n.evidence_count} evidence`,
        n.group.label,
      ].join(" · ");
      tooltip.append(title, meta, sig);
      const rect = container!.getBoundingClientRect();
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(ev.clientX - rect.left + 14, rect.width - 260)}px`;
      tooltip.style.top = `${ev.clientY - rect.top + 14}px`;
    }
    const onMove = (ev: PointerEvent) => {
      const id = pick(ev);
      hoveredId = id;
      renderer.domElement.style.cursor = id != null ? "pointer" : "grab";
      showTooltip(id, ev);
    };
    const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; };
    const onUp = (ev: PointerEvent) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) live.current.onSelect(pick(ev));
      down = null;
    };
    const onLeave = () => { hoveredId = null; tooltip.style.display = "none"; };
    const el = renderer.domElement;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    // ---- size + loop ----
    function resize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const v = new THREE.Vector3();
    let raf = 0;
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (tween) {
        const t = Math.min(1, (now - tween.t0) / 450);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        camera.position.lerpVectors(tween.from, tween.to, e);
        controls.target.lerpVectors(tween.fromT, tween.toT, e);
        if (t === 1) tween = null;
      }
      controls.update();
      renderer.render(scene, camera);

      const w = container!.clientWidth;
      const h = container!.clientHeight;
      const toScreen = (x: number, y: number) => {
        v.set(x, y, 0).project(camera);
        return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
      };
      for (const l of hubLabels) {
        const [sx, sy] = toScreen(l.x, l.y);
        l.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
        l.el.style.left = "0";
        l.el.style.top = "0";
      }
      // node names: selected, hovered, search matches, or everything once zoomed in
      const { selectedId: sel, query: q } = live.current;
      const zoomedIn = camera.position.z < fitZ * 0.45;
      for (const sn of sceneNodes) {
        const label = nodeLabels.get(sn.node.id)!;
        const show = sn.node.id === sel || sn.node.id === hoveredId || (q.trim() !== "" && matchesSearch(sn.node, q)) || zoomedIn;
        label.style.display = show ? "block" : "none";
        if (show) {
          const [sx, sy] = toScreen(sn.x, sn.y - sn.r - 2);
          label.style.left = "0";
          label.style.top = "0";
          label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0)`;
          label.style.fontWeight = sn.node.id === sel ? "700" : "500";
        }
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      el.remove();
      labelLayer.replaceChildren();
      api.current = null;
    };
  }, [nodes, links]);

  // selection / search restyle without rebuilding; fly to a newly selected node
  useEffect(() => {
    api.current?.applyStyles();
  }, [selectedId, query]);
  useEffect(() => {
    if (selectedId != null) api.current?.focus(selectedId);
  }, [selectedId]);

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="relationship-graph">
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={labelLayerRef} className="pointer-events-none absolute inset-0" aria-hidden />
      <div ref={tooltipRef} className="pointer-events-none absolute z-10 hidden w-60 rounded-lg border border-line bg-white px-3 py-2 shadow-raised" />
      <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <button type="button" aria-label="Zoom in" className="px-2.5 py-1 text-sm text-ink-soft hover:bg-surface-sunken" onClick={() => api.current?.zoom(0.7)}>+</button>
        <button type="button" aria-label="Zoom out" className="border-t border-line px-2.5 py-1 text-sm text-ink-soft hover:bg-surface-sunken" onClick={() => api.current?.zoom(1.4)}>−</button>
        <button type="button" aria-label="Reset view" className="border-t border-line px-2.5 py-1 text-xs text-ink-soft hover:bg-surface-sunken" onClick={() => api.current?.reset()}>⟲</button>
      </div>
    </div>
  );
}
