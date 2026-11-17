"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import { Badge, Button, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, Toolbar } from "@/components/ui";
import { FoundersTable } from "@/components/FoundersTable";
import { useToast } from "@/components/Toast";
import { WebSourcing } from "@/components/WebSourcing";
import { ArrowRightIcon, FoundersIcon, SearchIcon } from "@/components/icons";
import { FounderLead } from "@/lib/types";
import { clearPipelineStatus, getPipeline, PipelineStatus, setPipelineStatus } from "@/lib/myWorkspace";
import { FOUNDER_VIEWS, FounderView, inPipeline, matchesFounderView, matchesQuery, sortLeads } from "@/lib/pipeline";

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

const DISCOVERY_CACHE = "trajectory_last_discovery";
const PHONE_LABEL: Partial<Record<FounderView, string>> = { pinned: "Shortlist", in_pipeline: "Pipeline" };

export default function FoundersPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading Founders…" />}>
      <Founders />
    </Suspense>
  );
}

function Founders() {
  const leads = useFetch<{ items: FounderLead[] }>("/api/sourcing/prospects");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?source=open opens the sourcing drawer (used by the Map and empty states)
  const sourcingOpen = params.get("source") === "open";
  const setSourcingOpen = useCallback(
    (open: boolean) => router.replace(open ? `${pathname}?source=open` : pathname, { scroll: false }),
    [pathname, router]
  );

  const all = leads.data?.items ?? [];
  const pipelineCount = all.filter(inPipeline).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Founders"
        subtitle={leads.data
          ? `${all.length} Sourced ${all.length === 1 ? "Lead" : "Leads"} · ${pipelineCount} Moved to Pipeline`
          : "Leads You've Sourced from Public Evidence"}
        // with no leads yet, the empty state below carries this action
        actions={all.length > 0 && <button className="btn-primary" onClick={() => setSourcingOpen(true)}>Source Founders</button>}
      />
      <FounderLeads leads={leads} onOpenSourcing={() => setSourcingOpen(true)} />
      <Drawer
        open={sourcingOpen}
        onClose={() => setSourcingOpen(false)}
        title="Source Founders"
        subtitle="Search the web or public GitHub for leads, review the evidence, then save the ones worth tracking. Nothing is sent to founders."
        width="max-w-2xl"
      >
        <SourcingTabs onSourced={leads.reload} />
      </Drawer>
    </div>
  );
}

function SourcingTabs({ onSourced }: { onSourced: () => void }) {
  const [tab, setTab] = useState<"web" | "ai" | "github">("web");
  return (
    <div className="space-y-4">
      <Segmented
        label="Sourcing Method"
        value={tab}
        onChange={setTab}
        options={[
          { value: "web", label: "Web Search" },
          { value: "ai", label: "GitHub Discovery" },
          { value: "github", label: "GitHub Profile" },
        ]}
      />
      {tab === "web" ? <WebSourcing onSourced={onSourced} /> : tab === "ai" ? <AiDiscovery onSourced={onSourced} /> : <ManualAdd onSourced={onSourced} />}
    </div>
  );
}

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
          ? "AI is not configured — set OPENAI_API_KEY to run GitHub discovery."
          : e instanceof Error ? e.message : "Discovery failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Search Brief</span>
        <textarea
          className="textarea mt-1"
          rows={3}
          placeholder="Optional — e.g. technical pre-seed founders building payments infrastructure. Leave blank to search from your fund thesis."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={run} busy={loading}>Run GitHub Discovery</Button>
        {loading && <span className="text-meta text-ink-muted" role="status">Planning the Search, Querying GitHub, Scoring Candidates…</span>}
      </div>
      {error && <ErrorState message={error} />}

      {result && (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge tone="bg-brand-wash text-brand">Planned by {humanStatus(result.planned_by)}</Badge>
            <span className="num">{result.candidates_found} Candidates · Searched {result.searched_sources.join(", ")}</span>
            {result.rate_limit_remaining !== null && <span className="num">· GitHub Budget {result.rate_limit_remaining}</span>}
            <button className="btn-ghost btn-sm" onClick={() => setShowPlan((v) => !v)}>{showPlan ? "Hide" : "Show"} Search Plan</button>
            <button className="btn-ghost btn-sm" onClick={clearResults}>Clear</button>
          </div>
          {showPlan && (
            <div className="rounded-md border border-line bg-surface-sunken p-3 text-xs">
              <p className="text-ink-soft">{result.interpretation}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-ink-muted">{result.queries_run.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          {result.notes.length > 0 && (
            <p className="rounded-md border border-caution/30 bg-caution-wash px-3 py-2 text-xs text-caution">{result.notes.join(" ")}</p>
          )}
          {result.prospects.length ? (
            <ol className="divide-y divide-line" aria-label="Discovered Founders">
              {result.prospects.map((p, idx) => (
                <li key={p.opportunity_id} className="animate-rise" style={{ "--i": idx } as React.CSSProperties}>
                  <Link href={`/vc/opportunities/${p.opportunity_id}`} className="row-interactive group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5">
                    <span className="num w-5 text-meta text-ink-muted">{idx + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink group-hover:text-brand" data-content>{p.name}</span>
                      <span className="block text-meta text-ink-muted"><span data-content>@{p.login}</span> · <span className="num">{p.evidence_added}</span> Evidence</span>
                    </span>
                    <span className="num text-section text-ink">{Math.round(p.founder_score)}</span>
                    <ArrowRightIcon size={14} className="slide-arrow" />
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">No candidates surfaced this run — try refining the brief or your thesis.</p>
          )}
          <p className="text-xs text-ink-muted">{result.disclaimer}</p>
        </div>
      )}
    </div>
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
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (username.trim()) sync(); }}>
        <label className="block min-w-[14rem] flex-1">
          <span className="label">GitHub Username</span>
          <input className="input mt-1" placeholder="e.g. torvalds" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" busy={loading} disabled={!username.trim()}>Sync from GitHub</Button>
      </form>
      <p className="text-xs text-ink-muted">Pulls one public profile and its repositories as live evidence, then scores the founder.</p>
      {error && <ErrorState message={error} />}
      {result && (
        <div className="animate-rise rounded-lg bg-surface-sunken p-3 text-sm">
          <p className="font-medium text-ink">Sync {humanStatus(result.sync?.status ?? "")}: {result.sync?.message}</p>
          {result.opportunity_id && <Link href={`/vc/opportunities/${result.opportunity_id}`} className="btn-secondary btn-sm mt-2">Open Founder Profile →</Link>}
        </div>
      )}
    </div>
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
  const notify = useToast();
  const [view, setView] = useState<FounderView>("active");
  const [query, setQuery] = useState("");
  useEffect(() => setOverlay(getPipeline()), []);

  // Save / Monitor / Dismiss are this investor's personal shortlist — kept in
  // this browser, exactly like the opportunity detail page.
  const leadName = (id: number) => {
    const l = (leads.data?.items ?? []).find((x) => x.id === id);
    return l ? l.founder?.full_name || l.company?.name || `Opportunity #${id}` : `Opportunity #${id}`;
  };

  function setStatus(id: number, status: PipelineStatus | null) {
    if (status) setPipelineStatus(id, status);
    else clearPipelineStatus(id);
    setOverlay(getPipeline());
    notify({
      message: !status ? `${leadName(id)} removed from your shortlist.`
        : status === "dismissed" ? `${leadName(id)} dismissed — hidden from All active.`
        : `${leadName(id)} shortlisted as ${status === "saved" ? "Saved" : "Monitoring"}.`,
    });
  }

  async function moveToScreening(id: number) {
    // Existing investor-approved transition (historically named invite_to_apply):
    // moves the same opportunity into Screening. Nothing is sent to the founder.
    await api.post(`/api/sourcing/prospects/${id}/action`, { action: "invite_to_apply" });
    await leads.reload();
    notify({ message: `${leadName(id)} moved to Screening. No outreach was sent.`, href: "/vc/pipeline?stage=screening", linkLabel: "View in Pipeline" });
  }

  if (leads.loading && !leads.data) return <PageSkeleton label="Loading Founders…" />;
  if (leads.error) return <ErrorState message={`Couldn't load founders: ${leads.error}`} onRetry={leads.reload} />;
  const all = leads.data?.items ?? [];
  if (!all.length) {
    return (
      <EmptyState
        icon={<FoundersIcon size={20} />}
        title="No Founders Sourced Yet"
        hint="Search the web for launches and company sites, or source from GitHub. Saved leads appear here with their evidence."
        action={<button className="btn-primary" onClick={onOpenSourcing}>Source Founders</button>}
      />
    );
  }

  const count = (v: FounderView) => all.filter((l) => matchesFounderView(l, overlay[l.id] ?? null, v)).length;
  const shown = sortLeads(
    all.filter((l) => matchesFounderView(l, overlay[l.id] ?? null, view) && matchesQuery(l, query)),
    overlay
  );

  return (
    <div className="space-y-6">
      <Toolbar>
        {/* scrolls inside its own row on phones instead of widening the page */}
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="Filter Founders"
            value={view}
            onChange={setView}
            options={FOUNDER_VIEWS.filter((v) => v.key !== "all").map((v) => ({
              value: v.key,
              // shorter on phones so every view fits without scrolling
              label: <>{PHONE_LABEL[v.key] ? <><span className="sm:hidden">{PHONE_LABEL[v.key]}</span><span className="hidden sm:inline">{v.label}</span></> : v.label} <span className="ml-0.5 text-ink-faint">{count(v.key)}</span></>,
            }))}
          />
        </div>
        <label className="relative w-full sm:w-auto">
          <span className="sr-only">Search Founders</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            aria-label="Search Founders"
            placeholder="Search Name, @handle, Company, Project"
            className="input w-full pl-9 sm:w-72"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {leads.loading && <span className="spinner h-3.5 w-3.5 text-brand" role="status" aria-label="Refreshing" />}
      </Toolbar>
      {shown.length ? (
        <FoundersTable leads={shown} overlay={overlay} onSetStatus={setStatus} onMoveToScreening={moveToScreening} />
      ) : (
        <EmptyState
          title="No Founders Match This View"
          action={<button className="btn-secondary" onClick={() => { setView("active"); setQuery(""); }}>Show All Active Founders</button>}
        />
      )}
      <p className="text-meta text-ink-muted">
        Stage is shared with the fund; your shortlist (Saved, Monitoring, Dismissed) is personal to this browser. No outreach is ever sent automatically.
      </p>
    </div>
  );
}
