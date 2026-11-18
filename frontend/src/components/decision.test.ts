// Why the system recommends: the points that support THAT action (strengths for
// one that advances, concerns for a cautious one), and the strongest point on the
// other side as What Could Change This. Each point keeps its own tone.
import { describe, expect, it } from "vitest";
import { decisionPayload, decisionReasons, isCautious } from "@/lib/decision";

const debate = (bull: { text: string; evidence_ids: number[]; unverified?: boolean }[], bear: { text: string; evidence_ids: number[]; unverified?: boolean }[], change = "") => ({
  id: 1, opportunity_id: 2, version: 1, generated_by: "demo", computed_at: "",
  referee: change ? { evidence_that_would_change: change } as never : null,
  arguments: [
    { role: "bull" as const, headline: "", speech_bubble: "", referenced_evidence_ids: [], points: bull },
    { role: "bear" as const, headline: "", speech_bubble: "", referenced_evidence_ids: [], points: bear },
  ],
});
const strengths = [
  { text: "Founder Momentum is accelerating.", evidence_ids: [], unverified: true },
  { text: "Founder Score is 42/100 with independent GitHub evidence.", evidence_ids: [23, 24] },
];
const concerns = [
  { text: "0 material claims are founder-reported and lack independent corroboration.", evidence_ids: [], unverified: true },
  { text: "1 material claim is founder-reported and lacks independent corroboration.", evidence_ids: [], unverified: true },
];

describe("decision reasons", () => {
  it("backs a cautious recommendation (Monitor) with the concerns, and the strength could change it", () => {
    // record 2 as the check found it: Monitor, one uncorroborated claim, Founder Score 42 with evidence
    const { reasons, counter } = decisionReasons({ id: 2, debate: debate(strengths, concerns), diligence: [] }, "Monitor");
    expect(reasons).toEqual([expect.objectContaining({ text: "1 material claim is founder-reported and lacks independent corroboration.", tone: "concern", linkLabel: "See the Claims" })]);
    expect(counter).toMatchObject({ text: "Founder Score is 42/100 with independent GitHub evidence.", tone: "strength", unverified: false, linkLabel: "See Evidence (2)" });
  });

  it("backs an advancing recommendation (Continue Diligence) with the strengths, evidence first, and a concern could change it", () => {
    const contradiction = { text: "Contradiction: The founder reported 1,200 users but 660 on slide 7.", evidence_ids: [], unverified: true };
    const o = { id: 3, debate: debate(strengths, [contradiction, ...concerns]), diligence: [
      { id: 8, opportunity_id: 3, question: "Please reconcile: The founder reported 1,200 users but 660 on slide 7.", category: "contradiction", rationale: "", related_claim_ids: [7], status: "open", generated_by: "demo", responses: [] },
    ] };
    const { reasons, counter } = decisionReasons(o, "Continue Diligence");
    expect(reasons.map((r) => [r.text, r.tone, r.unverified])).toEqual([
      ["Founder Score is 42/100 with independent GitHub evidence.", "strength", false],
      ["Founder Momentum is accelerating.", "strength", true],
    ]);
    expect(counter).toMatchObject({ tone: "concern", href: "/vc/opportunities/3/diligence", linkLabel: "See the Open Question" });
    expect(counter!.text).toMatch(/^Contradiction/);
  });

  it("knows which actions are cautious", () => {
    for (const a of ["Monitor", "Request Information", "Request More Information", "Pass"]) expect(isCautious(a)).toBe(true);
    for (const a of ["Continue Diligence", "Invite to Apply", "Schedule Interview", "Invest"]) expect(isCautious(a)).toBe(false);
  });

  it("without a point on the other side, falls back to an open question or the referee's note", () => {
    expect(decisionReasons({ id: 3, debate: null, diligence: [] }, "Invest")).toEqual({ reasons: [], counter: null });
    const note = decisionReasons({ id: 2, debate: debate([], concerns, "Independent verification of traction."), diligence: [] }, "Monitor").counter;
    expect(note).toMatchObject({ text: "Independent verification of traction.", tone: "strength", href: null });
  });

  it("maps each answer onto the decision contract", () => {
    expect(decisionPayload("agree", "Continue Diligence", "")).toEqual({ decision: "approved", chosen_action: "Continue Diligence" });
    expect(decisionPayload("different", "Continue Diligence", "Monitor")).toEqual({ decision: "overridden", chosen_action: "Monitor" });
    expect(decisionPayload("different", null, "Invest")).toEqual({ decision: "approved", chosen_action: "Invest" });
    expect(decisionPayload("not_now", "Continue Diligence", "")).toEqual({ decision: "deferred", chosen_action: "Continue Diligence" });
    expect(decisionPayload("not_now", null, "")).toEqual({ decision: "deferred", chosen_action: "Monitor" });
    expect(decisionPayload("pass", "Continue Diligence", "")).toEqual({ decision: "rejected", chosen_action: "Pass" });
  });
});
