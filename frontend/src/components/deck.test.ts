// "Next" after a decision: the next record still waiting according to the backend,
// continuing from where the decided record sat in the deck.
import { describe, expect, it } from "vitest";
import { DeckItem, nextWaiting } from "@/lib/deck";

const it_ = (id: number, key = "review_recommendation"): DeckItem => ({
  opportunity_id: id, name: `R${id}`, founder_name: null, entry_type: "outbound", stage: "diligence", next_action: key, next_action_key: key,
  next_action_detail: null, priority: 1, age_days: 0, waiting_since: "", group: "recommendation",
});

describe("next waiting record", () => {
  const before = [it_(3), it_(2), it_(1), it_(4), it_(7)];

  it("is the following record in the deck that the backend still has waiting", () => {
    // 3 now resolves diligence (moved to the back); 2 was decided elsewhere and left
    const now = [it_(1), it_(4), it_(7), it_(3, "resolve_diligence")];
    expect(nextWaiting(before, now, 3)?.opportunity_id).toBe(1);
  });

  it("never returns the decided record, even when it is still waiting", () => {
    const now = [it_(3, "resolve_diligence")];
    expect(nextWaiting(before, now, 3)).toBeNull();
  });

  it("uses the backend's card, so the step and button are current", () => {
    const now = [it_(3, "resolve_diligence"), it_(2, "resolve_diligence")];
    expect(nextWaiting(before, now, 3)?.next_action_key).toBe("resolve_diligence");
  });

  it("from the last card, goes on to anything still waiting", () => {
    const now = [it_(3), it_(2), it_(8)];
    expect(nextWaiting(before, now, 7)?.opportunity_id).toBe(8); // new since the page opened
    expect(nextWaiting(before, [it_(3), it_(2)], 7)?.opportunity_id).toBe(3);
  });
});
