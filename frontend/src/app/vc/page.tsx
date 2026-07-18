"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { api } from "@/lib/api";
import { Badge, DemoBadge, ErrorState, Section, Spinner, Stat } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { PrestigeCompare } from "@/components/PrestigeCompare";
import { ArenaHero } from "@/components/ArenaHero";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { RankingEntry } from "@/lib/types";

interface ActionItem {
  opportunity_id: number;
  name: string;
  founder_name: string | null;
  entry_type: string;
  stage: string;
  next_action: string;
  priority: number;
  age_days: number;
}

interface Dashboard {
  thesis: { fund_name: string; sectors: string[]; stages: string[]; geographies: string[] } | null;
  stage_counts: Record<string, number>;
  top_outbound_prospects: any[];
  recent_inbound_applications: any[];
  highest_momentum: { opportunity_id: number; founder_name: string; company_name: string; trajectory: string; change_30d: number | null; current_score: number }[];
  largest_prestige_changes: RankingEntry[];
  action_queue: ActionItem[];
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string }[];
  connectors: { live: string[]; planned: string[] };
}

export default function DashboardPage() {
  const { data, error, loading } = useFetch<Dashboard>("/api/dashboard");
  const ranking = useFetch<{ entries: RankingEntry[] }>("/api/ranking/prestige-sensitivity");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);

  // Auto-start the tour for first-time investors — but only once the dashboard
  // (incl. the Arena hero the tour anchors to) has actually rendered.
  useEffect(() => {
    if (!data || tourChecked) return;
    setTourChecked(true);
    api.get<{ completed: boolean; skipped: boolean }>("/api/tour")
      .then((t) => { if (!t.completed && !t.skipped) setTourOpen(true); })
      .catch(() => {});
  }, [data, tourChecked]);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Investor Dashboard</h1>
          <p className="text-sm text-ink-muted">
            Your deal pipeline: Sourcing → Screening → Diligence → Decision. New here? Take the tour.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setTourOpen(true)}>Take the Guided Tour</button>
      </div>

      {/* The Investment Arena — the first thing an investor sees; anchors the tour */}
      <ArenaHero />

      {/* thesis + stage counts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Your Investment Thesis" subtitle="Your fund's strategy — everything is scored against it" id="thesis-section" right={<Link href="/vc/thesis" className="btn-ghost text-xs">Edit</Link>}>
          <div data-tour="thesis">
            {data.thesis ? (
              <>
                <p className="text-base font-semibold text-ink">{data.thesis.fund_name}</p>
                <p className="mt-1 text-sm text-ink-soft">{data.thesis.sectors.join(", ")}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {data.thesis.stages.join(", ")} · {data.thesis.geographies.join(", ")}
                </p>
                <p className="mt-2 text-xs text-ink-muted">Every score, ranking and recommendation is evaluated through this thesis.</p>
              </>
            ) : (
              <Link href="/vc/thesis" className="btn-primary">Set Up a Thesis</Link>
            )}
          </div>
        </Section>

        <Section title="Workflow Stages" subtitle="Pipeline counts">
          <div className="grid grid-cols-2 gap-2">
            {["sourcing", "screening", "diligence", "decision"].map((s) => (
              <Stat key={s} label={humanStatus(s)} value={data.stage_counts[s] || 0} />
            ))}
          </div>
        </Section>

        <Section title="Connectors" subtitle="Live vs planned">
          <div className="flex flex-wrap gap-2">
            {data.connectors.live.map((c) => <Badge key={c} tone="bg-positive-wash text-positive">{c} · Live</Badge>)}
            {data.connectors.planned.map((c) => <Badge key={c} tone="bg-neutral-wash text-neutral">{c} · Planned</Badge>)}
          </div>
          <Link href="/vc/settings" className="btn-ghost mt-3 text-xs">Data Sources &amp; Status →</Link>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top Outbound Prospects" subtitle="Surfaced before they formally apply">
          <div data-tour="sourcing" className="space-y-2">
            {data.top_outbound_prospects.length ? data.top_outbound_prospects.map((o) => (
              <OppRow key={o.id} o={o} />
            )) : <p className="text-sm text-ink-muted">No prospects yet. Sync a GitHub profile from Discovery.</p>}
          </div>
        </Section>

        <Section title="Recent Inbound Applications" subtitle="Founder-initiated">
          <div data-tour="inbound" className="space-y-2">
            {data.recent_inbound_applications.length ? data.recent_inbound_applications.map((o) => (
              <OppRow key={o.id} o={o} />
            )) : <p className="text-sm text-ink-muted">No inbound applications yet.</p>}
          </div>
        </Section>
      </div>

      {/* Action queue — the primary "what should I do next, and on whom?" list */}
      <Section title="Action Queue" subtitle="Your prioritized next steps — the deals you can act on now come first">
        <div data-tour="action-queue" className="space-y-2">
          {data.action_queue.length ? data.action_queue.map((a) => (
            <Link
              key={a.opportunity_id}
              href={`/vc/opportunities/${a.opportunity_id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 hover:border-brand/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {a.name}
                  {a.founder_name && a.founder_name !== a.name && <span className="font-normal text-ink-muted"> · {a.founder_name}</span>}
                </p>
                <p className="text-xs text-ink-muted">{humanStatus(a.entry_type)} · {humanStatus(a.stage)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={a.priority === 1 ? "bg-brand-wash text-brand" : "bg-neutral-wash text-neutral"}>{a.next_action}</Badge>
                <span className="w-14 text-right text-xs text-ink-muted">{a.age_days === 0 ? "today" : `${a.age_days}d open`}</span>
              </div>
            </Link>
          )) : <p className="text-sm text-ink-muted">Nothing needs your action right now. 🎉</p>}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Highest Founder Momentum" subtitle="Direction & rate of change">
          <div data-tour="momentum" className="space-y-2">
            {data.highest_momentum.map((m) => (
              <div key={m.opportunity_id} className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2">
                <Link href={`/vc/opportunities/${m.opportunity_id}`} className="text-sm font-medium text-ink hover:text-brand">
                  {m.company_name || m.founder_name}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-muted">{m.current_score}</span>
                  <Badge tone={trajectoryTone(m.trajectory)}>{humanStatus(m.trajectory)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Recent Evidence Updates" subtitle="Newest collected items" right={<DemoBadge />}>
          <div data-tour="evidence" className="space-y-2">
            {data.recent_evidence.map((e) => (
              <div key={e.id} className="rounded-lg bg-surface-sunken px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-soft">{e.title}</span>
                  <span className="font-mono text-[11px] text-ink-muted">E{e.id}</span>
                </div>
                <p className="text-xs text-ink-muted">{e.source_name} · {e.kind}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Standard vs Prestige-Free Ranking" subtitle="Largest movements when prestige is masked">
        {ranking.data ? <PrestigeCompare entries={ranking.data.entries} /> : <Spinner />}
      </Section>

      <GuidedTour steps={DASHBOARD_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

function OppRow({ o }: { o: any }) {
  return (
    <Link href={`/vc/opportunities/${o.id}`} className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2 hover:bg-line/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{o.company?.name || o.founder?.full_name || `Opportunity #${o.id}`}</p>
        <p className="truncate text-xs text-ink-muted">{o.company?.one_liner || o.surfaced_reason}</p>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {o.founder_score && <span className="text-sm font-semibold text-ink">{Math.round(o.founder_score.score)}</span>}
        <Badge tone="bg-brand-wash text-brand">fit {Math.round(o.thesis_fit_score)}</Badge>
      </div>
    </Link>
  );
}
