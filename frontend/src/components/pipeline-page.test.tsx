// Pipeline page: a board of stages in the Dashboard deck's order, one header action
// naming the deal the board marks Next Up, filters and the open deal in the URL, a
// preview that steps with J/K, and honest empty columns.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

let search = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), usePathname: () => "/vc/pipeline", useSearchParams: () => search }));
const fetched: Record<string, unknown> = {};
vi.mock("@/lib/useFetch", () => ({ useFetch: (url: string | null) => ({ data: url ? fetched[url] ?? null : null, loading: false, error: null, reload: () => {} }) }));

const deal = (id: number, name: string, key: string | null, priority: number | null, at: string, extra: Record<string, unknown> = {}) => ({
  id, fund_id: 1, entry_type: "inbound", stage: "screening", status: "applied", founder: { id, full_name: `Founder ${id}` }, company: { id, name, sector: "fintech", one_liner: `${name} does things` },
  thesis_fit_score: 50, thesis_fit_stale: false, surfaced_reason: "", first_signal_at: at, recommendation_at: null, founder_score: { score: 42, confidence: 0.5 }, is_demo: true,
  next_action: key === "review_recommendation" ? "Review Recommendation" : key === "review_application" ? "Review Application" : key === "resolve_diligence" ? "Resolve 4 Diligence Questions" : null,
  next_action_key: key, next_action_detail: null, priority, age_days: 1, momentum: null, ...extra,
});
const deals = () => [
  deal(1, "Newer Co", "review_application", 2, "2026-11-10T10:00:00Z"),
  deal(2, "Older Co", "review_application", 2, "2026-11-10T08:00:00Z", { entry_type: "outbound" }),
  deal(3, "Rec Co", "review_recommendation", 1, "2026-11-12T00:00:00Z", { stage: "diligence" }),
  deal(4, "Dil Co", "resolve_diligence", 3, "2026-11-01T00:00:00Z", { stage: "diligence", age_days: 9 }),
];
function load(items = deals()) {
  fetched["/api/pipeline"] = { items };
  fetched["/api/dashboard"] = { stage_counts: { sourcing: 3 }, thesis: { fund_name: "Northstar" } };
}
async function renderPipeline() {
  const { default: Pipeline } = await import("@/app/vc/pipeline/page");
  return render(<Pipeline />);
}
const column = (s: string) => screen.getByTestId(`column-${s}`);
const cardsIn = (s: string) => within(column(s)).queryAllByTestId(/^deal-card-/).map((c) => c.getAttribute("data-testid"));

afterEach(() => { cleanup(); search = new URLSearchParams(); replace.mockClear(); push.mockClear(); for (const k of Object.keys(fetched)) delete fetched[k]; });

describe("Pipeline board", () => {
  it("lays deals out by stage, in the deck's order, with Sourcing as a summary", async () => {
    load();
    await renderPipeline();
    expect(within(column("sourcing")).getByText(/Leads in Founders/)).toHaveTextContent("3 Leads in Founders");
    expect(within(column("sourcing")).queryAllByTestId(/^deal-card-/)).toHaveLength(0);
    // same priority: the one waiting longer first, though the API lists it second
    expect(cardsIn("screening")).toEqual(["deal-card-2", "deal-card-1"]);
    expect(cardsIn("diligence")).toEqual(["deal-card-3", "deal-card-4"]);
    expect(within(column("screening")).getByRole("heading")).toHaveTextContent("Screening2");
  });

  it("names the same deal in the header action as the card the board marks Next Up", async () => {
    load();
    await renderPipeline();
    // the header's action (also repeated in the condensed header that appears on scroll)
    const primaries = screen.getAllByTestId("pipeline-primary");
    for (const p of primaries) {
      expect(p).toHaveTextContent("Review Recommendation: Rec Co");
      expect(p).toHaveAttribute("href", "/vc/opportunities/3?tab=decision");
    }
    expect(within(screen.getByTestId("deal-card-3")).getByText("Next Up")).toBeInTheDocument();
    expect(new Set([...document.querySelectorAll(".btn-primary")].map((b) => b.getAttribute("href"))).size).toBe(1);
    expect(screen.getAllByText("Next Up")).toHaveLength(1);
  });

  it("says honestly what puts a deal in an empty column", async () => {
    load();
    await renderPipeline();
    expect(screen.getByTestId("empty-decision")).toHaveTextContent("No action moves a deal here yet. Recording a decision doesn't change a deal's stage.");
  });

  it("shows the next action, the two measures, how long it waited and the long-wait mark", async () => {
    load();
    await renderPipeline();
    const card = screen.getByTestId("deal-card-4");
    expect(card).toHaveTextContent("Resolve 4 Diligence Questions");
    expect(card).toHaveTextContent("Thesis Fit50");
    expect(card).toHaveTextContent("Founder Score42");
    expect(within(card).getByTestId("deal-waiting")).toHaveTextContent("Waiting 9d");
    expect(within(card).getByTestId("deal-waiting").className).toContain("text-caution");
    expect(within(screen.getByTestId("deal-card-1")).getByTestId("deal-waiting").className).not.toContain("text-caution");
    expect(within(screen.getByTestId("deal-card-3")).getByLabelText("Waiting on You")).toBeInTheDocument();
    expect(within(card).queryByLabelText("Waiting on You")).toBeNull();
  });

  it("filters by source and Needs Me through the URL, and Dashboard links still land", async () => {
    load();
    await renderPipeline();
    fireEvent.click(screen.getByRole("button", { name: "Outbound" }));
    expect(replace).toHaveBeenLastCalledWith("/vc/pipeline?source=outbound", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: /Needs Me/ }));
    expect(replace).toHaveBeenLastCalledWith("/vc/pipeline?mine=1", { scroll: false });
    cleanup();
    search = new URLSearchParams("next=review_recommendation");
    await renderPipeline();
    expect(cardsIn("diligence")).toEqual(["deal-card-3"]);
    expect(cardsIn("screening")).toEqual([]);
    expect(screen.getByRole("button", { name: "Remove Filter: Recommendations to Review" })).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-showing")).toHaveTextContent("Showing 1 of 4");
  });

  it("opens a preview from a card and keeps it in the URL; a second click opens the record", async () => {
    load();
    await renderPipeline();
    fireEvent.click(screen.getByTestId("deal-card-2"));
    expect(push).toHaveBeenLastCalledWith("/vc/pipeline?deal=2", { scroll: false });
    cleanup();
    search = new URLSearchParams("deal=2");
    fetched["/api/opportunities/2"] = { id: 2, current_recommendation: null, debate: null, diligence: [], evidence: [] };
    await renderPipeline();
    const preview = screen.getByTestId("deal-preview");
    expect(within(preview).getByRole("heading", { name: "Older Co" })).toBeInTheDocument();
    expect(within(preview).getByRole("link", { name: /Review Application/ })).toHaveAttribute("href", "/vc/opportunities/2");
    expect(within(preview).getByRole("link", { name: "Open Record" })).toHaveAttribute("href", "/vc/opportunities/2");
    // J moves to the next card in board order, K back; Escape closes
    fireEvent.keyDown(document.body, { key: "j" });
    expect(replace).toHaveBeenLastCalledWith("/vc/pipeline?deal=1", { scroll: false });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(replace).toHaveBeenLastCalledWith("/vc/pipeline", { scroll: false });
    fireEvent.click(screen.getByTestId("deal-card-2"));
    expect(push).toHaveBeenLastCalledWith("/vc/opportunities/2");
  });

  it("moves a card to its new column when its stage changes", async () => {
    load();
    const { rerender } = await renderPipeline();
    expect(cardsIn("screening")).toContain("deal-card-1");
    fetched["/api/pipeline"] = { items: deals().map((d) => (d.id === 1 ? { ...d, stage: "diligence", next_action_key: "review_recommendation", next_action: "Review Recommendation", priority: 1 } : d)) };
    const { default: Pipeline } = await import("@/app/vc/pipeline/page");
    rerender(<Pipeline />);
    expect(cardsIn("screening")).toEqual(["deal-card-2"]);
    expect(cardsIn("diligence")).toContain("deal-card-1");
    expect(within(column("screening")).getByRole("heading")).toHaveTextContent("Screening1");
  });

  it("keeps 30 deals in one column, each a full card", async () => {
    load(Array.from({ length: 30 }, (_, i) => deal(100 + i, `Volume ${i}`, "review_application", 2, `2026-11-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`)));
    await renderPipeline();
    expect(cardsIn("screening")).toHaveLength(30);
    const list = within(column("screening")).getByRole("list");
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-/);
  });

  it("an empty pipeline explains how deals arrive, with one fitting action", async () => {
    fetched["/api/pipeline"] = { items: [] };
    fetched["/api/dashboard"] = { stage_counts: {}, thesis: null };
    await renderPipeline();
    expect(screen.getByText(/a founder applies through the founder portal, or you move a lead to Screening/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Thesis" })).toHaveAttribute("href", "/vc/fund?edit=1");
  });
});

describe("Pipeline list view", () => {
  it("is a switch away, remembered in the URL, and filters a ?stage= link", async () => {
    load();
    await renderPipeline();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(replace).toHaveBeenLastCalledWith("/vc/pipeline?view=list", { scroll: false });
    cleanup();
    search = new URLSearchParams("view=list&stage=diligence");
    await renderPipeline();
    expect(screen.getAllByTestId(/^deal-row-/).map((r) => r.getAttribute("data-testid"))).toEqual(["deal-row-3", "deal-row-4"]);
    expect(screen.getByRole("button", { name: "Remove Filter: Diligence" })).toBeInTheDocument();
  });

  it("sorts by a column from the URL", async () => {
    load();
    search = new URLSearchParams("view=list&sort=waiting");
    await renderPipeline();
    expect(screen.getAllByTestId(/^deal-row-/)[0]).toHaveAttribute("data-testid", "deal-row-4");
  });
});
