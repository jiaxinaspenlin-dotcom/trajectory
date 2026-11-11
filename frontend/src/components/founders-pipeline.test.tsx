import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FoundersTable } from "./FoundersTable";
import { PipelineTable } from "./PipelineTable";
import { filterDeals, leadStatus, matchesFounderView, parseSource, parseStage, sortLeads } from "@/lib/pipeline";
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
    expect(within(row).getByText("Ada Builder")).toHaveAttribute("href", "/vc/opportunities/11");
    expect(within(row).getByText(/No company yet/)).toBeInTheDocument();
    expect(within(row).getByText("ledgerkit ↗")).toBeInTheDocument();
    expect(within(row).getByText("Score 61")).toBeInTheDocument();
    expect(within(row).getByText(/Accelerating/)).toBeInTheDocument();
    expect(within(row).getByText("4 evidence items")).toBeInTheDocument();
    expect(within(row).getByText("Review →")).toHaveAttribute("href", "/vc/opportunities/11");
  });

  it("says so honestly when there is no score, evidence, or project", () => {
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    expect(screen.getByText("Not scored")).toBeInTheDocument();
    expect(screen.getByText("No evidence collected yet")).toBeInTheDocument();
    expect(screen.getByText("No company yet")).toBeInTheDocument();
  });

  it("asks for confirmation before moving to screening, then calls with the same ID", async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={move} />);
    fireEvent.click(screen.getByText("Move to Screening"));
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByText(/No outreach is sent/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm move"));
    await waitFor(() => expect(move).toHaveBeenCalledWith(11));
  });

  it("links a lead already in the pipeline instead of offering the move again", () => {
    render(<FoundersTable leads={[lead({ stage: "screening", status: "applied" })]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    expect(screen.queryByText("Move to Screening")).not.toBeInTheDocument();
    expect(screen.getByText("View in Pipeline")).toHaveAttribute("href", "/vc/pipeline?stage=screening");
    expect(screen.getByText("In Pipeline")).toBeInTheDocument();
    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
  });

  it("opens the existing opportunity detail when a row is clicked", () => {
    push.mockClear();
    render(<FoundersTable leads={[lead()]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    fireEvent.click(screen.getByText("No company yet"));
    expect(push).toHaveBeenCalledWith("/vc/opportunities/11");
  });
});

describe("PipelineTable", () => {
  it("shows source, stage, next action, and honest missing fit", () => {
    render(<PipelineTable deals={[deal()]} />);
    const row = screen.getByTestId("deal-row-11");
    expect(within(row).getByText("Outbound")).toBeInTheDocument();
    expect(within(row).getByText("Screening")).toBeInTheDocument();
    expect(within(row).getByText("Run analysis")).toBeInTheDocument();
    expect(within(row).getByText("Not computed")).toBeInTheDocument();
    expect(within(row).getByText("Ada Builder")).toHaveAttribute("href", "/vc/opportunities/11");
  });

  it("marks decided deals as having no next action", () => {
    render(<PipelineTable deals={[deal({ next_action: null, priority: null, stage: "decision" })]} />);
    expect(screen.getByText("None — decided")).toBeInTheDocument();
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
