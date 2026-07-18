"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";

interface SettingsView {
  openai: { connected: boolean; model: string; key_hint: string; note: string };
  github: { connected: boolean; authenticated: boolean; token_hint: string; rate_limit: string };
  database: { connected: boolean; scheme: string };
  live_connectors: string[];
  unavailable_connectors: string[];
  data_sources: { id: number; name: string; type: string; live: boolean; last_synced_at: string | null }[];
  scoring_weights: { key: string; name: string; weight: number }[];
  upload_limit_mb: number;
  ai_rate_limit_per_minute: number;
  privacy_and_limitations: string[];
}

export default function SettingsPage() {
  const { data, loading, error } = useFetch<SettingsView>("/api/settings");
  const connectors = useFetch<any>("/api/connectors/status");
  const [tourReset, setTourReset] = useState(false);

  async function restartTour() {
    await api.put("/api/tour", { completed: false, skipped: false, last_step: 0 });
    setTourReset(true);
  }

  if (loading) return <Spinner label="Loading settings…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Settings & Data Sources</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="AI Provider (OpenAI)" subtitle="Server-side only — the key never reaches the browser">
          <Row label="Status" value={data.openai.connected ? <Badge tone="bg-positive-wash text-positive">Connected</Badge> : <Badge tone="bg-negative-wash text-negative">Not Configured</Badge>} />
          <Row label="Model" value={data.openai.model} />
          <Row label="Key" value={<span className="font-mono text-xs">{data.openai.key_hint || "not set"}</span>} />
          {!data.openai.connected && (
            <p className="mt-2 text-xs text-ink-muted">No API key configured — AI features (assessment, arena, memo, diligence, search) are unavailable and return 503. There is no fake fallback. Deterministic scoring (Founder Score, Momentum, ranking, Trust) still works.</p>
          )}
        </Section>

        <Section title="GitHub Connector" subtitle="Live public-data connector">
          <Row label="Status" value={<Badge tone="bg-positive-wash text-positive">live</Badge>} />
          <Row label="Authenticated" value={data.github.authenticated ? "Yes" : "No (anonymous)"} />
          <Row label="Token" value={<span className="font-mono text-xs">{data.github.token_hint || "not set"}</span>} />
          <Row label="Rate Limit" value={data.github.rate_limit} />
          {connectors.data?.live?.[0] && (
            <Row label="Remaining" value={String(connectors.data.live[0].rate_limit_remaining ?? "—")} />
          )}
        </Section>

        <Section title="Database" subtitle="Never exposes credentials">
          <Row label="Status" value={data.database.connected ? <Badge tone="bg-positive-wash text-positive">Connected</Badge> : <Badge tone="bg-negative-wash text-negative">Down</Badge>} />
          <Row label="Engine" value={data.database.scheme} />
        </Section>

        <Section title="Connectors" subtitle="Live vs planned (honest status)">
          <div className="flex flex-wrap gap-1">
            {data.live_connectors.map((c) => <Badge key={c} tone="bg-positive-wash text-positive">{c} · Live</Badge>)}
            {data.unavailable_connectors.map((c) => <Badge key={c} tone="bg-neutral-wash text-neutral">{c} · Planned</Badge>)}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Planned connectors are not implemented and are never presented as live.</p>
        </Section>
      </div>

      <Section title="Founder Score Weights" subtitle="Configurable component weights">
        <div className="grid gap-2 sm:grid-cols-2">
          {data.scoring_weights.map((w) => (
            <Row key={w.key} label={w.name} value={`${Math.round(w.weight * 100)}%`} />
          ))}
        </div>
      </Section>

      <Section title="Data Sources" subtitle="Last sync per source">
        <div className="space-y-1">
          {data.data_sources.length ? data.data_sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded bg-surface-sunken px-3 py-1.5 text-sm">
              <span className="text-ink-soft">{s.name}</span>
              <span className="text-xs text-ink-muted">{s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "never"}</span>
            </div>
          )) : <p className="text-sm text-ink-muted">No data sources registered yet.</p>}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Guided Tour">
          <button className="btn-secondary" onClick={restartTour}>Restart Guided Tour</button>
          {tourReset && <p className="mt-2 text-xs text-positive">Tour reset — it will appear next time you open the dashboard.</p>}
        </Section>
        <Section title="Privacy & Limitations">
          <ul className="list-inside list-disc space-y-1 text-sm text-ink-soft">
            {data.privacy_and_limitations.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}
