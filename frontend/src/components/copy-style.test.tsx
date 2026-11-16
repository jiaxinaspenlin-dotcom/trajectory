// Guards the copy style (docs/copy-style.md): interface text is sentence case,
// with a fixed glossary of names. Renders the main pages and components and
// fails on known bad patterns ("Vs", "Github", Title Case pairs).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { humanStatus } from "@/lib/format";
import { assessment, debate, momentum } from "@/test/fixtures";

// ---- the check ---------------------------------------------------------------

// Multi-word names that keep their capitals (docs/copy-style.md).
const GLOSSARY_PHRASES = [
  "Founder Score", "Founder Momentum", "Investment Arena", "Custom Axes", "Trust Score", "Trust Scores",
  "Product Hunt", "Show HN",
];
// Single-word names: a capitalized word after the first is fine when it's one of these.
const NAMES = new Set([
  "Dashboard", "Map", "Founders", "Pipeline", "Fund", "Sourcing", "Screening", "Diligence", "Decision",
  "Relationships", "Bull", "Bear", "Referee", "GitHub", "Tavily", "OpenAI", "YC", "PDF", "URL", "AI",
  "Market", "Trajectory",
]);
// People and companies in the fixtures and example placeholders.
const FIXTURE_NAMES = ["Ada Builder", "Demo Investor", "Northwind Labs", "Northstar Ventures", "San Francisco"];

export function copyProblems(text: string): string[] {
  const problems: string[] = [];
  if (/\bVs\b/.test(text)) problems.push(`"Vs" in "${text}"`);
  if (/Github|Openai|Github/.test(text)) problems.push(`miscased name in "${text}"`);
  let t = text;
  for (const p of [...GLOSSARY_PHRASES, ...FIXTURE_NAMES]) t = t.split(p).join("x");
  const words = t.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const [a, b] = [words[i - 1], words[i]];
    // two adjacent capitalized words, the second not a name → Title Case
    if (/^[A-Z][a-z]+$/.test(a) && /^[A-Z][a-z]+[.,!?…]?$/.test(b) && !NAMES.has(b.replace(/[.,!?…]$/, ""))) {
      problems.push(`Title Case "${a} ${b}" in "${text}"`);
    }
  }
  return problems;
}

const TEXT_SELECTOR = "button, a, h1, h2, h3, h4, h5, h6, th, label, legend, summary, option, dt, [role=tab], .label, .chip";
const ATTRS = ["aria-label", "title", "placeholder"];

function auditDom(root: HTMLElement = document.body): string[] {
  const problems: string[] = [];
  root.querySelectorAll<HTMLElement>(TEXT_SELECTOR).forEach((el) => {
    problems.push(...copyProblems((el.textContent ?? "").replace(/\s+/g, " ").trim()));
  });
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) problems.push(...copyProblems(v));
    }
  });
  return [...new Set(problems)];
}

function expectCleanCopy() {
  expect(auditDom()).toEqual([]);
}

// ---- mocks ---------------------------------------------------------------------

let search = new URLSearchParams();
const nav = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/vc/opportunities/1",
  useSearchParams: () => search,
  useParams: () => ({ id: "1" }),
  redirect: vi.fn(),
}));

const fetched: Record<string, unknown> = {};
vi.mock("@/lib/useFetch", () => ({
  useFetch: (url: string | null) => {
    // matched on the path; query strings (e.g. ?company_id=3) are ignored
    const data = url ? fetched[url.split("?")[0]] ?? null : null;
    return { data, loading: false, error: null, reload: () => {} };
  },
}));
// direct api.get calls (Fund, web search status, decision history) by path
const { gets } = vi.hoisted(() => ({ gets: {} as Record<string, unknown> }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: vi.fn((path: string) => Promise.resolve(gets[path] ?? { items: [] })),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

afterEach(() => {
  cleanup();
  search = new URLSearchParams();
  for (const k of Object.keys(fetched)) delete fetched[k];
  for (const k of Object.keys(gets)) delete gets[k];
});

// ---- fixtures ------------------------------------------------------------------

const founder = {
  id: 7, full_name: "Ada Builder", github_username: "ada", location: "Boston", headline: "Engineer", bio: "",
  is_demo: false, education: [], work_history: [], accelerators: [], prior_funding: [], evidence: [],
};
const company = { id: 3, name: "Ledgerkit", one_liner: "Payments infrastructure", sector: "fintech", website: "https://ledgerkit.dev" };
const memo = {
  id: 1, opportunity_id: 1, version: 1, generated_by: "fallback", recommended_action: "Continue Diligence", confidence: 0.6,
  sections: [{ key: "snapshot", title: "Company Snapshot", body: "A company.", evidence_ids: [1] }],
};
const opportunity = {
  id: 1, fund_id: 1, entry_type: "outbound", stage: "screening", status: "applied", founder, company,
  thesis_fit_score: 72, thesis_fit_stale: true, surfaced_reason: "AI discovery: matched your thesis.",
  first_signal_at: "2026-11-01T00:00:00Z", recommendation_at: null, is_demo: true,
  founder_score: {
    id: 1, founder_id: 7, version: 1, score: 61, confidence: 0.5, explanation: "From public work.", evidence_ids: [], computed_at: "",
    components: [{ key: "leadership_collaboration", name: "Leadership & Collaboration", weight: 0.1, value: 50, evidence_count: 2, confidence: 0.5, missingness: 0, contribution: 5 }],
  },
  momentum: { ...momentum, change_30d_window_days: 3, change_90d_window_days: 3 },
  current_recommendation: { action: "Continue Diligence", confidence: 0.6, rationale: "Mixed evidence." },
  assessment: { ...assessment, axes: assessment.axes.map((a, i) => (i === 1 ? { ...a, label: "Insufficient Evidence" } : a)) },
  debate, memo,
  evidence: [{ id: 1, kind: "github_repo", title: "ledgerkit repository", source_name: "GitHub", source_url: "https://github.com/ada/ledgerkit",
    verification_status: "partially_verified", event_date: "2026-10-01", structured_value: {} }],
  next_step: { key: "review_recommendation", label: "Review recommendation", detail: "Recommended: Continue diligence", priority: 1 },
  new_evidence_ids: [],
};
const claims = { items: [{ id: 1, text: "1,200 users", category: "traction", provenance: "founder_reported", verification_status: "founder_reported", trust_score: 40, supporting_evidence_ids: [1] }] };

// ---- tests ---------------------------------------------------------------------

describe("copy checker", () => {
  it("catches the patterns it's meant to", () => {
    expect(copyProblems("Idea Vs Market")).not.toEqual([]);
    expect(copyProblems("Github profile")).not.toEqual([]);
    expect(copyProblems("Skip Tour")).not.toEqual([]);
    expect(copyProblems("Generate Memo")).not.toEqual([]);
    expect(copyProblems("Move to Screening")).toEqual([]);
    expect(copyProblems("View in Pipeline")).toEqual([]);
    expect(copyProblems("Founder Score weights")).toEqual([]);
    expect(copyProblems("Idea vs Market")).toEqual([]);
  });
});

describe("humanStatus", () => {
  it("writes stored values as sentence case, with names and acronyms intact", () => {
    expect(humanStatus("idea_vs_market")).toBe("Idea vs Market");
    expect(humanStatus("github_profile")).toBe("GitHub profile");
    expect(humanStatus("GitHub Profile")).toBe("GitHub profile");
    expect(humanStatus("Continue Diligence")).toBe("Continue diligence");
    expect(humanStatus("Invite to Apply")).toBe("Invite to apply");
    expect(humanStatus("Insufficient Evidence")).toBe("Insufficient evidence");
    expect(humanStatus("partially_verified")).toBe("Partially verified");
    expect(humanStatus("screening")).toBe("Screening");
    expect(humanStatus("ai_generated_pdf")).toBe("AI generated PDF");
  });
});

describe("pages and components use sentence case", () => {
  it("Dashboard (populated, with the tour open)", async () => {
    fetched["/api/dashboard"] = {
      thesis: { fund_name: "Northstar", sectors: [], stages: [], geographies: [] },
      stage_counts: { sourcing: 2, screening: 1, diligence: 1, decision: 0 },
      top_outbound_prospects: [], recent_inbound_applications: [], highest_momentum: [],
      action_queue: [
        { opportunity_id: 1, name: "Ledgerkit", founder_name: "Ada Builder", entry_type: "outbound", stage: "screening",
          next_action: "Review recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Continue diligence", priority: 1, age_days: 3 },
      ],
      recent_evidence: [{ id: 1, kind: "github_repo", title: "ledgerkit repository", source_name: "GitHub", collected_at: "2026-11-01T00:00:00Z", opportunity_id: 1, opportunity_name: "Ledgerkit" }],
      connectors: { live: [], planned: [] },
    };
    const { default: Dashboard } = await import("@/app/vc/page");
    render(<Dashboard />);
    expectCleanCopy();
  });

  it("Dashboard (empty workspace)", async () => {
    fetched["/api/dashboard"] = {
      thesis: null, stage_counts: {}, top_outbound_prospects: [], recent_inbound_applications: [], highest_momentum: [],
      action_queue: [], recent_evidence: [], connectors: { live: [], planned: [] },
    };
    const { default: Dashboard } = await import("@/app/vc/page");
    render(<Dashboard />);
    expectCleanCopy();
  });

  it.each(["overview", "founder", "screening", "arena", "claims", "evidence", "decision"])("opportunity record: %s tab", async (tab) => {
    search = new URLSearchParams(tab === "overview" ? "" : `tab=${tab}`);
    fetched["/api/opportunities/1"] = opportunity;
    fetched["/api/claims"] = claims;
    fetched["/api/contradictions"] = { items: [] };
    const { default: Record } = await import("@/app/vc/opportunities/[id]/page");
    render(<Record />);
    if (tab === "founder") fireEvent.click(document.querySelector("[aria-expanded='false']")!);
    if (tab === "arena") {
      fireEvent.click(document.querySelector("[data-testid='arena-referee']")!);
      fireEvent.click(document.querySelector("[data-testid='arena-memo'] button")!);
    }
    expectCleanCopy();
  });

  it("Memo and Diligence pages", async () => {
    fetched["/api/opportunities/1/memo"] = memo;
    fetched["/api/opportunities/1/diligence"] = { items: [{ id: 1, question: "Who pays?", rationale: "Unclear.", category: "market", generated_by: "fallback", status: "open", related_claim_ids: [] }] };
    fetched["/api/opportunities/1"] = opportunity;
    fetched["/api/claims"] = claims;
    fetched["/api/contradictions"] = { items: [{ id: 1, severity: "high", description: "Users disagree.", detected_by: "rules" }] };
    const { default: MemoPage } = await import("@/app/vc/opportunities/[id]/memo/page");
    const { default: DiligencePage } = await import("@/app/vc/opportunities/[id]/diligence/page");
    render(<><MemoPage /><DiligencePage /></>);
    expectCleanCopy();
  });

  it("Founders, with the Source founders drawer open", async () => {
    search = new URLSearchParams("source=open");
    fetched["/api/sourcing/prospects"] = { items: [{ ...opportunity, stage: "sourcing", status: "saved", evidence_count: 1, top_project: null, new_evidence_count: 2 }] };
    gets["/api/sourcing/web/status"] = { search_configured: false, ai_configured: false, thesis_request: "", last_search_id: null };
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    await screen.findByTestId("web-not-configured");
    expectCleanCopy();
  });

  it("Pipeline", async () => {
    fetched["/api/pipeline"] = { items: [{ ...opportunity, next_action: "Review recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Continue diligence", priority: 1, age_days: 3 }] };
    const { default: Pipeline } = await import("@/app/vc/pipeline/page");
    render(<Pipeline />);
    expectCleanCopy();
  });

  it("Fund, with stale fit scores and the editor open", async () => {
    search = new URLSearchParams("edit=1");
    gets["/api/thesis"] = {
      stale_fit_count: 2,
      thesis: {
        id: 1, fund_id: 1, is_active: true, fund_name: "Northstar", sectors: ["fintech"], stages: ["seed"], geographies: ["Boston"],
        min_check_size: 250000, max_check_size: 1500000, target_ownership: 8, risk_tolerance: "balanced",
        traction_preferences: "", founder_preferences: "", excluded_sectors: [], excluded_geographies: [], excluded_business_models: [],
        custom_description: "", custom_scoring_criteria: [], score_weights: { leadership_collaboration: 0.1, evidence_reliability: 0.06 }, updated_at: null,
      },
    };
    const { default: Fund } = await import("@/app/vc/fund/page");
    render(<Fund />);
    await screen.findByTestId("stale-fit");
    expect(screen.getByTestId("stale-fit")).toHaveTextContent("2 thesis fit scores don't reflect your current thesis.");
    expectCleanCopy();
  });

  it("Map (list fallback, with a record open)", async () => {
    search = new URLSearchParams("focus=1");
    fetched["/api/map"] = {
      has_thesis: false, links: [],
      items: [{
        id: 1, name: "Ledgerkit", entry_type: "outbound", stage: "screening", status: "applied", kind: "deal", in_founders: true, in_pipeline: true,
        founder: { id: 7, full_name: "Ada Builder", github_username: "ada" }, company: { id: 3, name: "Ledgerkit", sector: "fintech", one_liner: "Payments" },
        founder_score: 61, evidence_count: 3, top_project: null, topics: ["payments"], group: { key: "fintech", label: "fintech", field: "company.sector" },
        thesis_fit: { value: 72, reason: null }, momentum: { value: 4, current_score: 61, trajectory: "improving", reason: null },
        next_action: "Review recommendation", next_action_key: "review_recommendation", is_demo: true,
      }],
    };
    const { default: MapPage } = await import("@/app/vc/map/page");
    render(<MapPage />);
    await screen.findByTestId("map-node-panel");
    expectCleanCopy();
  });

  it("landing page and founder portal", async () => {
    const { default: Landing } = await import("@/app/page");
    const { default: Apply } = await import("@/app/founder/page");
    const { default: MyApplications } = await import("@/app/founder/applications/page");
    render(<><Landing /><Apply /><MyApplications /></>);
    expectCleanCopy();
  });
});
