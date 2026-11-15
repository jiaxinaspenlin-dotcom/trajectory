// Shared TypeScript types mirroring the backend response shapes.

export interface Thesis {
  id: number;
  fund_id: number;
  is_active: boolean;
  fund_name: string;
  sectors: string[];
  stages: string[];
  geographies: string[];
  min_check_size: number;
  max_check_size: number;
  target_ownership: number;
  risk_tolerance: string;
  traction_preferences: string;
  founder_preferences: string;
  excluded_sectors: string[];
  excluded_geographies: string[];
  excluded_business_models: string[];
  custom_description: string;
  custom_scoring_criteria: Record<string, unknown>[];
  score_weights: Record<string, number>;
  updated_at?: string | null;
}

export interface ScoreComponent {
  key: string;
  name: string;
  weight: number;
  value: number;
  evidence_count: number;
  confidence: number;
  missingness: number;
  contribution: number;
  evidence_ids: number[];
}

export interface FounderScore {
  id: number;
  founder_id: number;
  version: number;
  score: number;
  confidence: number;
  components: ScoreComponent[];
  explanation: string;
  evidence_ids: number[];
  computed_at: string;
}

export interface SignalTrend {
  key: string;
  label: string;
  current: number;
  previous: number;
  change: number;
  direction: "up" | "down" | "flat";
}

export interface Momentum {
  current_score: number;
  previous_score: number | null;
  change_30d: number | null;
  change_90d: number | null;
  trajectory: string;
  signal_trends: SignalTrend[];
  explanation: string;
  series: { date: string; score: number; signals: Record<string, number> }[];
}

export interface Founder {
  id: number;
  full_name: string;
  email?: string | null;
  github_username?: string | null;
  location?: string | null;
  headline?: string | null;
  bio: string;
  is_demo: boolean;
  education: { school: string; degree: string; is_elite: boolean }[];
  work_history: { company: string; role: string; is_famous: boolean }[];
  accelerators: { name: string; is_elite: boolean }[];
  prior_funding: Record<string, unknown>[];
  founder_score?: FounderScore | null;
  momentum?: Momentum;
  evidence?: Evidence[];
}

export interface Company {
  id: number;
  name: string;
  website?: string | null;
  github_org?: string | null;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
  business_model?: string | null;
  one_liner: string;
  description: string;
  is_demo: boolean;
}

export interface Evidence {
  id: number;
  founder_id?: number | null;
  company_id?: number | null;
  source_name: string;
  source_type: string;
  source_url?: string | null;
  kind: string;
  title: string;
  raw_value: string;
  structured_value: Record<string, unknown>;
  event_date?: string | null;
  collected_at: string;
  provenance: string;
  verification_status: string;
  confidence: number;
  is_stale: boolean;
  is_demo: boolean;
}

export interface Claim {
  id: number;
  founder_id?: number | null;
  company_id?: number | null;
  text: string;
  category: string;
  owner: string;
  source_name: string;
  source_url?: string | null;
  collection_date?: string | null;
  event_date?: string | null;
  excerpt: string;
  structured_value: Record<string, unknown>;
  provenance: string;
  verification_status: string;
  confidence: number;
  trust_score: number;
  supporting_evidence_ids: number[];
  contradictory_evidence_ids: number[];
  is_demo: boolean;
}

export interface AxisAssessment {
  axis: "founder" | "market" | "idea_vs_market";
  display_score: number;
  label: string;
  confidence: number;
  trend: string;
  outlook: string;
  supporting_points: { text: string; evidence_ids: number[]; unverified?: boolean }[];
  supporting_evidence_ids: number[];
  risks: string[];
  missing_information: string[];
  contradictions: string[];
  narrative: string;
}

export interface Assessment {
  id: number;
  opportunity_id: number;
  version: number;
  generated_by: string;
  computed_at: string;
  axes: AxisAssessment[];
}

export interface DebateArgument {
  role: "bull" | "bear";
  headline: string;
  points: { text: string; evidence_ids: number[]; unverified?: boolean }[];
  speech_bubble: string;
  referenced_evidence_ids: number[];
}

export interface RefereeDecision {
  recommended_action: string;
  confidence: number;
  strongest_bull_point: string;
  strongest_bear_point: string;
  unresolved_questions: string[];
  required_diligence: string[];
  evidence_that_would_change: string;
  final_decision_supportable: boolean;
  rationale: string;
  speech_bubble: string;
}

export interface Debate {
  id: number;
  opportunity_id: number;
  version: number;
  generated_by: string;
  computed_at: string;
  arguments: DebateArgument[];
  referee: RefereeDecision | null;
}

export interface MemoSection {
  key: string;
  title: string;
  body: string;
  evidence_ids: number[];
  unavailable_label: string | null;
}

export interface Memo {
  id: number;
  opportunity_id: number;
  version: number;
  generated_by: string;
  computed_at: string;
  sections: MemoSection[];
  recommended_action: string | null;
  confidence: number;
}

export interface DiligenceQuestion {
  id: number;
  opportunity_id: number;
  question: string;
  category: string;
  rationale: string;
  related_claim_ids: number[];
  status: string;
  generated_by: string;
  responses: { id: number; answer: string; answered_by: string; evidence_ids: number[] }[];
}

export interface Opportunity {
  id: number;
  fund_id: number;
  entry_type: string;
  stage: string;
  status: string;
  founder: Founder | null;
  company: Company | null;
  thesis_fit_score: number;
  surfaced_reason: string;
  first_signal_at: string;
  recommendation_at: string | null;
  founder_score: FounderScore | null;
  momentum?: Momentum;
  is_demo: boolean;
  current_recommendation?: { action: string; confidence: number; rationale: string } | null;
  assessment?: Assessment | null;
  debate?: Debate | null;
  memo?: Memo | null;
  diligence?: DiligenceQuestion[];
  evidence?: Evidence[];
  // the one next step for this opportunity (detail view); null once decided
  next_step?: { key: string; label: string; detail: string | null; priority: number } | null;
  // web-sourced evidence added since the investor last reviewed this lead
  new_evidence_ids?: number[];
  identity?: LeadIdentity;
}

// How a lead is identified: reliable identifiers used for dedup, plus a founder
// named on a source but not verified (never treated as a confirmed person).
export interface LeadIdentity {
  founder_named: string | null;
  founder_named_source: string | null;
  identifiers: { kind: "domain" | "github" | "url"; value: string }[];
}


// Founders view row: an outbound-sourced opportunity plus list-level evidence signals.
export interface FounderLead extends Opportunity {
  evidence_count: number;
  top_project: { name: string; url: string | null; stars: number | null } | null;
  new_evidence_count?: number;
  identity?: LeadIdentity;
}

// Pipeline view row: an active deal plus its single next action (null once decided).
export interface PipelineDeal extends Opportunity {
  next_action: string | null;
  next_action_key?: string | null;
  next_action_detail?: string | null;
  priority: number | null;
  age_days: number;
}

// Map read model (GET /api/map): founder leads + active deals, same IDs as Founders / Pipeline.
export interface MapNode {
  id: number;
  name: string;
  entry_type: string;
  stage: string;
  status: string;
  kind: "lead" | "deal";
  in_founders: boolean;
  in_pipeline: boolean;
  founder: { id: number; full_name: string; github_username: string | null } | null;
  company: { id: number; name: string; sector: string | null; one_liner: string } | null;
  founder_score: number | null;
  evidence_count: number;
  top_project: { name: string; url: string | null; stars: number | null } | null;
  topics: string[];
  group: { key: string; label: string; field: string | null };
  thesis_fit: { value: number | null; reason: string | null };
  momentum: { value: number | null; current_score: number | null; trajectory: string | null; history_days?: number; reason: string | null };
  next_action: string | null;
  next_action_key?: string | null;
  new_evidence_count?: number;
  is_demo: boolean;
}

export interface MapLink {
  source: number;
  target: number;
  kind: "same_founder" | "same_company" | "shared_topic";
  label: string;
  topics?: string[];
}

export interface MapData {
  items: MapNode[];
  links: MapLink[];
  has_thesis: boolean;
}

// Web sourcing (POST /api/sourcing/web/search). Every claim cites retrieved
// sources (S1, S2, ...); dates and identities that aren't supported are null.
export interface WebEvidence {
  source_id: string;
  url: string;
  canonical_url: string;
  title: string;
  domain: string;
  kind: "launch" | "release" | "changelog" | "company_site" | "press" | "other";
  source_role?: "company_site" | "launch_page";
  claim: string;
  quote: string;
  event_date: string | null;
  date_precision: "day" | "month" | null;
  date_basis: "stated_in_source" | "search_provider" | null;
  date_text: string | null;
  status?: "new" | "known";
}

export interface WebResult {
  key: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  website_basis: string | null;
  sector: string | null;
  building: { text: string; source_ids: string[] };
  why_matched: { text: string; source_ids: string[] };
  founder: { name: string | null; status: "unknown" | "named_unverified" | "verified_github"; source_url: string | null; profile_url: string | null };
  github: { login: string; type: string | null; url: string | null; verified: boolean; basis: string } | null;
  evidence: WebEvidence[];
  unknowns: string[];
  identifiers: { kind: string; value: string; verified: boolean }[];
  existing: { opportunity_id: number; name: string; stage: string; evidence_added: number; evidence_known: number } | null;
  saved_opportunity_id: number | null;
}

export interface WebSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  published_date: string | null;
  query: string;
}

export interface WebSearchResponse {
  search_id: number;
  request: string;
  status: "success" | "no_sources" | "no_results";
  provider: string;
  queries: string[];
  interpretation: string;
  source_count: number;
  sources: WebSource[];
  results: WebResult[];
  rejected: { company_name: string | null; reason: string }[];
  notes: string[];
  updated_leads: { opportunity_id: number; name: string; evidence_added: number }[];
  created_at: string | null;
}

export interface WebSearchStatus {
  provider: string;
  search_configured: boolean;
  ai_configured: boolean;
  thesis_request: string;
  last_search_id: number | null;
}
