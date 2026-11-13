"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { Badge, DemoBadge, ErrorState, PageHeader, Section, Spinner, Stat } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { SourceBadge, StageBadge } from "@/components/DealBadges";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { accountScope } from "@/lib/auth";
import { getMyDecisions, getPipeline, LocalDecision, PipelineStatus } from "@/lib/myWorkspace";

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
  action_queue: ActionItem[];
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string }[];
  connectors: { live: string[]; planned: string[] };
}

const STAGE_LINKS: Record<string, string> = {
  sourcing: "/vc/founders",
  screening: "/vc/pipeline?stage=screening",
  diligence: "/vc/pipeline?stage=diligence",
  decision: "/vc/pipeline?stage=decision",
};

export default function DashboardPage() {
  const { data, error, loading, reload } = useFetch<Dashboard>("/api/dashboard");
  const router = useRouter();
  const [tourOpen, setTourOpen] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);
  // per-browser workspace overlay (saved / monitoring / dismissed + decisions)
  const [pipeline, setPipeline] = useState<Record<number, PipelineStatus>>({});
  const [decisions, setDecisions] = useState<Record<number, LocalDecision>>({});
  useEffect(() => {
    setPipeline(getPipeline());
    setDecisions(getMyDecisions());
  }, []);

  // Auto-start the tour the first time THIS signed-in investor reaches the
  // dashboard — tracked per account so a new sign-in gets it, and only once the
  // dashboard (incl. the panels the tour anchors to) has actually rendered.
  const tourSeenKey = `trajectory_tour_seen_${accountScope("investor")}`;
  useEffect(() => {
    if (!data || tourChecked) return;
    setTourChecked(true);
    try {
      if (!localStorage.getItem(tourSeenKey)) setTourOpen(true);
    } catch {
      /* localStorage unavailable — skip auto-start */
    }
  }, [data, tourChecked, tourSeenKey]);

  function closeTour() {
    setTourOpen(false);
    try { localStorage.setItem(tourSeenKey, "1"); } catch { /* ignore */ }
  }

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle={data?.thesis ? `${data.thesis.fund_name} · what needs your attention across the pipeline` : "What needs your attention across the pipeline"}
      actions={
        <>
          <button className="btn-ghost" onClick={() => setTourOpen(true)}>Take the tour</button>
          <Link href="/vc/map" className="btn-secondary">Open map</Link>
          <Link href="/vc/founders?source=open" className="btn-primary">+ Source founders</Link>
        </>
      }
    />
  );

  if (loading) return <div className="space-y-4">{header}<Spinner label="Loading dashboard…" /></div>;
  if (error) return <div className="space-y-4">{header}<ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return null;

  // Apply this browser's pipeline overlay: hide prospects it dismissed, pin the
  // ones it saved / is monitoring to the top, then trim to the display count.
  const rank = (s: PipelineStatus | null) => (s === "saved" || s === "monitoring" ? 0 : 1);
  const outboundProspects = (data.top_outbound_prospects || [])
    .map((o: any) => ({ o, status: pipeline[o.id] ?? null }))
    .filter((x) => x.status !== "dismissed")
    .sort((a, b) => rank(a.status) - rank(b.status))
    .slice(0, 6);

  // The Action Queue is built server-side from shared state, so it doesn't know
  // this browser already acted. Drop items for opportunities you've decided or
  // dismissed — using your per-browser workspace, not any hardcoded list.
  const actionQueue = (data.action_queue || []).filter(
    (a) => !decisions[a.opportunity_id] && pipeline[a.opportunity_id] !== "dismissed"
  );

  return (
    <div className="space-y-5">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="overview">
        {["sourcing", "screening", "diligence", "decision"].map((s) => (
          <Stat
            key={s}
            label={humanStatus(s)}
            value={data.stage_counts[s] || 0}
            sub={s === "sourcing" ? "Founder leads" : "Active deals"}
            href={STAGE_LINKS[s]}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Section
            title="Next actions"
            subtitle="One concrete step per opportunity — act-now items first"
            flush
            right={<Link href="/vc/pipeline" className="btn-ghost btn-sm">Pipeline →</Link>}
          >
            <div data-tour="action-queue" className="overflow-x-auto">
              {actionQueue.length ? (
                <table className="table min-w-[640px]">
                  <thead>
                    <tr><th>Opportunity</th><th>Source</th><th>Stage</th><th>Next action</th><th className="text-right">Waiting</th></tr>
                  </thead>
                  <tbody>
                    {actionQueue.map((a) => (
                      <tr key={a.opportunity_id} className="table-row-link" onClick={() => router.push(`/vc/opportunities/${a.opportunity_id}`)}>
                        <td>
                          <Link href={`/vc/opportunities/${a.opportunity_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand">{a.name}</Link>
                          {a.founder_name && a.founder_name !== a.name && <span className="block text-xs text-ink-muted">{a.founder_name}</span>}
                        </td>
                        <td><SourceBadge entryType={a.entry_type} /></td>
                        <td><StageBadge stage={a.stage} /></td>
                        <td>
                          <span className={`flex items-center gap-1.5 ${a.priority === 1 ? "font-medium text-ink" : "text-ink-soft"}`}>
                            {a.priority === 1 && <span aria-label="Act now" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                            {a.next_action}
                          </span>
                        </td>
                        <td className="num text-right text-xs text-ink-muted">{a.age_days === 0 ? "today" : `${a.age_days}d`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="px-4 py-6 text-[13px] text-ink-muted">Nothing needs your action right now.</p>}
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Top outbound prospects" subtitle="Surfaced before they apply" flush right={<Link href="/vc/founders" className="btn-ghost btn-sm">Founders →</Link>}>
              <div data-tour="sourcing">
                {outboundProspects.length ? (
                  <ul className="divide-y divide-line">
                    {outboundProspects.map(({ o, status }) => <OppRow key={o.id} o={o} status={status} />)}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-[13px] text-ink-muted">No prospects yet. <Link href="/vc/founders?source=open" className="text-brand hover:underline">Source founders</Link> to get started.</p>
                )}
              </div>
            </Section>
            <Section title="Recent inbound applications" subtitle="Founder-initiated" flush right={<Link href="/vc/pipeline?source=inbound" className="btn-ghost btn-sm">Pipeline →</Link>}>
              <div data-tour="inbound">
                {data.recent_inbound_applications.length ? (
                  <ul className="divide-y divide-line">
                    {data.recent_inbound_applications.map((o) => <OppRow key={o.id} o={o} />)}
                  </ul>
                ) : <p className="px-4 py-6 text-[13px] text-ink-muted">No inbound applications yet.</p>}
              </div>
            </Section>
          </div>
        </div>

        <div className="space-y-5">
          <Section title="Fund thesis" subtitle="Every score is evaluated through it" right={<Link href="/vc/fund" className="btn-ghost btn-sm">Edit</Link>}>
            <div data-tour="thesis">
              {data.thesis ? (
                <dl className="space-y-2 text-[13px]">
                  <p className="font-semibold text-ink">{data.thesis.fund_name}</p>
                  <ChipRow label="Sectors" items={data.thesis.sectors} />
                  <ChipRow label="Stages" items={data.thesis.stages} />
                  <ChipRow label="Geographies" items={data.thesis.geographies} />
                </dl>
              ) : (
                <div className="text-[13px] text-ink-muted">
                  No active thesis yet. <Link href="/vc/fund" className="btn-primary btn-sm ml-1">Set up the fund</Link>
                </div>
              )}
            </div>
          </Section>

          <Section title="Highest founder momentum" subtitle="Current score and trajectory" flush>
            <ul data-tour="momentum" className="divide-y divide-line">
              {data.highest_momentum.map((m) => (
                <li key={m.opportunity_id}>
                  <Link href={`/vc/opportunities/${m.opportunity_id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-sunken">
                    <span className="truncate text-[13px] font-medium text-ink">{m.company_name || m.founder_name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num text-xs text-ink-muted">{Math.round(m.current_score)}</span>
                      <Badge tone={trajectoryTone(m.trajectory)}>{humanStatus(m.trajectory)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Recent evidence" subtitle="Newest collected items" right={<DemoBadge />} flush>
            <ul data-tour="evidence" className="divide-y divide-line">
              {data.recent_evidence.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] text-ink-soft">{e.title}</span>
                    <span className="font-mono text-[11px] text-ink-faint">E{e.id}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{e.source_name} · {humanStatus(e.kind)}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Connectors">
            <div className="flex flex-wrap gap-1.5">
              {data.connectors.live.map((c) => <Badge key={c} tone="bg-positive-wash text-positive">{humanStatus(c)} · live</Badge>)}
              {data.connectors.planned.map((c) => <Badge key={c}>{humanStatus(c)} · planned</Badge>)}
            </div>
          </Section>
        </div>
      </div>

      <GuidedTour steps={DASHBOARD_TOUR} open={tourOpen} onClose={closeTour} />
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap gap-1">
        {items.length ? items.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-xs text-ink-faint">Any</span>}
      </dd>
    </div>
  );
}

function OppRow({ o, status }: { o: any; status?: PipelineStatus | null }) {
  return (
    <li>
      <Link href={`/vc/opportunities/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-sunken">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{o.company?.name || o.founder?.full_name || `Opportunity #${o.id}`}</span>
          <span className="block truncate text-xs text-ink-muted">{o.company?.one_liner || o.surfaced_reason}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {(status === "saved" || status === "monitoring") && <Badge tone="bg-positive-wash text-positive">{humanStatus(status)}</Badge>}
          {o.founder_score && <span className="num text-[13px] font-semibold text-ink" title="Founder score">{Math.round(o.founder_score.score)}</span>}
          {o.company && <Badge tone="bg-brand-wash text-brand">fit {Math.round(o.thesis_fit_score)}</Badge>}
        </span>
      </Link>
    </li>
  );
}
