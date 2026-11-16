"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { CountUp, ErrorState, PageHeader, Reveal, Skeleton } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { humanStatus, sourceName } from "@/lib/format";
import { evidenceHref, nextActionHref, opportunityName, stageDot } from "@/lib/pipeline";
import { accountScope } from "@/lib/auth";
import { useSeen } from "@/lib/motion";
import { getMyDecisions, getPipeline, LocalDecision, PipelineStatus } from "@/lib/myWorkspace";
import { FounderLead, PipelineDeal } from "@/lib/types";

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
  action_queue: ActionItem[];
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string; opportunity_id: number | null; opportunity_name: string | null }[];
}

const STAGES = ["sourcing", "screening", "diligence", "decision"] as const;
const STAGE_LINKS: Record<string, string> = {
  sourcing: "/vc/founders",
  screening: "/vc/pipeline?stage=screening",
  diligence: "/vc/pipeline?stage=diligence",
  decision: "/vc/pipeline?stage=decision",
};

// Kinds of work, in the order they matter. Each group opens its filtered list.
const WORK: { key: string; one: string; many: string; href: string }[] = [
  { key: "review_recommendation", one: "Recommendation to Review", many: "Recommendations to Review", href: "/vc/pipeline?next=review_recommendation" },
  { key: "review_application", one: "Application to Review", many: "Applications to Review", href: "/vc/pipeline?next=review_application" },
  { key: "resolve_diligence", one: "Deal with Open Diligence", many: "Deals with Open Diligence", href: "/vc/pipeline?next=resolve_diligence" },
  { key: "run_analysis", one: "Deal to Analyze", many: "Deals to Analyze", href: "/vc/pipeline?next=run_analysis" },
  { key: "generate_memo", one: "Memo to Generate", many: "Memos to Generate", href: "/vc/pipeline?next=generate_memo" },
];

export default function DashboardPage() {
  const { data, error, loading, reload } = useFetch<Dashboard>("/api/dashboard");
  const deals = useFetch<{ items: PipelineDeal[] }>("/api/pipeline");
  const leads = useFetch<{ items: FounderLead[] }>("/api/sourcing/prospects");
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

  // Auto-start the tour the first time this investor reaches the dashboard,
  // once the panels the tour anchors to have rendered.
  const tourSeenKey = `trajectory_tour_seen_${accountScope("investor")}`;
  useEffect(() => {
    if (!data || tourChecked) return;
    setTourChecked(true);
    try {
      if (!localStorage.getItem(tourSeenKey)) setTourOpen(true);
    } catch {
      /* localStorage unavailable: skip auto-start */
    }
  }, [data, tourChecked, tourSeenKey]);

  function closeTour() {
    setTourOpen(false);
    try { localStorage.setItem(tourSeenKey, "1"); } catch { /* ignore */ }
  }

  const total = data ? Object.values(data.stage_counts).reduce((a, b) => a + b, 0) : 0;
  const header = (
    <PageHeader
      eyebrow={data?.thesis?.fund_name ? <span data-content>{data.thesis.fund_name}</span> : undefined}
      title="Dashboard"
      actions={total > 0 ? <button className="btn-ghost" onClick={() => setTourOpen(true)}>Take the Tour</button> : undefined}
    />
  );

  if (loading && !data) return <div className="space-y-10" role="status" aria-label="Loading Dashboard…">{header}<DashboardSkeleton /></div>;
  if (error) return <div className="space-y-10">{header}<ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return null;

  // Shared records don't know what this browser decided or dismissed: drop those.
  const open = (id: number) => !decisions[id] && pipeline[id] !== "dismissed";
  const queue = (data.action_queue || []).filter((a) => open(a.opportunity_id));
  const next = queue[0];
  const openDeals = (deals.data?.items ?? []).filter((d) => open(d.id));
  const newLeads = (leads.data?.items ?? []).filter((l) => l.stage === "sourcing" && l.status !== "dismissed" && open(l.id));

  const groups = [
    ...WORK.map((w) => {
      const items = openDeals.filter((d) => d.next_action_key === w.key);
      return { key: w.key, count: items.length, label: items.length === 1 ? w.one : w.many, href: w.href, names: items.map(opportunityName) };
    }),
    { key: "new_leads", count: newLeads.length, label: newLeads.length === 1 ? "New Lead" : "New Leads", href: "/vc/founders", names: newLeads.map(opportunityName) },
  ].filter((g) => g.count > 0);

  const byStage: Record<string, string[]> = {
    sourcing: newLeads.map(opportunityName),
    ...Object.fromEntries(["screening", "diligence", "decision"].map((s) => [s, openDeals.filter((d) => d.stage === s).map(opportunityName)])),
  };

  // setup, in order; an empty workspace shows only the first missing step
  const setup = [
    { done: !!data.thesis, title: "Set Up Your Fund Thesis", body: "Sectors, stages and geographies every lead is scored against. It takes a minute.", href: "/vc/fund?edit=1", cta: "Create Thesis" },
    { done: total > 0, title: "Source Your First Founders", body: "Search the web or GitHub for leads, or share the founder portal so founders can apply.", href: "/vc/founders?source=open", cta: "Source Founders" },
  ];
  const stepIndex = setup.findIndex((x) => !x.done);
  const empty = total === 0;
  const evidence = data.recent_evidence.slice(0, 3);

  return (
    <div className="space-y-12">
      {header}

      {/* 1. what to do right now: one task, one primary button */}
      <section aria-labelledby="now-title" data-tour="action-queue">
        <h2 id="now-title" className="sr-only">Right Now</h2>
        {next ? (
          <NextUp a={next} total={queue.length} onOpen={() => router.push(nextActionHref(next.opportunity_id, next.next_action_key))} />
        ) : empty && stepIndex >= 0 ? (
          <SetupStep step={stepIndex} total={setup.length} {...setup[stepIndex]} />
        ) : (
          <div className="animate-rise flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-surface-sunken px-6 py-8 sm:px-8">
            <div>
              <p className="flex items-center gap-2 text-title text-ink">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-positive text-white"><CheckIcon size={14} className="check-draw" /></span>
                You&apos;re All Caught Up
              </p>
              <p className="mt-1.5 text-body text-ink-muted">New applications, analysis results and recommendations will appear here.</p>
            </div>
            <Link href="/vc/founders?source=open" className="btn-primary">Source Founders</Link>
          </div>
        )}
        {next && !data.thesis && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-caution">
            <span>No investment thesis yet — thesis fit can&apos;t be scored.</span>
            <Link href="/vc/fund?edit=1" className="link text-caution">Create Thesis</Link>
          </p>
        )}
      </section>

      {/* 2. what else is waiting, by kind of work */}
      {groups.length > 0 && (
        <section aria-labelledby="waiting-title" data-tour="waiting">
          <h2 id="waiting-title" className="mb-4 text-title text-ink">Also Waiting</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <Reveal as="li" key={g.key} i={i} className="animate-rise">
                <Link href={g.href} className="card-interactive group flex h-full flex-col rounded-xl border border-line bg-white p-5 focus-visible:outline-offset-2">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[2rem] font-semibold leading-none tracking-tight text-ink"><CountUp value={g.count} /></span>
                    <ArrowRightIcon size={18} className="slide-arrow" />
                  </span>
                  <span className="mt-2 text-body font-medium text-ink">{g.label}</span>
                  <span className="mt-1 truncate text-meta text-ink-muted" data-content>{g.names.slice(0, 3).join(", ")}{g.names.length > 3 ? ` +${g.names.length - 3}` : ""}</span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* 3. where everything stands: the four stages as one bar */}
      {!empty && (
        <Reveal as="section" aria-labelledby="stages-title" data-tour="overview">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="stages-title" className="text-title text-ink">Where Everything Stands</h2>
            <span className="num text-meta text-ink-muted">{total} {total === 1 ? "Record" : "Records"}</span>
          </div>
          <StageBar counts={data.stage_counts} names={byStage} />
        </Reveal>
      )}

      {/* 4. what's new: small, last */}
      {evidence.length > 0 && (
        <Reveal as="section" aria-labelledby="evidence-title" data-tour="evidence">
          <h2 id="evidence-title" className="mb-2 text-section text-ink-soft">Latest Evidence</h2>
          <ul className="divide-y divide-line">
            {evidence.map((e) => {
              const body = (
                <>
                  <span className="min-w-0 truncate">
                    <span className="text-ink" data-content>{e.title}</span>
                    <span className="text-ink-muted"> · </span>
                    {e.opportunity_name && <span className="text-ink-muted" data-content>{e.opportunity_name}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-ink-muted">
                    <span className="hidden sm:inline">{humanStatus(e.kind)}</span>
                    <span className="hidden truncate sm:inline sm:max-w-[12rem]" data-content>{sourceName(e.source_name)}</span>
                    <span className="num">{relativeDay(e.collected_at)}</span>
                  </span>
                </>
              );
              return (
                <li key={e.id}>
                  {e.opportunity_id ? (
                    <Link href={evidenceHref(e.opportunity_id, e.id)} className="row-interactive -mx-3 flex items-center justify-between gap-4 rounded-md px-3 py-2.5 text-meta">{body}</Link>
                  ) : <div className="flex items-center justify-between gap-4 py-2.5 text-meta">{body}</div>}
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}

      <GuidedTour steps={DASHBOARD_TOUR} open={tourOpen} onClose={closeTour} />
    </div>
  );
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} Days Ago`;
}

function waitingText(days: number): string {
  return days === 0 ? "Waiting Since Today" : `Waiting ${days}d`;
}

// The most urgent task, on its own, in the accent color. The whole panel opens
// it; the button says what it is.
function NextUp({ a, total, onOpen }: { a: ActionItem; total: number; onOpen: () => void }) {
  return (
    <div
      className="animate-rise group relative cursor-pointer overflow-hidden rounded-2xl bg-brand px-6 py-7 text-white shadow-raised transition-transform duration-base ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995] sm:px-9 sm:py-9"
      onClick={onOpen}
    >
      {/* a quiet trajectory line in the corner: the brand mark, not a decoration loop */}
      <svg aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-48 w-72 text-white/10" viewBox="0 0 280 180" fill="none">
        <path d="M10 170 C 90 160, 140 120, 170 80 S 240 20, 275 10" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
      </svg>
      <p className="relative text-meta font-medium text-white/80">Right Now{total > 1 ? ` · 1 of ${total}` : ""}</p>
      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-0">
          <Link href={`/vc/opportunities/${a.opportunity_id}`} onClick={(e) => e.stopPropagation()}
            className="block truncate text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-white hover:underline hover:decoration-white/40 hover:underline-offset-4 sm:text-display" data-content>{a.name}</Link>
          <p className="mt-2 text-body text-white/90">{a.next_action_detail ?? a.next_action}</p>
          <p className="mt-1 text-meta text-white/75">{humanStatus(a.stage)} · {a.entry_type === "inbound" ? "Inbound" : "Outbound"} · <span className="num">{waitingText(a.age_days)}</span></p>
        </div>
        <Link
          href={nextActionHref(a.opportunity_id, a.next_action_key)}
          onClick={(e) => e.stopPropagation()}
          className="btn btn-lg w-full bg-white text-brand shadow-raised hover:bg-brand-wash focus-visible:ring-white focus-visible:ring-offset-brand sm:w-auto"
        >
          {a.next_action}
          <ArrowRightIcon size={18} className="transition-transform duration-base ease-out group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}

// Empty workspace: exactly one setup action.
function SetupStep({ step, total, title, body, href, cta }: { step: number; total: number; title: string; body: string; href: string; cta: string }) {
  return (
    <div className="animate-rise rounded-2xl bg-brand-wash px-6 py-8 sm:px-9 sm:py-10" data-testid="setup-step">
      <p className="text-meta font-medium text-brand">Setup · Step {step + 1} of {total}</p>
      <p className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-page">{title}</p>
      <p className="mt-2 max-w-xl text-body text-ink-soft">{body}</p>
      <Link href={href} className="btn-primary btn-lg mt-6 w-full sm:w-auto">{cta}<ArrowRightIcon size={18} /></Link>
    </div>
  );
}

// The four stages as one bar. Each stage's share fills in on first view; hovering
// or focusing a stage shows its count and what's in it; clicking opens it.
function StageBar({ counts, names }: { counts: Record<string, number>; names: Record<string, string[]> }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const total = STAGES.reduce((a, s) => a + (counts[s] || 0), 0) || 1;
  return (
    <div ref={ref} onMouseLeave={() => setHover(null)}>
      <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full" aria-hidden>
        {STAGES.map((s, i) => {
          const n = counts[s] || 0;
          if (!n) return null;
          return (
            <Link key={s} href={STAGE_LINKS[s]} tabIndex={-1} onMouseEnter={() => setHover(s)}
              className={`h-full origin-left rounded-full transition-[transform,opacity] duration-[600ms] ease-out ${stageDot(s)} ${hover && hover !== s ? "opacity-35" : ""}`}
              style={{ flexGrow: n / total, transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: seen ? `${i * 90}ms` : "0ms" }} />
          );
        })}
      </div>
      <nav aria-label="Pipeline Summary" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s) => {
          const n = counts[s] || 0;
          const list = names[s] ?? [];
          return (
            <Link
              key={s}
              href={STAGE_LINKS[s]}
              onMouseEnter={() => setHover(s)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(null)}
              className={`group relative rounded-xl px-4 py-3 transition-colors duration-fast ${hover === s ? "bg-surface-sunken" : "hover:bg-surface-sunken"} active:bg-neutral-wash`}
            >
              <span className="flex items-center gap-2 text-meta font-medium text-ink-muted">
                <span aria-hidden className={`h-2 w-2 rounded-full ${stageDot(s)}`} />
                {humanStatus(s)}
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-2">
                <span className={`text-[1.75rem] font-semibold leading-none ${n ? "text-ink" : "text-ink-faint"}`}><CountUp value={n} /></span>
                <ArrowRightIcon size={16} className="slide-arrow" />
              </span>
              <span className="mt-1 block text-meta text-ink-muted">{s === "sourcing" ? (n === 1 ? "Lead in Founders" : "Leads in Founders") : (n === 1 ? "Deal in Pipeline" : "Deals in Pipeline")}</span>
              {/* what's in it, on hover or focus */}
              {hover === s && list.length > 0 && (
                <span className="menu-enter absolute left-2 top-full z-20 mt-1 w-56 rounded-lg border border-line bg-white p-3 text-left shadow-raised" role="tooltip">
                  <span className="block text-meta font-medium text-ink">{humanStatus(s)} · {n}</span>
                  <span className="mt-1 block text-meta text-ink-muted" data-content>{list.slice(0, 4).join(", ")}{list.length > 4 ? ` +${list.length - 4}` : ""}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-12" aria-hidden>
      <Skeleton className="h-48 rounded-2xl sm:h-52" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      </div>
    </div>
  );
}
