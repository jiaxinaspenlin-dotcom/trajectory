"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { api } from "@/lib/api";
import { Badge, DemoBadge, ErrorState, Section, Spinner, Stat } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { PrestigeCompare } from "@/components/PrestigeCompare";
import { WorkflowTimer } from "@/components/WorkflowTimer";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { RankingEntry, WorkflowStatus } from "@/lib/types";

interface Dashboard {
  thesis: { fund_name: string; sectors: string[]; stages: string[]; geographies: string[] } | null;
  stage_counts: Record<string, number>;
  top_outbound_prospects: any[];
  recent_inbound_applications: any[];
  highest_momentum: { opportunity_id: number; founder_name: string; company_name: string; trajectory: string; change_30d: number | null; current_score: number }[];
  largest_prestige_changes: RankingEntry[];
  needs_attention: WorkflowStatus[];
  timers: WorkflowStatus[];
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string }[];
  connectors: { live: string[]; planned: string[] };
}

export default function DashboardPage() {
  const { data, error, loading } = useFetch<Dashboard>("/api/dashboard");
  const ranking = useFetch<{ entries: RankingEntry[] }>("/api/ranking/prestige-sensitivity");
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    api.get<{ completed: boolean; skipped: boolean }>("/api/tour")
      .then((t) => { if (!t.completed && !t.skipped) setTourOpen(true); })
      .catch(() => {});
  }, []);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Investor dashboard</h1>
          <p className="text-sm text-ink-muted">
            Your deal pipeline: Sourcing → Screening → Diligence → Decision. New here? Take the tour.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setTourOpen(true)}>Take the guided tour</button>
      </div>

      {/* thesis + stage counts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Your investment thesis" subtitle="Your fund's strategy — everything is scored against it" id="thesis-section" right={<Link href="/vc/thesis" className="btn-ghost text-xs">Edit</Link>}>
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
              <Link href="/vc/thesis" className="btn-primary">Set up a thesis</Link>
            )}
          </div>
        </Section>

        <Section title="Workflow stages" subtitle="Pipeline counts">
          <div className="grid grid-cols-2 gap-2">
            {["sourcing", "screening", "diligence", "decision"].map((s) => (
              <Stat key={s} label={humanStatus(s)} value={data.stage_counts[s] || 0} />
            ))}
          </div>
        </Section>

        <Section title="Connectors" subtitle="Live vs planned">
          <div className="flex flex-wrap gap-2">
            {data.connectors.live.map((c) => <Badge key={c} tone="bg-positive-wash text-positive">{c} · live</Badge>)}
            {data.connectors.planned.map((c) => <Badge key={c} tone="bg-neutral-wash text-neutral">{c} · planned</Badge>)}
          </div>
          <Link href="/vc/settings" className="btn-ghost mt-3 text-xs">Data sources &amp; status →</Link>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top outbound prospects" subtitle="Surfaced before they formally apply">
          <div data-tour="sourcing" className="space-y-2">
            {data.top_outbound_prospects.length ? data.top_outbound_prospects.map((o) => (
              <OppRow key={o.id} o={o} />
            )) : <p className="text-sm text-ink-muted">No prospects yet. Sync a GitHub profile from Discovery.</p>}
          </div>
        </Section>

        <Section title="Recent inbound applications" subtitle="Founder-initiated">
          <div data-tour="inbound" className="space-y-2">
            {data.recent_inbound_applications.length ? data.recent_inbound_applications.map((o) => (
              <OppRow key={o.id} o={o} />
            )) : <p className="text-sm text-ink-muted">No inbound applications yet.</p>}
          </div>
        </Section>
      </div>

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

        <Section title="Needs attention" subtitle="Open blockers & timers">
          <div data-tour="attention" className="space-y-2">
            {data.needs_attention.length ? data.needs_attention.map((t) => (
              <Link key={t.opportunity_id} href={`/vc/opportunities/${t.opportunity_id}`} className="block rounded-lg bg-surface-sunken px-3 py-2 hover:bg-line/40">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">Opportunity #{t.opportunity_id}</span>
                  <span className="text-xs text-ink-muted">{t.remaining_human} left</span>
                </div>
                <p className="text-xs text-caution">{t.blockers[0]}</p>
              </Link>
            )) : <p className="text-sm text-ink-muted">Nothing blocked. 🎉</p>}
          </div>
        </Section>
      </div>

      <Section title="Standard vs prestige-free ranking" subtitle="Largest movements when prestige is masked">
        {ranking.data ? <PrestigeCompare entries={ranking.data.entries} /> : <Spinner />}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="24-hour decision timers" subtitle="Time to actionable recommendation">
          <div data-tour="timers" className="space-y-3">
            {data.timers.slice(0, 4).map((t) => <WorkflowTimer key={t.opportunity_id} w={t} />)}
          </div>
        </Section>
        <Section title="Recent evidence updates" subtitle="Newest collected items" right={<DemoBadge />}>
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

      {/* An Arena reference is present on each founder profile; the tour points here too. */}
      <div data-tour="arena" className="rounded-xl border border-dashed border-line bg-surface-sunken p-4 text-center text-sm text-ink-muted">
        Open any founder to see the full <strong>Investment Arena</strong>, the evidence-backed memo, and the
        recommended next action. <Link href="/vc/opportunities/1" className="text-brand">View a founder →</Link>
      </div>

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
