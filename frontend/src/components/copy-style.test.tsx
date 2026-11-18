// Guards the copy style (docs/copy-style.md): labels, headings and short
// phrases are Title Case; full sentences and content are left alone. Renders
// every route in src/app (and the shared shell, sign-in, tour, toasts, loading
// and error states) and fails on a label that isn't Title Case ("Review
// recommendation"), a capitalized minor word mid-phrase ("Idea Vs Market") and
// miscased names ("Github").
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { humanStatus, sectorLabel, sourceName, titleCase } from "@/lib/format";
import { assessment, debate, momentum } from "@/test/fixtures";

// ---- the check ---------------------------------------------------------------

// User and third-party content in the fixtures below (names, typed values,
// evidence titles, sectors) that is shown inside a label, such as an
// accessible name ("Review ada"): never re-cased, so the check skips it.
const CONTENT = [
  "Ada Builder", "Demo Investor", "Northwind Labs", "Northstar Ventures", "Northstar", "San Francisco", "Boston",
  "ledgerkit repository", "Ledgerkit", "Payments", "payments", "ada", "Quill AI", "Gridline",
];

// A sentence (descriptions, hints, errors, toasts) ends with . ? or ! and isn't
// checked. Bullets and inline elements (evidence chips, links) at either end
// don't stop a sentence from being one.
const PLACEHOLDER = "￼";
const isSentence = (t: string) =>
  /[.?!]["”)]?\s*[→↗]?$/.test(t.replace(new RegExp(`^[•\\s${PLACEHOLDER}]+|[\\s${PLACEHOLDER}]+$`, "g"), ""));

export function copyProblems(text: string): string[] {
  const problems: string[] = [];
  if (/Github|Openai/.test(text)) problems.push(`miscased name in "${text}"`);
  if (!text || isSentence(text)) return problems;
  let t = text.split(PLACEHOLDER).join("X");
  for (const c of CONTENT) t = t.split(c).join("X");
  const want = titleCase(t);
  if (want !== t) problems.push(`not Title Case: "${text}" (want "${want}")`);
  return problems;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
// An element's own phrase: its text, with each child element that has text
// standing in as one placeholder word (judged on its own), so "Grouped by
// {sector}" and "<strong>12</strong> More" are read as one phrase.
function phraseOf(el: Element): string {
  return norm([...el.childNodes].map((n) =>
    n.nodeType === Node.TEXT_NODE ? n.textContent
      : n instanceof Element && !n.matches("svg, [aria-hidden='true']") && /\S/.test(n.textContent ?? "") ? ` ${PLACEHOLDER} ` : ""
  ).join(""));
}
const INLINE = new Set(["STRONG", "EM", "B", "I", "A", "CODE", "SPAN"]);

// Every element that has its own text is a string to check, plus accessible
// names, tooltips and placeholders. Content ([data-content], typed values,
// example placeholders) and decorative glyphs (aria-hidden) are skipped.
function auditDom(root: HTMLElement = document.body): string[] {
  const problems: string[] = [];
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.closest("script, style, svg, [aria-hidden='true'], [data-content], textarea, input")) return;
    if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && /[a-z]/i.test(n.textContent ?? ""))) return;
    const phrase = phraseOf(el);
    // a word set in bold or linked inside a sentence is part of that sentence
    if (INLINE.has(el.tagName) && el.parentElement && isSentence(phraseOf(el.parentElement))) return;
    problems.push(...copyProblems(phrase));
  });
  root.querySelectorAll<HTMLElement>("[aria-label], [title], [placeholder], img[alt]").forEach((el) => {
    if (el.closest("svg, [data-content]")) return;
    for (const a of ["aria-label", "title", "alt"]) {
      const v = el.getAttribute(a);
      if (v) problems.push(...copyProblems(v));
    }
    // a placeholder that prompts ("Search…", "Your Name") is a label; an
    // example value ("e.g. fintech", "https://…", "you@example.com") is content
    const ph = el.getAttribute("placeholder");
    if (ph && !/^(e\.g\.|https?:\/\/)|@/.test(ph)) problems.push(...copyProblems(ph));
  });
  return [...new Set(problems)];
}

function expectCleanCopy() {
  expect(auditDom()).toEqual([]);
}

// ---- mocks ---------------------------------------------------------------------

let search = new URLSearchParams();
let pathname = "/vc/opportunities/1";
const nav = { push: vi.fn(), replace: vi.fn() };
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => pathname,
  useSearchParams: () => search,
  useParams: () => ({ id: "1" }),
  redirect,
}));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-inter", className: "" }) }));

// useFetch by path (query strings ignored); `fetchState` switches every call to
// its loading or error state
const fetched: Record<string, unknown> = {};
let fetchState: "data" | "loading" | "error" = "data";
vi.mock("@/lib/useFetch", () => ({
  useFetch: (url: string | null) => {
    if (fetchState === "loading") return { data: null, loading: true, error: null, reload: () => {} };
    if (fetchState === "error") return { data: null, loading: false, error: "Internal Server Error", reload: () => {} };
    const data = url ? fetched[url.split("?")[0]] ?? null : null;
    return { data, loading: false, error: null, reload: () => {} };
  },
}));
// direct api calls (Fund, web search, decisions, founder portal) by path
const { gets, posts } = vi.hoisted(() => ({ gets: {} as Record<string, unknown>, posts: {} as Record<string, unknown> }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: vi.fn((path: string) => {
      const v = gets[path.split("?")[0]];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? { items: [] });
    }),
    post: vi.fn((path: string) => {
      const v = posts[path.split("?")[0]];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? {});
    }),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    upload: vi.fn((path: string) => Promise.resolve(posts[path] ?? {})),
  },
}));

afterEach(() => {
  cleanup();
  search = new URLSearchParams();
  pathname = "/vc/opportunities/1";
  fetchState = "data";
  localStorage.clear();
  redirect.mockReset();
  for (const k of Object.keys(fetched)) delete fetched[k];
  for (const k of Object.keys(gets)) delete gets[k];
  for (const k of Object.keys(posts)) delete posts[k];
});

// ---- fixtures ------------------------------------------------------------------

const founder = {
  id: 7, full_name: "Ada Builder", github_username: "ada", location: "Boston", headline: "Engineer", bio: "",
  is_demo: false, education: [], work_history: [], accelerators: [], prior_funding: [], evidence: [],
};
const company = { id: 3, name: "Ledgerkit", one_liner: "Payments infrastructure", sector: "fintech", website: "https://ledgerkit.dev" };
const memo = {
  id: 1, opportunity_id: 1, version: 1, generated_by: "fallback", recommended_action: "Continue Diligence", confidence: 0.6,
  sections: [
    { key: "snapshot", title: "Company snapshot", body: "A company.", evidence_ids: [1] },
    { key: "swot", title: "SWOT", body: "Strengths: technical execution on public repositories. Weaknesses: unverified traction.", evidence_ids: [] },
  ],
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
  // generated gaps arrive in sentence case ("Market size") and are shown as labels
  assessment: { ...assessment, axes: assessment.axes.map((a, i) => (i === 1 ? { ...a, label: "Insufficient Evidence", missing_information: ["Market size", "Growth rate"] } : a)) },
  debate, memo,
  evidence: [
    { id: 1, kind: "github_repo", title: "ledgerkit repository", source_name: "GitHub (demo)", source_url: "https://github.com/ada/ledgerkit",
      verification_status: "partially_verified", event_date: "2026-10-01", structured_value: {} },
    { id: 2, kind: "claim", title: "ledgerkit repository", source_name: "Pitch deck (demo)", source_url: null,
      verification_status: "founder_reported", event_date: null, structured_value: {} },
  ],
  next_step: { key: "review_recommendation", label: "Review Recommendation", detail: "Recommended: Continue Diligence", priority: 1 },
  new_evidence_ids: [2],
};
// a sourcing lead with no company, and a deal whose founder is only named on a page
const lead = { ...opportunity, id: 1, stage: "sourcing", status: "saved", company: null, assessment: null, debate: null, memo: null, current_recommendation: null, next_step: null, thesis_fit_stale: false };
const unlinked = { ...opportunity, founder: null, founder_score: null, momentum: null, identity: { founder_named: "Ada Builder", founder_named_source: "https://ledgerkit.dev/about", identifiers: [] } };
const claims = { items: [{ id: 1, text: "1,200 users", category: "traction", provenance: "founder_reported", verification_status: "founder_reported", trust_score: 40, supporting_evidence_ids: [1] }] };
const queueItem = {
  opportunity_id: 1, name: "Ledgerkit", founder_name: "Ada Builder", entry_type: "outbound", stage: "screening",
  next_action: "Review Recommendation", next_action_key: "review_recommendation", next_action_detail: "Recommended: Continue Diligence", priority: 1, age_days: 3,
  waiting_since: "2026-11-01T00:00:00Z", group: "recommendation",
};
const dashboard = {
  thesis: { fund_name: "Northstar", sectors: [], stages: [], geographies: [] },
  stage_counts: { sourcing: 2, screening: 1, diligence: 1, decision: 0 },
  top_outbound_prospects: [], recent_inbound_applications: [], highest_momentum: [],
  action_queue: [queueItem, { ...queueItem, opportunity_id: 2, entry_type: "inbound", next_action: "Review Application", next_action_key: "review_application", next_action_detail: "New Inbound Application", priority: 2, age_days: 0, group: "application" }],
  queue_groups: [{ key: "recommendation", count: 1, first_opportunity_id: 1 }, { key: "application", count: 1, first_opportunity_id: 2 }],
  stage_names: { sourcing: ["CareBridge", "ForgeTools"], screening: ["Ledgerkit"], diligence: ["PayMesh"] },
  recent_evidence: [{ id: 1, kind: "github_repo", title: "ledgerkit repository", source_name: "GitHub (demo)", collected_at: "2026-11-01T00:00:00Z", opportunity_id: 1, opportunity_name: "Ledgerkit" }],
  connectors: { live: [], planned: [] },
};
const emptyDashboard = { ...dashboard, thesis: null, stage_counts: {}, action_queue: [], recent_evidence: [] };
const thesis = {
  id: 1, fund_id: 1, is_active: true, fund_name: "Northstar", sectors: ["fintech"], stages: ["seed"], geographies: ["Boston"],
  min_check_size: 250000, max_check_size: 1500000, target_ownership: 8, risk_tolerance: "balanced",
  traction_preferences: "", founder_preferences: "", excluded_sectors: [], excluded_geographies: [], excluded_business_models: [],
  custom_description: "", custom_scoring_criteria: [], score_weights: { leadership_collaboration: 0.1, evidence_reliability: 0.06 }, updated_at: null,
};
const mapNode = {
  id: 1, name: "Ledgerkit", entry_type: "outbound", stage: "screening", status: "applied", kind: "deal", in_founders: true, in_pipeline: true,
  founder: { id: 7, full_name: "Ada Builder", github_username: "ada" }, company: { id: 3, name: "Ledgerkit", sector: "fintech", one_liner: "Payments" },
  founder_score: 61, evidence_count: 3, top_project: null, topics: ["payments"], group: { key: "fintech", label: "fintech", field: "company.sector" },
  thesis_fit: { value: 72, reason: null }, momentum: { value: 4, current_score: 61, trajectory: "improving", reason: null },
  next_action: "Review Recommendation", next_action_key: "review_recommendation", is_demo: true,
};
const sparseNode = {
  ...mapNode, id: 2, name: "ada", kind: "lead", company: null, founder_score: null, evidence_count: 0,
  group: { key: "ungrouped", label: "Not Enough Data to Group", field: null },
  thesis_fit: { value: null, reason: "insufficient_history" }, momentum: { value: null, current_score: null, trajectory: null, reason: "insufficient momentum history" },
};
const webResult = {
  key: "abc123", company_name: "Ledgerkit", website: "https://ledgerkit.dev", domain: "ledgerkit.dev", website_basis: "a cited source is on this domain", sector: "fintech",
  building: { text: "A reconciliation API for marketplaces", source_ids: ["S1"] },
  why_matched: { text: "Payments infrastructure launched this year", source_ids: ["S1"] },
  founder: { name: "Ada Builder", status: "verified_github", source_url: null, profile_url: "https://github.com/ada" },
  github: { login: "ada", type: "User", url: "https://github.com/ada", verified: true, basis: "GitHub profile lists ledgerkit.dev as its website" },
  evidence: [{ source_id: "S1", url: "https://ledgerkit.dev/", canonical_url: "https://ledgerkit.dev", title: "ledgerkit repository", domain: "ledgerkit.dev",
    kind: "launch", claim: "ledgerkit repository", quote: "ledgerkit repository", event_date: "2026-03-03", date_precision: "day", date_basis: "stated_in_source", date_text: "March 3, 2026", status: "new" }],
  unknowns: ["Pricing not stated", "Founder identity not verified"],
  identifiers: [], existing: { opportunity_id: 1, name: "Ledgerkit", stage: "sourcing", evidence_added: 1, evidence_known: 0 }, saved_opportunity_id: null,
};
const webSearch = {
  search_id: 5, request: "payments", status: "success", provider: "tavily", queries: ["payments api launch"], interpretation: "", source_count: 1,
  sources: [{ id: "S1", url: "https://ledgerkit.dev/", title: "ledgerkit repository", domain: "ledgerkit.dev", published_date: null, query: "q" }],
  results: [webResult], rejected: [{ company_name: "Northwind Labs", reason: "A claim was not tied to a retrieved source." }],
  notes: [], updated_leads: [{ opportunity_id: 1, name: "Ledgerkit", evidence_added: 1 }], created_at: null,
};
const application = {
  id: 1, company_id: 3, company_name: "Ledgerkit", founder_names: ["Ada Builder"], sector: null, geography: "Boston", website: null, product_link: null,
  github_profile: null, team_info: null, missing_fields: ["website", "github_profile"], screen_summary: "We've completed an automated first-pass review.",
  current_revenue: null, num_users: 1200, funding_requested: null, document: { id: 1, num_pages: 12, status: "extracted", page_count: 12 },
};

const leadRow = (over = {}) => ({ ...opportunity, stage: "sourcing", status: "saved", evidence_count: 1, top_project: null, new_evidence_count: 2, ...over });
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

// ---- tests ---------------------------------------------------------------------

describe("copy checker", () => {
  it("catches the patterns it's meant to", () => {
    expect(copyProblems("Review recommendation")).not.toEqual([]);
    expect(copyProblems("Needs attention")).not.toEqual([]);
    expect(copyProblems("Idea Vs Market")).not.toEqual([]);
    expect(copyProblems("Github Profile")).not.toEqual([]);
    expect(copyProblems("Review Recommendation")).toEqual([]);
    expect(copyProblems("Move to Screening")).toEqual([]);
    expect(copyProblems("Idea vs Market")).toEqual([]);
    expect(copyProblems("Next Up")).toEqual([]);
    expect(copyProblems("Waiting 4d")).toEqual([]);
    expect(copyProblems("+16.4 pts / 30d")).toEqual([]);
    // sentences are left alone, including one followed by an evidence chip
    expect(copyProblems("No evidence collected yet.")).toEqual([]);
    expect(copyProblems(`• Market signals are thin. ${PLACEHOLDER}`)).toEqual([]);
  });

  it("reads every element, not only buttons and headings", () => {
    render(<div><span>Loading dashboard…</span><p>Market size</p><p data-content>market size</p><p>A sentence with <strong>bold words</strong>.</p></div>);
    expect(auditDom()).toEqual([
      'not Title Case: "Loading dashboard…" (want "Loading Dashboard…")',
      'not Title Case: "Market size" (want "Market Size")',
    ]);
  });
});

describe("titleCase", () => {
  it("follows the rule: minor words, last word, hyphens, units and names", () => {
    expect(titleCase("needs attention")).toBe("Needs Attention");
    expect(titleCase("next up")).toBe("Next Up");
    // phrasal verbs: the particle is capitalized; "in" as a preposition is not
    expect(titleCase("set up your fund thesis")).toBe("Set Up Your Fund Thesis");
    expect(titleCase("fill in what you can")).toBe("Fill In What You Can");
    expect(titleCase("not yet in pipeline")).toBe("Not Yet in Pipeline");
    expect(titleCase("log out")).toBe("Log Out");
    expect(titleCase("opt in to updates")).toBe("Opt In to Updates");
    expect(titleCase("signed off on it")).toBe("Signed Off on It");
    expect(titleCase("so far")).toBe("So Far");
    expect(titleCase("7 in pipeline")).toBe("7 in Pipeline");
    expect(titleCase("take the tour")).toBe("Take the Tour");
    expect(titleCase("Northstar Ventures (Demo) · what to do next")).toBe("Northstar Ventures (Demo) · What to Do Next");
    expect(titleCase("Recommended: Continue diligence")).toBe("Recommended: Continue Diligence");
    expect(titleCase("New inbound application · waiting 4d")).toBe("New Inbound Application · Waiting 4d");
    expect(titleCase("12 more:")).toBe("12 More:");
    expect(titleCase("5 leads in Founders")).toBe("5 Leads in Founders");
    expect(titleCase("evidence-backed")).toBe("Evidence-Backed");
    expect(titleCase("30-day")).toBe("30-Day");
    expect(titleCase("check size $250K – 8%")).toBe("Check Size $250K – 8%");
    expect(titleCase("+16.4 pts / 30d")).toBe("+16.4 pts / 30d");
    expect(titleCase("github and openai via tavily")).toBe("GitHub and OpenAI via Tavily");
    expect(titleCase("GitHub (demo)")).toBe("GitHub (Demo)");
    // paths and slash pairs are values, not words
    expect(titleCase("GitHub ada/ledgerkit-sdk")).toBe("GitHub ada/ledgerkit-sdk");
    expect(titleCase("sectors: ai/ml")).toBe("Sectors: ai/ml");
  });

  it("shows source names as content, re-casing only the seeded (demo) marker", () => {
    expect(sourceName("GitHub (demo)")).toBe("GitHub (Demo)");
    expect(sourceName("Pitch deck (demo)")).toBe("Pitch Deck (Demo)");
    expect(sourceName("Founder application")).toBe("Founder Application");
    expect(sourceName("Launch YC: InsForge: The backend platform | Y Combinator")).toBe("Launch YC: InsForge: The backend platform | Y Combinator");
  });
});

describe("sectorLabel", () => {
  it("shows sectors as labels without changing what is stored", () => {
    expect(sectorLabel("fintech")).toBe("Fintech");
    expect(sectorLabel("ai/ml")).toBe("AI/ML");
    expect(sectorLabel("devtools")).toBe("Developer Tools");
    expect(sectorLabel("climate")).toBe("Climate");
    expect(sectorLabel("b2b saas")).toBe("B2B SaaS");
    expect(sectorLabel("llm devops")).toBe("LLM DevOps");
    expect(sectorLabel("api tooling")).toBe("API Tooling");
  });
});

describe("humanStatus", () => {
  it("writes stored values as Title Case, with names and acronyms intact", () => {
    expect(humanStatus("idea_vs_market")).toBe("Idea vs Market");
    expect(humanStatus("github_profile")).toBe("GitHub Profile");
    expect(humanStatus("GitHub Profile")).toBe("GitHub Profile");
    expect(humanStatus("Continue Diligence")).toBe("Continue Diligence");
    expect(humanStatus("Invite to Apply")).toBe("Invite to Apply");
    expect(humanStatus("Insufficient Evidence")).toBe("Insufficient Evidence");
    expect(humanStatus("insufficient_history")).toBe("Insufficient History");
    expect(humanStatus("partially_verified")).toBe("Partially Verified");
    expect(humanStatus("execution_consistency")).toBe("Execution Consistency");
    expect(humanStatus("screening")).toBe("Screening");
  });
});

// Every page.tsx in src/app, each state that has its own copy.
describe("every route uses Title Case labels", () => {
  // ---- root: / and the document title
  it("/ (landing page) and the document title", async () => {
    const { default: Landing } = await import("@/app/page");
    const { metadata } = await import("@/app/layout");
    render(<Landing />);
    expectCleanCopy();
    expect(copyProblems(String(metadata.title).split(" — ")[1])).toEqual([]);
  });

  // ---- founder portal
  it("/founder: company step, deck step, submitted", async () => {
    const { default: FounderLayout } = await import("@/app/founder/layout");
    const { default: Apply } = await import("@/app/founder/page");
    pathname = "/founder";
    render(<FounderLayout><Apply /></FounderLayout>);
    fireEvent.click(screen.getByText("Add Optional Details"));
    expectCleanCopy();
    // step 2: first-pass screen and the deck upload
    posts["/api/applications"] = { application_id: 1, screen_summary: "We've completed an automated first-pass review.", missing_fields: ["website", "github_profile", "team_info"] };
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Northwind Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Pitch Deck" }));
    await screen.findByText("Choose PDF");
    expectCleanCopy();
    // step 3: submitted
    posts["/api/applications/1/upload-deck"] = { num_pages: 12, extraction_status: "extracted", extracted_fields: { missing: ["Revenue"] } };
    fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [new File(["%PDF"], "deck.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Application" }));
    await screen.findByText("Application Submitted");
    expectCleanCopy();
  });

  it("/founder: an error creating the application", async () => {
    const { default: Apply } = await import("@/app/founder/page");
    posts["/api/applications"] = new Error("Company name is required");
    render(<Apply />);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Northwind Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Pitch Deck" }));
    await screen.findByRole("alert");
    expectCleanCopy();
  });

  it("/founder/applications: with applications, and empty", async () => {
    const { default: MyApplications } = await import("@/app/founder/applications/page");
    localStorage.setItem("trajectory_my_apps", JSON.stringify([1, 2]));
    gets["/api/applications/1"] = application;
    gets["/api/applications/2"] = { ...application, id: 2, document: null, sector: "fintech" };
    render(<MyApplications />);
    await screen.findAllByText("Ledgerkit");
    expectCleanCopy();
    cleanup();
    localStorage.clear();
    render(<MyApplications />);
    await screen.findByText("You Haven't Applied Yet");
    expectCleanCopy();
  });

  it.each(["data", "loading", "error"] as const)("/founder/application/[id]: %s", async (state) => {
    const { default: Status } = await import("@/app/founder/application/[id]/page");
    fetchState = state;
    fetched["/api/applications/1"] = application;
    render(<Status />);
    expectCleanCopy();
  });

  // ---- investor workspace
  it("/vc layout: shell, nav and the phone menu", async () => {
    const { default: VcLayout } = await import("@/app/vc/layout");
    pathname = "/vc";
    render(<VcLayout><div /></VcLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Open Menu" }));
    expectCleanCopy();
  });

  it.each([["populated", dashboard], ["empty workspace", emptyDashboard]])("/vc (Dashboard): %s", async (_, data) => {
    fetched["/api/dashboard"] = data;
    const { default: Dashboard } = await import("@/app/vc/page");
    render(<Dashboard />);
    expectCleanCopy();
  });

  it("/vc (Dashboard): every step of the guided tour", async () => {
    const { GuidedTour, DASHBOARD_TOUR } = await import("@/components/GuidedTour");
    render(<GuidedTour steps={DASHBOARD_TOUR} open onClose={() => {}} />);
    for (let i = 0; i < DASHBOARD_TOUR.length; i++) {
      expectCleanCopy();
      if (i < DASHBOARD_TOUR.length - 1) fireEvent.click(screen.getByTestId("tour-next"));
    }
  });

  it("/vc/founders: leads, their row menus and a search with no match", async () => {
    pathname = "/vc/founders";
    fetched["/api/sourcing/prospects"] = { items: [
      leadRow(), leadRow({ id: 2, company: null, top_project: { name: "ledgerkit", url: null, stars: 40 } }),
      leadRow({ id: 3, stage: "screening", status: "applied" }),
    ] };
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    expectCleanCopy();
    for (const menu of document.querySelectorAll<HTMLElement>("[aria-haspopup=menu]")) { fireEvent.click(menu); expectCleanCopy(); }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expectCleanCopy();
  });

  it("/vc/founders: Remove from Shortlist in the row menu clears the record's value", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.post).mockClear();
    pathname = "/vc/founders";
    fetched["/api/sourcing/prospects"] = { items: [leadRow({ status: "saved" })] };
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    fireEvent.click(document.querySelector<HTMLElement>("[aria-haspopup=menu]")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from Shortlist" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/sourcing/prospects/1/action", { action: "clear_shortlist" }));
    expect(screen.queryByText(/Already Saved/)).toBeNull();
  });

  it("/vc/founders: empty", async () => {
    fetched["/api/sourcing/prospects"] = { items: [] };
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    expectCleanCopy();
  });

  it("/vc/founders: the Source Founders drawer, web search not set up", async () => {
    search = new URLSearchParams("source=open");
    fetched["/api/sourcing/prospects"] = { items: [leadRow()] };
    gets["/api/sourcing/web/status"] = { search_configured: false, ai_configured: false, thesis_request: "", last_search_id: null };
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    await screen.findByTestId("web-not-configured");
    expectCleanCopy();
  });

  it("/vc/founders: the Source Founders drawer with web results, sources and rejections", async () => {
    search = new URLSearchParams("source=open");
    fetched["/api/sourcing/prospects"] = { items: [leadRow()] };
    gets["/api/sourcing/web/status"] = { search_configured: true, ai_configured: true, thesis_request: "Payments infrastructure", last_search_id: 5 };
    gets["/api/sourcing/web/searches/5"] = webSearch;
    const { default: Founders } = await import("@/app/vc/founders/page");
    render(<Founders />);
    await screen.findByTestId("web-result-abc123");
    for (const b of screen.getAllByRole("button").filter((b) => b.getAttribute("aria-expanded") === "false")) fireEvent.click(b);
    expectCleanCopy();
  });

  it.each([["populated", true], ["empty", false]])("/vc/pipeline: %s", async (_, populated) => {
    fetched["/api/pipeline"] = { items: populated ? [{ ...opportunity, ...queueItem, id: 1 }] : [] };
    const { default: Pipeline } = await import("@/app/vc/pipeline/page");
    render(<Pipeline />);
    expectCleanCopy();
  });

  it("/vc/fund: profile with stale fit scores, the editor's sections, and its errors", async () => {
    gets["/api/thesis"] = { stale_fit_count: 2, thesis };
    const { default: Fund } = await import("@/app/vc/fund/page");
    render(<Fund />);
    await screen.findByTestId("stale-fit");
    expect(screen.getByTestId("stale-fit")).toHaveTextContent("2 thesis fit scores don't reflect your current thesis.");
    expectCleanCopy();
    cleanup();
    search = new URLSearchParams("edit=1");
    render(<Fund />);
    const dialog = await screen.findByRole("dialog");
    for (const tab of [...dialog.querySelectorAll<HTMLElement>("[role=tab], [aria-pressed]")]) { fireEvent.click(tab); expectCleanCopy(); }
    fireEvent.click(dialog.querySelector("[role=tab]")!);
    fireEvent.change(document.getElementById("thesis-fund_name")!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findAllByRole("alert");
    expectCleanCopy();
  });

  it("/vc/fund: no thesis yet", async () => {
    gets["/api/thesis"] = { thesis: null };
    const { default: Fund } = await import("@/app/vc/fund/page");
    render(<Fund />);
    await flush();
    expectCleanCopy();
  });

  it("/vc/map: list with a record open, sparse records, and empty", async () => {
    search = new URLSearchParams("focus=1");
    fetched["/api/map"] = { has_thesis: false, links: [], items: [mapNode, sparseNode] };
    const { default: MapPage } = await import("@/app/vc/map/page");
    render(<MapPage />);
    await screen.findByTestId("map-node-panel");
    expectCleanCopy();
    cleanup();
    search = new URLSearchParams();
    fetched["/api/map"] = { has_thesis: false, links: [], items: [] };
    render(<MapPage />);
    await flush();
    expectCleanCopy();
  });

  const TABS = ["overview", "founder", "screening", "arena", "claims", "evidence", "decision"];
  const recordWith = async (opp: object, tab: string, extra = "") => {
    search = new URLSearchParams(tab === "overview" ? extra : `tab=${tab}${extra}`);
    fetched["/api/opportunities/1"] = opp;
    fetched["/api/claims"] = claims;
    fetched["/api/contradictions"] = { items: [{ id: 1, severity: "high", description: "Users disagree.", detected_by: "rules" }] };
    fetched["/api/opportunities/1/decisions"] = { items: [{ decision: "advance", chosen_action: "Continue Diligence", decided_by: "Demo Investor", decided_at: "2026-11-01T00:00:00Z", system_recommended_action: "Continue Diligence", notes: "ledgerkit repository" }] };
    const { default: Record } = await import("@/app/vc/opportunities/[id]/page");
    render(<Record />);
  };

  it.each(TABS)("/vc/opportunities/[id]: %s tab", async (tab) => {
    await recordWith(opportunity, tab);
    if (tab === "founder") fireEvent.click(document.querySelector("[aria-expanded='false']")!);
    if (tab === "arena") {
      fireEvent.click(document.querySelector("[data-testid='arena-referee']")!);
      fireEvent.click(document.querySelector("[data-testid='arena-memo'] button")!);
      expectCleanCopy();
      fireEvent.click(screen.getByRole("button", { name: /Expand Full Debate/ }));
    }
    if (tab === "decision") {
      // every part of the step on screen at once: the picker, the note and Deciding As
      fireEvent.click(screen.getByRole("radio", { name: /Choose a Different Action/ }));
      fireEvent.click(screen.getByRole("radio", { name: "Monitor" }));
      fireEvent.click(screen.getByRole("button", { name: "Add a Note" }));
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    }
    expectCleanCopy();
  });

  // The 3D renderer draws its text outside the React tree, so its strings are
  // checked from the same builder the canvas uses, in both views.
  const mapNodes = [
    mapNode, sparseNode,
    { ...mapNode, id: 3, name: "Quill AI", company: { ...mapNode.company, name: "Quill AI", sector: "ai/ml" }, group: { key: "ai/ml", label: "ai/ml", field: "company.sector" }, new_evidence_count: 2 },
    { ...mapNode, id: 4, name: "Gridline", company: { ...mapNode.company, name: "Gridline", sector: "devtools" }, group: { key: "devtools", label: "devtools", field: "company.sector" }, momentum: { ...mapNode.momentum, value: -3 } },
    { ...sparseNode, id: 5, name: "ada", group: { key: "language:go", label: "Go Projects", field: "github_repo.language" } },
  ];
  it("/vc/map: every string the 3D renderer draws, in Relationships and Custom Axes", async () => {
    const { axesLayout, clusterColors, relationshipLayout } = await import("@/lib/opportunityMap");
    const { rendererStrings } = await import("@/components/map/sceneText");
    const nodes = mapNodes as never[];
    const colors = clusterColors(nodes);
    const strings = (["graph", "axes"] as const).flatMap((mode) => [{ x: "fit", y: "momentum", z: "score" }, { x: "evidence", y: "fit", z: "none" }].flatMap((ax) =>
      rendererStrings({ nodes, mode, colors, relationships: relationshipLayout(nodes), axes: axesLayout(nodes, ax as never) })));
    expect(strings.filter((s) => s.kind === "cluster").map((s) => s.text)).toEqual(expect.arrayContaining(["Fintech", "AI/ML", "Developer Tools", "Go Projects", "Not Enough Data to Group"]));
    expect(strings.some((s) => s.kind === "axis")).toBe(true);
    expect(strings.some((s) => s.kind === "tick")).toBe(true);
    // names (nodes, tooltip titles) are content and are never re-cased
    expect(strings.filter((s) => s.kind === "node").every((s) => s.content)).toBe(true);
    expect(strings.filter((s) => !s.content).flatMap((s) => copyProblems(s.text))).toEqual([]);
  });

  it("/vc/map: Custom Axes with the values panel, filters and the not-plotted reasons", async () => {
    search = new URLSearchParams("view=axes&focus=2");
    fetched["/api/map"] = { has_thesis: true, links: [], items: mapNodes };
    const { default: MapPage } = await import("@/app/vc/map/page");
    render(<MapPage />);
    await screen.findByTestId("map-node-panel");
    expectCleanCopy();
    // reasons are sentences: a capital first letter and a period
    const reasons = [...document.querySelectorAll("[data-testid='map-node-panel'] li")].map((li) => li.textContent ?? "");
    expect(reasons.length).toBeGreaterThan(0);
    for (const r of reasons) expect(r).toMatch(/^[A-Z].*\.$/);
    for (const label of ["Fintech", "AI/ML", "Developer Tools", "Go Projects"]) expect(screen.getAllByText(new RegExp(label.replace("/", "\\/"))).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^fintech|^ai\/ml|^devtools/)).toBeNull();
  });

  it("/vc/opportunities/[id]: overview with a current thesis fit", async () => {
    await recordWith({ ...opportunity, thesis_fit_stale: false }, "overview");
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: a recorded decision", async () => {
    posts["/api/opportunities/1/decision"] = { human_decision: { decided_by: "Demo Investor", decision: "advance", chosen_action: "Continue Diligence", system_recommended_action: "Continue Diligence", notes: "" } };
    await recordWith(opportunity, "decision");
    // confirming with nothing chosen shows the reason first
    fireEvent.click(screen.getByTestId("confirm-decision"));
    expectCleanCopy();
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByTestId("confirm-decision"));
    await screen.findByText("Decision Recorded");
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: opened from the Dashboard deck", async () => {
    const card = (id: number, name: string) => ({ opportunity_id: id, name, founder_name: null, entry_type: "outbound", stage: "diligence", next_action: "Review Recommendation",
      next_action_key: "review_recommendation", next_action_detail: "Recommended: Monitor", priority: 1, age_days: 0, waiting_since: "", group: "recommendation" });
    gets["/api/dashboard"] = { action_queue: [card(3, "Inferra"), card(1, "PayMesh"), card(4, "TerraSignal")] };
    await recordWith(opportunity, "overview", "from=deck");
    await flush();
    const strip = screen.getByTestId("deck-strip");
    expect(strip).toHaveTextContent("Back to Dashboard· 2 of 3");
    expect(within(strip).getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/vc?card=1");
    expect(within(strip).getByRole("link", { name: "Previous: Inferra" })).toHaveAttribute("href", "/vc/opportunities/3?tab=decision&from=deck");
    expect(within(strip).getByRole("link", { name: "Next: TerraSignal" })).toHaveAttribute("href", "/vc/opportunities/4?tab=decision&from=deck");
    // the header doesn't repeat the next step or the recommendation; Memo and Diligence are quiet links
    const header = document.querySelector("header")!;
    expect(header).not.toHaveTextContent(/Next Step:|Recommended:/);
    expect(within(header).getByRole("link", { name: "Memo" })).toHaveClass("link");
    // tabs keep the deck context
    fireEvent.click(screen.getByRole("tab", { name: /Claims/ }));
    expect(nav.push).toHaveBeenLastCalledWith("/vc/opportunities/1?tab=claims&from=deck", { scroll: false });
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: an application lands on its first-pass screen", async () => {
    const application = { ...opportunity, entry_type: "inbound", stage: "screening", assessment: null, debate: null, current_recommendation: null,
      next_step: { key: "review_application", label: "Review Application", detail: "New Inbound Application", priority: 2 } };
    // two applications from companies with the same name: the record's own is found by id
    fetched["/api/applications"] = { items: [
      { id: 8, company_id: 1, opportunity_id: 77, company_name: "Ledgerkit" },
      { id: 9, company_id: 1, opportunity_id: 1, company_name: "Ledgerkit" },
    ] };
    fetched["/api/applications/8"] = { id: 8, company_name: "Ledgerkit", github_profile: null, website: null, product_link: null,
      missing_fields: [], current_revenue: null, num_users: 5, funding_requested: null, document: null };
    fetched["/api/applications/9"] = { id: 9, company_name: "Ledgerkit", github_profile: "ada", website: null, product_link: "https://ledgerkit.dev",
      missing_fields: ["pitch_deck"], current_revenue: null, num_users: 1200, funding_requested: 1500000, document: null };
    await recordWith(application, "overview");
    const screenPanel = screen.getByTestId("application-screen");
    expect(screenPanel).toHaveTextContent("First-Pass Screen");
    expect(screenPanel).toHaveTextContent("1,200 UsersFounder-Reported");
    expect(screenPanel).not.toHaveTextContent("5 Users");
    expect(screenPanel).toHaveTextContent("Raising $1.5MFounder-Reported");
    expect(screenPanel).toHaveTextContent("Pitch Deck");
    // the one next action
    expect([...document.querySelectorAll(".btn-primary")].map((b) => b.textContent)).toEqual(["Run Analysis"]);
    expect(screen.queryByTestId("lead-evidence")).toBeNull();
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: a lead lands on its evidence, and Move to Screening asks first", async () => {
    await recordWith({ ...lead, company: opportunity.company }, "overview");
    const panel = screen.getByTestId("lead-evidence");
    expect(panel).toHaveTextContent("Evidence Summary");
    expect(within(panel).getAllByRole("link")[0].getAttribute("href")).toMatch(/\?tab=evidence&evidence=\d+$/);
    const primaries = [...document.querySelectorAll(".btn-primary")];
    expect(primaries.map((b) => b.textContent)).toEqual(["Move to Screening"]);
    fireEvent.click(primaries[0]);
    const confirm = screen.getByRole("region", { name: "Confirm Move to Screening" });
    expect(confirm).toHaveTextContent("No outreach is sent.");
    const { api } = await import("@/lib/api");
    expect(api.post).not.toHaveBeenCalledWith(expect.anything(), { action: "invite_to_apply" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Confirm Move" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/sourcing/prospects/1/action", { action: "invite_to_apply" }));
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: Remove from Shortlist clears a value held on the record, and the stage stays", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.post).mockClear();
    localStorage.setItem("trajectory_investor_pipeline", JSON.stringify({ 1: "monitoring" }));
    await recordWith({ ...lead, status: "saved" }, "overview");
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Shortlist" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/sourcing/prospects/1/action", { action: "clear_shortlist" }));
    expect(api.post).not.toHaveBeenCalledWith(expect.anything(), { action: "invite_to_apply" });
    expect(JSON.parse(localStorage.getItem("trajectory_investor_pipeline") ?? "{}")[1]).toBeUndefined();
    expect(screen.queryByText(/Already Saved/)).toBeNull();
    expectCleanCopy();
  });

  it.each(TABS)("/vc/opportunities/[id]: a sourcing lead, %s tab", async (tab) => {
    await recordWith(lead, tab);
    expectCleanCopy();
  });

  it.each(TABS)("/vc/opportunities/[id]: a deal with no linked founder, %s tab", async (tab) => {
    await recordWith(unlinked, tab);
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]: evidence opened from a citation", async () => {
    await recordWith(opportunity, "evidence", "&evidence=1");
    expectCleanCopy();
  });

  it("/vc/opportunities/[id]/memo and /diligence", async () => {
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

  it("/vc/opportunities/[id]/memo and /diligence: nothing generated yet", async () => {
    fetched["/api/opportunities/1"] = lead;
    fetched["/api/opportunities/1/diligence"] = { items: [] };
    fetched["/api/contradictions"] = { items: [] };
    const { default: MemoPage } = await import("@/app/vc/opportunities/[id]/memo/page");
    const { default: DiligencePage } = await import("@/app/vc/opportunities/[id]/diligence/page");
    render(<><MemoPage /><DiligencePage /></>);
    expectCleanCopy();
  });

  it("/vc/discovery and /vc/thesis redirect (no copy of their own)", async () => {
    const { default: Discovery } = await import("@/app/vc/discovery/page");
    const { default: Thesis } = await import("@/app/vc/thesis/page");
    Discovery();
    Thesis();
    expect(redirect).toHaveBeenNthCalledWith(1, "/vc/founders?source=open");
    expect(redirect).toHaveBeenNthCalledWith(2, "/vc/fund");
  });

  // loading and error states of every data route
  const DATA_ROUTES: [string, () => Promise<{ default: () => ReactElement | null }>][] = [
    ["/vc", () => import("@/app/vc/page")],
    ["/vc/founders", () => import("@/app/vc/founders/page")],
    ["/vc/pipeline", () => import("@/app/vc/pipeline/page")],
    ["/vc/map", () => import("@/app/vc/map/page")],
    ["/vc/opportunities/[id]", () => import("@/app/vc/opportunities/[id]/page")],
    ["/vc/opportunities/[id]/memo", () => import("@/app/vc/opportunities/[id]/memo/page")],
    ["/vc/opportunities/[id]/diligence", () => import("@/app/vc/opportunities/[id]/diligence/page")],
  ];
  it.each(DATA_ROUTES.flatMap(([r, load]) => (["loading", "error"] as const).map((s) => [r, s, load] as const)))("%s: %s", async (_, state, load) => {
    fetchState = state;
    const { default: Page } = await load();
    render(<Page />);
    expectCleanCopy();
  });

  it("/vc/fund: loading and error", async () => {
    const { default: Fund } = await import("@/app/vc/fund/page");
    render(<Fund />);
    expectCleanCopy();
    cleanup();
    gets["/api/thesis"] = new Error("Internal Server Error");
    render(<Fund />);
    await screen.findByRole("alert");
    expectCleanCopy();
  });

  // ---- shared: sign-in (AuthGate, unmounted while login is disabled) and toasts
  it.each(["VC", "Founder"] as const)("sign-in and create-account forms (%s)", async (persona) => {
    const { AuthGate } = await import("@/components/AuthGate");
    render(<AuthGate persona={persona}><div /></AuthGate>);
    await screen.findByRole("button", { name: "Sign In" });
    expectCleanCopy();
    fireEvent.click(screen.getByRole("button", { name: /Create (an )?Account|Sign Up/i }));
    expectCleanCopy();
  });

  it("toasts: the message is a sentence, the link is a label", async () => {
    const { ToastProvider, useToast } = await import("@/components/Toast");
    function Trigger() {
      const notify = useToast();
      return <button onClick={() => notify({ message: "Moved to Screening — it's now in Pipeline. No outreach was sent.", href: "/vc/pipeline", linkLabel: "View in Pipeline" })}>Move to Screening</button>;
    }
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Move to Screening" }));
    await waitFor(() => expect(screen.getByText("View in Pipeline")).toBeInTheDocument());
    expectCleanCopy();
  });
});
