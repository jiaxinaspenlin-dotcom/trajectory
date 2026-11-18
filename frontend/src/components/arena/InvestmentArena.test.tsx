// The Arena: the whole argument visible at once (no hover needed), the verdict with
// one step forward, the balance bar's rule, replay in place, and honest edge states.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InvestmentArena } from "./InvestmentArena";
import { debate } from "@/test/fixtures";
import { debateTurns, refereePosition, relatedPoints, replayPosition } from "@/lib/arena";
import { Debate } from "@/lib/types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const full: Debate = {
  ...debate,
  generated_by: "demo",
  arguments: [
    { ...debate.arguments[0], points: [
      { text: "Founder Score is 25/100 with independent GitHub evidence.", evidence_ids: [23, 24, 25] },
      { text: "Founder Momentum is accelerating.", evidence_ids: [], unverified: true },
    ] },
    { ...debate.arguments[1], points: [
      { text: "Contradiction: 1,200 users on the application but 660 on slide 7.", evidence_ids: [], unverified: true },
      { text: "1 material claim is founder-reported and lacks independent corroboration.", evidence_ids: [24] },
    ] },
  ],
  referee: { ...debate.referee!, confidence: 0.56, strongest_bull_point: "Founder Score is 25/100 with independent GitHub evidence.", rationale: "Demo referee: evidence quality is mixed." },
};
const arena = (extra: Partial<React.ComponentProps<typeof InvestmentArena>> = {}) =>
  render(<InvestmentArena debate={full} opportunityId={3} decideHref="/vc/opportunities/3?tab=decision" memoHref="/vc/opportunities/3/memo" {...extra} />);

describe("Arena", () => {
  it("shows every point of both sides by default, with evidence links and Unverified marks", () => {
    arena();
    const bull = screen.getByTestId("arena-bull"), bear = screen.getByTestId("arena-bear");
    expect(bull).toHaveTextContent("Bull · Case to Advance");
    expect(bear).toHaveTextContent("Bear · Case for Caution");
    expect(within(bull).getAllByRole("listitem")).toHaveLength(2);
    expect(within(bear).getAllByRole("listitem")).toHaveLength(2);
    expect(within(bull).getByRole("link", { name: "3 Evidence Items" })).toHaveAttribute("href", "/vc/opportunities/3?tab=evidence&evidence=23");
    expect(within(screen.getByTestId("point-bull-1")).getByText("Unverified")).toBeInTheDocument();
    expect(within(screen.getByTestId("point-bull-0")).getByText("Strongest Point")).toBeInTheDocument();
    // no instructions about hovering, no stage, no folded memo
    expect(screen.queryByText(/Hover or focus/)).toBeNull();
    expect(screen.queryByText("Investment Memo")).toBeNull();
    expect(screen.getByRole("link", { name: "Read the Memo" })).toHaveAttribute("href", "/vc/opportunities/3/memo");
    // the Referee's line about evidence quality, once
    expect(screen.getAllByText(/judges evidence quality/)).toHaveLength(1);
  });

  it("leads with the verdict and one step forward", () => {
    arena();
    const verdict = screen.getByTestId("arena-verdict");
    expect(verdict).toHaveTextContent("Referee Recommends");
    expect(verdict).toHaveTextContent("Continue Diligence");
    expect(verdict).toHaveTextContent("56%");
    expect(verdict).toHaveTextContent("Evidence quality is mixed.");
    expect(verdict).not.toHaveTextContent("Demo referee");
    expect(within(verdict).getByRole("link", { name: /Decide/ })).toHaveAttribute("href", "/vc/opportunities/3?tab=decision");
    expect(document.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("with a decision recorded, shows it instead of Decide, and says when the debate is newer", () => {
    arena({ decision: { decision: "approved", chosen_action: "Monitor", decided_by: "Ana", decided_at: "2026-07-01T00:00:00Z" } });
    expect(screen.getByTestId("arena-decided")).toHaveTextContent("Decided: Monitor");
    expect(screen.getByRole("link", { name: "See the Decision" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Decide/ })).toBeNull();
    expect(screen.getByTestId("arena-updated")).toHaveTextContent("The debate was updated after this decision.");
  });

  it("places the Referee by the recommended action's side and its confidence, and nothing else", () => {
    expect(refereePosition("Continue Diligence", 0.56)).toBe(22);
    expect(refereePosition("Monitor", 0.65)).toBe(82.5);
    expect(refereePosition("Pass", 1)).toBe(100);
    expect(refereePosition("Invest", 0)).toBe(50);
    arena();
    expect(screen.getByTestId("balance-marker")).toHaveAttribute("data-position", "22");
    expect(screen.getByTestId("arena-balance")).toHaveTextContent("AdvanceLeans AdvanceCaution");
  });

  it("connects points on the two sides about the same evidence or figure", () => {
    const [b0] = full.arguments[0].points, [r0, r1] = full.arguments[1].points;
    expect(relatedPoints(b0, [r0, r1])).toEqual([{ index: 1, why: "Same Evidence" }]);
    expect(relatedPoints({ text: "Users reached 1,200.", evidence_ids: [] }, [r0])).toEqual([{ index: 0, why: "Same Figure" }]);
    arena();
    fireEvent.mouseEnter(screen.getByTestId("point-bull-0"));
    expect(within(screen.getByTestId("point-bear-1")).getByTestId("point-link")).toHaveTextContent("Same Evidence");
    expect(screen.getByTestId("point-bull-1").className).toContain("opacity-60");
    fireEvent.mouseLeave(screen.getByTestId("point-bull-0"));
    expect(screen.queryByTestId("point-link")).toBeNull();
  });

  it("replays in place, one turn at a time, and shows everything when it ends or is skipped", () => {
    vi.useFakeTimers();
    arena();
    expect(debateTurns(full.arguments[0].points, full.arguments[1].points).map((t) => t.side)).toEqual(["bull", "bear", "bull", "bear", "referee"]);
    fireEvent.click(screen.getByTestId("replay-start"));
    expect(screen.getByTestId("replay-position")).toHaveTextContent("Turn 1 of 5");
    expect(screen.getByTestId("point-bull-0").className).not.toContain("invisible");
    expect(screen.getByTestId("point-bear-0").className).toContain("invisible");
    // keys: Space pauses, Right moves on, Left goes back
    const controls = screen.getByTestId("replay-controls");
    fireEvent.keyDown(controls, { key: " " });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.keyDown(controls, { key: "ArrowRight" });
    expect(screen.getByTestId("replay-position")).toHaveTextContent("Turn 2 of 5");
    expect(screen.getByTestId("point-bear-0").className).not.toContain("invisible");
    fireEvent.keyDown(controls, { key: "ArrowLeft" });
    expect(screen.getByTestId("replay-position")).toHaveTextContent("Turn 1 of 5");
    // playing runs to the verdict, then everything is shown again
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    for (let i = 0; i < 5; i++) act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.queryByTestId("replay-controls")).toBeNull();
    expect(document.querySelectorAll("li.invisible")).toHaveLength(0);
    // skipping does the same
    fireEvent.click(screen.getByTestId("replay-start"));
    fireEvent.click(screen.getByRole("button", { name: "Skip to End" }));
    expect(document.querySelectorAll("li.invisible")).toHaveLength(0);
  });

  it("moves the marker with the argument during a replay and ends on the verdict", () => {
    const turns = debateTurns(full.arguments[0].points, full.arguments[1].points);
    expect(replayPosition(turns, 0, 22)).toBe(40); // one Bull point
    expect(replayPosition(turns, 1, 22)).toBe(50); // then one Bear point
    expect(replayPosition(turns, 4, 22)).toBe(22); // the verdict
  });

  it("says plainly when a side has no points", () => {
    render(<InvestmentArena debate={{ ...full, arguments: [full.arguments[0], { ...full.arguments[1], points: [] }] }} opportunityId={3} />);
    expect(screen.getByTestId("arena-bear")).toHaveTextContent("The Bear made no points in this debate.");
  });

  it("without a debate, offers Run Analysis right there and shows progress", () => {
    const run = vi.fn();
    const { rerender } = render(<InvestmentArena debate={null} opportunityId={4} onRunAnalysis={run} />);
    expect(screen.getByTestId("arena-empty")).toHaveTextContent("No Debate Yet");
    fireEvent.click(screen.getByRole("button", { name: "Run Analysis" }));
    expect(run).toHaveBeenCalled();
    rerender(<InvestmentArena debate={null} opportunityId={4} onRunAnalysis={run} analysisBusy />);
    expect(screen.getByRole("status")).toHaveTextContent(/this can take a minute/);
  });

  it("keeps the Demo mark, the version and when it was generated", () => {
    arena();
    expect(screen.getByText("Demo Data")).toBeInTheDocument();
    expect(screen.getByText(/v1 · Generated/)).toBeInTheDocument();
  });

  it("on the memo page, is read-only: no Decide and no replay", () => {
    render(<InvestmentArena debate={full} opportunityId={3} compact />);
    expect(screen.queryByRole("link", { name: /Decide/ })).toBeNull();
    expect(screen.queryByTestId("replay-start")).toBeNull();
    expect(screen.getByTestId("arena-bull")).toBeInTheDocument();
  });
});
