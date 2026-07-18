"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";
import { Opportunity } from "@/lib/types";
import { humanStatus, trajectoryTone } from "@/lib/format";

export default function DiscoveryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Founder discovery</h1>
        <p className="text-sm text-ink-muted">
          Natural-language search over your indexed dataset, plus live outbound sourcing from public GitHub.
        </p>
      </div>
      <NlSearch />
      <GithubSync />
      <Prospects />
    </div>
  );
}

function NlSearch() {
  const [q, setQ] = useState("Find technical pre-seed founders in Boston building financial infrastructure, with strong recent execution, no prior institutional funding, and evidence of product adoption.");
  const [filters, setFilters] = useState<any | null>(null);
  const [results, setResults] = useState<Opportunity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    setLoading(true); setError(null); setResults(null);
    try {
      const r = await api.post<{ filters: any; searched_sources: string[] }>("/api/search/parse", { query: q });
      setFilters(r.filters);
      setSources(r.searched_sources);
    } catch (e) { setError(e instanceof Error ? e.message : "Parse failed"); }
    finally { setLoading(false); }
  }

  async function apply() {
    setLoading(true); setError(null);
    try {
      const r = await api.post<{ results: Opportunity[] }>("/api/search/apply", { filters });
      setResults(r.results);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }

  return (
    <Section title="Natural-language search" subtitle="We show the interpreted filters for you to edit before searching">
      <textarea
        className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
        rows={2} value={q} onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn-primary" onClick={parse} disabled={loading}>Interpret query</button>
        {loading && <Spinner />}
      </div>
      {error && <div className="mt-2"><ErrorState message={error} /></div>}

      {filters && (
        <div className="mt-4 rounded-lg border border-line bg-surface-sunken p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Interpreted filters (editable)</span>
            <Badge tone="bg-neutral-wash text-neutral">via {filters.generated_by}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <EditFilter label="Sectors" value={(filters.sectors || []).join(", ")} onChange={(v) => setFilters({ ...filters, sectors: v.split(",").map((x: string) => x.trim()).filter(Boolean) })} />
            <EditFilter label="Stages" value={(filters.stages || []).join(", ")} onChange={(v) => setFilters({ ...filters, stages: v.split(",").map((x: string) => x.trim()).filter(Boolean) })} />
            <EditFilter label="Geographies" value={(filters.geographies || []).join(", ")} onChange={(v) => setFilters({ ...filters, geographies: v.split(",").map((x: string) => x.trim()).filter(Boolean) })} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Searching: {sources.join(", ")}. Only connected sources are searched — never the entire internet.
          </p>
          <button className="btn-secondary mt-2" onClick={apply} disabled={loading}>Apply search</button>
        </div>
      )}

      {results && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-muted">{results.length} match(es) in the indexed dataset.</p>
          <div className="space-y-2">
            {results.map((o) => <CandidateCard key={o.id} o={o} />)}
          </div>
        </div>
      )}
    </Section>
  );
}

function EditFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="mt-1 w-full rounded border border-line px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function GithubSync() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api.post<any>("/api/sourcing/github/sync", {
        username: username.trim(), create_founder_name: name.trim() || undefined,
      });
      setResult(r);
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed"); }
    finally { setLoading(false); }
  }

  return (
    <Section title="Add a real public GitHub profile" subtitle="Live connector — collects only public data, with source attribution">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">GitHub username</span>
          <input className="mt-1 w-48 rounded-lg border border-line px-3 py-2 text-sm" placeholder="e.g. torvalds" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Display name (optional)</span>
          <input className="mt-1 w-48 rounded-lg border border-line px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={sync} disabled={loading || !username.trim()}>Sync from GitHub</button>
        {loading && <Spinner label="Syncing…" />}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Without a GITHUB_TOKEN the public API allows ~60 requests/hour. Real evidence is stored separately from demo data.
      </p>
      {error && <div className="mt-2"><ErrorState message={error} /></div>}
      {result && (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3 text-sm">
          <p className="font-medium text-ink">Sync {result.sync?.status}: {result.sync?.message}</p>
          <p className="text-ink-muted">Evidence added: {result.sync?.evidence_added} · Founder score: {result.founder_score ?? "—"}</p>
          {result.opportunity_id && <Link href={`/vc/opportunities/${result.opportunity_id}`} className="btn-secondary mt-2">Open founder profile →</Link>}
        </div>
      )}
    </Section>
  );
}

function Prospects() {
  const { data, loading, error, reload } = useFetch<{ items: Opportunity[] }>("/api/sourcing/prospects");
  async function act(id: number, action: string) {
    await api.post(`/api/sourcing/prospects/${id}/action`, { action });
    reload();
  }
  if (loading) return <Section title="Prospects"><Spinner /></Section>;
  if (error) return <Section title="Prospects"><ErrorState message={error} /></Section>;
  return (
    <Section title="Sourced prospects" subtitle="Save, dismiss, monitor, recommend outreach, or invite to apply">
      <div className="space-y-2">
        {data?.items.length ? data.items.map((o) => (
          <div key={o.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/vc/opportunities/${o.id}`} className="text-sm font-semibold text-ink hover:text-brand">
                  {o.company?.name || o.founder?.full_name}
                </Link>
                <p className="text-xs text-ink-muted">{o.surfaced_reason}</p>
                <div className="mt-1 flex items-center gap-2">
                  {o.founder_score && <Badge tone="bg-brand-wash text-brand">score {Math.round(o.founder_score.score)}</Badge>}
                  {o.momentum && <Badge tone={trajectoryTone(o.momentum.trajectory)}>{humanStatus(o.momentum.trajectory)}</Badge>}
                  <Badge tone="bg-neutral-wash text-neutral">{humanStatus(o.status)}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {["save", "monitor", "dismiss", "recommend_outreach", "invite_to_apply"].map((a) => (
                  <button key={a} className="btn-ghost text-xs" onClick={() => act(o.id, a)}>{humanStatus(a)}</button>
                ))}
              </div>
            </div>
          </div>
        )) : <p className="text-sm text-ink-muted">No prospects yet.</p>}
      </div>
      <p className="mt-3 text-xs text-ink-muted">No automated outreach is sent — the investor approves all consequential actions.</p>
    </Section>
  );
}

function CandidateCard({ o }: { o: Opportunity }) {
  return (
    <Link href={`/vc/opportunities/${o.id}`} className="block rounded-lg border border-line bg-surface p-3 hover:border-brand/40">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{o.company?.name || o.founder?.full_name}</span>
        <Badge tone="bg-brand-wash text-brand">fit {Math.round(o.thesis_fit_score)}</Badge>
      </div>
      <p className="text-xs text-ink-muted">{o.company?.one_liner}</p>
    </Link>
  );
}
