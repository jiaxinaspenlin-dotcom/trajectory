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

  it("starts with no outcome or action selected and requires an explicit choice", async () => {
    get.mockResolvedValue({ items: [] });
    render(<HumanDecisionPanel opportunityId={5} recommendation={rec} onDecision={() => {}} />);
    for (const r of screen.getAllByRole("radio")) expect(r).not.toBeChecked();
    expect(screen.getByLabelText(/Chosen Action/)).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Record Decision" }));
    expect(screen.getByText("Choose an outcome.")).toBeInTheDocument();
    expect(screen.getByText("Choose the action you're taking.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use Recommendation" }));
    expect(screen.getByLabelText(/Chosen Action/)).toHaveValue("Continue Diligence");
    post.mockResolvedValueOnce({ human_decision: { decision: "approved", chosen_action: "Continue Diligence", decided_by: "Demo Investor", decided_at: "", notes: "", system_recommended_action: "Continue Diligence" } });
    fireEvent.click(screen.getByRole("button", { name: "Record Decision" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/opportunities/5/decision", {
      decided_by: "Demo Investor", decision: "approved", chosen_action: "Continue Diligence", notes: "",
    }));
    expect(await screen.findByText("Decision Recorded")).toBeInTheDocument();
  });

  it("shows existing decision history", async () => {
    get.mockResolvedValue({ items: [{ decision: "deferred", chosen_action: "Monitor", system_recommended_action: "Invest", decided_by: "Ana", decided_at: "2026-11-01T00:00:00Z", notes: "revisit Q1" }] });
    render(<HumanDecisionPanel opportunityId={5} recommendation={null} onDecision={() => {}} />);
    expect(await screen.findByTestId("decision-history")).toHaveTextContent("Deferred: Monitor");
    expect(screen.getByTestId("decision-history")).toHaveTextContent("revisit Q1");
  });
});
