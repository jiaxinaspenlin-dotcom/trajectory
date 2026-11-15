"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { ErrorState, PageHeader, Section, Spinner } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { SourceBadge, StageBadge } from "@/components/DealBadges";
import { humanStatus } from "@/lib/format";
import { evidenceHref, nextActionHref } from "@/lib/pipeline";
import { accountScope } from "@/lib/auth";
import { getMyDecisions, getPipeline, LocalDecision, PipelineStatus } from "@/lib/myWorkspace";

interface ActionItem {
  opportunity_id: number;
  name: string;
  founder_name: string | null;
  entry_type: string;
  stage: string;
  next_action: string;
  next_action_key: string;
  next_action_detail: string | null;
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
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string; opportunity_id: number | null; opportunity_name: string | null }[];
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
      subtitle={data?.thesis ? `${data.thesis.fund_name} · what to do next` : "What to do next"}
      actions={
        <>
          <button className="btn-ghost" onClick={() => setTourOpen(true)}>Take the tour</button>
          <Link href="/vc/founders?source=open" className="btn-secondary">Source founders</Link>
        </>
      }
    />
  );

  if (loading) return <div className={`${COLUMN} space-y-4`}>{header}<Spinner label="Loading dashboard…" /></div>;
  if (error) return <div className={`${COLUMN} space-y-4`}>{header}<ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return null;

  // The queue is built server-side from shared state, so it doesn't know this
  // browser already acted: drop opportunities you've decided or dismissed here.
  const queue = (data.action_queue || []).filter(
    (a) => !decisions[a.opportunity_id] && pipeline[a.opportunity_id] !== "dismissed"
  );
  const attention = queue.slice(0, 5);
  const evidence = data.recent_evidence.slice(0, 3);
  const total = Object.values(data.stage_counts).reduce((a, b) => a + b, 0);
  const inPipeline = (data.stage_counts.screening || 0) + (data.stage_counts.decision || 0) + (data.stage_counts.diligence || 0);
  // setup, in order; only the first missing step is offered
  const setup = [
    { done: !!data.thesis, title: "Create your investment thesis", body: "Sectors, stages, and geographies every lead is scored against. It takes a minute.", href: "/vc/fund?edit=1", cta: "Create thesis" },
    { done: total > 0, title: "Source your first founders", body: "Search the web or GitHub for leads, or share the founder portal so founders can apply.", href: "/vc/founders?source=open", cta: "Source founders" },
    { done: inPipeline > 0, title: "Move a lead to Screening", body: "Open a lead in Founders, review its evidence, then move it into Pipeline to evaluate it.", href: "/vc/founders", cta: "Open Founders" },
  ];
  const stepIndex = setup.findIndex((x) => !x.done);
  const nextSetup = stepIndex >= 0 ? setup[stepIndex] : null;

  return (
    <div className={`${COLUMN} space-y-6`}>
      {header}

      {/* 1. what to do next */}
      <Section
        title="Needs attention"
        subtitle={attention.length
          ? `${queue.length} open ${queue.length === 1 ? "step" : "steps"} · most urgent first`
          : nextSetup ? `Setup · step ${stepIndex + 1} of ${setup.length}` : "One next step per open opportunity"}
        flush
        right={attention.length ? <Link href="/vc/pipeline" className="btn-ghost btn-sm">All in Pipeline →</Link> : undefined}
      >
        <div data-tour="action-queue">
          {attention.length ? (
            <>
              {nextSetup && !data.thesis && (
                <p className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-caution-wash px-5 py-2.5 text-sm text-caution">
                  <span>No investment thesis yet — thesis fit can&apos;t be scored.</span>
                  <Link href="/vc/fund?edit=1" className="font-medium underline underline-offset-2">Create thesis</Link>
                </p>
              )}
              <ol className="divide-y divide-line">
                {attention.map((a, i) => (
                  <AttentionRow key={a.opportunity_id} a={a} primary={i === 0} onOpen={() => router.push(nextActionHref(a.opportunity_id, a.next_action_key))} />
                ))}
              </ol>
              {queue.length > attention.length && (() => {
                // the rest of the queue lives in two places: deals in Pipeline, leads in Founders
                const rest = queue.slice(attention.length);
                const deals = rest.filter((a) => a.stage !== "sourcing").length;
                const leads = rest.length - deals;
                return (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-sm text-ink-muted">
                    <span>{rest.length} more:</span>
                    {deals > 0 && <Link href="/vc/pipeline" className="font-medium text-brand hover:underline">{deals} in Pipeline →</Link>}
                    {leads > 0 && <Link href="/vc/founders" className="font-medium text-brand hover:underline">{leads} {leads === 1 ? "lead" : "leads"} in Founders →</Link>}
                  </p>
                );
              })()}
            </>
          ) : nextSetup ? (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6" data-testid="setup-step">
              <div className="min-w-0 max-w-xl">
                <p className="text-lg font-semibold text-ink">{nextSetup.title}</p>
                <p className="mt-1 text-[15px] text-ink-muted">{nextSetup.body}</p>
              </div>
              <Link href={nextSetup.href} className="btn-primary shrink-0">{nextSetup.cta}</Link>
            </div>
          ) : (
            <div className="px-5 py-8">
              <p className="text-[15px] font-medium text-ink">You&apos;re all caught up.</p>
              <p className="mt-1 text-[13px] text-ink-muted">New applications, analysis results, and recommendations will appear here.</p>
            </div>
          )}
        </div>
      </Section>

      {/* 2. where things stand: each stage opens its list */}
      <nav aria-label="Pipeline summary" data-tour="overview"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <Link
            key={s}
            href={STAGE_LINKS[s]}
            className={`flex items-baseline justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-sunken ${
              i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-ink">{humanStatus(s)}</span>
              <span className="block text-[13px] text-ink-muted">{s === "sourcing" ? "Leads in Founders" : "Deals in Pipeline"}</span>
            </span>
            <span className="num text-[28px] font-semibold leading-none text-ink">{data.stage_counts[s] || 0}</span>
          </Link>
        ))}
      </nav>

      {/* 3. what's new */}
      <Section title="Recent evidence" subtitle="Newest sources across your leads and deals" flush>
        <ul data-tour="evidence" className="divide-y divide-line">
          {evidence.length ? evidence.map((e) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-[15px] leading-6 text-ink">{e.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-muted">
                    {e.opportunity_name ? <span className="font-medium text-ink-soft">{e.opportunity_name}</span> : null}
                    {e.opportunity_name ? " · " : ""}{e.source_name} · {humanStatus(e.kind)}
                  </span>
                </span>
                <span className="num shrink-0 text-[13px] leading-6 text-ink-muted">{relativeDay(e.collected_at)}</span>
              </>
            );
            return (
              <li key={e.id}>
                {e.opportunity_id ? (
                  <Link href={evidenceHref(e.opportunity_id, e.id)} className="flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-surface-sunken">{body}</Link>
                ) : <div className="flex items-start justify-between gap-4 px-5 py-3.5">{body}</div>}
              </li>
            );
          }) : <li className="px-5 py-6 text-[15px] text-ink-muted">No evidence collected yet. It appears here as you source founders and receive applications.</li>}
        </ul>
      </Section>

      <GuidedTour steps={DASHBOARD_TOUR} open={tourOpen} onClose={closeTour} />
    </div>
  );
}

// One readable column; the thesis lives on Fund, rankings on Founders, and the
// full queue in Pipeline.
const COLUMN = "max-w-[960px]";
const STAGES = ["sourcing", "screening", "diligence", "decision"] as const;

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}

function AttentionRow({ a, primary, onOpen }: { a: ActionItem; primary: boolean; onOpen: () => void }) {
  const href = nextActionHref(a.opportunity_id, a.next_action_key);
  return (
    <li className="table-row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]" onClick={onOpen}>
      <span className="min-w-0">
        <Link href={`/vc/opportunities/${a.opportunity_id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[15px] font-medium text-ink hover:text-brand">{a.name}</Link>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <StageBadge stage={a.stage} />
          <SourceBadge entryType={a.entry_type} />
        </span>
      </span>
      <span className="col-span-2 row-start-2 min-w-0 text-[13px] text-ink-muted sm:col-span-1 sm:row-start-auto">
        {a.priority === 1 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" aria-label="Act now" />}
        {a.next_action_detail ?? a.next_action}
        <span className="num"> · waiting {a.age_days === 0 ? "since today" : `${a.age_days}d`}</span>
      </span>
      <Link href={href} onClick={(e) => e.stopPropagation()} className={`${primary ? "btn-primary" : "btn-secondary"} btn-sm col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto`}>
        {a.next_action}
      </Link>
    </li>
  );
}
