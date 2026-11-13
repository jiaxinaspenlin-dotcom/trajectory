// One Three.js scene for the investor Map. Both modes (Relationships and Custom
// Axes) share this renderer, perspective camera and OrbitControls; switching
// mode only re-targets node positions and shows/hides the axis group. Axis lines,
// the grid, points and links all live in the same scene, so orbiting the camera
// tilts them together. Interaction model follows Meridian's BrainCanvas.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Vec3 = [number, number, number];

export interface SceneNode {
  id: number;
  label: string;
  color: string;
  kind: "lead" | "deal";
  size: number; // px at the framing distance
}

export interface SceneLink {
  source: number;
  target: number;
  color: string;
}

export interface SceneCluster {
  key: string;
  label: string;
  color: string;
  center: Vec3;
}

export interface SceneAxis {
  axis: "x" | "y" | "z";
  label: string;
  maxLabel: string;
  // value labels at positions along the axis, in [-1, 1] (axis end = ±1)
  ticks: { t: number; text: string }[];
}

export interface SceneLayout {
  positions: Map<number, Vec3>; // nodes without a position are hidden (e.g. unplottable)
  clusters: SceneCluster[]; // empty in Custom Axes
  axes: SceneAxis[] | null; // null in Relationships
  axisLength: number;
  viewDir: Vec3; // initial framing direction
}

export interface SceneCallbacks {
  onSelect: (id: number | null) => void;
  describe: (id: number) => { title: string; lines: string[] };
}

const ACCENT = "#1f4fd8";
const DAMPING = 0.06; // Meridian's damping factor
const CLICK_SLOP_PX = 5; // movement under this is a click, not a drag

const srgb = (hex: string) => new THREE.Color(hex).convertLinearToSRGB();
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface NodeState {
  node: SceneNode;
  index: number;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  visible: boolean; // target visibility
  alpha: number; // rendered alpha (animated)
  fromAlpha: number;
}

export class MapScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 1, 20000);
  private controls: OrbitControls;
  private reducedMotion: boolean;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;

  private states = new Map<number, NodeState>();
  private order: NodeState[] = [];
  private links: SceneLink[] = [];
  private pGeo = new THREE.BufferGeometry();
  private pMat: THREE.ShaderMaterial;
  private points: THREE.Points;
  private lGeo = new THREE.BufferGeometry();
  private lMat: THREE.ShaderMaterial;
  private lines: THREE.LineSegments;
  private halo: THREE.Mesh;
  private hoverRing: THREE.Mesh;

  private axesGroup = new THREE.Group();
  private axesMats: (THREE.LineBasicMaterial)[] = [];
  private axesAlpha = 0;
  private axesTarget = 0;

  private layout: SceneLayout | null = null;
  private layoutT = 1; // node-position tween progress
  private selected: number | null = null;
  private follow: number | null = null; // orbit target tracks this node
  private highlight: Set<number> | null = null;
  private hovered: number | null = null;
  private home: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private framing = { pos: new THREE.Vector3(0, 0, 900), target: new THREE.Vector3(), radius: 300 };
  private refDistance = 900;
  private camTween: { t: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;

  private mouse = { x: -1e4, y: -1e4, downX: 0, downY: 0, inside: false };
  private activePointers = new Set<number>();
  private clusterEls = new Map<string, HTMLDivElement>();
  private axisEls: HTMLDivElement[] = [];
  private nodeLabelEls = new Map<number, HTMLDivElement>();
  private clock = new THREE.Clock();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    private labelLayer: HTMLElement,
    private tooltip: HTMLElement,
    private cb: SceneCallbacks,
  ) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // throws when WebGL is unavailable — the caller swaps in the list fallback
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    const el = this.renderer.domElement;
    el.style.display = "block";
    el.style.touchAction = "none";
    el.setAttribute("role", "img");
    container.appendChild(el);

    const c = (this.controls = new OrbitControls(this.camera, el));
    c.enableDamping = true;
    c.dampingFactor = DAMPING;
    c.autoRotate = false;
    c.screenSpacePanning = true;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.9;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    // a user drag ends any camera flight and stops following the selected node's
    // tween (the orbit target stays on the node)
    c.addEventListener("start", () => { this.camTween = null; });

    // points: filled disc = active deal, ring = founder lead
    this.pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: this.renderer.getPixelRatio() }, uRef: { value: 900 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize, aKind, aAlpha;
        uniform float uScale, uRef;
        varying vec3 vColor;
        varying float vKind, vAlpha;
        void main() {
          vColor = aColor; vKind = aKind; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // sub-linear growth: nodes get bigger as you zoom in, but never balloon
          gl_PointSize = aAlpha < 0.01 ? 0.0 : clamp(aSize * uScale * pow(uRef / -mv.z, 0.7), 3.0, 72.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vKind, vAlpha;
        void main() {
          vec2 p = 2.0 * gl_PointCoord - 1.0;
          float r = length(p);
          float edge = 1.0 - smoothstep(0.84, 1.0, r);
          if (edge <= 0.0) discard;
          vec3 col = vColor;
          if (vKind < 0.5) col = mix(vec3(1.0), vColor, smoothstep(0.46, 0.58, r));
          gl_FragColor = vec4(col, edge * vAlpha);
        }`,
    });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.renderOrder = 3;
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.lMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aRGBA;
        varying vec4 vRGBA;
        void main() { vRGBA = aRGBA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vRGBA;
        void main() { gl_FragColor = vRGBA; }`,
    });
    this.lines = new THREE.LineSegments(this.lGeo, this.lMat);
    this.lines.renderOrder = 2;
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    const ring = (color: string, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 48),
        new THREE.MeshBasicMaterial({ color: srgb(color), transparent: true, opacity, depthTest: false }),
      );
      m.renderOrder = 4;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.halo = ring(ACCENT, 0.95);
    this.hoverRing = ring(ACCENT, 0.45);

    this.axesGroup.visible = false;
    this.scene.add(this.axesGroup);

    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("pointercancel", this.onPointerCancel);
    el.addEventListener("contextmenu", this.onContextMenu);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  // Where a node currently is on screen (CSS px relative to the canvas), or null
  // when hidden/behind the camera. Used by browser tests to click real nodes.
  screenPositionOf(id: number): { x: number; y: number } | null {
    const st = this.states.get(id);
    if (!st || st.alpha < 0.2) return null;
    const p = this.project(st.pos);
    return p.behind ? null : { x: p.x, y: p.y };
  }

  // Camera state summary (tests verify orbit / zoom / reset actually moved it).
  cameraState() {
    const c = this.camera.position;
    const t = this.controls.target;
    return { position: [c.x, c.y, c.z], target: [t.x, t.y, t.z], distance: c.distanceTo(t), following: this.follow };
  }

  // ---- data -----------------------------------------------------------------

  setData(nodes: SceneNode[], links: SceneLink[]) {
    const next = new Map<number, NodeState>();
    nodes.forEach((n, index) => {
      const prev = this.states.get(n.id);
      next.set(n.id, prev
        ? { ...prev, node: n, index }
        : { node: n, index, pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), visible: false, alpha: 0, fromAlpha: 0 });
    });
    this.states = next;
    this.order = [...next.values()].sort((a, b) => a.index - b.index);
    this.links = links;

    const N = this.order.length;
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const kind = new Float32Array(N);
    this.order.forEach((s, i) => {
      const c = srgb(s.node.color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = s.node.size;
      kind[i] = s.node.kind === "deal" ? 1 : 0;
    });
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.pGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    this.pGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    this.pGeo.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    this.pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage));
    const L = links.length;
    this.lGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(L * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.lGeo.setAttribute("aRGBA", new THREE.BufferAttribute(new Float32Array(L * 8), 4).setUsage(THREE.DynamicDrawUsage));

    for (const [id, el] of this.nodeLabelEls) {
      if (!next.has(id)) { el.remove(); this.nodeLabelEls.delete(id); }
    }
    for (const s of this.order) {
      if (this.nodeLabelEls.has(s.node.id)) continue;
      const el = document.createElement("div");
      el.className = "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded bg-white/85 px-1 text-[11px] font-medium text-ink";
      el.textContent = s.node.label; // textContent: names come from public profiles
      el.style.display = "none";
      this.labelLayer.appendChild(el);
      this.nodeLabelEls.set(s.node.id, el);
    }
    if (this.selected != null && !next.has(this.selected)) this.selected = this.follow = null;
  }

  // Re-target every node. First call places nodes instantly and frames the data.
  setLayout(layout: SceneLayout, { animate }: { animate: boolean }) {
    const first = this.layout === null;
    const instant = first || !animate || this.reducedMotion;
    this.layout = layout;
    for (const s of this.order) {
      const p = layout.positions.get(s.node.id);
      s.from.copy(s.pos);
      s.fromAlpha = s.alpha;
      s.visible = !!p;
      if (p) s.to.set(p[0], p[1], p[2]);
      else s.to.copy(s.pos); // fade out in place
      if (first || (!s.alpha && p)) s.from.copy(s.to); // appear where it lands
    }
    this.layoutT = instant ? 1 : 0;
    if (instant) this.order.forEach((s) => { s.pos.copy(s.to); s.alpha = s.visible ? 1 : 0; });

    this.buildClusterLabels(layout.clusters);
    this.buildAxes(layout.axes, layout.axisLength);
    this.computeFraming();

    const sel = this.selected != null ? this.states.get(this.selected) : undefined;
    if (sel?.visible) {
      // keep focus on the selected record; its new overview is this mode's framing
      this.home = { pos: this.framing.pos.clone(), target: this.framing.target.clone() };
      this.follow = sel.node.id;
      this.flyToNode(sel, instant);
    } else {
      this.follow = null;
      if (this.selected != null) this.home = { pos: this.framing.pos.clone(), target: this.framing.target.clone() };
      this.flyTo(this.framing.pos, this.framing.target, instant ? 0 : 0.9);
    }
  }

  setSelected(id: number | null, { animate = true }: { animate?: boolean } = {}) {
    if (id === this.selected) return;
    const instant = !animate || this.reducedMotion;
    const s = id != null ? this.states.get(id) : undefined;
    if (id == null || !s) {
      this.selected = null;
      this.follow = null;
      if (this.home) {
        this.flyTo(this.home.pos, this.home.target, instant ? 0 : 1.0);
        this.home = null;
      }
      return;
    }
    if (this.selected == null && !this.home) {
      this.home = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    }
    this.selected = id;
    if (s.visible) {
      this.follow = id;
      this.flyToNode(s, instant);
    } else {
      this.follow = null; // e.g. not plottable in Custom Axes: the drawer explains
    }
  }

  setHighlight(ids: Set<number> | null) {
    this.highlight = ids;
  }

  zoom(factor: number) {
    const dir = this.tmp.copy(this.camera.position).sub(this.controls.target);
    const dist = THREE.MathUtils.clamp(dir.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(this.controls.target.clone().add(dir.setLength(dist)), this.controls.target.clone(), 0.35);
  }

  // Restore this mode's initial framing (selection stays open in the drawer).
  reset() {
    this.follow = null;
    this.home = null;
    this.flyTo(this.framing.pos, this.framing.target, 0.8);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("pointercancel", this.onPointerCancel);
    el.removeEventListener("contextmenu", this.onContextMenu);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    el.remove();
    this.labelLayer.replaceChildren();
  }

  // ---- camera ---------------------------------------------------------------

  private computeFraming() {
    const pts: THREE.Vector3[] = [];
    for (const s of this.order) if (s.visible) pts.push(s.to.clone());
    const L = this.layout?.axisLength ?? 0;
    if (this.layout?.axes) {
      for (const a of this.layout.axes) {
        const i = a.axis === "x" ? 0 : a.axis === "y" ? 1 : 2;
        const v = [0, 0, 0];
        v[i] = L * 1.12; pts.push(new THREE.Vector3(...v));
        v[i] = -L * 1.12; pts.push(new THREE.Vector3(...v));
      }
    }
    const sphere = new THREE.Sphere();
    if (pts.length) sphere.setFromPoints(pts);
    const radius = Math.max(sphere.radius, 60);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.06;
    const dir = new THREE.Vector3(...(this.layout?.viewDir ?? [0, 0.3, 1])).normalize();
    this.framing = { pos: sphere.center.clone().addScaledVector(dir, dist), target: sphere.center.clone(), radius };
    this.refDistance = dist;
    this.pMat.uniforms.uRef.value = dist;
    this.controls.minDistance = Math.max(radius * 0.12, 25);
    this.controls.maxDistance = dist * 4;
    this.camera.near = Math.max(dist / 200, 0.5);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
  }

  private flyToNode(s: NodeState, instant: boolean) {
    const target = s.to.clone();
    const dir = this.tmp.copy(this.camera.position).sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
    const dist = Math.max(this.refDistance * 0.42, this.controls.minDistance * 1.5);
    this.flyTo(target.clone().add(dir.setLength(dist)), target, instant ? 0 : 1.1);
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur: number) {
    if (dur <= 0 || this.reducedMotion) {
      this.camTween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.camTween = {
      t: 0, dur,
      fromP: this.camera.position.clone(), toP: pos.clone(),
      fromT: this.controls.target.clone(), toT: target.clone(),
    };
  }

  // ---- labels + axes --------------------------------------------------------

  private buildClusterLabels(clusters: SceneCluster[]) {
    const keep = new Set(clusters.map((c) => c.key));
    for (const [k, el] of this.clusterEls) if (!keep.has(k)) { el.remove(); this.clusterEls.delete(k); }
    for (const c of clusters) {
      let el = this.clusterEls.get(c.key);
      if (!el) {
        el = document.createElement("div");
        el.className = "pointer-events-none absolute left-0 top-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-ink";
        el.dataset.cluster = c.key;
        this.labelLayer.appendChild(el);
        this.clusterEls.set(c.key, el);
      }
      el.textContent = c.label;
      el.style.borderLeft = `3px solid ${c.color}`;
      el.style.paddingLeft = "6px";
      (el as HTMLDivElement & { anchor?: Vec3 }).anchor = c.center;
    }
  }

  private buildAxes(axes: SceneAxis[] | null, L: number) {
    this.axesTarget = axes ? 1 : 0;
    this.axisEls.forEach((e) => e.remove());
    this.axisEls = [];
    if (!axes) return;
    this.axesGroup.clear();
    this.axesMats.forEach((m) => m.dispose());
    this.axesMats = [];
    const segs: number[] = [];
    const ticks: number[] = [];
    for (const a of axes) {
      const i = a.axis === "x" ? 0 : a.axis === "y" ? 1 : 2;
      const p = (t: number) => { const v = [0, 0, 0]; v[i] = t; return v; };
      segs.push(...p(-L), ...p(L));
      // ticks at min, mid, max: short cross marks perpendicular to the axis
      const j = i === 1 ? 0 : 1;
      for (const t of [-L, -L / 2, 0, L / 2, L]) {
        const a1 = p(t); const a2 = p(t);
        a1[j] -= 5; a2[j] += 5;
        ticks.push(...a1, ...a2);
      }
    }
    const axisMat = new THREE.LineBasicMaterial({ color: srgb("#1d2939"), transparent: true, opacity: 0 });
    const tickMat = new THREE.LineBasicMaterial({ color: srgb("#1d2939"), transparent: true, opacity: 0 });
    const gridMat = new THREE.LineBasicMaterial({ color: srgb("#98a2b3"), transparent: true, opacity: 0 });
    this.axesMats = [axisMat, tickMat, gridMat];
    const mk = (arr: number[], mat: THREE.LineBasicMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const ls = new THREE.LineSegments(g, mat);
      ls.renderOrder = 1;
      return ls;
    };
    // faint grid on the X–Y plane so 2-metric layouts read like a chart
    const grid: number[] = [];
    for (let k = -4; k <= 4; k++) {
      const t = (k / 4) * L;
      grid.push(-L, t, 0, L, t, 0, t, -L, 0, t, L, 0);
    }
    this.axesGroup.add(mk(grid, gridMat), mk(segs, axisMat), mk(ticks, tickMat));
    this.axesGroup.visible = true;

    for (const a of axes) {
      const i = a.axis === "x" ? 0 : a.axis === "y" ? 1 : 2;
      const at = (t: number): Vec3 => { const v: Vec3 = [0, 0, 0]; v[i] = t; return v; };
      const tag = (text: string, anchor: Vec3, strong: boolean) => {
        const el = document.createElement("div") as HTMLDivElement & { anchor?: Vec3 };
        el.className = strong
          ? "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-card"
          : "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded border border-line bg-white/90 px-1 text-[10.5px] font-medium text-ink-soft num";
        el.textContent = text;
        el.anchor = anchor;
        el.dataset.axis = a.axis;
        this.labelLayer.appendChild(el);
        this.axisEls.push(el);
      };
      tag(`${a.axis.toUpperCase()} · ${a.label} ${a.maxLabel}`, at(L * 1.07), true);
      // origin is shared by every axis, so value labels skip t = 0
      for (const tk of a.ticks) tag(tk.text, at(tk.t * L * (Math.abs(tk.t) === 1 ? 1.07 : 1)), false);
    }
  }

  // ---- input ----------------------------------------------------------------

  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.inside = e.pointerType === "mouse";
  };
  private onPointerDown = (e: PointerEvent) => {
    this.mouse.downX = e.clientX;
    this.mouse.downY = e.clientY;
    this.activePointers.add(e.pointerId);
    // panning (right/middle drag, two fingers) moves the orbit target off the
    // selected node, so stop pinning the target to it
    if ((e.pointerType === "mouse" && e.button !== 0) || this.activePointers.size > 1) this.follow = null;
  };
  private onPointerUp = (e: PointerEvent) => {
    const multi = this.activePointers.size > 1;
    this.activePointers.delete(e.pointerId);
    if (multi || (e.button !== 0 && e.pointerType === "mouse")) return;
    const dx = e.clientX - this.mouse.downX;
    const dy = e.clientY - this.mouse.downY;
    if (dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX) return; // a drag, not a click
    const r = this.renderer.domElement.getBoundingClientRect();
    const id = this.pick(e.clientX - r.left, e.clientY - r.top);
    if (id != null) this.cb.onSelect(id);
    else if (this.selected != null) this.cb.onSelect(null);
  };
  private onPointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
  };
  private onContextMenu = (e: Event) => e.preventDefault(); // right-drag pans
  private onPointerLeave = () => {
    this.mouse.inside = false;
    this.mouse.x = this.mouse.y = -1e4;
  };

  // nearest visible node under the pointer (screen space), front-most on ties
  private pick(mx: number, my: number): number | null {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const s of this.order) {
      if (s.alpha < 0.2) continue;
      const p = this.tmp.copy(s.pos).project(this.camera);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * w;
      const sy = (-p.y * 0.5 + 0.5) * h;
      const rad = Math.max(10, this.pixelSize(s) / 2 + 3);
      const d2 = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d2 > rad * rad) continue;
      const score = d2 + p.z * 10; // prefer closer to cursor, then nearer to camera
      if (score < bestScore) { bestScore = score; best = s.node.id; }
    }
    return best;
  }

  private pixelSize(s: NodeState): number {
    const dist = this.camera.position.distanceTo(s.pos);
    return THREE.MathUtils.clamp(s.node.size * Math.pow(this.refDistance / Math.max(dist, 1), 0.7), 3 / this.renderer.getPixelRatio(), 72 / this.renderer.getPixelRatio());
  }

  // place a camera-facing ring around a node, sized in screen pixels
  private placeRing(ring: THREE.Mesh, s: NodeState | undefined, padPx: number) {
    if (!s || s.alpha < 0.2) { ring.visible = false; return; }
    const dist = this.camera.position.distanceTo(s.pos);
    const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(this.renderer.domElement.clientHeight, 1);
    const r = (this.pixelSize(s) / 2 + padPx) * worldPerPx;
    ring.position.copy(s.pos);
    ring.quaternion.copy(this.camera.quaternion);
    ring.scale.setScalar(r);
    ring.visible = true;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- frame ------------------------------------------------------------------

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // node position / visibility tween between layouts
    if (this.layoutT < 1) {
      this.layoutT = Math.min(1, this.layoutT + dt / 0.9);
      const e = easeInOutCubic(this.layoutT);
      for (const s of this.order) {
        s.pos.lerpVectors(s.from, s.to, e);
        s.alpha = THREE.MathUtils.lerp(s.fromAlpha, s.visible ? 1 : 0, e);
      }
    }
    // axes fade with the mode
    this.axesAlpha += (this.axesTarget - this.axesAlpha) * (this.reducedMotion ? 1 : Math.min(1, dt * 6));
    if (this.axesMats.length) {
      this.axesMats[0].opacity = 0.75 * this.axesAlpha;
      this.axesMats[1].opacity = 0.6 * this.axesAlpha;
      this.axesMats[2].opacity = 0.16 * this.axesAlpha;
    }
    this.axesGroup.visible = this.axesAlpha > 0.01;

    // camera flight, then follow the selected node as the orbit target
    if (this.camTween) {
      const t = this.camTween;
      t.t = Math.min(1, t.t + dt / t.dur);
      const e = easeInOutCubic(t.t);
      this.camera.position.lerpVectors(t.fromP, t.toP, e);
      this.controls.target.lerpVectors(t.fromT, t.toT, e);
      if (t.t >= 1) this.camTween = null;
    } else if (this.follow != null) {
      const s = this.states.get(this.follow);
      if (s) {
        // carry the camera with the node so the view stays locked while it moves
        const delta = this.tmp2.copy(s.pos).sub(this.controls.target);
        if (delta.lengthSq() > 1e-6) {
          this.controls.target.add(delta);
          this.camera.position.add(delta);
        }
      }
    }
    this.controls.update();

    // per-node alpha: search highlight, focus neighbourhood
    const neighbours = this.selected != null ? this.neighbourSet(this.selected) : null;
    const alphaAttr = this.pGeo.getAttribute("aAlpha") as THREE.BufferAttribute | undefined;
    const posAttr = this.pGeo.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (alphaAttr && posAttr) {
      this.order.forEach((s, i) => {
        let a = s.alpha;
        if (this.highlight) a *= this.highlight.has(s.node.id) ? 1 : 0.14;
        else if (neighbours) a *= neighbours.has(s.node.id) ? 1 : 0.38;
        alphaAttr.setX(i, a);
        posAttr.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
      });
      alphaAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
    }

    // links follow their endpoints; drawn only when both ends are visible
    const lp = this.lGeo.getAttribute("position") as THREE.BufferAttribute | undefined;
    const lc = this.lGeo.getAttribute("aRGBA") as THREE.BufferAttribute | undefined;
    if (lp && lc) {
      this.links.forEach((l, i) => {
        const a = this.states.get(l.source);
        const b = this.states.get(l.target);
        if (!a || !b) return;
        lp.setXYZ(i * 2, a.pos.x, a.pos.y, a.pos.z);
        lp.setXYZ(i * 2 + 1, b.pos.x, b.pos.y, b.pos.z);
        let alpha = Math.min(a.alpha, b.alpha) * 0.7;
        if (this.selected != null) alpha *= l.source === this.selected || l.target === this.selected ? 1.3 : 0.25;
        if (this.highlight) alpha *= this.highlight.has(l.source) || this.highlight.has(l.target) ? 1 : 0.2;
        const c = srgb(l.color);
        lc.setXYZW(i * 2, c.r, c.g, c.b, Math.min(alpha, 0.95));
        lc.setXYZW(i * 2 + 1, c.r, c.g, c.b, Math.min(alpha, 0.95));
      });
      lp.needsUpdate = true;
      lc.needsUpdate = true;
    }

    // hover
    this.hovered = this.mouse.inside ? this.pick(this.mouse.x, this.mouse.y) : null;
    this.renderer.domElement.style.cursor = this.hovered != null ? "pointer" : "grab";
    this.placeRing(this.hoverRing, this.hovered != null && this.hovered !== this.selected ? this.states.get(this.hovered) : undefined, 4);
    this.placeRing(this.halo, this.selected != null ? this.states.get(this.selected) : undefined, 5);
    this.updateTooltip();

    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private neighbourSet(id: number): Set<number> {
    const set = new Set([id]);
    for (const l of this.links) {
      if (l.source === id) set.add(l.target);
      if (l.target === id) set.add(l.source);
    }
    return set;
  }

  private updateTooltip() {
    const t = this.tooltip;
    if (this.hovered == null) {
      if (t.dataset.id) { t.style.display = "none"; delete t.dataset.id; }
      return;
    }
    if (t.dataset.id !== String(this.hovered)) {
      const d = this.cb.describe(this.hovered);
      t.replaceChildren();
      const title = document.createElement("div");
      title.className = "text-[13px] font-semibold text-ink";
      title.textContent = d.title;
      t.append(title);
      for (const line of d.lines) {
        const el = document.createElement("div");
        el.className = "text-xs text-ink-muted";
        el.textContent = line;
        t.append(el);
      }
      t.dataset.id = String(this.hovered);
    }
    const w = this.container.clientWidth;
    t.style.display = "block";
    t.style.left = `${Math.min(this.mouse.x + 14, w - 250)}px`;
    t.style.top = `${this.mouse.y + 14}px`;
  }

  private project(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const p = this.tmp.copy(v).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, behind: p.z > 1 };
  }

  private updateLabels() {
    const W = this.renderer.domElement.clientWidth;
    const H = this.renderer.domElement.clientHeight;
    // keep labels fully inside the canvas so axis ends never clip at narrow widths
    const clampX = (x: number, w: number) => Math.min(Math.max(x, w / 2 + 4), W - w / 2 - 4);
    const clampY = (y: number, h: number) => Math.min(Math.max(y, h / 2 + 4), H - h / 2 - 4);
    const place = (el: HTMLElement, v: THREE.Vector3, opacity: number, dy = 0) => {
      const p = this.project(v);
      if (p.behind || opacity <= 0.01) { el.style.opacity = "0"; return; }
      el.style.opacity = String(opacity);
      const w = el.offsetWidth || 40;
      const h = el.offsetHeight || 14;
      el.style.transform = `translate(${clampX(p.x, w)}px, ${clampY(p.y + dy, h)}px) translate(-50%, -50%)`;
    };
    // node names first (selected, hovered, search matches); cluster labels then avoid them
    const placed: { x: number; y: number; w: number; h: number; node?: boolean }[] = [];
    for (const s of this.order) {
      const el = this.nodeLabelEls.get(s.node.id)!;
      const show = s.alpha > 0.5 && (s.node.id === this.selected || s.node.id === this.hovered || !!this.highlight?.has(s.node.id));
      if (!show) { el.style.display = "none"; continue; }
      el.style.display = "block";
      el.style.fontWeight = s.node.id === this.selected ? "700" : "500";
      const dy = -(this.pixelSize(s) / 2 + 12);
      place(el, s.pos, 1, dy);
      const p = this.project(s.pos);
      placed.push({ x: p.x, y: p.y + dy, w: el.offsetWidth || 60, h: el.offsetHeight || 14, node: true });
    }
    // every visible node disc is an obstacle, so cluster labels never sit on a node
    for (const s of this.order) {
      if (s.alpha < 0.3) continue;
      const p = this.project(s.pos);
      if (p.behind) continue;
      const d = this.pixelSize(s) + 4;
      placed.push({ x: p.x, y: p.y, w: d, h: d, node: true });
    }
    // cluster labels: project, then nudge overlapping ones apart on screen
    const clusterOpacity = this.axesTarget ? 0 : (1 - this.axesAlpha) * 0.95;
    const items = [...this.clusterEls.values()].map((el) => {
      const a = (el as HTMLDivElement & { anchor?: Vec3 }).anchor!;
      return { el, p: this.project(this.tmp2.set(a[0], a[1], a[2])) };
    }).sort((u, v) => u.p.y - v.p.y);
    for (const { el, p } of items) {
      if (p.behind || clusterOpacity <= 0.01) { el.style.opacity = "0"; continue; }
      const w = el.offsetWidth || 80;
      const h = el.offsetHeight || 14;
      // first slot (anchor, then progressively further above/below) clear of every node and label
      const hits = (cy: number) => placed.some((r) => Math.abs(r.x - p.x) < (r.w + w) / 2 + 4 && Math.abs(r.y - cy) < (r.h + h) / 2 + 2);
      let y = p.y;
      for (const off of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
        const cy = p.y + off * (h + 4);
        if (!hits(cy)) { y = cy; break; }
      }
      placed.push({ x: p.x, y, w, h });
      el.style.opacity = String(clusterOpacity);
      el.style.transform = `translate(${clampX(p.x, w)}px, ${clampY(y, h)}px) translate(-50%, -50%)`;
    }
    for (const el of this.axisEls) {
      const a = (el as HTMLDivElement & { anchor?: Vec3 }).anchor!;
      place(el, this.tmp2.set(a[0], a[1], a[2]), this.axesAlpha);
    }

  }
}
