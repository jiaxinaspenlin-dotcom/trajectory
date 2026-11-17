"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, Button, ConfidenceBar, CountUp, DemoBadge, EmptyState, ErrorState, PageSkeleton, ScoreRing, Section, Segmented, Skeleton } from "@/components/ui";
import { ShortlistBadge, StageBadge } from "@/components/DealBadges";
import { ArrowRightIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { MomentumChart } from "@/components/MomentumChart";
import { ThreeAxes } from "@/components/ThreeAxes";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { ClaimsTable } from "@/components/ClaimsTable";
import { FounderScoreBreakdown } from "@/components/FounderScoreBreakdown";
import { HumanDecisionPanel } from "@/components/HumanDecisionPanel";
import { Claim, Evidence, Opportunity } from "@/lib/types";
import { LeadWebCheck } from "@/components/WebSourcing";
import { humanStatus, labelPhrase, sourceName, verificationTone } from "@/lib/format";
import { evidenceHref, OpportunityTab, parseOpportunityTab, SHORTLIST_LABEL, shortlistOf, sourceLabel, stageDot } from "@/lib/pipeline";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { EvidenceLinkProvider } from "@/components/EvidenceRef";
import {
  clearPipelineStatus, getMyDecision, getPipelineStatus, LocalDecision, PipelineStatus,
  saveMyDecision, setPipelineStatus,
} from "@/lib/myWorkspace";

export default function OpportunityPage() {
  // useSearchParams (the ?tab= state) needs a Suspense boundary
  return (
    <Suspense fallback={<RecordSkeleton />}>
      <OpportunityRecord />
    </Suspense>
  );
}

const TAB_LABELS: Record<OpportunityTab, string> = {
  overview: "Overview", founder: "Founder", screening: "Screening", arena: "Arena",
  claims: "Claims", evidence: "Evidence", decision: "Decision",
};
// links from before tabs existed (#decision, #evidence, …) still land on the right panel
const LEGACY_HASH: Record<string, OpportunityTab> = {
  "#overview": "overview", "#next-step": "overview", "#screening": "screening", "#arena": "arena",
  "#claims": "claims", "#evidence": "evidence", "#decision": "decision",
};

function OpportunityRecord() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = parseOpportunityTab(params.get("tab"));
  const focusEvidence = Number(params.get("evidence")) || null;
  // tab changes are history entries, so Back returns to the previous panel
  const setTab = useCallback((t: OpportunityTab) => {
    router.push(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }, [pathname, router]);
  useEffect(() => {
    const legacy = LEGACY_HASH[window.location.hash];
    if (legacy && !params.get("tab")) router.replace(legacy === "overview" ? pathname : `${pathname}?tab=${legacy}`, { scroll: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: o, loading, error, reload } = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const scope = o?.company?.id
    ? `company_id=${o.company.id}`
    : o?.founder?.id
    ? `founder_id=${o.founder.id}`
    : null;
  const claims = useFetch<{ items: Claim[] }>(scope ? `/api/claims?${scope}` : null);
  const contradictions = useFetch<{ items: any[] }>(scope ? `/api/contradictions?${scope}` : null);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const [fitBusy, setFitBusy] = useState(false);
  const [confirmScreening, setConfirmScreening] = useState(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const notify = useToast();
  // per-browser workspace overlay for this opportunity
  const [myStatus, setMyStatus] = useState<PipelineStatus | null>(null);
  const [myDecision, setMyDecision] = useState<LocalDecision | null>(null);
  useEffect(() => {
    const n = Number(id);
    setMyStatus(getPipelineStatus(n));
    setMyDecision(getMyDecision(n));
  }, [id]);

  // My shortlist (Saved / Monitoring / Dismissed) is personal — kept in this
  // browser and never shared. Choosing the current value again clears it.
  function setShortlist(next: PipelineStatus) {
    const n = Number(id);
    if (!myStatus && o && o.status === next) {
      // shortlisted on the shared record (e.g. saved from web search); pick another value to change it
      notify({ message: `Already ${SHORTLIST_LABEL[next]} — choose another option to change it.` });
      return;
    }
    if (myStatus === next) {
      clearPipelineStatus(n);
      setMyStatus(null);
      notify({ message: "Removed from your shortlist." });
    } else {
      setPipelineStatus(n, next);
      setMyStatus(next);
      notify({ message: next === "dismissed" ? "Dismissed — hidden from your active leads." : `Shortlist set to ${SHORTLIST_LABEL[next]}.` });
    }
  }

  // Suggesting outreach and moving to Screening are shared workflow steps.
  async function prospectAction(action: string) {
    await api.post(`/api/sourcing/prospects/${id}/action`, { action });
    await reload();
  }

  async function suggestOutreach() {
    try {
      await prospectAction("recommend_outreach");
      notify({ message: "Outreach suggested — it's now the next step, awaiting your review. Nothing was sent.", href: `${pathname}?tab=decision`, linkLabel: "Review It" });
    } catch (e) {
      notify({ tone: "error", message: e instanceof Error ? e.message : "Couldn't suggest outreach." });
    }
  }

  async function recalculateFit() {
    setFitBusy(true);
    try {
      await api.post(`/api/thesis/recalculate-fit?opportunity_id=${id}`);
      await reload();
      notify({ message: "Thesis fit recalculated. Stage and shortlist didn't change." });
    } catch (e) {
      notify({ tone: "error", message: e instanceof Error ? `Couldn't recalculate: ${e.message}` : "Couldn't recalculate the fit." });
    } finally {
      setFitBusy(false);
    }
  }

  async function markReviewed() {
    await api.post(`/api/opportunities/${id}/evidence/reviewed`);
    await reload();
  }

  async function moveToScreening(): Promise<void> {
    setScreeningError(null);
    try {
      // historically named invite_to_apply; it moves this opportunity to Screening and sends nothing
      await prospectAction("invite_to_apply");
      setConfirmScreening(false);
      notify({ message: "Moved to Screening — it's now in Pipeline. No outreach was sent.", href: "/vc/pipeline?stage=screening", linkLabel: "View in Pipeline" });
    } catch (e) {
      setScreeningError(e instanceof Error ? e.message : "Could not move to screening.");
    }
  }

  async function generateMemo() {
    setMemoBusy(true);
    try {
      await api.post(`/api/opportunities/${id}/memo`);
      await reload();
    } catch {
      /* surfaced via the drawer staying empty; full errors live on the print view */
    } finally {
      setMemoBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    setRegenError(null);
    try {
      await api.post(`/api/opportunities/${id}/analyze`);
      await reload();
      claims.reload();
      contradictions.reload();
      setConfirmRegen(false);
    } catch (e) {
      setRegenError(
        e instanceof Error ? e.message : "Analysis failed. Ensure OPENAI_API_KEY is configured."
      );
    } finally {
      setBusy(false);
    }
  }

  // reloads keep the page (and in-flight messages) mounted; only the first load shows a spinner
  if (loading && !o) return <RecordSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!o) return null;

  const name = o.company?.name || o.founder?.full_name || `Opportunity #${o.id}`;
  const newIds = new Set(o.new_evidence_ids ?? []);
  // new web evidence first
  const evidence: Evidence[] = [...(o.evidence || o.founder?.evidence || [])].sort(
    (a, b) => Number(newIds.has(b.id)) - Number(newIds.has(a.id))
  );
  const analyzed = !!(o.assessment || o.debate);
  const inPipeline = o.stage !== "sourcing";
  const shortlist = shortlistOf(o, myStatus);
  const step = o.next_step ?? null;
  const claimCount = claims.data?.items.length ?? 0;

  // the ONE primary action for this record, from its next step
  const arrow = <ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" />;
  const primary =
    step?.key === "run_analysis" || step?.key === "review_application"
      ? <Button variant="primary" onClick={() => setConfirmRegen(true)} busy={busy}>Run Analysis</Button>
    // already on the Decision tab: the form is the action, so no button points back at it
    : step?.key === "review_recommendation" && tab === "decision"
      ? null
    : step?.key === "review_recommendation"
      ? <Link href={`${pathname}?tab=decision`} scroll={false} className="btn-primary group">Review Recommendation{arrow}</Link>
    : step?.key === "resolve_diligence"
      ? <Link href={`/vc/opportunities/${id}/diligence`} className="btn-primary group">Open Diligence{arrow}</Link>
    : step?.key === "generate_memo"
      ? <Link href={`/vc/opportunities/${id}/memo`} className="btn-primary group">Open Memo{arrow}</Link>
    : null;

  const tabs = (Object.keys(TAB_LABELS) as OpportunityTab[]).map((k) => ({
    key: k,
    label: TAB_LABELS[k],
    badge:
      k === "evidence" && newIds.size ? <span className="chip bg-signal-wash text-caution" aria-label={`${newIds.size} New`}>{newIds.size} New</span>
      : k === "evidence" ? <span className="num text-[13px] text-ink-faint">{evidence.length}</span>
      : k === "claims" && claimCount ? <span className="num text-[13px] text-ink-faint">{claimCount}</span>
      : k === "decision" && step?.key === "review_recommendation" ? <span className="h-2 w-2 rounded-full bg-brand" aria-label="Awaiting Your Review" />
      : undefined,
  }));

  return (
    <EvidenceLinkProvider href={(eid) => evidenceHref(o.id, eid)}>
    {/* capped so long analysis text keeps a comfortable line length on wide screens */}
    <div className="space-y-8">
      <div className="animate-rise space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center text-[13px] text-ink-muted">
          {o.entry_type === "outbound" && <><Link href="/vc/founders" className="link text-ink-muted hover:text-ink">Founders</Link><span className="mx-1.5 text-ink-faint">/</span></>}
          {inPipeline && <><Link href={`/vc/pipeline?stage=${o.stage}`} className="link text-ink-muted hover:text-ink">Pipeline</Link><span className="mx-1.5 text-ink-faint">/</span></>}
          <span className="truncate text-ink-soft" data-content>{name}</span>
          <Link href={`/vc/map?focus=${o.id}`} className="link ml-auto shrink-0 pl-3 text-ink-muted hover:text-ink">View on Map</Link>
        </nav>

        {/* name, where it stands, and the one next action */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mr-1 text-[1.75rem] font-[650] leading-9 tracking-[-0.025em] text-ink sm:text-page" data-content>{name}</h1>
              <StageBadge stage={o.stage} />
              {shortlist && <ShortlistBadge shortlist={shortlist} />}
              {o.is_demo && <DemoBadge />}
            </div>
            {o.company?.one_liner && <p className="mt-1.5 max-w-3xl text-body text-ink-soft" data-content>{o.company.one_liner}</p>}
            <p className="mt-1 text-meta text-ink-muted">
              {sourceLabel(o.entry_type)}
              {step && <> · Next Step: <span className="font-medium text-ink-soft">{step.label}</span>{step.detail ? ` · ${step.detail}` : ""}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step?.key !== "generate_memo" && <Link href={`/vc/opportunities/${id}/memo`} className="btn-ghost">Memo</Link>}
            {step?.key !== "resolve_diligence" && <Link href={`/vc/opportunities/${id}/diligence`} className="btn-ghost">Diligence</Link>}
            {primary}
          </div>
        </header>
      </div>

      {confirmRegen && (
        <div className="animate-rise rounded-xl bg-brand-wash px-5 py-4" role="region" aria-label="Confirm Analysis">
          <p className="text-sm text-ink-soft">
            {analyzed ? "Regenerate" : "Generate"} the assessment, diligence questions, Arena debate, and memo with OpenAI? Prior versions are kept — nothing is overwritten.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" size="sm" onClick={regenerate} busy={busy}>{analyzed ? "Regenerate" : "Run Analysis"}</Button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirmRegen(false)} disabled={busy}>Cancel</button>
          </div>
          {regenError && (
            <p className="field-error" role="alert">
              {regenError.includes("OPENAI") || regenError.toLowerCase().includes("ai provider")
                ? "AI is not configured. Set OPENAI_API_KEY on the backend to enable analysis. Deterministic scores and the seeded demo analysis remain available."
                : regenError}
            </p>
          )}
        </div>
      )}

      <Tabs label="Record Sections" idPrefix="opp" tabs={tabs} value={tab} onChange={setTab} />

      <div key={tab} {...tabPanelProps("opp", tab)}>
        {tab === "overview" && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] [&>*]:min-w-0">
            <div className="space-y-8">
              <Section title="Summary" card={false}>
                <div className="max-w-prose space-y-4 text-[15px] leading-7 text-ink-soft">
                  {o.company?.description || o.company?.one_liner || o.founder?.headline
                    ? <p data-content>{o.company?.description || o.company?.one_liner || o.founder?.headline}</p>
                    : <p>No description yet.</p>}
                  <p className="text-sm text-ink-muted">
                    {o.founder
                      ? <span data-content>{[o.founder.full_name, o.founder.location].filter(Boolean).join(" · ")}</span>
                      : o.identity?.founder_named ? <>Founder Named on a Source: <span data-content>{o.identity.founder_named}</span> · <span className="text-caution">Unverified</span></> : "Founder Not Linked Yet"}
                    {o.company?.website && <> · <a href={o.company.website} target="_blank" rel="noreferrer" className="link text-ink-muted" data-content>{o.company.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a></>}
                  </p>
                  {o.surfaced_reason && (
                    <div className="border-l-2 border-brand/40 pl-4">
                      <p className="label">Why It Surfaced</p>
                      <p className="mt-1 text-sm leading-6">{o.surfaced_reason}</p>
                    </div>
                  )}
                </div>
              </Section>
              <Section title="At a Glance" card={false}>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Fact label="Thesis Fit" value={o.company ? `${Math.round(o.thesis_fit_score)}` : "Needs a Company"} note={o.company ? (o.thesis_fit_stale ? "Not Current" : "/ 100") : undefined} tab="screening" pathname={pathname} />
                  <Fact label="Founder Score" value={o.founder_score ? `${Math.round(o.founder_score.score)}` : "Not Scored"} tab="founder" pathname={pathname} />
                  <Fact label="Evidence" value={`${evidence.length}`} note={newIds.size ? `${newIds.size} New` : evidence.length === 1 ? "Item" : "Items"} tab="evidence" pathname={pathname} />
                  <Fact label="Claims" value={claims.data ? `${claimCount}` : "…"} tab="claims" pathname={pathname} />
                  <Fact label="Analysis" value={analyzed ? "Done" : "Not Run Yet"} tab="screening" pathname={pathname} />
                </dl>
              </Section>
            </div>
            <StatusCard
              o={o} inPipeline={inPipeline} shortlist={shortlist}
              confirmScreening={confirmScreening} setConfirmScreening={setConfirmScreening}
              moveToScreening={moveToScreening} screeningError={screeningError}
              setShortlist={setShortlist} suggestOutreach={suggestOutreach}
            />
          </div>
        )}

        {tab === "founder" && (
          o.founder ? (
            <div className="space-y-10">
              <Section title="Founder" card={false}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-ink" data-content>{o.founder.full_name}</p>
                    <p className="text-sm text-ink-muted">
                      {o.founder.headline || o.founder.location
                        ? <span data-content>{[o.founder.headline, o.founder.location].filter(Boolean).join(" · ")}</span>
                        : "No Headline or Location"}
                    </p>
                  </div>
                  {o.founder.github_username ? (
                    <span className="flex flex-col items-end gap-1 text-sm">
                      <Badge tone="bg-positive-wash text-positive">GitHub Profile Linked</Badge>
                      <a href={`https://github.com/${o.founder.github_username}`} target="_blank" rel="noreferrer" className="text-brand hover:underline" data-content>@{o.founder.github_username} ↗</a>
                    </span>
                  ) : <Badge tone="bg-caution-wash text-caution">No Public Profile Linked</Badge>}
                </div>
              </Section>
              <div className="grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
                <Section title="Founder Score" subtitle="Deterministic, from Public Evidence · Persists Across Companies" card={false}>
                  {o.founder_score ? (
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center gap-1.5">
                        <ScoreRing score={o.founder_score.score} size={80} />
                        <ConfidenceBar value={o.founder_score.confidence} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5 text-ink-soft">{o.founder_score.explanation}</p>
                        <FounderScoreBreakdown components={o.founder_score.components} />
                      </div>
                    </div>
                  ) : <EmptyState title="No Score Yet" hint="The Founder Score is computed from the founder's public GitHub evidence. Sync their GitHub profile from Founders → Source Founders." />}
                </Section>
                <Section title="Momentum" subtitle="Direction and Rate of Change Over Time" card={false}>
                  {o.momentum ? <MomentumChart momentum={o.momentum} /> : <EmptyState title="No Momentum History" hint="Momentum appears after the Founder Score has been computed more than once." />}
                </Section>
              </div>
            </div>
          ) : (
            <Section title="Founder" card={false}>
              <div className="max-w-prose space-y-3" data-testid="founder-missing">
                <p className="text-base font-semibold text-ink">No Founder Linked Yet</p>
                <p className="text-[15px] leading-7 text-ink-soft">
                  {o.identity?.founder_named
                    ? <><span data-content>{o.identity.founder_named}</span> {o.identity.founder_named.includes(" and ") ? "are" : "is"} named on a <a href={o.identity.founder_named_source ?? undefined} target="_blank" rel="noreferrer" className="text-brand hover:underline">source</a>, but not verified. </>
                    : "None of this lead's sources name a founder. "}
                  Founder Score and Momentum need a founder with public GitHub activity — sync their GitHub profile to add one.
                </p>
                <Link href="/vc/founders?source=open" className="btn-secondary btn-sm">Source Founders</Link>
              </div>
            </Section>
          )
        )}

        {tab === "screening" && (
          <div className="space-y-10">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] [&>*]:min-w-0">
              <Section title="Thesis Fit" subtitle="Against Your Fund Thesis" card={false}>
                {o.company ? (
                  <div className="text-[2.5rem] font-semibold leading-none tracking-tight text-ink"><CountUp value={o.thesis_fit_score} /><span className="text-base font-normal text-ink-muted"> / 100</span></div>
                ) : <p className="text-sm text-ink-muted">Not computed — fit is evaluated from a company, and this lead has none yet.</p>}
                {o.company && o.thesis_fit_stale && (
                  <div className="mt-3 rounded-lg bg-caution-wash px-3 py-2.5 text-sm text-caution" data-testid="fit-stale">
                    <p>Not scored against your current thesis.</p>
                    <Button size="sm" className="mt-2" onClick={recalculateFit} busy={fitBusy}>Recalculate Fit</Button>
                  </div>
                )}
                <Link href="/vc/fund" className="link mt-3 inline-block text-sm">View Thesis</Link>
              </Section>
              <Section title="Gaps to Investigate" subtitle="Missing Information and Contradictions, Most Important First" card={false}>
                <Gaps assessment={o.assessment ?? null} contradictions={contradictions.data?.items ?? []} />
              </Section>
            </div>
            <Section
              title="Assessment"
              card={false}
              right={analyzed && <button className="btn-secondary btn-sm" onClick={() => setConfirmRegen(true)} disabled={busy}>Regenerate Analysis</button>}
            >
              {o.assessment ? <ThreeAxes assessment={o.assessment} /> : (
                <EmptyState title="No Assessment Yet" hint="Use Run Analysis at the top of this record to generate the three screening axes." />
              )}
            </Section>
          </div>
        )}

        {tab === "arena" && (
          <InvestmentArena debate={o.debate || null} memo={o.memo ?? null} onGenerateMemo={generateMemo} memoBusy={memoBusy} />
        )}

        {tab === "claims" && (
          <Section title="Claims" subtitle="Each claim's verification status and trust score. Citations open the supporting evidence." card={false}>
            {claims.data ? <ClaimsTable claims={claims.data.items} /> : claims.error ? <ErrorState message={claims.error} onRetry={claims.reload} /> : <div role="status" aria-label="Loading Claims…" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
          </Section>
        )}

        {tab === "evidence" && (
          <EvidencePanel
            o={o} evidence={evidence} newIds={newIds} focusId={focusEvidence}
            onClearFocus={() => router.replace(`${pathname}?tab=evidence`, { scroll: false })}
            markReviewed={markReviewed} reload={reload}
          />
        )}

        {tab === "decision" && (
          <div className="max-w-3xl">
            <Section title="Recommendation & Decision" subtitle="The system recommends; a person decides." card={false}>
              <HumanDecisionPanel
                opportunityId={o.id}
                recommendation={o.current_recommendation || null}
                onDecision={reload}
                savedLocal={myDecision}
                onSavedLocal={(d) => { saveMyDecision(o.id, d); setMyDecision(d); }}
              />
            </Section>
          </div>
        )}
      </div>
    </div>
    </EvidenceLinkProvider>
  );
}

function Fact({ label, value, note, tab, pathname }: { label: string; value: string; note?: string; tab: OpportunityTab; pathname: string }) {
  return (
    <Link href={`${pathname}?tab=${tab}`} scroll={false} className="card-interactive group block rounded-xl border border-line px-4 py-3">
      <dt className="flex items-center justify-between text-meta text-ink-muted">{label}<ArrowRightIcon size={14} className="slide-arrow" /></dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-xl font-semibold text-ink">{value}</span>
        {note && <span className="text-meta text-ink-muted">{note}</span>}
      </dd>
    </Link>
  );
}

// Where the record stands: the shared stage (and the deliberate move into
// Screening) and, for outbound leads, my personal shortlist. The next step lives
// in the header with the record's one primary button.
function StatusCard({
  o, inPipeline, shortlist, confirmScreening, setConfirmScreening, moveToScreening, screeningError, setShortlist, suggestOutreach,
}: {
  o: Opportunity; inPipeline: boolean; shortlist: ReturnType<typeof shortlistOf>;
  confirmScreening: boolean; setConfirmScreening: (v: boolean) => void; moveToScreening: () => Promise<void>;
  screeningError: string | null; setShortlist: (s: PipelineStatus) => void; suggestOutreach: () => void;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <aside aria-label="Stage and Shortlist" className="space-y-8 lg:border-l lg:border-line lg:pl-8">
      <div>
        <p className="label">Stage</p>
        <StageTrack stage={o.stage} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!inPipeline && (confirmScreening ? (
            <div className="animate-rise w-full rounded-lg bg-surface-sunken p-3">
              <p className="text-[13px] text-ink-soft">Move into the fund&apos;s Pipeline at Screening? No outreach is sent.</p>
              <div className="mt-2 flex gap-2">
                <Button variant="primary" size="sm" busy={moving} onClick={async () => { setMoving(true); try { await moveToScreening(); } finally { setMoving(false); } }}>Confirm Move</Button>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmScreening(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => setConfirmScreening(true)}>Move to Screening</button>
          ))}
          {inPipeline && <Link href={`/vc/pipeline?stage=${o.stage}`} className="link text-sm">Open in Pipeline</Link>}
          {screeningError && <p className="field-error w-full" role="alert">{screeningError}</p>}
        </div>
      </div>

      {o.entry_type === "outbound" && (
        <div>
          <p className="label mb-1.5" id="shortlist-label">My Shortlist</p>
          <Segmented<PipelineStatus | "none">
            size="sm"
            label="My Shortlist"
            value={shortlist ?? "none"}
            onChange={(v) => v !== "none" && setShortlist(v)}
            options={(["saved", "monitoring", "dismissed"] as const).map((st) => ({ value: st, label: SHORTLIST_LABEL[st] }))}
          />
          <p className="mt-2 text-xs text-ink-muted">Only you see this (saved in this browser). It doesn&apos;t change the stage.</p>
          {!inPipeline && (
            <button className="link mt-3 text-sm" onClick={suggestOutreach}
              title="Adds an 'Invite to Apply' suggestion for you to approve. Nothing is sent.">
              Suggest Outreach
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

// Missing information from the screening axes plus detected contradictions —
// the things to dig into next. Contradictions first: they're the riskiest.
function Gaps({ assessment, contradictions }: { assessment: Opportunity["assessment"] | null; contradictions: { id: number; severity: string; description: string }[] }) {
  const missing = (assessment?.axes ?? []).flatMap((ax) =>
    (ax.missing_information ?? []).map((m: string) => ({ axis: humanStatus(ax.axis), text: m }))
  );
  const seen = new Set<string>();
  const unique = missing.filter((m) => (seen.has(m.text.toLowerCase()) ? false : (seen.add(m.text.toLowerCase()), true)));
  if (!contradictions.length && !unique.length) {
    return <p className="text-sm text-ink-muted">{assessment ? "No contradictions or missing information flagged." : "Gaps appear after analysis runs."}</p>;
  }
  return (
    <ul className="space-y-2" data-testid="screening-gaps">
      {contradictions.slice(0, 3).map((c) => (
        <li key={`c${c.id}`} className="flex items-start gap-2 text-sm text-ink-soft">
          <Badge tone="bg-negative-wash text-negative">Contradiction · {humanStatus(c.severity)}</Badge><span>{c.description}</span>
        </li>
      ))}
      {unique.slice(0, Math.max(0, 6 - Math.min(3, contradictions.length))).map((m) => (
        <li key={m.text} className="flex items-start gap-2 text-sm text-ink-soft">
          <Badge tone="bg-caution-wash text-caution">Missing · {m.axis}</Badge><span>{labelPhrase(m.text)}</span>
        </li>
      ))}
    </ul>
  );
}

function EvidencePanel({
  o, evidence, newIds, focusId, onClearFocus, markReviewed, reload,
}: {
  o: Opportunity; evidence: Evidence[]; newIds: Set<number>; focusId: number | null;
  onClearFocus: () => void; markReviewed: () => void; reload: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const focusIndex = focusId ? evidence.findIndex((e) => e.id === focusId) : -1;
  const shown = showAll || focusIndex >= 25 ? evidence : evidence.slice(0, 25);

  // bring a cited item into view and move focus to it
  useEffect(() => {
    if (!focusId || focusIndex < 0) return;
    const row = document.getElementById(`evidence-row-${focusId}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.focus({ preventScroll: true });
  }, [focusId, focusIndex]);

  return (
    <Section
      title="Evidence"
      subtitle={`${evidence.length} Sourced, Dated Items`}
      right={
        <span className="flex flex-wrap items-center justify-end gap-2">
          {newIds.size ? (
            <span className="flex items-center gap-2" data-testid="evidence-new-summary">
              <Badge tone="bg-signal-wash text-caution">{newIds.size} New from Web Search</Badge>
              <button className="btn-secondary btn-sm" onClick={markReviewed}>Mark Reviewed</button>
            </span>
          ) : o.is_demo ? <DemoBadge /> : null}
          {!o.is_demo && (o.company || o.founder) && <LeadWebCheck opportunityId={o.id} onUpdated={reload} />}
        </span>
      }
      flush
    >
      {focusId && (
        <div className="animate-fade flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-wash px-5 py-2.5 text-sm text-brand" role="status">
          <span>{focusIndex >= 0 ? <>Showing cited evidence <strong className="font-mono">E{focusId}</strong>.</> : <>Evidence <strong className="font-mono">E{focusId}</strong> isn&apos;t part of this record&apos;s evidence.</>}</span>
          <button className="btn-ghost btn-sm" onClick={onClearFocus}>Clear</button>
        </div>
      )}
      {evidence.length ? (
        <div>
          <ol className="divide-y divide-line" aria-label="Evidence Items">
            {shown.map((e) => {
              const quote = ((e.structured_value ?? {}) as { quote?: string }).quote;
              const focused = e.id === focusId;
              return (
                <li
                  key={e.id}
                  id={`evidence-row-${e.id}`}
                  tabIndex={focused ? -1 : undefined}
                  aria-current={focused ? "true" : undefined}
                  className={`scroll-mt-28 px-5 py-3.5 transition-colors duration-base focus:outline-none ${focused ? "bg-brand-wash shadow-[inset_3px_0_0_#3047e8]" : newIds.has(e.id) ? "bg-signal-wash/60" : "hover:bg-surface-sunken"}`}
                  data-testid={focused ? "evidence-focused-row" : newIds.has(e.id) ? "evidence-new-row" : undefined}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {newIds.has(e.id) && <Badge tone="mr-1.5 bg-signal-wash text-caution">New</Badge>}
                      {e.source_url
                        ? <a href={e.source_url} target="_blank" rel="noreferrer" className="text-ink hover:text-brand" data-content>{e.title} <span className="text-ink-faint">↗</span></a>
                        : <span className="text-ink" data-content>{e.title}</span>}
                      {quote && <span className="mt-1 block border-l-2 border-line pl-2 text-[13px] italic text-ink-muted" data-content>“{quote}”</span>}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-ink-faint">E{e.id}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                    <span data-content>{sourceName(e.source_name)}</span>
                    <Badge tone={verificationTone(e.verification_status)}>{humanStatus(e.verification_status)}</Badge>
                    <span className="num"><EvidenceDate e={e} /></span>
                  </div>
                </li>
              );
            })}
          </ol>
          {evidence.length > shown.length && (
            <div className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">
              Showing {shown.length} of {evidence.length}. <button className="link" onClick={() => setShowAll(true)}>Show All</button>
            </div>
          )}
        </div>
      ) : <p className="px-5 py-6 text-sm text-ink-muted">No evidence collected for this lead yet. Use Check the Web for Updates, or sync a GitHub profile from Founders.</p>}
    </Section>
  );
}

// Web evidence carries how its date was established; anything unsupported is
// shown as unknown rather than guessed.
function EvidenceDate({ e }: { e: Evidence }) {
  const sv = (e.structured_value ?? {}) as { date_basis?: string | null; date_precision?: string | null; date_text?: string | null };
  if (!e.event_date) return e.kind.startsWith("web_") ? <span className="italic">Date Unknown</span> : <>—</>;
  const d = new Date(e.event_date);
  const text = d.toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", year: "numeric", ...(sv.date_precision === "month" ? {} : { day: "numeric" }),
  });
  const title = sv.date_basis === "stated_in_source" ? `Stated in the source: “${sv.date_text}”.`
    : sv.date_basis === "search_provider" ? "Published date reported by the search provider." : undefined;
  return <span title={title}>{text}{sv.date_basis === "search_provider" && " *"}</span>;
}

const STAGE_ORDER = ["sourcing", "screening", "diligence", "decision"] as const;

// Shared stage as a short track: done → current → upcoming.
function StageTrack({ stage }: { stage: string }) {
  const at = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return (
    <div className="mt-2.5">
      <ol className="grid grid-cols-4 gap-1" aria-label={`Stage: ${humanStatus(stage)}`}>
        {STAGE_ORDER.map((s, i) => (
          <li key={s} aria-current={i === at ? "step" : undefined} title={humanStatus(s)}>
            <span className="sr-only">{humanStatus(s)}{i < at ? " (Done)" : ""}</span>
            <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={`block h-full origin-left rounded-full transition-transform duration-[600ms] ease-out ${stageDot(s)}`}
                style={{ transform: `scaleX(${i <= at ? 1 : 0})`, transitionDelay: `${i * 80}ms` }} />
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm" aria-hidden>
        <span className="font-semibold text-ink">{humanStatus(stage)}</span>
        <span className="text-ink-muted"> · Step {at + 1} of {STAGE_ORDER.length}</span>
      </p>
    </div>
  );
}

function RecordSkeleton() {
  return (
    <div role="status" aria-label="Loading Opportunity…" className="space-y-8">
      <span className="sr-only">Loading Opportunity…</span>
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]" aria-hidden>
        <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
