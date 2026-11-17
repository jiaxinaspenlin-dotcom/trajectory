import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Tabs, tabPanelProps } from "./Tabs";
import { EvidenceLinkProvider, EvidenceRef } from "./EvidenceRef";
import { HumanDecisionPanel } from "./HumanDecisionPanel";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
afterEach(() => { get.mockReset(); post.mockReset(); });

function Demo() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return (
    <>
      <Tabs label="Sections" idPrefix="t" value={v} onChange={setV}
        tabs={[{ key: "a", label: "Alpha" }, { key: "b", label: "Beta" }, { key: "c", label: "Gamma" }]} />
      <div {...tabPanelProps("t", v)}>panel {v}</div>
    </>
  );
}

describe("Tabs", () => {
  it("shows one panel, marks the selected tab, and supports arrow/Home/End keys", () => {
    render(<Demo />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha).toHaveAttribute("aria-selected", "true");
    expect(alpha).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "t-tab-a");

    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "End" });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel c");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Gamma" }), { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel c");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });
});

describe("evidence citations", () => {
  it("link to the exact evidence entry inside a record, and stay plain elsewhere", () => {
    const { rerender } = render(
      <EvidenceLinkProvider href={(id) => `/vc/opportunities/3?tab=evidence&evidence=${id}`}><EvidenceRef id={42} /></EvidenceLinkProvider>
    );
    expect(screen.getByRole("link", { name: "Evidence E42" })).toHaveAttribute("href", "/vc/opportunities/3?tab=evidence&evidence=42");
    rerender(<EvidenceRef id={42} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("E42")).toBeInTheDocument();
  });
});

describe("HumanDecisionPanel", () => {
  const rec = { action: "Continue Diligence", confidence: 0.6, rationale: "Strong execution" };
  const why = {
    reasons: [{ text: "Founder Score is 25/100 with independent GitHub evidence.", href: "/vc/opportunities/5?tab=evidence&evidence=23", linkLabel: "See Evidence (5)", unverified: false }],
    risk: { text: "Contradiction: reported users differ.", href: "/vc/opportunities/5?tab=claims", linkLabel: "See the Claims", unverified: true },
  };
  const recorded = (decision: string, chosen_action: string) => ({ human_decision: { decision, chosen_action, decided_by: "Demo Investor", decided_at: "", notes: "", system_recommended_action: "Continue Diligence" } });
  const panel = (extra: Partial<React.ComponentProps<typeof HumanDecisionPanel>> = {}) =>
    render(<HumanDecisionPanel opportunityId={5} recommendation={rec} why={why} onDecision={() => {}} {...extra} />);

  it("shows why first: the recommendation, its reasons and the main risk, each linked", () => {
    get.mockResolvedValue({ items: [] });
    panel();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Evidence (5)" })).toHaveAttribute("href", "/vc/opportunities/5?tab=evidence&evidence=23");
    expect(screen.getByTestId("decision-risk")).toHaveTextContent("Contradiction: reported users differ.");
    expect(screen.getByTestId("decision-risk")).toHaveTextContent("Unverified");
    expect(screen.getByRole("link", { name: "See the Claims" })).toHaveAttribute("href", "/vc/opportunities/5?tab=claims");
  });

  it("says plainly when there are no reasons", () => {
    get.mockResolvedValue({ items: [] });
    panel({ why: { reasons: [], risk: null } });
    expect(screen.getByText(/No reasons are recorded for this recommendation yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("decision-risk")).toBeNull();
  });

  it("starts with nothing chosen and records nothing without an explicit choice", async () => {
    get.mockResolvedValue({ items: [] });
    panel();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    for (const r of screen.getAllByRole("radio")) expect(r).not.toBeChecked();
    expect(screen.queryByTestId("action-picker")).toBeNull();
    const confirm = screen.getByTestId("confirm-decision");
    expect(confirm).toHaveTextContent("Record Your Decision");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an answer above first.");
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ["Agree: Continue Diligence", "Record: Continue Diligence", "approved", "Continue Diligence"],
    ["Not Now", "Record: Not Now", "deferred", "Continue Diligence"],
    ["Pass", "Record: Pass", "rejected", "Pass"],
  ])("%s records outcome and action", async (choice, label, decision, action) => {
    get.mockResolvedValue({ items: [] });
    panel();
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${choice}`) }));
    expect(screen.queryByTestId("action-picker")).toBeNull();
    expect(screen.getByTestId("confirm-decision")).toHaveTextContent(label);
    post.mockResolvedValueOnce(recorded(decision, action));
    fireEvent.click(screen.getByTestId("confirm-decision"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/opportunities/5/decision", { decided_by: "Demo Investor", decision, chosen_action: action, notes: "" }));
    expect(await screen.findByText("Decision Recorded")).toBeInTheDocument();
  });

  it("asks for an action only for a different action, and records an override", async () => {
    get.mockResolvedValue({ items: [] });
    panel();
    fireEvent.click(screen.getByRole("radio", { name: /^Choose a Different Action/ }));
    const picker = screen.getByTestId("action-picker");
    // a short list, not a dropdown, without the recommended action
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(picker).not.toHaveTextContent("Continue Diligence");
    fireEvent.click(screen.getByTestId("confirm-decision"));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick the action you'd take instead.");
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Monitor" }));
    expect(screen.getByTestId("confirm-decision")).toHaveTextContent("Record: Monitor");
    // a note and a different decider are optional extras
    fireEvent.click(screen.getByRole("button", { name: "Add a Note" }));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Wait for Q1 numbers" } });
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Deciding As"), { target: { value: "Ana" } });
    post.mockResolvedValueOnce(recorded("overridden", "Monitor"));
    fireEvent.click(screen.getByTestId("confirm-decision"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/opportunities/5/decision", { decided_by: "Ana", decision: "overridden", chosen_action: "Monitor", notes: "Wait for Q1 numbers" }));
    // leaving the different action hides the picker again
  });

  it("hides the picker when another answer is chosen", () => {
    get.mockResolvedValue({ items: [] });
    panel();
    fireEvent.click(screen.getByRole("radio", { name: /^Choose a Different Action/ }));
    expect(screen.getByTestId("action-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Pass/ }));
    expect(screen.queryByTestId("action-picker")).toBeNull();
  });

  it("after recording, Next goes to the next card in the deck", async () => {
    get.mockResolvedValue({ items: [] });
    const next = { opportunity_id: 2, name: "PayMesh", founder_name: null, entry_type: "outbound", stage: "diligence", next_action: "Review Recommendation", next_action_key: "review_recommendation",
      next_action_detail: "Recommended: Monitor", priority: 1, age_days: 0, waiting_since: "", group: "recommendation" as const };
    panel({ next, dashboardHref: "/vc?card=2" });
    fireEvent.click(screen.getByRole("radio", { name: /^Agree/ }));
    post.mockResolvedValueOnce(recorded("approved", "Continue Diligence"));
    fireEvent.click(screen.getByTestId("confirm-decision"));
    const done = await screen.findByTestId("decision-recorded");
    expect(done).toHaveTextContent("Demo Investor agreed: Continue Diligence.");
    expect(screen.getByRole("link", { name: /Next: PayMesh/ })).toHaveAttribute("href", "/vc/opportunities/2?tab=decision&from=deck");
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/vc?card=2");
  });

  it("says when it was the last waiting record", async () => {
    get.mockResolvedValue({ items: [] });
    panel({ next: null, savedLocal: recorded("rejected", "Pass").human_decision });
    expect(screen.getByTestId("decision-recorded")).toHaveTextContent("Demo Investor passed.");
    expect(screen.queryByRole("link", { name: /Next:/ })).toBeNull();
    expect(screen.getByText("That was the last waiting record.")).toBeInTheDocument();
  });

  it("shows the latest decision, with the rest behind Show All", async () => {
    get.mockResolvedValue({ items: [
      { decision: "deferred", chosen_action: "Monitor", system_recommended_action: "Invest", decided_by: "Ana", decided_at: "2026-11-01T00:00:00Z", notes: "revisit Q1" },
      { decision: "approved", chosen_action: "Invest", system_recommended_action: "Invest", decided_by: "Ana", decided_at: "2026-11-02T00:00:00Z", notes: "" },
    ] });
    render(<HumanDecisionPanel opportunityId={5} recommendation={null} onDecision={() => {}} />);
    const list = await screen.findByTestId("decision-history");
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(list).toHaveTextContent("Approved: Invest");
    fireEvent.click(screen.getByRole("button", { name: "Show All (2)" }));
    expect(screen.getByTestId("decision-history").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("decision-history")).toHaveTextContent("revisit Q1");
  });

  it("without a recommendation, offers an action of your own instead of Agree", () => {
    get.mockResolvedValue({ items: [] });
    render(<HumanDecisionPanel opportunityId={5} recommendation={null} onDecision={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("radio", { name: /^Agree/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /^Choose an Action/ })).toBeInTheDocument();
  });
});
