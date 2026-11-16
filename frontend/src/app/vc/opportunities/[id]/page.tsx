"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ConfidenceBar, DemoBadge, EmptyState, ErrorState, ScoreRing, Section, Spinner } from "@/components/ui";
import { ShortlistBadge, SourceBadge, StageBadge } from "@/components/DealBadges";
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
import { evidenceHref, OpportunityTab, parseOpportunityTab, SHORTLIST_LABEL, shortlistOf } from "@/lib/pipeline";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { EvidenceLinkProvider } from "@/components/EvidenceRef";
import {
  clearPipelineStatus, getMyDecision, getPipelineStatus, LocalDecision, PipelineStatus,
  saveMyDecision, setPipelineStatus,
} from "@/lib/myWorkspace";

export default function OpportunityPage() {
  // useSearchParams (the ?tab= state) needs a Suspense boundary
  return (
    <Suspense fallback={<Spinner label="Loading Opportunity…" />}>
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

  async function moveToScreening() {
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
  if (loading && !o) return <Spinner label="Loading Opportunity…" />;
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
  const primary =
    step?.key === "run_analysis" || step?.key === "review_application"
      ? <button className="btn-primary" onClick={() => setConfirmRegen(true)} disabled={busy}>{busy ? "Analyzing…" : "Run Analysis"}</button>
    : step?.key === "review_recommendation"
      ? <Link href={`${pathname}?tab=decision`} scroll={false} className="btn-primary">Review Recommendation</Link>
    : step?.key === "resolve_diligence"
      ? <Link href={`/vc/opportunities/${id}/diligence`} className="btn-primary">Open Diligence</Link>
    : step?.key === "generate_memo"
      ? <Link href={`/vc/opportunities/${id}/memo`} className="btn-primary">Open Memo</Link>
    : null;

  const tabs = (Object.keys(TAB_LABELS) as OpportunityTab[]).map((k) => ({
    key: k,
    label: TAB_LABELS[k],
    badge:
      k === "evidence" && newIds.size ? <span className="chip bg-signal-wash text-caution" aria-label={`${newIds.size} New`}>{newIds.size} New</span>
      : k === "evidence" ? <span className="num text-[13px] text-ink-muted">{evidence.length}</span>
      : k === "claims" && claimCount ? <span className="num text-[13px] text-ink-muted">{claimCount}</span>
      : k === "decision" && step?.key === "review_recommendation" ? <span className="h-2 w-2 rounded-full bg-brand" aria-label="Awaiting Your Review" />
      : undefined,
  }));

  return (
    <EvidenceLinkProvider href={(eid) => evidenceHref(o.id, eid)}>
    {/* capped so long analysis text keeps a comfortable line length on wide screens */}
    <div className="max-w-[1480px] space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center text-[13px] text-ink-muted">
        {o.entry_type === "outbound" && <><Link href="/vc/founders" className="hover:text-brand">Founders</Link><span className="mx-1.5 text-ink-faint">/</span></>}
        {inPipeline && <><Link href={`/vc/pipeline?stage=${o.stage}`} className="hover:text-brand">Pipeline</Link><span className="mx-1.5 text-ink-faint">/</span></>}
        <span className="truncate text-ink-soft" data-content>{name}</span>
        <Link href={`/vc/map?focus=${o.id}`} className="ml-auto shrink-0 pl-3 hover:text-brand">View on Map →</Link>
      </nav>

      {/* compact header: name, source, stage, one primary next action */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="mr-1 text-2xl font-semibold tracking-[-0.015em] text-ink" data-content>{name}</h1>
            <SourceBadge entryType={o.entry_type} />
            <StageBadge stage={o.stage} />
            {shortlist && <ShortlistBadge shortlist={shortlist} />}
            {o.is_demo && <DemoBadge />}
          </div>
          {o.company?.one_liner && <p className="mt-1 max-w-3xl text-[15px] text-ink-soft" data-content>{o.company.one_liner}</p>}
          {step && <p className="mt-1 text-[13px] text-ink-muted">Next Step: <span className="font-medium text-ink-soft">{step.label}</span>{step.detail ? ` · ${step.detail}` : ""}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step?.key !== "generate_memo" && <Link href={`/vc/opportunities/${id}/memo`} className="btn-ghost">Memo</Link>}
          {step?.key !== "resolve_diligence" && <Link href={`/vc/opportunities/${id}/diligence`} className="btn-ghost">Diligence Workspace</Link>}
          {primary}
        </div>
      </header>

      {confirmRegen && (
        <div className="rounded-lg border border-brand/25 bg-brand-wash px-4 py-3" role="region" aria-label="Confirm Analysis">
          <p className="text-sm text-brand">
            {analyzed ? "Regenerate" : "Generate"} the assessment, diligence questions, Arena debate, and memo with OpenAI? Prior versions are kept — nothing is overwritten.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary btn-sm" onClick={regenerate} disabled={busy}>{busy ? "Analyzing…" : analyzed ? "Regenerate" : "Run Analysis"}</button>
            <button className="btn-secondary btn-sm" onClick={() => setConfirmRegen(false)} disabled={busy}>Cancel</button>
          </div>
          {regenError && (
            <p className="mt-2 text-sm text-negative" role="alert">
              {regenError.includes("OPENAI") || regenError.toLowerCase().includes("ai provider")
                ? "AI is not configured. Set OPENAI_API_KEY on the backend to enable analysis. Deterministic scores and the seeded demo analysis remain available."
                : regenError}
            </p>
          )}
        </div>
      )}

      <Tabs label="Record Sections" idPrefix="opp" tabs={tabs} value={tab} onChange={setTab} />

      <div {...tabPanelProps("opp", tab)}>
        {tab === "overview" && (
          <div className="space-y-6">
            <StatusCard
              o={o} inPipeline={inPipeline} shortlist={shortlist} step={step}
              confirmScreening={confirmScreening} setConfirmScreening={setConfirmScreening}
              moveToScreening={moveToScreening} screeningError={screeningError}
              setShortlist={setShortlist} suggestOutreach={suggestOutreach}
            />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] [&>*]:min-w-0">
              <Section title="Summary">
                <div className="max-w-prose space-y-3 text-[15px] leading-7 text-ink-soft">
                  {o.company?.description || o.company?.one_liner || o.founder?.headline
                    ? <p data-content>{o.company?.description || o.company?.one_liner || o.founder?.headline}</p>
                    : <p>No description yet.</p>}
                  <p className="text-sm text-ink-muted">
                    {o.founder
                      ? <span data-content>{[o.founder.full_name, o.founder.location].filter(Boolean).join(" · ")}</span>
                      : o.identity?.founder_named ? <>Founder Named on a Source: <span data-content>{o.identity.founder_named}</span> · <span className="text-caution">Unverified</span></> : "Founder Not Linked Yet"}
                    {o.company?.website && <> · <a href={o.company.website} target="_blank" rel="noreferrer" className="hover:text-brand" data-content>{o.company.website.replace(/^https?:\/\/(www\.)?/, "")} ↗</a></>}
                  </p>
                  {o.surfaced_reason && (
                    <div>
                      <p className="label">Why It Surfaced</p>
                      <p className="mt-1 text-sm leading-6">{o.surfaced_reason}</p>
                    </div>
                  )}
                </div>
              </Section>
              <Section title="At a Glance" flush>
                <dl className="divide-y divide-line">
                  <Fact label="Thesis Fit" value={o.company ? `${Math.round(o.thesis_fit_score)} / 100${o.thesis_fit_stale ? " · Not Current" : ""}` : "Needs a Company"} tab="screening" pathname={pathname} />
                  <Fact label="Founder Score" value={o.founder_score ? `${Math.round(o.founder_score.score)}` : "Not Scored"} tab="founder" pathname={pathname} />
                  <Fact label="Evidence" value={`${evidence.length} ${evidence.length === 1 ? "Item" : "Items"}${newIds.size ? ` · ${newIds.size} New` : ""}`} tab="evidence" pathname={pathname} />
                  <Fact label="Claims" value={claims.data ? `${claimCount}` : "…"} tab="claims" pathname={pathname} />
                  <Fact label="Analysis" value={analyzed ? "Done" : "Not Run Yet"} tab="screening" pathname={pathname} />
                </dl>
              </Section>
            </div>
          </div>
        )}

        {tab === "founder" && (
          o.founder ? (
            <div className="space-y-6">
              <Section title="Founder">
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
              <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
                <Section title="Founder Score" subtitle="Deterministic, from Public Evidence · Persists Across Companies">
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
                <Section title="Momentum" subtitle="Direction and Rate of Change Over Time">
                  {o.momentum ? <MomentumChart momentum={o.momentum} /> : <EmptyState title="No Momentum History" hint="Momentum appears after the Founder Score has been computed more than once." />}
                </Section>
              </div>
            </div>
          ) : (
            <Section title="Founder">
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
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] [&>*]:min-w-0">
              <Section title="Thesis Fit" subtitle="Against Your Fund Thesis">
                {o.company ? (
                  <div className="num text-3xl font-semibold text-ink">{Math.round(o.thesis_fit_score)}<span className="text-base font-normal text-ink-muted"> / 100</span></div>
                ) : <p className="text-sm text-ink-muted">Not computed — fit is evaluated from a company, and this lead has none yet.</p>}
                {o.company && o.thesis_fit_stale && (
                  <div className="mt-3 rounded-md bg-caution-wash px-3 py-2 text-sm text-caution" data-testid="fit-stale">
                    <p>Not scored against your current thesis.</p>
                    <button className="btn-secondary btn-sm mt-2" onClick={recalculateFit} disabled={fitBusy}>
                      {fitBusy ? "Recalculating…" : "Recalculate Fit"}
                    </button>
                  </div>
                )}
                <Link href="/vc/fund" className="mt-3 inline-block text-sm text-brand hover:underline">View Thesis →</Link>
              </Section>
              <Section title="Gaps to Investigate" subtitle="Missing Information and Contradictions, Most Important First">
                <Gaps assessment={o.assessment ?? null} contradictions={contradictions.data?.items ?? []} />
              </Section>
            </div>
            <Section
              title="Assessment"
              subtitle="Three Independent Axes — Founder · Market · Idea vs Market, Never Averaged"
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
          <Section title="Claims" subtitle="Each claim's verification status and trust score. Citations open the supporting evidence.">
            {claims.data ? <ClaimsTable claims={claims.data.items} /> : claims.error ? <ErrorState message={claims.error} onRetry={claims.reload} /> : <Spinner />}
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
            <Section title="Recommendation & Decision" subtitle="The system recommends; a person decides.">
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

function Fact({ label, value, tab, pathname }: { label: string; value: string; tab: OpportunityTab; pathname: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd>
        <Link href={`${pathname}?tab=${tab}`} scroll={false} className="num text-[15px] font-medium text-ink hover:text-brand">
          {value} <span aria-hidden className="text-ink-faint">→</span>
        </Link>
      </dd>
    </div>
  );
}

function StatusCard({
  o, inPipeline, shortlist, step, confirmScreening, setConfirmScreening, moveToScreening, screeningError, setShortlist, suggestOutreach,
}: {
  o: Opportunity; inPipeline: boolean; shortlist: ReturnType<typeof shortlistOf>;
  step: Opportunity["next_step"] | null;
  confirmScreening: boolean; setConfirmScreening: (v: boolean) => void; moveToScreening: () => void;
  screeningError: string | null; setShortlist: (s: PipelineStatus) => void; suggestOutreach: () => void;
}) {
  return (
    <section aria-label="Stage, Next Step, and Shortlist" className="card grid gap-x-6 gap-y-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
      <div>
        <p className="label">Stage</p>
        <StageTrack stage={o.stage} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!inPipeline && (confirmScreening ? (
            <>
              <span className="w-full text-[13px] text-ink-soft">Move into the fund&apos;s Pipeline at Screening? No outreach is sent.</span>
              <button className="btn-primary btn-sm" onClick={moveToScreening}>Confirm Move</button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmScreening(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => setConfirmScreening(true)}>Move to Screening</button>
          ))}
          {inPipeline && <Link href={`/vc/pipeline?stage=${o.stage}`} className="btn-ghost btn-sm">Open in Pipeline →</Link>}
          {screeningError && <span className="text-[13px] text-negative" role="alert">{screeningError}</span>}
        </div>
      </div>

      <div className="border-line lg:border-l lg:pl-6">
        <p className="label">Next Step</p>
        {step ? (
          <>
            <p className="mt-1.5 text-base font-semibold text-ink">{step.label}</p>
            <p className="text-[13px] text-ink-muted">
              {step.key === "run_analysis"
                ? "Evidence and the Founder Score are ready; analysis adds the screening axes, debate, and memo."
                : step.key === "review_application"
                ? "Read the application and its evidence, then run analysis."
                : step.detail}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">Use the button at the top of this record.</p>
          </>
        ) : (
          <p className="mt-1.5 text-[15px] text-ink-soft">{o.status === "decided" ? "Decided — no further steps." : "No open steps."}</p>
        )}
      </div>

      {o.entry_type === "outbound" && (
        <div className="border-line lg:border-l lg:pl-6">
          <p className="label" id="shortlist-label">My Shortlist</p>
          <div className="mt-1.5 inline-flex rounded-md border border-line-strong bg-white p-0.5" role="group" aria-labelledby="shortlist-label">
            {(["saved", "monitoring", "dismissed"] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={shortlist === st}
                onClick={() => setShortlist(st)}
                className={`h-8 rounded-[4px] px-3 text-[13px] font-medium ${shortlist === st ? "bg-ink text-white" : "text-ink-soft hover:bg-neutral-wash"}`}
              >
                {SHORTLIST_LABEL[st]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 max-w-[16rem] text-xs text-ink-muted">Only you see this (saved in this browser). It doesn&apos;t change the stage.</p>
          {!inPipeline && (
            <button className="btn-ghost btn-sm -ml-3 mt-1" onClick={suggestOutreach}
              title="Adds an 'Invite to Apply' suggestion for you to approve. Nothing is sent.">
              Suggest Outreach
            </button>
          )}
        </div>
      )}
    </section>
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
        <li key={`c${c.id}`} className="flex items-start gap-2 rounded-md border border-negative/20 bg-negative-wash px-3 py-2 text-sm text-negative">
          <Badge tone="bg-white text-negative">Contradiction · {humanStatus(c.severity)}</Badge><span>{c.description}</span>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-wash px-5 py-2.5 text-sm text-brand" role="status">
          <span>{focusIndex >= 0 ? <>Showing cited evidence <strong className="font-mono">E{focusId}</strong>.</> : <>Evidence <strong className="font-mono">E{focusId}</strong> isn&apos;t part of this record&apos;s evidence.</>}</span>
          <button className="btn-ghost btn-sm" onClick={onClearFocus}>Clear</button>
        </div>
      )}
      {evidence.length ? (
        <div className="relative overflow-x-auto">
          <table className="table min-w-[680px]">
            <thead><tr><th>Evidence</th><th>Source</th><th>Status</th><th className="text-right">Date</th><th className="text-right">ID</th></tr></thead>
            <tbody>
              {shown.map((e) => {
                const quote = ((e.structured_value ?? {}) as { quote?: string }).quote;
                const focused = e.id === focusId;
                return (
                  <tr
                    key={e.id}
                    id={`evidence-row-${e.id}`}
                    tabIndex={focused ? -1 : undefined}
                    aria-current={focused ? "true" : undefined}
                    className={`scroll-mt-24 focus:outline-none ${focused ? "bg-brand-wash shadow-[inset_3px_0_0_#1f4fd8]" : newIds.has(e.id) ? "bg-signal-wash/60" : ""}`}
                    data-testid={focused ? "evidence-focused-row" : newIds.has(e.id) ? "evidence-new-row" : undefined}
                  >
                    <td className="max-w-[380px]">
                      {newIds.has(e.id) && <Badge tone="mr-1.5 bg-signal-wash text-caution">New</Badge>}
                      {e.source_url
                        ? <a href={e.source_url} target="_blank" rel="noreferrer" className="text-ink hover:text-brand" data-content>{e.title} <span className="text-ink-faint">↗</span></a>
                        : <span className="text-ink" data-content>{e.title}</span>}
                      {quote && <span className="mt-1 block border-l-2 border-line pl-2 text-[13px] italic text-ink-muted" data-content>“{quote}”</span>}
                    </td>
                    <td className="text-[13px] text-ink-muted" data-content>{sourceName(e.source_name)}</td>
                    <td><Badge tone={verificationTone(e.verification_status)}>{humanStatus(e.verification_status)}</Badge></td>
                    <td className="num text-right text-[13px] text-ink-muted"><EvidenceDate e={e} /></td>
                    <td className="text-right font-mono text-xs text-ink-faint">E{e.id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {evidence.length > shown.length && (
            <div className="border-t border-line px-5 py-2.5 text-[13px] text-ink-muted">
              Showing {shown.length} of {evidence.length}. <button className="font-medium text-brand hover:underline" onClick={() => setShowAll(true)}>Show All</button>
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
    <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]" aria-label={`Stage: ${humanStatus(stage)}`}>
      {STAGE_ORDER.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5" aria-current={i === at ? "step" : undefined}>
          {i > 0 && <span aria-hidden className={`h-px w-4 ${i <= at ? "bg-brand" : "bg-line-strong"}`} />}
          <span className={`rounded-full px-2.5 py-1 font-medium ${
            i === at ? "bg-brand text-white" : i < at ? "bg-brand-wash text-brand" : "bg-neutral-wash text-ink-muted"}`}>
            {humanStatus(s)}
          </span>
        </li>
      ))}
    </ol>
  );
}
