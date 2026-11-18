import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LeadWebCheck, WebSourcing, formatEvidenceDate } from "./WebSourcing";
import { FoundersTable } from "./FoundersTable";
import { ApiError } from "@/lib/api";
import { FounderLead, WebResult, WebSearchResponse, WebSearchStatus } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));

const status = (over: Partial<WebSearchStatus> = {}): WebSearchStatus => ({
  provider: "tavily", search_configured: true, ai_configured: true,
  thesis_request: "Seed startups building in Fintech that recently launched or shipped a product release.",
  last_search_id: null, ...over,
});

const result = (over: Partial<WebResult> = {}): WebResult => ({
  key: "abc123", company_name: "Ledgerly", website: "https://ledgerly.dev", domain: "ledgerly.dev", website_basis: "A cited source is on this domain or links to it", sector: "Fintech",
  building: { text: "A reconciliation API for marketplaces.", source_ids: ["S1"] },
  why_matched: { text: "Payments infrastructure launched this year.", source_ids: ["S1", "S2"] },
  founder: { name: "Maya Chen", status: "named_unverified", source_url: "https://ledgerly.dev/", profile_url: null },
  github: null,
  evidence: [
    { source_id: "S1", url: "https://ledgerly.dev/", canonical_url: "https://ledgerly.dev", title: "Ledgerly", domain: "ledgerly.dev",
      kind: "company_site", claim: "Reconciliation API for marketplaces", quote: "", event_date: "2026-03-03",
      date_precision: "day", date_basis: "stated_in_source", date_text: "March 3, 2026" },
    { source_id: "S2", url: "https://news.ycombinator.com/item?id=1", canonical_url: "https://news.ycombinator.com/item", title: "Show HN", domain: "news.ycombinator.com",
      kind: "launch", claim: "Launched on Show HN", quote: "", event_date: null, date_precision: null, date_basis: null, date_text: null },
  ],
  unknowns: ["Founder identity not verified", "Team size"],
  identifiers: [{ kind: "domain", value: "ledgerly.dev", verified: true }],
  existing: null, saved_opportunity_id: null, ...over,
});

const response = (over: Partial<WebSearchResponse> = {}): WebSearchResponse => ({
  search_id: 5, request: "payments", status: "success", provider: "tavily", queries: ["payments api launch"], interpretation: "",
  source_count: 2,
  sources: [
    { id: "S1", url: "https://ledgerly.dev/", title: "Ledgerly", domain: "ledgerly.dev", published_date: null, query: "q" },
    { id: "S2", url: "https://news.ycombinator.com/item?id=1", title: "Show HN", domain: "news.ycombinator.com", published_date: null, query: "q" },
  ],
  results: [result()], rejected: [{ company_name: "Acme", reason: "A claim was not tied to a retrieved source." }],
  notes: [], updated_leads: [], created_at: null, ...over,
});

afterEach(() => {
  get.mockReset();
  post.mockReset();
  localStorage.clear();
});

describe("WebSourcing", () => {
  it("explains missing credentials instead of showing an empty search", async () => {
    get.mockResolvedValueOnce(status({ search_configured: false }));
    render(<WebSourcing onSourced={() => {}} />);
    const box = await screen.findByTestId("web-not-configured");
    expect(box).toHaveTextContent("TAVILY_API_KEY");
    expect(box).not.toHaveTextContent("OPENAI_API_KEY");
    expect(screen.queryByRole("button", { name: "Search the Web" })).not.toBeInTheDocument();
  });

  it("starts from the thesis, then shows why, evidence, and unknowns for each result", async () => {
    get.mockResolvedValueOnce(status());
    post.mockResolvedValueOnce(response());
    render(<WebSourcing onSourced={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start from Fund Thesis" }));
    const box = screen.getByLabelText("What Are You Looking For?") as HTMLTextAreaElement;
    expect(box.value).toMatch(/^Seed startups building in Fintech/);
    fireEvent.click(screen.getByRole("button", { name: "Search the Web" }));

    const card = await screen.findByTestId("web-result-abc123");
    expect(post).toHaveBeenCalledWith("/api/sourcing/web/search", { request: box.value });
    expect(within(card).getByText("Why It Surfaced")).toBeInTheDocument();
    expect(within(card).getByText("Evidence")).toBeInTheDocument();
    expect(within(card).getByText("What's Unknown")).toBeInTheDocument();
    expect(within(card).getByText("Mar 3, 2026")).toBeInTheDocument();
    expect(within(card).getByText("Date Unknown")).toBeInTheDocument();
    expect(within(card).getByText("Unverified")).toBeInTheDocument();
    expect(within(card).getAllByRole("link", { name: "S1" })[0]).toHaveAttribute("href", "https://ledgerly.dev/");
    expect(screen.getByText("1 Left Out")).toBeInTheDocument();
  });

  it("saves through the stored search and then links to the same record", async () => {
    get.mockResolvedValueOnce(status({ last_search_id: 5 })).mockResolvedValueOnce(response());
    post.mockResolvedValueOnce({ opportunity_id: 42, created: true });
    const onSourced = vi.fn();
    render(<WebSourcing onSourced={onSourced} />);
    const card = await screen.findByTestId("web-result-abc123");
    expect(screen.getByText("Last Search")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Monitor" }));
    await waitFor(() => expect(within(card).getByRole("link", { name: "Open Lead" })).toHaveAttribute("href", "/vc/opportunities/42"));
    expect(post).toHaveBeenCalledWith("/api/sourcing/web/searches/5/results/abc123/save", { status: "monitoring" });
    expect(within(card).getByRole("link", { name: "View on Map" })).toHaveAttribute("href", "/vc/map?focus=42");
    expect(onSourced).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("trajectory_investor_pipeline") || "{}")).toEqual({ 42: "monitoring" });
    // saving never offers a Screening move here
    expect(within(card).queryByText(/Move to Screening/)).not.toBeInTheDocument();
  });

  it("marks matched leads, new vs known evidence, and leads updated by the search", async () => {
    get.mockResolvedValueOnce(status());
    const matched = result({
      existing: { opportunity_id: 42, name: "Ledgerly", stage: "sourcing", evidence_added: 1, evidence_known: 1 },
      evidence: result().evidence.map((e, i) => ({ ...e, status: i === 0 ? "new" : "known" })),
    });
    post.mockResolvedValueOnce(response({ results: [matched], updated_leads: [{ opportunity_id: 42, name: "Ledgerly", evidence_added: 1 }] }));
    render(<WebSourcing onSourced={() => {}} />);
    fireEvent.change(await screen.findByLabelText("What Are You Looking For?"), { target: { value: "payments" } });
    fireEvent.click(screen.getByRole("button", { name: "Search the Web" }));
    expect(await screen.findByTestId("web-updated-leads")).toHaveTextContent("New Evidence Added to Ledgerly (+1 Source)");
    const card = screen.getByTestId("web-result-abc123");
    expect(within(card).getByText("Already in Founders")).toBeInTheDocument();
    expect(within(card).getByText("New")).toBeInTheDocument();
    expect(within(card).getByText("Already Saved")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Save lead" })).not.toBeInTheDocument();
  });

  it("maps provider failures and zero matches to useful messages", async () => {
    get.mockResolvedValueOnce(status());
    post.mockRejectedValueOnce(new ApiError(429, "rate", "rate_limited"));
    render(<WebSourcing onSourced={() => {}} />);
    fireEvent.change(await screen.findByLabelText("What Are You Looking For?"), { target: { value: "payments" } });
    fireEvent.click(screen.getByRole("button", { name: "Search the Web" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rate limited");

    post.mockResolvedValueOnce(response({ status: "no_results", results: [], rejected: [], source_count: 6 }));
    fireEvent.click(screen.getByRole("button", { name: "Search the Web" }));
    expect(await screen.findByText(/Found 6 pages, but none described/)).toBeInTheDocument();
  });

  it("formats month-precision dates without inventing a day", () => {
    expect(formatEvidenceDate({ event_date: "2026-10-01", date_precision: "month" })).toBe("Oct 2026");
    expect(formatEvidenceDate({ event_date: null, date_precision: null })).toBeNull();
  });
});

describe("LeadWebCheck", () => {
  it("reports new sources and refreshes, or says nothing new was found", async () => {
    const onUpdated = vi.fn();
    post.mockResolvedValueOnce({ ...response(), source_count: 9, lead: { evidence_added: 2, matched: true } });
    render(<LeadWebCheck opportunityId={42} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "Check the Web for Updates" }));
    expect(await screen.findByTestId("web-check-result")).toHaveTextContent("2 New Sources Added");
    expect(post).toHaveBeenCalledWith("/api/sourcing/web/check/42", undefined);
    expect(onUpdated).toHaveBeenCalledTimes(1);

    post.mockResolvedValueOnce({ ...response(), source_count: 9, lead: { evidence_added: 0, matched: true } });
    fireEvent.click(screen.getByRole("button", { name: "Check the Web for Updates" }));
    await waitFor(() => expect(screen.getByTestId("web-check-result")).toHaveTextContent("No New Sources (Checked 9 Pages)"));
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });
});

describe("FoundersTable web leads", () => {
  const webLead: FounderLead = {
    id: 42, fund_id: 1, entry_type: "outbound", stage: "sourcing", status: "saved", founder: null,
    company: { id: 3, name: "Ledgerly", website: "https://ledgerly.dev", github_org: null, sector: "Fintech", stage: null, geography: null,
      business_model: null, one_liner: "A reconciliation API for marketplaces.", description: "", is_demo: false },
    thesis_fit_score: 60, surfaced_reason: "", first_signal_at: "2026-11-01T00:00:00Z", recommendation_at: null,
    founder_score: null, is_demo: false, evidence_count: 3, top_project: null, new_evidence_count: 1,
    identity: { founder_named: "Maya Chen", founder_named_source: "https://ledgerly.dev/", identifiers: [{ kind: "domain", value: "ledgerly.dev" }] },
  };

  it("shows New evidence, the company, and the founder as unverified", () => {
    render(<FoundersTable leads={[webLead]} overlay={{}} onSetStatus={() => {}} onMoveToScreening={async () => {}} />);
    const row = screen.getByTestId("founder-row-42");
    expect(within(row).getByTestId("new-evidence-42")).toHaveTextContent("New Evidence · 1");
    expect(within(row).getByTestId("new-evidence-42")).toHaveAttribute("href", "/vc/opportunities/42?tab=evidence");
    expect(within(row).getByText("Named on Source: Maya Chen · Unverified")).toBeInTheDocument();
    expect(within(row).getByText("ledgerly.dev ↗")).toHaveAttribute("href", "https://ledgerly.dev");
  });
});
