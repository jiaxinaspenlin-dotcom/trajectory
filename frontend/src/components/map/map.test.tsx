import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  filterNodes, layoutGraph, mapStateToQuery, matchesSearch, parseMapState, partitionForPlot,
} from "@/lib/opportunityMap";
import { MapData, MapLink, MapNode } from "@/lib/types";
import { FitMomentumScatter } from "./FitMomentumScatter";
import { MapList } from "./MapList";
import { MapNodePanel } from "./MapNodePanel";

function node(o: Partial<MapNode> = {}): MapNode {
  return {
    id: 1, name: "Ada Builder", entry_type: "outbound", stage: "sourcing", status: "prospect", kind: "lead",
    in_founders: true, in_pipeline: false,
    founder: { id: 7, full_name: "Ada Builder", github_username: "ada" }, company: null,
    founder_score: 40, evidence_count: 3, top_project: { name: "ledgerkit", url: "https://github.com/ada/ledgerkit", stars: 42 },
    topics: ["payments"], group: { key: "language:rust", label: "Rust projects", field: "github_repo.language" },
    thesis_fit: { value: null, reason: "No company yet — thesis fit is a placeholder" },
    momentum: { value: null, current_score: 40, trajectory: "insufficient_history", reason: "Insufficient momentum history (needs 30+ days of score snapshots)" },
    next_action: "Run analysis", is_demo: false, ...o,
  };
}

const inbound = node({
  id: 2, name: "LedgerLoop", entry_type: "inbound", stage: "screening", status: "applied", kind: "deal",
  in_founders: false, in_pipeline: true, founder: null, company: { id: 3, name: "LedgerLoop", sector: "fintech", one_liner: "Recon" },
  topics: [], top_project: null, group: { key: "sector:fintech", label: "fintech", field: "company.sector" },
  thesis_fit: { value: 72, reason: null },
  momentum: { value: null, current_score: null, trajectory: null, reason: "No linked founder to track momentum for" },
  next_action: "Review new application",
});
const plotted = node({
  id: 3, name: "PayMesh", kind: "deal", stage: "diligence", in_pipeline: true,
  company: { id: 4, name: "PayMesh", sector: "fintech", one_liner: "" },
  group: { key: "sector:fintech", label: "fintech", field: "company.sector" },
  thesis_fit: { value: 88, reason: null }, momentum: { value: 16, current_score: 42, trajectory: "accelerating", reason: null },
});

describe("map state", () => {
  it("round-trips URL state and supports a direct focus link", () => {
    const s = parseMapState(new URLSearchParams("view=axes&focus=13&source=outbound&kind=deal&q=rust"));
    expect(s).toEqual({ view: "axes", focus: 13, q: "rust", source: "outbound", kind: "deal" });
    expect(mapStateToQuery(s)).toBe("view=axes&focus=13&q=rust&source=outbound&kind=deal");
    expect(mapStateToQuery(parseMapState(new URLSearchParams("focus=13")))).toBe("focus=13");
    expect(parseMapState(new URLSearchParams("focus=abc&view=nope&source=x")).focus).toBeNull();
  });

  it("filters by source and kind, searches names, groups and topics", () => {
    const all = [node(), inbound, plotted];
    expect(filterNodes(all, { source: "inbound", kind: "all" }).map((n) => n.id)).toEqual([2]);
    expect(filterNodes(all, { source: "all", kind: "deal" }).map((n) => n.id)).toEqual([2, 3]);
    expect(matchesSearch(node(), "payments")).toBe(true);
    expect(matchesSearch(node(), "rust")).toBe(true);
    expect(matchesSearch(inbound, "rust")).toBe(false);
  });

  it("plots only records with both real values and explains every exclusion", () => {
    const { plotted: p, excluded } = partitionForPlot([node(), inbound, plotted]);
    expect(p.map((x) => [x.id, x.fit, x.momentum])).toEqual([[3, 88, 16]]);
    expect(excluded.find((e) => e.node.id === 1)!.reasons).toEqual([
      "Thesis fit unavailable: No company yet — thesis fit is a placeholder",
      "Momentum unavailable: Insufficient momentum history (needs 30+ days of score snapshots)",
    ]);
    expect(excluded.find((e) => e.node.id === 2)!.reasons).toEqual(["Momentum unavailable: No linked founder to track momentum for"]);
  });

  it("lays nodes out deterministically, so a node keeps its place when it becomes a deal", () => {
    const before = layoutGraph([node(), inbound, plotted]).nodes.get(1);
    const after = layoutGraph([node({ kind: "deal", stage: "screening" }), inbound, plotted]).nodes.get(1);
    expect(after).toEqual(before);
    expect(layoutGraph([node(), inbound]).hubs.size).toBe(2);
  });
});

describe("MapNodePanel", () => {
  const links: MapLink[] = [{ source: 1, target: 3, kind: "shared_topic", label: "Shared project topic: payments", topics: ["payments"] }];
  const byId = new Map([node(), inbound, plotted].map((n) => [n.id, n]));

  it("shows honest metrics, named relationships, and opens the existing opportunity", () => {
    const onSelect = vi.fn();
    render(<MapNodePanel node={node()} links={links} nodesById={byId} hiddenByFilters={false} plotted={false} view="axes" onSelect={onSelect} onClose={() => {}} />);
    const panel = screen.getByTestId("map-node-panel");
    expect(within(panel).getByText("Open opportunity →")).toHaveAttribute("href", "/vc/opportunities/1");
    expect(within(panel).getByText(/Insufficient momentum history/)).toBeInTheDocument();
    expect(within(panel).getByText(/thesis fit is a placeholder/)).toBeInTheDocument();
    expect(within(panel).getByText(/Not on the chart/)).toBeInTheDocument();
    expect(within(panel).getByText("GitHub repo language (no company yet)")).toBeInTheDocument();
    fireEvent.click(within(panel).getByText("PayMesh"));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(within(panel).getByText(/Shared project topic: payments/)).toBeInTheDocument();
  });
});

describe("MapList (WebGL fallback)", () => {
  it("lists every node by group, including sparse records, and selects by ID", () => {
    const onSelect = vi.fn();
    render(<MapList nodes={[node({ founder_score: null, evidence_count: 0, top_project: null, topics: [], group: { key: "ungrouped", label: "Not enough data to group", field: null } }), inbound]} selectedId={null} query="" onSelect={onSelect} />);
    expect(screen.getByText("Not enough data to group · 1")).toBeInTheDocument();
    expect(screen.getByText(/not scored/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("LedgerLoop"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe("FitMomentumScatter", () => {
  it("reports how many records were plotted and lists the rest with reasons", () => {
    const onSelect = vi.fn();
    render(<FitMomentumScatter nodes={[node(), inbound, plotted]} selectedId={1} query="" onSelect={onSelect} />);
    expect(screen.getByTestId("plot-count")).toHaveTextContent("1 of 3 opportunities plotted");
    const list = screen.getByTestId("excluded-list");
    expect(within(list).getByText(/Insufficient momentum history/)).toBeInTheDocument();
    expect(within(list).getByText("Ada Builder").closest("button")).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(list).getByText("LedgerLoop"));
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

  it("keeps the selection when switching to the axes view", async () => {
    const { default: MapPage } = await import("@/app/vc/map/page");
    window.history.replaceState(null, "", "/vc/map?focus=1");
    render(<MapPage />);
    fireEvent.click(await screen.findByText("Thesis fit × Momentum"));
    expect(replace).toHaveBeenLastCalledWith("/vc/map?view=axes&focus=1", { scroll: false });
  });
});
