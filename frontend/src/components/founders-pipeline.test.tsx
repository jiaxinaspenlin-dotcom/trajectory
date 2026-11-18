import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FoundersTable } from "./FoundersTable";
import { PipelineTable } from "./PipelineTable";
import { filterDeals, leadStatus, matchesFounderView, parseSource, parseStage, sortDeals, sortLeads } from "@/lib/pipeline";
import { FounderLead, PipelineDeal } from "@/lib/types";
import { momentum } from "@/test/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const founder = {
  id: 7, full_name: "Ada Builder", github_username: "ada", location: "Boston", headline: null, bio: "",
  is_demo: false, education: [], work_history: [], accelerators: [], prior_funding: [],
};

function lead(overrides: Partial<FounderLead> = {}): FounderLead {
  return {
    id: 11, fund_id: 1, entry_type: "outbound", stage: "sourcing", status: "prospect",
    founder, company: null, thesis_fit_score: 0, surfaced_reason: "", first_signal_at: "2026-11-01T00:00:00Z",
    recommendation_at: null, founder_score: null, is_demo: false,
    evidence_count: 0, top_project: null, ...overrides,
  };
}

function deal(overrides: Partial<PipelineDeal> = {}): PipelineDeal {
  return { ...lead({ stage: "screening", status: "applied" }), next_action: "Run analysis", priority: 4, age_days: 3, ...overrides };
}

describe("FoundersTable", () => {
  it("renders a founder with no company, plus momentum and evidence when available", () => {
    render(
      <FoundersTable
        leads={[lead({
          momentum,
          evidence_count: 4,
          top_project: { name: "ledgerkit", url: "https://github.com/ada/ledgerkit", stars: 42 },
          founder_score: { id: 1, founder_id: 7, version: 1, score: 61.4, confidence: 0.5, components: [], explanation: "", evidence_ids: [], computed_at: "" },
        })]}
        overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}}
      />
    );
    const row = screen.getByTestId("founder-row-11");
    expect(within(row).getByRole("link", { name: "Ada Builder" })).toHaveAttribute("href", "/vc/opportunities/11");
    expect(within(row).getByText(/No Company Yet/)).toBeInTheDocument();
    expect(within(row).getByText("ledgerkit ↗")).toBeInTheDocument();
    expect(within(row).getByText("61")).toBeInTheDocument();
    expect(within(row).getByText(/Accelerating/)).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();
    // one link opens the record; there is no repeated Review button
    expect(within(row).queryByRole("link", { name: /Review/ })).toBeNull();
  });

  it("says so honestly when there is no score, evidence, or project", () => {
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    expect(screen.getByText("Not Scored")).toBeInTheDocument();
    expect(screen.getByText("None Yet")).toBeInTheDocument();
    expect(screen.getByText("No Company Yet")).toBeInTheDocument();
  });

  it("asks for confirmation before moving to screening, then calls with the same ID", async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={move} />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions for Ada Builder" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to Screening…" }));
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Move Ada Builder to Screening?" })).toHaveTextContent("No outreach is sent");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Move" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(11));
  });

  it("links a lead already in the pipeline instead of offering the move again", async () => {
    render(<FoundersTable leads={[lead({ stage: "screening", status: "applied" })]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    // the shared stage is shown, not a pseudo-status
    expect(screen.getByText("Screening")).toBeInTheDocument();
    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More Actions for Ada Builder" }));
    expect(await screen.findByRole("menuitem", { name: "View in Pipeline · Screening" })).toHaveAttribute("href", "/vc/pipeline?stage=screening");
    expect(screen.queryByRole("menuitem", { name: "Move to Screening…" })).not.toBeInTheDocument();
  });

  it("opens the existing opportunity detail when a row is clicked", () => {
    push.mockClear();
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    fireEvent.click(screen.getByText("No Company Yet"));
    expect(push).toHaveBeenCalledWith("/vc/opportunities/11");
  });
});

describe("FoundersTable sorting", () => {
  it("sorts by a column header and reports aria-sort", () => {
    const score = (v: number) => ({ id: 1, founder_id: 1, version: 1, score: v, confidence: 1, components: [], explanation: "", evidence_ids: [], computed_at: "" });
    render(
      <FoundersTable
        leads={[
          lead({ id: 1, founder: { ...founder, full_name: "Bea" }, founder_score: score(20) }),
          lead({ id: 2, founder: { ...founder, full_name: "Ann" }, founder_score: score(80) }),
          lead({ id: 3, founder: { ...founder, full_name: "Cal" }, founder_score: null }),
        ]}
        overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}}
      />
    );
    const order = () => screen.getAllByTestId(/founder-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order()).toEqual(["founder-row-1", "founder-row-2", "founder-row-3"]);
    fireEvent.click(screen.getByRole("button", { name: /Score/ }));
    expect(order()).toEqual(["founder-row-2", "founder-row-1", "founder-row-3"]);
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Founder/ }));
    expect(order()).toEqual(["founder-row-2", "founder-row-1", "founder-row-3"]);
    expect(screen.getByRole("columnheader", { name: /^Founder$/ })).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("PipelineTable", () => {
  it("shows source, stage, next action, and honest missing fit; the row's action appears once", () => {
    render(<PipelineTable deals={[deal()]} />);
    const row = screen.getByTestId("deal-row-11");
    expect(within(row).getByText(/Outbound ·/)).toBeInTheDocument();
    expect(within(row).getByText("Screening")).toBeInTheDocument();
    // the next action is the row's one link, to where it's done
    expect(within(row).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([["Run analysis", "/vc/opportunities/11"]]);
    expect(within(row).getByText("No Company")).toBeInTheDocument();
    // the whole row opens it too
    fireEvent.click(within(row).getByText("Ada Builder"));
    expect(push).toHaveBeenCalledWith("/vc/opportunities/11");
  });

  it("links a recommendation awaiting review to the decision panel", () => {
    render(<PipelineTable deals={[deal({ next_action: "Review recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Continue diligence", priority: 1 })]} />);
    const row = screen.getByTestId("deal-row-11");
    expect(within(row).getByRole("link", { name: /Review recommendation/ })).toHaveAttribute("href", "/vc/opportunities/11?tab=decision");
    expect(within(row).getByText("Recommended: Continue diligence")).toBeInTheDocument();
    expect(within(row).getByLabelText("Awaiting Your Review")).toBeInTheDocument();
  });

  it("marks decided deals as having no next action", () => {
    render(<PipelineTable deals={[deal({ next_action: null, priority: null, stage: "decision" })]} />);
    expect(within(screen.getByTestId("deal-row-11")).getByText("None — Decided")).toBeInTheDocument();
  });

  it("lays deals out as a list on narrower screens, with the same single action", () => {
    render(<PipelineTable deals={[deal()]} />);
    const card = screen.getByTestId("deal-card-11");
    expect(within(card).getAllByRole("link")).toHaveLength(1);
  });
});

describe("sortDeals", () => {
  it("puts deals awaiting review first, then the oldest waiting, then by id", () => {
    const deals = [
      deal({ id: 1, priority: 2, first_signal_at: "2026-10-01T00:00:00Z" }),
      deal({ id: 2, priority: 1, first_signal_at: "2026-11-10T00:00:00Z" }),
      deal({ id: 3, priority: 1, first_signal_at: "2026-11-01T00:00:00Z" }),
      deal({ id: 4, priority: 1, first_signal_at: "2026-11-01T00:00:00Z" }),
      deal({ id: 5, priority: null, next_action: null }),
    ];
    expect(sortDeals(deals).map((d) => d.id)).toEqual([3, 4, 2, 1, 5]);
  });
});

describe("pipeline helpers", () => {
  it("filters deals by stage and source", () => {
    const deals = [
      deal({ id: 1 }),
      deal({ id: 2, entry_type: "inbound", stage: "diligence" }),
      deal({ id: 3, entry_type: "inbound" }),
    ];
    expect(filterDeals(deals, "all", "all").map((d) => d.id)).toEqual([1, 2, 3]);
    expect(filterDeals(deals, "screening", "all").map((d) => d.id)).toEqual([1, 3]);
    expect(filterDeals(deals, "screening", "inbound").map((d) => d.id)).toEqual([3]);
  });

  it("rejects unknown URL filter values", () => {
    expect(parseStage("diligence")).toBe("diligence");
    expect(parseStage("sourcing")).toBe("all");
    expect(parseSource("referral")).toBe("all");
  });

  it("keeps saved and dismissed leads discoverable via views", () => {
    const l = lead({ status: "saved" });
    expect(matchesFounderView(l, null, "pinned")).toBe(true);
    expect(matchesFounderView(l, "dismissed", "active")).toBe(false);
    expect(matchesFounderView(l, "dismissed", "dismissed")).toBe(true);
    expect(leadStatus(lead({ status: "applied" }), null)).toBe("in_pipeline");
    expect(leadStatus(lead({ entry_type: "inbound", status: "applied" }), null)).toBe("applied");
  });

  it("pins saved leads first, then sorts by founder score", () => {
    const score = (s: number) => ({ id: 1, founder_id: 1, version: 1, score: s, confidence: 1, components: [], explanation: "", evidence_ids: [], computed_at: "" });
    const sorted = sortLeads(
      [lead({ id: 1, founder_score: score(50) }), lead({ id: 2 }), lead({ id: 3, founder_score: score(80) }), lead({ id: 4, founder_score: score(10) })],
      { 4: "monitoring" }
    );
    expect(sorted.map((l) => l.id)).toEqual([4, 3, 1, 2]);
  });
});

describe("FoundersTable row menu and phones", () => {
  it("keeps my shortlist in the row's one menu", async () => {
    const onSetStatus = vi.fn();
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={onSetStatus} onMoveToScreening={async () => {}} />);
    const row = screen.getByTestId("founder-row-11");
    expect(within(row).getAllByRole("button", { name: /More Actions/ })).toHaveLength(1);
    expect(within(row).queryByRole("combobox")).toBeNull();
    const more = within(row).getByRole("button", { name: "More Actions for Ada Builder" });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Monitoring/ }));
    expect(onSetStatus).toHaveBeenCalledWith(11, "monitoring");
  });

  it("marks the shortlist value the row's badge shows, mine or the shared record's", async () => {
    const onSetStatus = vi.fn();
    const { unmount } = render(<FoundersTable leads={[lead({ status: "saved" })]} overlay={{}} onSetStatus={onSetStatus} onMoveToScreening={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions for Ada Builder" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: /Saved/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /Monitoring/ })).toHaveAttribute("aria-checked", "false");
    // held on the shared record: it can be removed, by choosing it again or by Remove from Shortlist
    expect(screen.getByRole("menuitem", { name: "Remove from Shortlist" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Saved/ }));
    expect(onSetStatus).toHaveBeenCalledWith(11, null);
    unmount();

    render(<FoundersTable leads={[lead({ status: "saved" })]} overlay={{ 11: "monitoring" }} onSetStatus={onSetStatus} onMoveToScreening={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions for Ada Builder" }));
    const mine = await screen.findByRole("menuitemcheckbox", { name: /Monitoring/ });
    expect(mine).toHaveAttribute("aria-checked", "true");
    expect(mine.querySelector("[aria-hidden]")).not.toHaveClass("invisible");
    expect(screen.getByRole("menuitemcheckbox", { name: /Saved/ })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(mine);
    expect(onSetStatus).toHaveBeenLastCalledWith(11, null);
  });

  it("stacks each row on phones with the record and the menu reachable", () => {
    push.mockClear();
    render(<FoundersTable layout="stacked" leads={[lead({ evidence_count: 4 })]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByTestId("founder-row-11");
    expect(within(card).getByRole("link", { name: "Ada Builder" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "More Actions for Ada Builder" })).toBeInTheDocument();
    expect(within(card).getByText("Evidence")).toBeInTheDocument();
    fireEvent.click(within(card).getByText("No Company Yet"));
    expect(push).toHaveBeenCalledWith("/vc/opportunities/11");
  });
});
