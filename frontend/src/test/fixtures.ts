import { Assessment, Debate, Momentum, RankingEntry, WorkflowStatus } from "@/lib/types";

export const debate: Debate = {
  id: 1, opportunity_id: 1, version: 1, generated_by: "fallback", computed_at: "2026-07-18T00:00:00Z",
  arguments: [
    { role: "bull", headline: "Case to advance", speech_bubble: "Momentum looks strong.",
      points: [{ text: "Founder Score is high", evidence_ids: [1, 2], unverified: false }], referenced_evidence_ids: [1, 2] },
    { role: "bear", headline: "Case for caution", speech_bubble: "Key claims unverified.",
      points: [{ text: "Traction is founder-reported", evidence_ids: [], unverified: true }], referenced_evidence_ids: [] },
  ],
  referee: {
    recommended_action: "Continue Diligence", confidence: 0.6,
    strongest_bull_point: "High score", strongest_bear_point: "Unverified traction",
    unresolved_questions: ["Verify MAU"], required_diligence: ["Get references"],
    evidence_that_would_change: "Independent traction data", final_decision_supportable: false,
    rationale: "Evidence quality is mixed.", speech_bubble: "My call: Continue Diligence.",
  },
};

export const assessment: Assessment = {
  id: 1, opportunity_id: 1, version: 1, generated_by: "fallback", computed_at: "2026-07-18T00:00:00Z",
  axes: [
    { axis: "founder", display_score: 72, label: "Promising", confidence: 0.7, trend: "improving", outlook: "neutral",
      supporting_points: [{ text: "Strong execution", evidence_ids: [1] }], supporting_evidence_ids: [1],
      risks: ["thin market evidence"], missing_information: ["references"], contradictions: [], narrative: "Founder axis." },
    { axis: "market", display_score: 40, label: "Mixed", confidence: 0.4, trend: "stable", outlook: "neutral",
      supporting_points: [], supporting_evidence_ids: [], risks: [], missing_information: ["TAM"], contradictions: [], narrative: "Market axis." },
    { axis: "idea_vs_market", display_score: 65, label: "Promising", confidence: 0.5, trend: "stable", outlook: "neutral",
      supporting_points: [], supporting_evidence_ids: [], risks: [], missing_information: [], contradictions: [], narrative: "Idea axis." },
  ],
};

export const momentum: Momentum = {
  current_score: 45, previous_score: 30, change_30d: 15, change_90d: 25, trajectory: "accelerating",
  signal_trends: [{ key: "release_frequency", label: "release frequency", current: 5, previous: 2, change: 3, direction: "up" }],
  explanation: "Founder Momentum is accelerating because release frequency increased.",
  series: [
    { date: "2026-04-19T00:00:00Z", score: 20, signals: {} },
    { date: "2026-05-19T00:00:00Z", score: 30, signals: {} },
    { date: "2026-07-18T00:00:00Z", score: 45, signals: {} },
  ],
};

export const ranking: RankingEntry[] = [
  { candidate_id: 1, founder_id: 1, name: "Prestige A", standard_rank: 1, prestige_free_rank: 3, rank_delta: -2,
    standard_score: 70, prestige_free_score: 55, substantive_score: 55, prestige_score: 95,
    influential_prestige_variables: [{ variable: "elite_education", label: "elite university brand", value: 100, score_contribution: 9 }],
    sensitivity: 0.15, substantial_change: true },
  { candidate_id: 2, founder_id: 2, name: "Substance B", standard_rank: 2, prestige_free_rank: 1, rank_delta: 1,
    standard_score: 68, prestige_free_score: 78, substantive_score: 78, prestige_score: 10,
    influential_prestige_variables: [], sensitivity: 0.1, substantial_change: false },
];

export const workflow: WorkflowStatus = {
  opportunity_id: 1, stage: "diligence", status: "in_diligence", first_signal_at: "2026-07-18T00:00:00Z",
  recommendation_at: "2026-07-18T02:00:00Z", elapsed_seconds: 7200, elapsed_human: "2h 0m",
  remaining_seconds: 79200, remaining_human: "22h 0m", target_hours: 24, target_met: true,
  time_to_recommendation_human: "2h 0m", open_diligence_count: 1, blockers: ["1 open diligence item."],
  current_recommendation: { action: "Continue Diligence", confidence: 0.6, rationale: "Mixed evidence." },
};
