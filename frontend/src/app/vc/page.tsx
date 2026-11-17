"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { CountUp, ErrorState, PageHeader, Reveal, Skeleton } from "@/components/ui";
import { DASHBOARD_TOUR, GuidedTour } from "@/components/GuidedTour";
import { Deck } from "@/components/Deck";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { humanStatus, sourceName } from "@/lib/format";
import { evidenceHref, stageDot } from "@/lib/pipeline";
import { accountScope } from "@/lib/auth";
import { useSeen } from "@/lib/motion";
import { getMyDecisions, getPipeline, LocalDecision, PipelineStatus } from "@/lib/myWorkspace";
import { cardHref, DECK_GROUPS, DeckItem, deckGroups, openItems } from "@/lib/deck";

interface Dashboard {
  thesis: { fund_name: string; sectors: string[]; stages: string[]; geographies: string[] } | null;
  stage_counts: Record<string, number>;
  stage_names: Record<string, string[]>;
  action_queue: DeckItem[];
  queue_groups: { key: string; count: number; first_opportunity_id: number }[];
  recent_evidence: { id: number; kind: string; title: string; source_name: string; collected_at: string; opportunity_id: number | null; opportunity_name: string | null }[];
}

const STAGES = ["sourcing", "screening", "diligence", "decision"] as const;
const STAGE_LINKS: Record<string, string> = {
  sourcing: "/vc/founders",
  screening: "/vc/pipeline?stage=screening",
  diligence: "/vc/pipeline?stage=diligence",
  decision: "/vc/pipeline?stage=decision",
};

// useSearchParams (the deck's ?card=) needs a Suspense boundary
export default function DashboardPage() {
  return <Suspense fallback={<div className="space-y-10" role="status" aria-label="Loading Dashboard…"><PageHeader title="Dashboard" /><DashboardSkeleton /></div>}><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const { data, error, loading, reload } = useFetch<Dashboard>("/api/dashboard");
  const router = useRouter();
  const params = useSearchParams();
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
  // The deck is every other waiting record, in the queue's order.
  const items = openItems(data.action_queue || [], decisions, pipeline);
  const wanted = Number(params.get("card"));
  const found = items.findIndex((it) => it.opportunity_id === wanted);
  // a card that's no longer waiting falls back to the first
  const index = found >= 0 ? found : 0;
  const current = items[index];
  const groups = deckGroups(items);
  // flipping is only which card is in front: it's kept in the URL (so Back from a
  // record returns to it) without adding a history entry per flip
  const show = (i: number) => router.replace(`/vc?card=${items[i].opportunity_id}`, { scroll: false });

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

      {/* 1. what's waiting: a deck, one card in front, one primary button */}
      <section aria-labelledby="now-title" data-tour="action-queue">
        <h2 id="now-title" className="sr-only">Waiting for You</h2>
        {current ? (
          <Deck items={items} index={index} onIndex={show} onOpen={(it) => router.push(cardHref(it))} />
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
        {current && !data.thesis && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-caution">
            <span>No investment thesis yet — thesis fit can&apos;t be scored.</span>
            <Link href="/vc/fund?edit=1" className="link text-caution">Create Thesis</Link>
          </p>
        )}
      </section>

      {/* 2. the deck by kind of work: each jumps to the first card of its kind */}
      {groups.length > 1 && (
        <section aria-labelledby="waiting-title" data-tour="waiting">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="waiting-title" className="text-title text-ink">Jump to a Kind of Work</h2>
            <span className="num text-meta text-ink-muted">{items.length} Waiting</span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => {
              const on = current?.group === g.key;
              const meta = DECK_GROUPS[g.key];
              return (
                <Reveal as="li" key={g.key} i={i} className="animate-rise">
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => { show(g.first); document.querySelector("[data-testid=deck]")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}
                    className={`card-interactive group flex h-full w-full flex-col rounded-xl border p-5 text-left focus-visible:outline-offset-2 ${on ? "border-brand bg-brand-wash" : "border-line bg-white"}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[2rem] font-semibold leading-none tracking-tight text-ink"><CountUp value={g.count} /></span>
                      {on ? <span className="text-meta font-medium text-brand">Showing</span> : <ArrowRightIcon size={18} className="slide-arrow" />}
                    </span>
                    <span className="mt-2 text-body font-medium text-ink">{g.count === 1 ? meta.one : meta.many}</span>
                    <span className="mt-1 truncate text-meta text-ink-muted" data-content>{g.names.slice(0, 3).join(", ")}{g.names.length > 3 ? ` +${g.names.length - 3}` : ""}</span>
                  </button>
                </Reveal>
              );
            })}
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
          <StageBar counts={data.stage_counts} names={data.stage_names ?? {}} />
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
              className={`h-full origin-left rounded-full transition-[transform,opacity] duration-[500ms] ease-out ${stageDot(s)} ${hover && hover !== s ? "opacity-35" : ""}`}
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
