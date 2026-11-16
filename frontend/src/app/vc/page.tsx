"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { ErrorState, PageHeader, Spinner } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { SourceBadge, StageBadge } from "@/components/DealBadges";
import { humanStatus } from "@/lib/format";
import { evidenceHref, nextActionHref, stageDot } from "@/lib/pipeline";
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
      subtitle={data?.thesis ? `${data.thesis.fund_name} · What to Do Next` : "What to Do Next"}
      actions={
        <>
          <button className="btn-ghost" onClick={() => setTourOpen(true)}>Take the Tour</button>
          <Link href="/vc/founders?source=open" className="btn-secondary">Source Founders</Link>
        </>
      }
    />
  );

  if (loading) return <div className={`${COLUMN} space-y-6`}>{header}<Spinner label="Loading dashboard…" /></div>;
  if (error) return <div className={`${COLUMN} space-y-6`}>{header}<ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return null;

  // The queue is built server-side from shared state, so it doesn't know this
  // browser already acted: drop opportunities you've decided or dismissed here.
  const queue = (data.action_queue || []).filter(
    (a) => !decisions[a.opportunity_id] && pipeline[a.opportunity_id] !== "dismissed"
  );
  const [next, ...waiting] = queue.slice(0, 5);
  const evidence = data.recent_evidence.slice(0, 3);
  const total = Object.values(data.stage_counts).reduce((a, b) => a + b, 0);
  const inPipeline = (data.stage_counts.screening || 0) + (data.stage_counts.decision || 0) + (data.stage_counts.diligence || 0);
  // setup, in order; only the first missing step is offered
  const setup = [
    { done: !!data.thesis, title: "Create Your Investment Thesis", body: "Sectors, stages, and geographies every lead is scored against. It takes a minute.", href: "/vc/fund?edit=1", cta: "Create Thesis" },
    { done: total > 0, title: "Source Your First Founders", body: "Search the web or GitHub for leads, or share the founder portal so founders can apply.", href: "/vc/founders?source=open", cta: "Source Founders" },
    { done: inPipeline > 0, title: "Move a Lead to Screening", body: "Open a lead in Founders, review its evidence, then move it into Pipeline to evaluate it.", href: "/vc/founders", cta: "Open Founders" },
  ];
  const stepIndex = setup.findIndex((x) => !x.done);
  const nextSetup = stepIndex >= 0 ? setup[stepIndex] : null;
  const rest = queue.slice(5);

  return (
    <div className={`${COLUMN} space-y-8`}>
      {header}

      {/* 1. what to do next: one featured step, then the rest of the short list */}
      <section aria-labelledby="attention-title" data-tour="action-queue">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="attention-title" className="text-section text-ink">
            Needs Attention
            {queue.length > 0 && <span className="num ml-2 font-normal text-ink-muted">{queue.length}</span>}
          </h2>
          {queue.length > 0
            ? <Link href="/vc/pipeline" className="link text-meta">All in Pipeline →</Link>
            : nextSetup && <span className="text-meta text-ink-muted">Setup · Step {stepIndex + 1} of {setup.length}</span>}
        </div>

        {next ? (
          <div className="space-y-3">
            {nextSetup && !data.thesis && (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-caution-wash px-4 py-2.5 text-meta text-caution">
                <span>No investment thesis yet — thesis fit can&apos;t be scored.</span>
                <Link href="/vc/fund?edit=1" className="font-medium underline underline-offset-2">Create Thesis</Link>
              </p>
            )}
            <NextUp a={next} onOpen={() => router.push(nextActionHref(next.opportunity_id, next.next_action_key))} />
            {waiting.length > 0 && (
              <div className="card">
                <ol className="divide-y divide-line" aria-label="Also Waiting">
                  {waiting.map((a) => (
                    <AttentionRow key={a.opportunity_id} a={a} onOpen={() => router.push(nextActionHref(a.opportunity_id, a.next_action_key))} />
                  ))}
                </ol>
                {rest.length > 0 && (() => {
                  // the rest of the queue lives in two places: deals in Pipeline, leads in Founders
                  const deals = rest.filter((a) => a.stage !== "sourcing").length;
                  const leads = rest.length - deals;
                  return (
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-meta text-ink-muted">
                      <span>{rest.length} More:</span>
                      {deals > 0 && <Link href="/vc/pipeline" className="link">{`${deals} in Pipeline →`}</Link>}
                      {leads > 0 && <Link href="/vc/founders" className="link">{`${leads} ${leads === 1 ? "Lead" : "Leads"} in Founders →`}</Link>}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        ) : nextSetup ? (
          <div className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-6 shadow-focus" data-testid="setup-step">
            <div className="min-w-0 max-w-xl">
              <SetupProgress step={stepIndex} total={setup.length} />
              <p className="mt-3 text-section text-ink">{nextSetup.title}</p>
              <p className="mt-1 text-body text-ink-muted">{nextSetup.body}</p>
            </div>
            <Link href={nextSetup.href} className="btn-primary shrink-0">{nextSetup.cta}</Link>
          </div>
        ) : (
          <div className="card px-6 py-8">
            <p className="text-body font-medium text-ink">You&apos;re All Caught Up</p>
            <p className="mt-1 text-meta text-ink-muted">New applications, analysis results, and recommendations will appear here.</p>
          </div>
        )}
      </section>

      {/* 2. where things stand: each stage opens its list */}
      <section aria-labelledby="stages-title">
        <h2 id="stages-title" className="mb-3 text-section text-ink">Stages</h2>
        <nav aria-label="Pipeline Summary" data-tour="overview"
          className="card grid grid-cols-2 overflow-hidden sm:grid-cols-4">
          {STAGES.map((s, i) => {
            const n = data.stage_counts[s] || 0;
            return (
              <Link
                key={s}
                href={STAGE_LINKS[s]}
                className={`group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-sunken ${
                  i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
              >
                <span className="flex items-center gap-2 text-body font-medium text-ink">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${stageDot(s)}`} />
                  {humanStatus(s)}
                </span>
                <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                  <span className={`num text-[1.75rem] font-semibold leading-none ${n ? "text-ink" : "text-ink-muted"}`}>{n}</span>
                  <span className="text-meta text-ink-muted group-hover:text-ink-soft">{s === "sourcing" ? "Leads in Founders" : "Deals in Pipeline"}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      </section>

      {/* 3. what's new */}
      <section aria-labelledby="evidence-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="evidence-title" className="text-section text-ink">Recent Evidence</h2>
          <span className="hidden text-meta text-ink-muted sm:inline">Newest Sources Across Your Leads and Deals</span>
        </div>
        <ul data-tour="evidence" className="card divide-y divide-line">
          {evidence.length ? evidence.map((e) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-body text-ink" data-content>{e.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-muted">
                    {e.opportunity_name && <span className="shrink-0 font-medium text-ink-soft" data-content>{e.opportunity_name}</span>}
                    {e.opportunity_name && <span aria-hidden>·</span>}
                    <span className="shrink-0">{humanStatus(e.kind)}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate" data-content>{e.source_name}</span>
                  </span>
                </span>
                <span className="num shrink-0 text-meta text-ink-muted">{relativeDay(e.collected_at)}</span>
              </>
            );
            return (
              <li key={e.id}>
                {e.opportunity_id ? (
                  <Link href={evidenceHref(e.opportunity_id, e.id)} className="flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-sunken">{body}</Link>
                ) : <div className="flex items-start justify-between gap-4 px-5 py-3.5">{body}</div>}
              </li>
            );
          }) : <li className="px-5 py-6 text-body text-ink-muted">No evidence collected yet. It appears here as you source founders and receive applications.</li>}
        </ul>
      </section>

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
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} Days Ago`;
}

function waitingText(days: number): string {
  return days === 0 ? "Waiting Since Today" : `Waiting ${days}d`;
}

function SetupProgress({ step, total }: { step: number; total: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1 w-8 rounded-full ${i < step ? "bg-brand" : i === step ? "bg-brand/50" : "bg-line-strong"}`} />
      ))}
    </span>
  );
}

// The most urgent step, shown on its own so the page answers "what next?" first.
function NextUp({ a, onOpen }: { a: ActionItem; onOpen: () => void }) {
  return (
    <div className="card cursor-pointer p-5 shadow-focus transition-colors hover:bg-surface-sunken/60 sm:p-6" onClick={onOpen}>
      <p className="text-meta font-medium text-brand">Next Up</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <Link href={`/vc/opportunities/${a.opportunity_id}`} onClick={(e) => e.stopPropagation()}
            className="block truncate text-[1.25rem] font-semibold leading-7 text-ink hover:text-brand">{a.name}</Link>
          <p className="mt-1 text-body text-ink-soft">{a.next_action_detail ?? a.next_action}</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-meta text-ink-muted">
            <StageBadge stage={a.stage} />
            <SourceBadge entryType={a.entry_type} />
            <span className="num">{waitingText(a.age_days)}</span>
          </p>
        </div>
        <Link href={nextActionHref(a.opportunity_id, a.next_action_key)} onClick={(e) => e.stopPropagation()} className="btn-primary w-full sm:w-auto">
          {a.next_action}
        </Link>
      </div>
    </div>
  );
}

function AttentionRow({ a, onOpen }: { a: ActionItem; onOpen: () => void }) {
  const href = nextActionHref(a.opportunity_id, a.next_action_key);
  return (
    // phones stack the action under the text so names never truncate to a letter
    <li className="table-row-link grid grid-cols-1 items-center gap-x-4 gap-y-2.5 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]" onClick={onOpen}>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <Link href={`/vc/opportunities/${a.opportunity_id}`} onClick={(e) => e.stopPropagation()} className="truncate text-body font-medium text-ink hover:text-brand">{a.name}</Link>
          <StageBadge stage={a.stage} />
        </span>
        <span className="mt-0.5 block text-meta text-ink-muted">
          {a.priority === 1 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" aria-label="Act Now" />}
          {a.next_action_detail ?? a.next_action}
          <span className="num"> · {waitingText(a.age_days)}</span>
        </span>
      </span>
      <Link href={href} onClick={(e) => e.stopPropagation()} className="btn-secondary btn-sm justify-self-start sm:justify-self-end">
        {a.next_action}
      </Link>
    </li>
  );
}
