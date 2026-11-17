// Dashboard: the next action first with one primary button, the rest grouped by
// kind of work with real counts, stages as one bar, and exactly one action in an
// empty workspace.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/vc", useSearchParams: () => new URLSearchParams() }));
const fetched: Record<string, unknown> = {};
vi.mock("@/lib/useFetch", () => ({
  useFetch: (url: string) => ({ data: fetched[url] ?? null, loading: false, error: null, reload: () => {} }),
}));
vi.mock("@/lib/api", () => ({ api: { put: vi.fn().mockResolvedValue({}) } }));

const deal = (id: number, name: string, stage: string, key: string, priority: number) => ({
  id, fund_id: 1, entry_type: "inbound", stage, status: "applied", founder: null, company: { id, name, sector: "fintech", one_liner: "" },
  thesis_fit_score: 50, surfaced_reason: "", first_signal_at: "2026-11-01T00:00:00Z", recommendation_at: null, founder_score: null, is_demo: true,
  next_action: "x", next_action_key: key, priority, age_days: 1,
});
const lead = (id: number, name: string) => ({ ...deal(id, name, "sourcing", "run_analysis", 4), entry_type: "outbound", status: "prospect", evidence_count: 2, top_project: null });
const queue = [
  { opportunity_id: 3, name: "Inferra", founder_name: null, entry_type: "outbound", stage: "diligence", next_action: "Review Recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Continue Diligence", priority: 1, age_days: 0 },
  { opportunity_id: 2, name: "PayMesh", founder_name: null, entry_type: "outbound", stage: "diligence", next_action: "Review Recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Monitor", priority: 1, age_days: 0 },
];

function populated() {
  fetched["/api/dashboard"] = {
    thesis: { fund_name: "Northstar Ventures (Demo)", sectors: [], stages: [], geographies: [] },
    stage_counts: { sourcing: 2, screening: 1, diligence: 2 },
    action_queue: queue,
    recent_evidence: [{ id: 9, kind: "github_repo", title: "Public repository: aep", source_name: "GitHub", collected_at: new Date().toISOString(), opportunity_id: 3, opportunity_name: "Inferra" }],
  };
  fetched["/api/pipeline"] = { items: [deal(3, "Inferra", "diligence", "review_recommendation", 1), deal(2, "PayMesh", "diligence", "review_recommendation", 1), deal(4, "TerraSignal", "screening", "review_application", 2)] };
  fetched["/api/sourcing/prospects"] = { items: [lead(5, "CareBridge"), lead(6, "ForgeTools")] };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const k of Object.keys(fetched)) delete fetched[k];
});

async function renderDashboard() {
  localStorage.setItem("trajectory_tour_seen_anon", "1");
  const { default: Dashboard } = await import("@/app/vc/page");
  render(<Dashboard />);
}

describe("Dashboard", () => {
  it("leads with one task and one primary button; a recommendation opens the Decision tab", async () => {
    populated();
    await renderDashboard();
    const now = screen.getByRole("region", { name: "Right Now" });
    expect(within(now).getByText("Inferra")).toBeInTheDocument();
    expect(within(now).getByRole("link", { name: /Review Recommendation/ })).toHaveAttribute("href", "/vc/opportunities/3?tab=decision");
    // one primary action on the page
    expect(document.querySelectorAll(".btn-primary, .btn-lg").length).toBe(1);
    // the whole panel opens it too
    fireEvent.click(within(now).getByText("Recommended: Continue Diligence"));
    expect(push).toHaveBeenCalledWith("/vc/opportunities/3?tab=decision");
  });

  it("groups what else is waiting by kind of work, with real counts and filtered lists", async () => {
    populated();
    await renderDashboard();
    const waiting = screen.getByRole("region", { name: "Also Waiting" });
    const links = within(waiting).getAllByRole("link");
    // Inferra is Right Now: the groups leave it out, and "1 of N" is it plus the groups
    expect(links.map((l) => [l.getAttribute("href"), l.textContent])).toEqual([
      ["/vc/pipeline?next=review_recommendation", expect.stringContaining("1Recommendation to Review")],
      ["/vc/pipeline?next=review_application", expect.stringContaining("1Application to Review")],
      ["/vc/founders", expect.stringContaining("2New Leads")],
    ]);
    expect(within(waiting).queryByText(/Inferra/)).toBeNull();
    expect(within(waiting).getByText("PayMesh")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Right Now" })).getByText(/1 of 5/)).toBeInTheDocument();
    // no row per company with the same button
    expect(within(waiting).queryByRole("button")).toBeNull();
  });

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

  it("drops what this browser already decided or dismissed", async () => {
    populated();
    localStorage.setItem("trajectory_investor_decisions", JSON.stringify({ 3: { decision: "advance" } }));
    await renderDashboard();
    const now = screen.getByRole("region", { name: "Right Now" });
    expect(within(now).getByText("PayMesh")).toBeInTheDocument();
  });

  it("an empty workspace shows exactly one setup action", async () => {
    fetched["/api/dashboard"] = { thesis: null, stage_counts: {}, action_queue: [], recent_evidence: [] };
    fetched["/api/pipeline"] = { items: [] };
    fetched["/api/sourcing/prospects"] = { items: [] };
    await renderDashboard();
    const actions = [...document.querySelectorAll("main a, main button, a.btn-primary, button")].filter((el) => !el.closest("[aria-hidden='true']"));
    expect(actions.map((a) => a.textContent)).toEqual(["Create Thesis"]);
    expect(screen.getByRole("link", { name: "Create Thesis" })).toHaveAttribute("href", "/vc/fund?edit=1");
  });
});
