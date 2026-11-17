// Dashboard: every waiting record as a deck (queue order, one card in front, one
// primary button), flipped by buttons, keys or swipe and kept in ?card=; kinds of
// work jump the deck; stages as one bar; exactly one action in an empty workspace.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), usePathname: () => "/vc", useSearchParams: () => search }));
const fetched: Record<string, unknown> = {};
const requested: string[] = [];
vi.mock("@/lib/useFetch", () => ({
  useFetch: (url: string) => { requested.push(url); return { data: fetched[url] ?? null, loading: false, error: null, reload: () => {} }; },
}));
vi.mock("@/lib/api", () => ({ api: { put: vi.fn().mockResolvedValue({}) } }));
// jsdom has no PointerEvent: a MouseEvent carrying pointerType and pointerId
if (!("PointerEvent" in window)) {
  class PointerEventShim extends MouseEvent {
    pointerType: string; pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? "mouse"; this.pointerId = init.pointerId ?? 1; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventShim;
}

const item = (id: number, name: string, group: string, stage: string, key: string, detail: string | null, entry = "outbound") => ({
  opportunity_id: id, name, founder_name: null, entry_type: entry, stage, next_action: key === "run_analysis" ? "Run Analysis" : "x",
  next_action_key: key, next_action_detail: detail, priority: 1, age_days: 2, waiting_since: "2026-11-15T00:00:00Z", group,
});
const queue = [
  item(3, "Inferra", "recommendation", "diligence", "review_recommendation", "Recommended: Continue Diligence"),
  item(2, "PayMesh", "recommendation", "diligence", "review_recommendation", "Recommended: Monitor"),
  item(4, "TerraSignal", "application", "screening", "review_application", "New Inbound Application", "inbound"),
  item(5, "CareBridge", "lead", "sourcing", "run_analysis", "Scores the Three Screening Axes"),
  item(6, "ForgeTools", "lead", "sourcing", "run_analysis", "Scores the Three Screening Axes"),
];

function populated() {
  fetched["/api/dashboard"] = {
    thesis: { fund_name: "Northstar Ventures (Demo)", sectors: [], stages: [], geographies: [] },
    stage_counts: { sourcing: 2, screening: 1, diligence: 2 },
    stage_names: { sourcing: ["CareBridge", "ForgeTools"], screening: ["TerraSignal"], diligence: ["Inferra", "PayMesh"] },
    action_queue: queue,
    queue_groups: [{ key: "recommendation", count: 2, first_opportunity_id: 3 }, { key: "application", count: 1, first_opportunity_id: 4 }, { key: "lead", count: 2, first_opportunity_id: 5 }],
    recent_evidence: [{ id: 9, kind: "github_repo", title: "Public repository: aep", source_name: "GitHub", collected_at: new Date().toISOString(), opportunity_id: 3, opportunity_name: "Inferra" }],
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  push.mockClear(); replace.mockClear(); requested.length = 0;
  search = new URLSearchParams();
  for (const k of Object.keys(fetched)) delete fetched[k];
});

async function renderDashboard() {
  localStorage.setItem("trajectory_tour_seen_anon", "1");
  const { default: Dashboard } = await import("@/app/vc/page");
  return render(<Dashboard />);
}
const card = () => screen.getByTestId("deck-card");

describe("Dashboard deck", () => {
  it("shows the first waiting record in front with one primary button, from one request", async () => {
    populated();
    await renderDashboard();
    const deck = screen.getByRole("region", { name: "Waiting Records" });
    expect(deck).toHaveAttribute("aria-roledescription", "carousel");
    expect(card()).toHaveAttribute("aria-label", "1 of 5");
    expect(within(card()).getByText("Inferra")).toBeInTheDocument();
    expect(within(card()).getByText("Recommended: Continue Diligence")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Diligence · Outbound · Waiting 2 Days");
    expect(within(card()).getByRole("link", { name: /Review Recommendation/ })).toHaveAttribute("href", "/vc/opportunities/3?tab=decision&from=deck");
    expect(document.querySelectorAll(".btn-primary, .btn-lg").length).toBe(1);
    // the whole card opens it too
    fireEvent.click(card());
    expect(push).toHaveBeenCalledWith("/vc/opportunities/3?tab=decision&from=deck");
    expect([...new Set(requested)]).toEqual(["/api/dashboard"]);
  });

  it("flips with the buttons and the arrow keys, keeps the card in the URL, and stops at the ends", async () => {
    populated();
    await renderDashboard();
    expect(screen.getByRole("button", { name: "Previous Card" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next Card" }));
    expect(replace).toHaveBeenLastCalledWith("/vc?card=2", { scroll: false });
    fireEvent.keyDown(card(), { key: "ArrowRight" });
    expect(replace).toHaveBeenLastCalledWith("/vc?card=2", { scroll: false }); // still card 1 here: the URL drives the deck
    cleanup();
    search = new URLSearchParams("card=6");
    await renderDashboard();
    expect(card()).toHaveAttribute("aria-label", "5 of 5");
    expect(screen.getByTestId("deck-position")).toHaveTextContent("5 of 5");
    expect(screen.getByRole("button", { name: "Next Card" })).toBeDisabled();
    expect(within(card()).getByRole("link", { name: /Review Lead/ })).toHaveAttribute("href", "/vc/opportunities/6?from=deck");
    fireEvent.keyDown(card(), { key: "ArrowLeft" });
    expect(replace).toHaveBeenLastCalledWith("/vc?card=5", { scroll: false });
    replace.mockClear();
    fireEvent.keyDown(card(), { key: "ArrowRight" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to the first card when the one in the URL is no longer waiting", async () => {
    populated();
    search = new URLSearchParams("card=99");
    await renderDashboard();
    expect(card()).toHaveAttribute("aria-label", "1 of 5");
    expect(within(card()).getByText("Inferra")).toBeInTheDocument();
  });

  it("names an application and its one action", async () => {
    populated();
    search = new URLSearchParams("card=4");
    await renderDashboard();
    expect(within(card()).getByText("New Inbound Application")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Screening · Inbound · Waiting 2 Days");
    expect(within(card()).getByRole("link", { name: /Review Application/ })).toHaveAttribute("href", "/vc/opportunities/4?from=deck");
  });

  it("jumps by kind of work, marks the current kind, and the counts add up to the deck", async () => {
    populated();
    search = new URLSearchParams("card=2");
    await renderDashboard();
    const kinds = screen.getByRole("region", { name: "Jump to a Kind of Work" });
    const tiles = within(kinds).getAllByRole("button");
    // count (read once, by its screen-reader copy) and kind
    expect(tiles.map((t) => [t.querySelector(".sr-only")!.textContent, t.querySelector(".font-medium.text-ink")!.textContent])).toEqual([
      ["2", "Recommendations to Review"], ["1", "Application to Review"], ["2", "New Leads"],
    ]);
    expect(tiles[0]).toHaveTextContent("Showing");
    expect(tiles[0]).toHaveAttribute("aria-current", "true");
    expect(tiles[1]).not.toHaveAttribute("aria-current");
    expect(within(kinds).getByText("5 Waiting")).toBeInTheDocument();
    fireEvent.click(tiles[2]);
    expect(replace).toHaveBeenLastCalledWith("/vc?card=5", { scroll: false });
  });

  it("swipes on touch", async () => {
    populated();
    await renderDashboard();
    const c = card();
    fireEvent.pointerDown(c, { pointerType: "touch", clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(c, { pointerType: "touch", clientX: 200, clientY: 104, pointerId: 1 });
    fireEvent.pointerUp(c, { pointerType: "touch", clientX: 200, clientY: 104, pointerId: 1 });
    expect(replace).toHaveBeenLastCalledWith("/vc?card=2", { scroll: false });
    // a swipe isn't a click
    expect(push).not.toHaveBeenCalled();
  });

  it("drops what this browser already decided or dismissed", async () => {
    populated();
    localStorage.setItem("trajectory_investor_decisions", JSON.stringify({ 3: { decision: "advance" } }));
    await renderDashboard();
    expect(within(card()).getByText("PayMesh")).toBeInTheDocument();
    expect(card()).toHaveAttribute("aria-label", "1 of 4");
  });
});

describe("Dashboard", () => {
  it("shows the four stages as one summary, each opening its list", async () => {
    populated();
    await renderDashboard();
    const nav = screen.getByRole("navigation", { name: "Pipeline Summary" });
    expect(within(nav).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/vc/founders", "/vc/pipeline?stage=screening", "/vc/pipeline?stage=diligence", "/vc/pipeline?stage=decision",
    ]);
    fireEvent.mouseEnter(within(nav).getAllByRole("link")[2]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Diligence · 2");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Inferra, PayMesh");
  });

  it("an empty workspace shows exactly one setup action", async () => {
    fetched["/api/dashboard"] = { thesis: null, stage_counts: {}, stage_names: {}, action_queue: [], queue_groups: [], recent_evidence: [] };
    await renderDashboard();
    const actions = [...document.querySelectorAll("main a, main button, a.btn-primary, button")].filter((el) => !el.closest("[aria-hidden='true']"));
    expect(actions.map((a) => a.textContent)).toEqual(["Create Thesis"]);
    expect(screen.getByRole("link", { name: "Create Thesis" })).toHaveAttribute("href", "/vc/fund?edit=1");
  });
});
