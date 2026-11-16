"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { setPipelineStatus } from "@/lib/myWorkspace";
import { WebEvidence, WebResult, WebSearchResponse, WebSearchStatus, WebSource } from "@/lib/types";
import { useToast } from "./Toast";
import { Badge, ErrorState, Spinner } from "./ui";

const KIND_LABEL: Record<WebEvidence["kind"], string> = {
  launch: "Launch",
  release: "Release",
  changelog: "Changelog",
  company_site: "Company Site",
  press: "Press",
  other: "Source",
};

const ERROR_COPY: Record<string, string> = {
  not_configured: "Web search isn't configured. Add TAVILY_API_KEY to the backend environment and restart it.",
  invalid_credentials: "The web search provider rejected the configured TAVILY_API_KEY. Check the key and restart the backend.",
  plan_limit: "The web search plan's credit limit has been reached. Searches will work again when credits are available.",
  rate_limited: "Web search is rate limited right now. Wait a minute and try again.",
  provider_error: "The web search provider returned an error. Try again shortly.",
  provider_unreachable: "Couldn't reach the web search provider. Check the backend's network connection.",
  ai_unavailable: "Results are structured with AI, which isn't configured. Set OPENAI_API_KEY on the backend.",
};

export function formatEvidenceDate(e: Pick<WebEvidence, "event_date" | "date_precision">): string | null {
  if (!e.event_date) return null;
  const d = new Date(`${e.event_date}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
    ...(e.date_precision === "month" ? {} : { day: "numeric" }),
  });
}

export function WebSourcing({ onSourced }: { onSourced: () => void }) {
  const [status, setStatus] = useState<WebSearchStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [search, setSearch] = useState<WebSearchResponse | null>(null);
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setStatusError(null);
    try {
      const s = await api.get<WebSearchStatus>("/api/sourcing/web/status");
      setStatus(s);
      // Reopen the latest shortlist from the server so leaving and coming back
      // doesn't require (or pay for) another search.
      if (s.last_search_id) {
        const last = await api.get<WebSearchResponse>(`/api/sourcing/web/searches/${s.last_search_id}`);
        setSearch((cur) => cur ?? last);
        setRequest((cur) => cur || last.request);
        setRestored(true);
      }
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Couldn't check web search.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<WebSearchResponse>("/api/sourcing/web/search", { request: request.trim() });
      setSearch(r);
      setRestored(false);
      if (r.updated_leads.length) onSourced();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      setError((code && ERROR_COPY[code]) || (e instanceof Error ? e.message : "Search failed."));
    } finally {
      setLoading(false);
    }
  }

  function onSaved(key: string, opportunityId: number, created: boolean) {
    setSearch((s) =>
      s && {
        ...s,
        results: s.results.map((r) =>
          r.key === key
            ? { ...r, saved_opportunity_id: opportunityId, existing: r.existing ?? { opportunity_id: opportunityId, name: r.company_name, stage: "sourcing", evidence_added: created ? r.evidence.length : 0, evidence_known: 0 } }
            : r
        ),
      }
    );
    onSourced();
  }

  if (statusError) return <ErrorState message={`Couldn't check web search: ${statusError}`} onRetry={loadStatus} />;
  if (!status) return <Spinner label="Checking Web Search…" />;

  if (!status.search_configured || !status.ai_configured) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-white px-5 py-6" data-testid="web-not-configured">
        <p className="text-sm font-medium text-ink">Web Search Isn&apos;t Set up Yet</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-muted">
          {!status.search_configured && <li>Add <code className="font-mono text-ink-soft">TAVILY_API_KEY</code> to the backend environment and restart it.</li>}
          {!status.ai_configured && <li>Add <code className="font-mono text-ink-soft">OPENAI_API_KEY</code>. Results are structured with AI and checked against their sources.</li>}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">GitHub discovery and GitHub profile sync still work in the other tabs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (request.trim().length >= 3 && !loading) run();
        }}
      >
        <label className="block">
          <span className="label">What Are You Looking For?</span>
          <textarea
            className="textarea mt-1"
            rows={3}
            placeholder="e.g. Developer tools startups that launched a product in the last six months"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={loading || request.trim().length < 3}>
            {loading ? "Searching…" : "Search the Web"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || !status.thesis_request}
            title={status.thesis_request ? "Fill the request from your fund thesis, then edit it before searching." : "Set up your fund thesis first."}
            onClick={() => setRequest(status.thesis_request)}
          >
            Start from Fund Thesis
          </button>
          {loading && <Spinner label="Planning Queries, Searching the Web, Checking Each Claim Against Its Source…" />}
        </div>
        <p className="text-xs text-ink-muted">
          Searches company sites, launch posts, and changelogs. Nothing is added to Founders until you save a result.
        </p>
      </form>

      {error && <ErrorState message={error} onRetry={request.trim().length >= 3 ? run : undefined} />}
      {search && !loading && <SearchResults search={search} restored={restored} onSaved={onSaved} />}
    </div>
  );
}

function SearchResults({
  search,
  restored,
  onSaved,
}: {
  search: WebSearchResponse;
  restored: boolean;
  onSaved: (key: string, opportunityId: number, created: boolean) => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const sources = Object.fromEntries(search.sources.map((s) => [s.id, s]));

  return (
    <section className="space-y-3 border-t border-line pt-4" aria-label="Web Search Results" data-testid="web-results">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        {restored && <Badge>Last Search</Badge>}
        <span className="num" data-testid="web-results-summary">
          {search.results.length} {search.results.length === 1 ? "Lead" : "Leads"} from {search.source_count} {search.source_count === 1 ? "Source" : "Sources"}
        </span>
        <span>· {search.queries.length} {search.queries.length === 1 ? "Query" : "Queries"}</span>
        <button type="button" className="btn-ghost btn-sm" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
          {showSources ? "Hide" : "Show"} Sources
        </button>
        {search.rejected.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" aria-expanded={showRejected} onClick={() => setShowRejected((v) => !v)}>
            {search.rejected.length} Left Out
          </button>
        )}
      </div>

      {showSources && <SourceList sources={search.sources} queries={search.queries} />}
      {showRejected && (
        <ul className="space-y-1 rounded-md border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
          {search.rejected.map((r, i) => (
            <li key={i}><span className="text-ink-soft">{r.company_name || "Unnamed Candidate"}</span>: {r.reason}</li>
          ))}
        </ul>
      )}

      {search.notes.length > 0 && (
        <p className="rounded-md border border-caution/30 bg-caution-wash px-3 py-2 text-xs text-caution">{search.notes.join(" ")}</p>
      )}

      {search.updated_leads.length > 0 && (
        <div className="rounded-md border border-signal/40 bg-signal-wash px-3 py-2 text-sm text-ink-soft" role="status" data-testid="web-updated-leads">
          New Evidence Added to{" "}
          {search.updated_leads.map((u, i) => (
            <span key={u.opportunity_id}>
              {i > 0 && ", "}
              <Link href={`/vc/opportunities/${u.opportunity_id}`} className="font-medium text-ink hover:text-brand">{u.name}</Link>{" "}
              <span className="num">(+{u.evidence_added} {u.evidence_added === 1 ? "Source" : "Sources"})</span>
            </span>
          ))}
        </div>
      )}

      {search.status === "no_sources" && (
        <p className="rounded-md border border-line bg-surface-sunken px-3 py-3 text-sm text-ink-muted">
          The web search returned no pages for this request. Try broader wording or a different sector.
        </p>
      )}
      {search.status === "no_results" && (
        <p className="rounded-md border border-line bg-surface-sunken px-3 py-3 text-sm text-ink-muted">
          Found {search.source_count} pages, but none described a specific early-stage company with claims that could be tied to a source.
          Try naming a product category or a kind of launch.
        </p>
      )}

      <ol className="space-y-3">
        {search.results.map((r) => (
          <li key={r.key}>
            <ResultCard searchId={search.search_id} result={r} sources={sources} onSaved={onSaved} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function SourceList({ sources, queries }: { sources: WebSource[]; queries: string[] }) {
  return (
    <div className="rounded-md border border-line bg-surface-sunken p-3 text-xs">
      <p className="text-ink-muted">Queries: {queries.map((q) => `“${q}”`).join(" · ")}</p>
      <ol className="mt-2 space-y-1">
        {sources.map((s) => (
          <li key={s.id} className="flex gap-2">
            <span className="num w-6 shrink-0 font-mono text-ink-faint">{s.id}</span>
            <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-ink-soft hover:text-brand">
              {s.title || s.url} <span className="text-ink-muted">· {s.domain} ↗</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Cites({ ids, sources }: { ids: string[]; sources: Record<string, WebSource> }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-middle">
      {ids.map((id) => (
        <a
          key={id}
          href={sources[id]?.url}
          target="_blank"
          rel="noreferrer"
          title={sources[id] ? `${sources[id].title} — ${sources[id].domain}` : id}
          data-content
          className="rounded border border-line px-1 font-mono text-[11px] leading-4 text-ink-muted hover:border-brand hover:text-brand"
        >
          {id}
        </a>
      ))}
    </span>
  );
}

function FounderLine({ r }: { r: WebResult }) {
  const f = r.founder;
  return (
    <p className="text-xs text-ink-muted">
      {f.status === "verified_github" ? (
        <>
          Founder <a href={f.profile_url ?? undefined} target="_blank" rel="noreferrer" className="text-ink-soft hover:text-brand">{f.name} ↗</a>{" "}
          <Badge tone="bg-positive-wash text-positive" title={r.github?.basis}>Verified via GitHub</Badge>
        </>
      ) : f.status === "named_unverified" ? (
        <>
          Founder Named on <a href={f.source_url ?? undefined} target="_blank" rel="noreferrer" className="hover:text-brand">Source</a>:{" "}
          <span className="text-ink-soft">{f.name}</span>{" "}
          <Badge tone="bg-caution-wash text-caution" title="Named on a retrieved page; not matched to a verified profile.">Unverified</Badge>
        </>
      ) : (
        <>Founder Not Identified Yet</>
      )}
      {r.github && r.founder.status !== "verified_github" && (
        <span className="ml-2">
          · GitHub <a href={r.github.url ?? undefined} target="_blank" rel="noreferrer" className="text-ink-soft hover:text-brand">@{r.github.login} ↗</a>{" "}
          {r.github.verified
            ? <Badge tone="bg-positive-wash text-positive" title={r.github.basis}>Verified Match</Badge>
            : <span title={r.github.basis}>(Not Verified)</span>}
        </span>
      )}
    </p>
  );
}

function EvidenceRow({ e, showStatus }: { e: WebEvidence; showStatus: boolean }) {
  const date = formatEvidenceDate(e);
  return (
    <li className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-0.5 py-1.5" data-testid="web-evidence">
      <span className="text-xs text-ink-muted">
        {date ? (
          <span title={e.date_basis === "stated_in_source" ? `Date stated in the source: “${e.date_text}”.` : "Published date reported by the search provider."}>
            {date}{e.date_basis === "search_provider" && <span aria-hidden> *</span>}
          </span>
        ) : (
          <span className="italic">Date Unknown</span>
        )}
      </span>
      <span className="min-w-0 text-sm text-ink-soft">
        <span className="mr-1.5 text-xs font-medium text-ink-muted">{KIND_LABEL[e.kind]}</span>
        {e.claim}
        {showStatus && e.status === "new" && <Badge tone="ml-1.5 bg-signal-wash text-caution">New</Badge>}
        {showStatus && e.status === "known" && <span className="ml-1.5 text-xs text-ink-faint">Already Saved</span>}
        {e.quote && (
          <span className="mt-0.5 block border-l-2 border-line pl-2 text-[13px] italic text-ink-muted" title="Quoted from the Source">
            “{e.quote}”
          </span>
        )}
        <a href={e.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink-muted hover:text-brand">
          {e.source_id} · {e.source_role === "company_site" ? "Company Site" : e.source_role === "launch_page" ? "Launch Page" : "Source"} · {e.domain} ↗
        </a>
      </span>
    </li>
  );
}

function ResultCard({
  searchId,
  result: r,
  sources,
  onSaved,
}: {
  searchId: number;
  result: WebResult;
  sources: Record<string, WebSource>;
  onSaved: (key: string, opportunityId: number, created: boolean) => void;
}) {
  const [busy, setBusy] = useState<"saved" | "monitoring" | null>(null);
  const notify = useToast();
  const [error, setError] = useState<string | null>(null);
  const oppId = r.saved_opportunity_id ?? r.existing?.opportunity_id ?? null;

  async function save(status: "saved" | "monitoring") {
    setBusy(status);
    setError(null);
    try {
      const res = await api.post<{ opportunity_id: number; created: boolean }>(
        `/api/sourcing/web/searches/${searchId}/results/${r.key}/save`,
        { status }
      );
      // keep this browser's shortlist in step with the shared status
      setPipelineStatus(res.opportunity_id, status);
      onSaved(r.key, res.opportunity_id, res.created);
      notify({
        message: res.created
          ? `${r.company_name} added to Founders as a lead in Sourcing (${status === "saved" ? "Saved" : "Monitoring"}).`
          : `${r.company_name} was already a lead — updated it.`,
        href: `/vc/opportunities/${res.opportunity_id}`,
        linkLabel: "Open Lead",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this lead.");
    } finally {
      setBusy(null);
    }
  }

  const hasDated = r.evidence.some((e) => e.date_basis === "search_provider");

  return (
    <article className="card p-4" data-testid={`web-result-${r.key}`} aria-label={r.company_name}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{r.company_name}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
            {r.website
              ? <a href={r.website} target="_blank" rel="noreferrer" title={r.website_basis ?? undefined} className="text-brand hover:underline" data-content>{r.domain} ↗</a>
              : <span>Website Unknown</span>}
            {r.sector && <span>· {r.sector}</span>}
          </p>
        </div>
        {oppId != null && (
          <Badge tone="bg-brand-wash text-brand" title="This company already has a lead in Founders, matched by a reliable identifier.">
            {r.saved_opportunity_id ? "Saved" : "Already in Founders"}
          </Badge>
        )}
      </header>

      <p className="mt-2 text-sm text-ink">
        {r.building.text}
        <Cites ids={r.building.source_ids} sources={sources} />
      </p>
      <div className="mt-1"><FounderLine r={r} /></div>

      <div className="mt-3 grid gap-3">
        <section>
          <h4 className="label">Why It Surfaced</h4>
          <p className="mt-1 text-sm text-ink-soft">
            {r.why_matched.text}
            <Cites ids={r.why_matched.source_ids} sources={sources} />
          </p>
        </section>
        <section>
          <h4 className="label">Evidence</h4>
          <ul className="mt-0.5 divide-y divide-line">
            {r.evidence.map((e) => <EvidenceRow key={e.source_id} e={e} showStatus={oppId != null} />)}
          </ul>
          {hasDated && <p className="mt-1 text-xs text-ink-muted">* Published date reported by the search provider, not stated on the page.</p>}
        </section>
        <section>
          <h4 className="label">What&apos;s Unknown</h4>
          {r.unknowns.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-muted">
              {r.unknowns.map((u) => <li key={u}>{u}</li>)}
            </ul>
          ) : <p className="mt-1 text-sm text-ink-muted">Nothing flagged.</p>}
        </section>
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {oppId != null ? (
          <>
            <Link href={`/vc/opportunities/${oppId}`} className="btn-secondary btn-sm">Open Lead</Link>
            <Link href={`/vc/map?focus=${oppId}`} className="btn-ghost btn-sm">View on Map</Link>
            {r.existing && r.existing.evidence_added > 0 && !r.saved_opportunity_id && (
              <span className="text-xs text-ink-muted">+{r.existing.evidence_added} New {r.existing.evidence_added === 1 ? "Source" : "Sources"} Added</span>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn-primary btn-sm" disabled={busy != null} onClick={() => save("saved")}>
              {busy === "saved" ? "Saving…" : "Save Lead"}
            </button>
            <button type="button" className="btn-secondary btn-sm" disabled={busy != null} onClick={() => save("monitoring")}>
              {busy === "monitoring" ? "Saving…" : "Monitor"}
            </button>
            <span className="text-xs text-ink-muted">Adds to Founders in Sourcing. Move to Screening stays your call.</span>
          </>
        )}
        {error && <p className="w-full text-xs text-negative" role="alert">{error}</p>}
      </footer>
    </article>
  );
}

// One saved lead: search its own site's release pages and launch sites, and
// append only sources it doesn't have yet. Stage never changes.
export function LeadWebCheck({ opportunityId, onUpdated }: { opportunityId: number; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.post<WebSearchResponse & { lead: { evidence_added: number; matched: boolean } }>(`/api/sourcing/web/check/${opportunityId}`);
      const n = r.lead.evidence_added;
      setMessage({
        tone: "ok",
        text: n
          ? `${n} New ${n === 1 ? "Source" : "Sources"} Added`
          : r.lead.matched
          ? `No New Sources (Checked ${r.source_count} Pages)`
          : `Nothing Found That Could Be Tied to This Lead (Checked ${r.source_count} Pages)`,
      });
      if (n) onUpdated();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      setMessage({ tone: "error", text: (code && ERROR_COPY[code]) || (e instanceof Error ? e.message : "Check failed.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {message && (
        <span role={message.tone === "error" ? "alert" : "status"} data-testid="web-check-result"
          className={`text-xs ${message.tone === "error" ? "text-negative" : "text-ink-muted"}`}>
          {message.text}
        </span>
      )}
      <button type="button" className="btn-secondary btn-sm" onClick={check} disabled={busy}
        title="Search this lead's own site and launch sites for releases or launches it doesn't have yet.">
        {busy ? "Checking the Web…" : "Check the Web for Updates"}
      </button>
    </span>
  );
}
