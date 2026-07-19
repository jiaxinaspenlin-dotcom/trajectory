"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";
import { Opportunity } from "@/lib/types";
import { humanStatus, trajectoryTone } from "@/lib/format";

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

export default function DiscoveryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Founder Discovery</h1>
        <p className="text-sm text-ink-muted">
          AI-driven outbound sourcing — describe what you want (or use your thesis) and Trajectory finds
          real builders on public GitHub, scores them, and hands you a ranked shortlist. No searching founder by founder.
        </p>
      </div>
      <AiDiscovery />
      <ManualAdd />
      <Prospects />
    </div>
  );
}

function AiDiscovery() {
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<DiscoveryResult>("/api/sourcing/discover", { brief, limit: 8 });
      setResult(r);
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
                      {p.already_in_pipeline && <Badge tone="bg-neutral-wash text-neutral">already sourced</Badge>}
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

function ManualAdd() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Add a Specific GitHub Profile" subtitle="Know someone already? Pull one profile directly (live public data)">
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

function Prospects() {
  const { data, loading, error, reload } = useFetch<{ items: Opportunity[] }>("/api/sourcing/prospects");
  async function act(id: number, action: string) {
    await api.post(`/api/sourcing/prospects/${id}/action`, { action });
    reload();
  }
  if (loading) return <Section title="Sourced Prospects"><Spinner /></Section>;
  if (error) return <Section title="Sourced Prospects"><ErrorState message={error} /></Section>;
  return (
    <Section title="Sourced Prospects" subtitle="Save, monitor, dismiss, recommend outreach, or invite to apply">
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
                  {o.founder_score && <Badge tone="bg-brand-wash text-brand">Score {Math.round(o.founder_score.score)}</Badge>}
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
        )) : <p className="text-sm text-ink-muted">No prospects yet. Run AI Discovery above.</p>}
      </div>
      <p className="mt-3 text-xs text-ink-muted">No automated outreach is sent — the investor approves all consequential actions.</p>
    </Section>
  );
}
