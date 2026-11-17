// Why the system recommends: reasons from the side that supports the action, the
// main risk from the other side, each linked; nothing padded.
import { describe, expect, it } from "vitest";
import { decisionPayload, decisionReasons } from "@/lib/decision";

const o = {
  id: 3,
  debate: {
    id: 1, opportunity_id: 3, version: 1, generated_by: "demo", computed_at: "", referee: null,
    arguments: [
      { role: "bull" as const, headline: "", speech_bubble: "", referenced_evidence_ids: [], points: [
        { text: "Founder Momentum is accelerating.", evidence_ids: [], unverified: true },
        { text: "Founder Score is 25/100 with independent GitHub evidence.", evidence_ids: [23, 24] },
      ] },
      { role: "bear" as const, headline: "", speech_bubble: "", referenced_evidence_ids: [], points: [
        { text: "0 material claim(s) are founder-reported and lack independent corroboration.", evidence_ids: [], unverified: true },
        { text: "Contradiction: The founder reported 1,200 monthly active users on the application but 660 on slide 7.", evidence_ids: [], unverified: true },
      ] },
    ],
  },
  diligence: [{ id: 8, opportunity_id: 3, question: "Please reconcile: The founder reported 1,200 monthly active users on the application but 660 on slide 7.", category: "contradiction", rationale: "", related_claim_ids: [7], status: "open", generated_by: "demo", responses: [] }],
};

describe("decision reasons", () => {
  it("backs an advancing action with the bull case, evidence first, and names the bear risk", () => {
    const { reasons, risk } = decisionReasons(o, "Continue Diligence");
    expect(reasons.map((r) => r.text)).toEqual(["Founder Score is 25/100 with independent GitHub evidence.", "Founder Momentum is accelerating."]);
    expect(reasons[0]).toMatchObject({ href: "/vc/opportunities/3?tab=evidence&evidence=23", linkLabel: "See Evidence (2)", unverified: false });
    expect(reasons[1]).toMatchObject({ href: null, unverified: true });
    // "0 material claims…" is not a risk; the contradiction is, linked to its open question
    expect(risk).toMatchObject({ href: "/vc/opportunities/3/diligence", linkLabel: "See the Open Question", unverified: true });
    expect(risk!.text).toMatch(/^Contradiction/);
  });

  it("backs a cautious action with the bear case", () => {
    const { reasons, risk } = decisionReasons(o, "Monitor");
    expect(reasons.map((r) => r.text)).toEqual([expect.stringMatching(/^Contradiction/)]);
    expect(risk!.text).toBe("Founder Momentum is accelerating.");
  });

  it("has nothing to say without a debate, except an open question", () => {
    expect(decisionReasons({ id: 3, debate: null, diligence: [] }, "Invest")).toEqual({ reasons: [], risk: null });
    expect(decisionReasons({ id: 3, debate: null, diligence: o.diligence }, "Invest").risk).toMatchObject({ linkLabel: "See the Open Question" });
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
