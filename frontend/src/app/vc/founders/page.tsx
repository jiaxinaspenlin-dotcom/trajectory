"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, EmptyState, ErrorState, PageHeader, Section, Segmented, Spinner } from "@/components/ui";
import { FoundersTable } from "@/components/FoundersTable";
import { FounderLead } from "@/lib/types";
import { clearPipelineStatus, getPipeline, PipelineStatus, setPipelineStatus } from "@/lib/myWorkspace";
import { FOUNDER_VIEWS, FounderView, matchesFounderView, matchesQuery, sortLeads } from "@/lib/pipeline";

interface Prospect {
  opportunity_id: number;
  founder_id: number;
  login: string;
  name: string;
  github_url: string;
  founder_score: number;
  confidence: number;
  evidence_added: number;
  already_in_pipeline: boolean;
}
interface DiscoveryResult {
  planned_by: string;
  interpretation: string;
  queries_run: string[];
  candidates_found: number;
  prospects: Prospect[];
  searched_sources: string[];
  rate_limit_remaining: number | null;
  notes: string[];
  disclaimer: string;
}

export default function FoundersPage() {
  const leads = useFetch<{ items: FounderLead[] }>("/api/sourcing/prospects");
  const [sourcingOpen, setSourcingOpen] = useState(false);

  // Open the sourcing panel when there's a restored shortlist to show, or
  // nothing sourced yet — otherwise lead with the table.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISCOVERY_CACHE)) setSourcingOpen(true);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (leads.data && leads.data.items.length === 0) setSourcingOpen(true);
  }, [leads.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Founders"
        title="Founder leads"
        subtitle="Builders surfaced from public GitHub before they apply. Review the evidence, keep your shortlist, and move the strongest into Screening."
        actions={
          <button className="btn-primary" onClick={() => setSourcingOpen((v) => !v)} aria-expanded={sourcingOpen}>
            {sourcingOpen ? "Hide sourcing" : "+ Source founders"}
          </button>
        }
      />
      {sourcingOpen && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2"><AiDiscovery onSourced={leads.reload} /></div>
          <ManualAdd onSourced={leads.reload} />
        </div>
      )}
      <FounderLeads leads={leads} onOpenSourcing={() => setSourcingOpen(true)} />
    </div>
  );
}

const DISCOVERY_CACHE = "trajectory_last_discovery";

function AiDiscovery({ onSourced }: { onSourced: () => void }) {
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  // Restore the last shortlist so navigating to a founder and back doesn't wipe
  // it (real cached result in sessionStorage — you don't have to re-run).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISCOVERY_CACHE);
      if (raw) {
        const cached = JSON.parse(raw) as { brief: string; result: DiscoveryResult };
        setBrief(cached.brief || "");
        setResult(cached.result);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function clearResults() {
    setResult(null);
    try {
      sessionStorage.removeItem(DISCOVERY_CACHE);
    } catch {
      /* ignore */
    }
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<DiscoveryResult>("/api/sourcing/discover", { brief, limit: 8 });
      setResult(r);
      onSourced();
      try {
        sessionStorage.setItem(DISCOVERY_CACHE, JSON.stringify({ brief, result: r }));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(
        e instanceof Error && (e.message.toLowerCase().includes("ai provider") || e.message.includes("OPENAI"))
          ? "AI is not configured — set OPENAI_API_KEY to run AI Discovery."
          : e instanceof Error ? e.message : "Discovery failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Run AI Discovery" subtitle="Trajectory plans the search from your thesis, then finds & ranks real founders on GitHub">
      <textarea
        className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
        rows={2}
        placeholder="Optional: refine the search (e.g. 'technical pre-seed founders building payments infrastructure, strong recent execution'). Leave blank to use your fund thesis."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Discovering…" : "Run AI Discovery"}
        </button>
        {loading && <Spinner label="Planning the search, querying GitHub, scoring candidates…" />}
      </div>
      {error && <div className="mt-2"><ErrorState message={error} /></div>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge tone="bg-brand-wash text-brand">planned by {result.planned_by}</Badge>
            <span>{result.candidates_found} candidates found · searched {result.searched_sources.join(", ")}</span>
            {result.rate_limit_remaining !== null && <span>· GitHub search budget: {result.rate_limit_remaining}</span>}
            <button className="btn-ghost text-xs" onClick={() => setShowPlan((v) => !v)}>
              {showPlan ? "Hide" : "Show"} search plan
            </button>
            <button className="btn-ghost text-xs" onClick={clearResults}>Clear results</button>
          </div>

          {showPlan && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3 text-xs">
              <p className="text-ink-soft">{result.interpretation}</p>
              <ul className="mt-2 space-y-1 font-mono text-ink-muted">
                {result.queries_run.map((q, i) => <li key={i}>• {q}</li>)}
              </ul>
            </div>
          )}

          {result.notes.length > 0 && (
            <div className="rounded-lg border border-caution/30 bg-caution-wash p-2 text-xs text-caution">
              {result.notes.join(" ")}
            </div>
          )}

          <p className="text-sm font-medium text-ink">Ranked shortlist</p>
          {result.prospects.length ? (
            <div className="space-y-2">
              {result.prospects.map((p, idx) => (
                <div key={p.opportunity_id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink-muted">#{idx + 1}</span>
                      <Link href={`/vc/opportunities/${p.opportunity_id}`} className="truncate text-sm font-semibold text-ink hover:text-brand">
                        {p.name}
                      </Link>
                      <a href={p.github_url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">@{p.login} ↗</a>
                    </div>
                    <p className="text-xs text-ink-muted">{p.evidence_added} public evidence items collected</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="bg-brand-wash text-brand">Score {Math.round(p.founder_score)}</Badge>
                    <Link href={`/vc/opportunities/${p.opportunity_id}`} className="btn-secondary text-xs">Review</Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No candidates surfaced this run — try refining the brief or your thesis.</p>
          )}
          <p className="text-xs text-ink-muted">{result.disclaimer}</p>
        </div>
      )}
    </Section>
  );
}

function ManualAdd({ onSourced }: { onSourced: () => void }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<{ sync?: { status: string; message: string }; opportunity_id?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<{ sync?: { status: string; message: string }; opportunity_id?: number }>(
        "/api/sourcing/github/sync",
        { username: username.trim() }
      );
      setResult(r);
      onSourced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Add a GitHub Profile" subtitle="Know someone already? Sync one profile directly (live public data)">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">GitHub Username</span>
          <input className="mt-1 w-48 rounded-lg border border-line px-3 py-2 text-sm" placeholder="e.g. torvalds" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <button className="btn-secondary" onClick={sync} disabled={loading || !username.trim()}>Sync from GitHub</button>
        {loading && <Spinner label="Syncing…" />}
      </div>
      {error && <div className="mt-2"><ErrorState message={error} /></div>}
      {result && (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3 text-sm">
          <p className="font-medium text-ink">Sync {result.sync?.status}: {result.sync?.message}</p>
          {result.opportunity_id && <Link href={`/vc/opportunities/${result.opportunity_id}`} className="btn-secondary mt-2">Open Founder Profile →</Link>}
        </div>
      )}
    </Section>
  );
}

function FounderLeads({
  leads,
  onOpenSourcing,
}: {
  leads: ReturnType<typeof useFetch<{ items: FounderLead[] }>>;
  onOpenSourcing: () => void;
}) {
  const [overlay, setOverlay] = useState<Record<number, PipelineStatus>>({});
  const [view, setView] = useState<FounderView>("active");
  const [query, setQuery] = useState("");
  useEffect(() => setOverlay(getPipeline()), []);

  // Save / Monitor / Dismiss are this investor's personal shortlist — kept in
  // this browser, exactly like the opportunity detail page.
  function setStatus(id: number, status: PipelineStatus | null) {
    if (status) setPipelineStatus(id, status);
    else clearPipelineStatus(id);
    setOverlay(getPipeline());
  }

  async function moveToScreening(id: number) {
    // Existing investor-approved transition (historically named invite_to_apply):
    // moves the same opportunity into Screening. Nothing is sent to the founder.
    await api.post(`/api/sourcing/prospects/${id}/action`, { action: "invite_to_apply" });
    await leads.reload();
  }

  if (leads.loading && !leads.data) return <Section title="Leads"><Spinner label="Loading founders…" /></Section>;
  if (leads.error) {
    return (
      <Section title="Leads">
        <ErrorState message={`Couldn't load founders: ${leads.error}`} />
        <button className="btn-secondary mt-3" onClick={leads.reload}>Retry</button>
      </Section>
    );
  }
  const all = leads.data?.items ?? [];
  if (!all.length) {
    return (
      <EmptyState
        title="No founders sourced yet"
        hint="Run AI Discovery or sync a GitHub profile above — sourced founders appear here with their score, momentum, and evidence."
        action={<button className="btn-primary" onClick={onOpenSourcing}>Source founders</button>}
      />
    );
  }

  const count = (v: FounderView) => all.filter((l) => matchesFounderView(l, overlay[l.id] ?? null, v)).length;
  const shown = sortLeads(
    all.filter((l) => matchesFounderView(l, overlay[l.id] ?? null, view) && matchesQuery(l, query)),
    overlay
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Filter founders"
          value={view}
          onChange={setView}
          options={FOUNDER_VIEWS.map((v) => ({ value: v.key, label: `${v.label} ${count(v.key)}` }))}
        />
        <input
          type="search"
          aria-label="Search founders"
          placeholder="Search name, @handle, company, project"
          className="w-64 rounded-lg border border-line bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {leads.loading && <Spinner label="Refreshing…" />}
      </div>
      {shown.length ? (
        <FoundersTable leads={shown} overlay={overlay} onSetStatus={setStatus} onMoveToScreening={moveToScreening} />
      ) : (
        <EmptyState
          title="No founders match this view"
          action={<button className="btn-secondary" onClick={() => { setView("all"); setQuery(""); }}>Show all founders</button>}
        />
      )}
      <p className="text-xs text-ink-muted">
        Saved / Monitoring / Dismissed is your personal shortlist in this browser. Moving to Screening is a shared pipeline step
        that the investor approves — no outreach is ever sent automatically.
      </p>
    </div>
  );
}
