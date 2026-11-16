import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  availableMetrics, axesLayout, AXIS_LENGTH, clusterColors, filterNodes, formatMetric, mapStateToQuery, matchesSearch,
  metricDomain, parseMapState, relationshipLayout,
} from "@/lib/opportunityMap";
import { MapData, MapLink, MapNode } from "@/lib/types";
import { MapDrawer } from "./MapDrawer";
import { MapList } from "./MapList";
import { MapValuesPanel } from "./MapValuesPanel";

function node(o: Partial<MapNode> = {}): MapNode {
  return {
    id: 1, name: "Ada Builder", entry_type: "outbound", stage: "sourcing", status: "prospect", kind: "lead",
    in_founders: true, in_pipeline: false,
    founder: { id: 7, full_name: "Ada Builder", github_username: "ada" }, company: null,
    founder_score: 40, evidence_count: 3, top_project: { name: "ledgerkit", url: "https://github.com/ada/ledgerkit", stars: 42 },
    topics: ["payments"], group: { key: "language:rust", label: "Rust projects", field: "github_repo.language" },
    thesis_fit: { value: null, reason: "No company yet — thesis fit is a placeholder" },
    momentum: { value: null, current_score: 40, trajectory: "insufficient_history", reason: "Insufficient momentum history (needs 30+ days of score snapshots; has 1 spanning 0 days)" },
    next_action: "Run analysis", is_demo: false, ...o,
  };
}

const inbound = node({
  id: 2, name: "LedgerLoop", entry_type: "inbound", stage: "screening", status: "applied", kind: "deal",
  in_founders: false, in_pipeline: true, founder: null, founder_score: null, company: { id: 3, name: "LedgerLoop", sector: "fintech", one_liner: "Recon" },
  topics: [], top_project: null, group: { key: "sector:fintech", label: "fintech", field: "company.sector" },
  thesis_fit: { value: 72, reason: null },
  momentum: { value: null, current_score: null, trajectory: null, reason: "No linked founder to track momentum for" },
  next_action: "Review new application",
});
const plotted = node({
  id: 3, name: "PayMesh", kind: "deal", stage: "diligence", in_pipeline: true, founder_score: 42,
  company: { id: 4, name: "PayMesh", sector: "fintech", one_liner: "" },
  group: { key: "sector:fintech", label: "fintech", field: "company.sector" },
  thesis_fit: { value: 88, reason: null }, momentum: { value: 16, current_score: 42, trajectory: "accelerating", reason: null },
});
const twin = node({ ...plotted, id: 4, name: "ForgeTools" }); // identical values -> same point

describe("map state", () => {
  it("round-trips view, focus, filters, and axes; defaults stay out of the URL", () => {
    const s = parseMapState(new URLSearchParams("view=axes&focus=13&source=outbound&kind=deal&q=rust&x=score&y=fit&z=none"));
    expect(s).toEqual({ view: "axes", focus: 13, q: "rust", source: "outbound", kind: "deal", x: "score", y: "fit", z: "none" });
    expect(mapStateToQuery(s)).toBe("view=axes&focus=13&q=rust&source=outbound&kind=deal&x=score&y=fit&z=none");
    // existing links keep working: Thesis Fit on X, Momentum on Y by default
    const d = parseMapState(new URLSearchParams("view=axes&focus=13"));
    expect([d.x, d.y]).toEqual(["fit", "momentum"]);
    expect(mapStateToQuery(d)).toBe("view=axes&focus=13");
    expect(parseMapState(new URLSearchParams("focus=abc&view=nope")).focus).toBeNull();
  });

  it("never puts one metric on two axes", () => {
    const s = parseMapState(new URLSearchParams("x=fit&y=fit&z=fit"));
    expect(s.x).toBe("fit");
    expect(s.y).not.toBe("fit");
    expect(s.z).toBe("none");
  });

  it("filters by source and kind and searches names, groups and topics", () => {
    const all = [node(), inbound, plotted];
    expect(filterNodes(all, { source: "inbound", kind: "all" }).map((n) => n.id)).toEqual([2]);
    expect(filterNodes(all, { source: "all", kind: "deal" }).map((n) => n.id)).toEqual([2, 3]);
    expect(matchesSearch(node(), "payments")).toBe(true);
    expect(matchesSearch(inbound, "rust")).toBe(false);
  });
});

describe("Custom Axes layout", () => {
  it("plots only records with real values on every chosen axis, with reasons for the rest", () => {
    const l = axesLayout([node(), inbound, plotted], { x: "fit", y: "momentum", z: "none" });
    expect([...l.positions.keys()]).toEqual([3]);
    expect(l.values.get(3)).toEqual({ fit: 88, momentum: 16 });
    expect(l.excluded.find((e) => e.node.id === 1)!.reasons).toEqual([
      "Thesis Fit Unavailable: No Company Yet — Thesis Fit Is a Placeholder",
      "Founder Momentum (30d) Unavailable: Insufficient Momentum History (Needs 30+ Days of Score Snapshots; Has 1 Spanning 0 Days)",
    ]);
    expect(l.excluded.find((e) => e.node.id === 2)!.reasons).toEqual(["Founder Momentum (30d) Unavailable: No Linked Founder to Track Momentum For"]);
  });

  it("maps actual values onto axes centred on the domain midpoint, with z=none as a plane", () => {
    const l = axesLayout([plotted], { x: "fit", y: "momentum", z: "none" });
    const [x, y, z] = l.positions.get(3)!;
    expect(x).toBeCloseTo(((88 - 50) / 50) * AXIS_LENGTH); // fit 0–100
    expect(y).toBeCloseTo((16 / 20) * AXIS_LENGTH); // momentum domain ±20 pts
    expect(z).toBe(0);
    expect(l.domains.map((d) => [d.axis, d.min, d.max])).toEqual([["x", 0, 100], ["y", -20, 20]]);
  });

  it("uses a real third metric and reports records that share a point", () => {
    const l = axesLayout([plotted, twin], { x: "fit", y: "momentum", z: "score" });
    expect(l.positions.get(3)![2]).toBeCloseTo(((42 - 50) / 50) * AXIS_LENGTH);
    expect(l.overlaps).toEqual([[3, 4]]);
  });

  it("offers a metric only when at least two records have it, and keeps units", () => {
    expect(availableMetrics([node(), inbound, plotted])).toEqual(["fit", "score", "evidence"]); // momentum: only one real value
    expect(availableMetrics([plotted, twin])).toEqual(["fit", "momentum", "score", "evidence"]);
    expect(metricDomain("momentum", [3, -27])).toEqual([-30, 30]);
    expect(formatMetric("momentum", 16.42)).toBe("+16.4 pts");
    expect(formatMetric("fit", 88)).toBe("88/100");
    expect(formatMetric("evidence", 7)).toBe("7 Items");
  });
});

describe("Relationships layout", () => {
  it("is a deterministic 3D layout: a node keeps its place when it becomes a deal", () => {
    const before = relationshipLayout([node(), inbound, plotted]).positions.get(1)!;
    const after = relationshipLayout([node({ kind: "deal", stage: "screening" }), inbound, plotted]).positions.get(1)!;
    expect(after).toEqual(before);
    const zs = [...relationshipLayout([node(), inbound, plotted]).positions.values()].map((p) => p[2]);
    expect(new Set(zs.map((z) => Math.round(z))).size).toBeGreaterThan(1); // genuine depth
  });

  it("anchors one labelled cluster per group, above its members, with stable distinct colors", () => {
    const { clusters, positions } = relationshipLayout([node(), inbound, plotted]);
    expect(clusters.map((c) => c.label).sort()).toEqual(["Rust projects", "fintech"]);
    const fintech = clusters.find((c) => c.key === "sector:fintech")!;
    expect(fintech.labelAt[1]).toBeGreaterThan(Math.max(positions.get(2)![1], positions.get(3)![1]));
    const colors = clusterColors([node(), inbound, plotted]);
    expect(colors.get("sector:fintech")).not.toBe(colors.get("language:rust"));
  });
});

describe("MapDrawer", () => {
  const links: MapLink[] = [{ source: 1, target: 3, kind: "shared_topic", label: "Shared project topic: payments", topics: ["payments"] }];
  const byId = new Map([node(), inbound, plotted].map((n) => [n.id, n]));
  const colors = clusterColors([node(), inbound, plotted]);

  it("explains why a selected record isn't on the Custom Axes, and opens the existing opportunity", () => {
    const onSelect = vi.fn();
    const axes = axesLayout([node(), inbound, plotted], { x: "fit", y: "momentum", z: "none" });
    render(<MapDrawer node={node()} links={links} nodesById={byId} colors={colors} mode="axes" axes={axes} hiddenByFilters={false} onSelect={onSelect} onClose={() => {}} />);
    const panel = screen.getByTestId("map-node-panel");
    expect(within(panel).getByRole("link", { name: /Open Opportunity/ })).toHaveAttribute("href", "/vc/opportunities/1");
    const why = within(panel).getByTestId("drawer-not-plotted");
    expect(why).toHaveTextContent("Thesis Fit Unavailable: No Company Yet");
    expect(why).toHaveTextContent("Has 1 Spanning 0 Days");
    fireEvent.click(within(panel).getByText("PayMesh"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("shows the exact axis values for a plotted record and closes on Escape", () => {
    const onClose = vi.fn();
    const axes = axesLayout([plotted], { x: "fit", y: "momentum", z: "score" });
    render(<MapDrawer node={plotted} links={[]} nodesById={byId} colors={colors} mode="axes" axes={axes} hiddenByFilters={false} onSelect={() => {}} onClose={onClose} />);
    expect(screen.getByText("88/100")).toBeInTheDocument();
    expect(screen.getByText("+16 pts")).toBeInTheDocument();
    expect(screen.getByText("42/100")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("MapValuesPanel", () => {
  it("lists exact values, marks records on the same point, and lists exclusions with reasons", () => {
    const onSelect = vi.fn();
    const nodes = [node(), plotted, twin];
    const axes = axesLayout(nodes, { x: "fit", y: "momentum", z: "none" });
    render(<MapValuesPanel nodes={nodes} axes={axes} selectedId={3} onSelect={onSelect} onClose={() => {}} />);
    const table = screen.getByTestId("plotted-list");
    expect(within(table).getAllByText("88/100")).toHaveLength(2);
    expect(within(table).getByText("Same Point as ForgeTools")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Not Plotted 1/ }));
    const ex = screen.getByTestId("excluded-list");
    expect(within(ex).getByText(/Insufficient Momentum History/)).toBeInTheDocument();
    fireEvent.click(within(ex).getByText("Ada Builder"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("MapList (WebGL fallback)", () => {
  it("lists every node by group, including sparse records, and selects by ID", () => {
    const onSelect = vi.fn();
    const sparse = node({ founder_score: null, evidence_count: 0, top_project: null, topics: [], group: { key: "ungrouped", label: "Not enough data to group", field: null } });
    render(<MapList nodes={[sparse, inbound]} colors={clusterColors([sparse, inbound])} selectedId={null} query="" onSelect={onSelect} />);
    expect(screen.getByText("Not enough data to group · 1")).toBeInTheDocument();
    expect(screen.getAllByText(/Not Scored/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("LedgerLoop"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

// ---- page: WebGL unavailable -> grouped list --------------------------------

const replace = vi.fn();
let search = "focus=1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/vc/map",
  useSearchParams: () => new URLSearchParams(search),
}));
const mapData: MapData = { items: [node(), inbound, plotted], links: [], has_thesis: true };
vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({ data: mapData, loading: false, error: null, reload: vi.fn() }),
}));

describe("Map page", () => {
  beforeEach(() => {
    search = "focus=1";
    // jsdom has no WebGL
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  it("falls back to the list when WebGL is unavailable and keeps the focused node selected", async () => {
    const { default: MapPage } = await import("@/app/vc/map/page");
    render(<MapPage />);
    expect(await screen.findByText(/WebGL isn.t available/)).toBeInTheDocument();
    expect(screen.getByTestId("map-list")).toBeInTheDocument();
    expect(within(screen.getByTestId("map-node-panel")).getByText("Ada Builder")).toBeInTheDocument();
  });

  it("keeps the selection and filters when switching to Custom Axes", async () => {
    const { default: MapPage } = await import("@/app/vc/map/page");
    window.history.replaceState(null, "", "/vc/map?focus=1&kind=lead");
    search = "focus=1&kind=lead";
    render(<MapPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Custom Axes/ }));
    expect(replace).toHaveBeenLastCalledWith("/vc/map?view=axes&focus=1&kind=lead", { scroll: false });
  });
});
