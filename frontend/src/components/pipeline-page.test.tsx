// Pipeline page: the header's one action is the top row's next step, and the
// Dashboard's ?next= filter narrows the list to that kind of work.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => "/vc/pipeline", useSearchParams: () => search }));
const fetched: Record<string, unknown> = {};
vi.mock("@/lib/useFetch", () => ({ useFetch: (url: string) => ({ data: fetched[url] ?? null, loading: false, error: null, reload: () => {} }) }));

const deal = (id: number, name: string, key: string, priority: number, at: string) => ({
  id, fund_id: 1, entry_type: "inbound", stage: "screening", status: "applied", founder: null, company: { id, name, sector: "fintech", one_liner: "" },
  thesis_fit_score: 50, surfaced_reason: "", first_signal_at: at, recommendation_at: null, founder_score: null, is_demo: true,
  next_action: key === "review_recommendation" ? "Review Recommendation" : "Review Application", next_action_key: key, priority, age_days: 0,
});

afterEach(() => { cleanup(); search = new URLSearchParams(); });

describe("Pipeline page", () => {
  it("names the same company in the header action as the top row", async () => {
    // same priority; the older one waits longer, though the API lists it second
    fetched["/api/pipeline"] = { items: [
      deal(1, "Newer Co", "review_application", 2, "2026-11-10T10:00:00Z"),
      deal(2, "Older Co", "review_application", 2, "2026-11-10T08:00:00Z"),
      deal(3, "Rec Co", "review_recommendation", 1, "2026-11-12T00:00:00Z"),
    ] };
    const { default: Pipeline } = await import("@/app/vc/pipeline/page");
    render(<Pipeline />);
    const rows = screen.getAllByTestId(/^deal-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["deal-row-3", "deal-row-2", "deal-row-1"]);
    const primary = document.querySelector(".btn-primary")!;
    expect(primary).toHaveTextContent("Review Recommendation: Rec Co");
    search = new URLSearchParams("next=review_application");
    cleanup();
    render(<Pipeline />);
    expect(screen.getAllByTestId(/^deal-row-/).map((r) => r.getAttribute("data-testid"))).toEqual(["deal-row-2", "deal-row-1"]);
    expect(document.querySelector(".btn-primary")).toHaveTextContent("Review Application: Older Co");
    expect(screen.getByRole("button", { name: "Remove Filter: Applications to Review" })).toBeInTheDocument();
    expect(within(screen.getByTestId("pipeline-showing")).getByText("Showing 2 of 3")).toBeInTheDocument();
  });
});
