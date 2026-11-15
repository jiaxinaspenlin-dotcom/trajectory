"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ConfidenceBar, DemoBadge, EmptyState, ErrorState, ScoreRing, Section, Spinner } from "@/components/ui";
import { SourceBadge, StageBadge } from "@/components/DealBadges";
import { MomentumChart } from "@/components/MomentumChart";
import { ThreeAxes } from "@/components/ThreeAxes";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { ClaimsTable } from "@/components/ClaimsTable";
import { FounderScoreBreakdown } from "@/components/FounderScoreBreakdown";
import { HumanDecisionPanel } from "@/components/HumanDecisionPanel";
import { Claim, Evidence, Opportunity } from "@/lib/types";
import { LeadWebCheck } from "@/components/WebSourcing";
import { humanStatus, verificationTone } from "@/lib/format";
import { leadStatus } from "@/lib/pipeline";
import {
  getMyDecision, getPipelineStatus, LocalDecision, PipelineStatus,
  saveMyDecision, setPipelineStatus,
} from "@/lib/myWorkspace";

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
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
  const [confirmScreening, setConfirmScreening] = useState(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  // per-browser workspace overlay for this opportunity
  const [myStatus, setMyStatus] = useState<PipelineStatus | null>(null);
  const [myDecision, setMyDecision] = useState<LocalDecision | null>(null);
  useEffect(() => {
    const n = Number(id);
    setMyStatus(getPipelineStatus(n));
    setMyDecision(getMyDecision(n));
  }, [id]);

  async function prospectAction(action: string) {
    // Save / Monitor / Dismiss are the investor's personal pipeline — scoped to
    // this browser (like founder applications), never shared with other investors.
    const pipelineMap: Record<string, PipelineStatus> = {
      save: "saved", monitor: "monitoring", dismiss: "dismissed",
    };
    if (pipelineMap[action]) {
      setPipelineStatus(Number(id), pipelineMap[action]);
      setMyStatus(pipelineMap[action]);
      return;
    }
    // Recommend outreach / move to screening are real, shared workflow steps.
    await api.post(`/api/sourcing/prospects/${id}/action`, { action });
    await reload();
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
  if (loading && !o) return <Spinner label="Loading opportunity…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!o) return null;

  const newIds = new Set(o.new_evidence_ids ?? []);
  // new web evidence first, so it's never cut off below the fold
  const founderEvidence: Evidence[] = [...(o.evidence || o.founder?.evidence || [])].sort(
    (a, b) => Number(newIds.has(b.id)) - Number(newIds.has(a.id))
  );
  const notAnalyzed = !o.assessment && !o.debate;
  const inPipeline = o.stage !== "sourcing";
  const shownStatus = leadStatus(o, myStatus);
  const statusTone = shownStatus === "saved" || shownStatus === "monitoring"
    ? "bg-positive-wash text-positive"
    : shownStatus === "dismissed" ? "bg-negative-wash text-negative" : "bg-neutral-wash text-neutral";
  const sections: [string, string][] = [
    ["overview", "Founder"], ["screening", "Screening"], ["arena", "Arena"], ["claims", "Claims"], ["evidence", "Evidence"],
  ];

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center text-xs text-ink-muted">
        {o.entry_type === "outbound" && <><Link href="/vc/founders" className="hover:text-brand">Founders</Link><span className="mx-1.5 text-ink-faint">/</span></>}
        {inPipeline && <><Link href={`/vc/pipeline?stage=${o.stage}`} className="hover:text-brand">Pipeline</Link><span className="mx-1.5 text-ink-faint">/</span></>}
        <span className="text-ink-soft">{o.company?.name || o.founder?.full_name}</span>
        <Link href={`/vc/map?focus=${o.id}`} className="ml-auto hover:text-brand">View on map →</Link>
      </nav>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="mr-1 text-xl font-semibold text-ink">{o.company?.name || o.founder?.full_name}</h1>
            <SourceBadge entryType={o.entry_type} />
            <StageBadge stage={o.stage} />
            <Badge tone={statusTone}>{humanStatus(shownStatus)}</Badge>
            {o.is_demo && <DemoBadge />}
          </div>
          {o.company?.one_liner && <p className="mt-1 text-[13px] text-ink-soft">{o.company.one_liner}</p>}
          <p className="mt-0.5 text-xs text-ink-muted">
            {o.founder
              ? [o.founder.full_name, o.founder.headline, o.founder.location].filter(Boolean).join(" · ")
              : o.identity?.founder_named
              ? <>Founder named on <a href={o.identity.founder_named_source ?? undefined} target="_blank" rel="noreferrer" className="hover:text-brand">source</a>: {o.identity.founder_named} · <span className="text-caution">unverified</span></>
              : "Founder not linked yet"}
            {o.company?.website && (
              <>
                {" · "}
                <a href={o.company.website} target="_blank" rel="noreferrer" className="hover:text-brand">
                  {o.company.website.replace(/^https?:\/\/(www\.)?/, "")} ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/vc/opportunities/${id}/diligence`} className="btn-secondary">Diligence workspace</Link>
          <Link href={`/vc/opportunities/${id}/memo`} className="btn-secondary">Memo</Link>
          <button className="btn-primary" onClick={() => setConfirmRegen(true)} disabled={busy}>
            {busy ? "Analyzing…" : notAnalyzed ? "Run analysis" : "Regenerate analysis"}
          </button>
        </div>
      </div>

      {/* workflow: personal shortlist + shared, investor-approved pipeline steps */}
      {o.entry_type === "outbound" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
          <span className="label mr-1">Workflow</span>
          <div className="inline-flex rounded-md border border-line-strong p-0.5" role="group" aria-label="My shortlist status">
            {([["save", "saved", "Save to pipeline"], ["monitor", "monitoring", "Monitor"], ["dismiss", "dismissed", "Dismiss"]] as const).map(([action, st, label]) => (
              <button
                key={action}
                type="button"
                aria-pressed={myStatus === st}
                onClick={() => prospectAction(action)}
                className={`h-7 rounded-[4px] px-2.5 text-xs font-medium ${myStatus === st ? "bg-ink text-white" : "text-ink-soft hover:bg-neutral-wash"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn-ghost btn-sm" onClick={() => prospectAction("recommend_outreach")}>Recommend outreach</button>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {!inPipeline && (confirmScreening ? (
            <>
              <span className="text-xs text-ink-soft">Move into the fund&apos;s Pipeline at Screening? No outreach is sent.</span>
              <button className="btn-primary btn-sm" onClick={moveToScreening}>Confirm move</button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmScreening(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => setConfirmScreening(true)}>Move to Screening</button>
          ))}
          {inPipeline && <Link href={`/vc/pipeline?stage=${o.stage}`} className="btn-ghost btn-sm">In Pipeline · {humanStatus(o.stage)} →</Link>}
          {screeningError && <span className="text-xs text-negative" role="alert">{screeningError}</span>}
          <span className="ml-auto text-[11px] text-ink-muted">
            {myStatus === "saved" || myStatus === "monitoring"
              ? "Pinned to the top of your dashboard (this browser only)."
              : myStatus === "dismissed"
              ? "Hidden from your dashboard (this browser only)."
              : "Your shortlist is saved in this browser — other investors don't see it."}
          </span>
        </div>
      )}

      {confirmRegen && (
        <div className="rounded-lg border border-brand/25 bg-brand-wash px-4 py-3">
          <p className="text-[13px] text-brand">
            Generate the assessment, diligence, Arena debate, and memo with OpenAI? Prior versions are preserved — nothing is overwritten.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary btn-sm" onClick={regenerate} disabled={busy}>Confirm</button>
            <button className="btn-secondary btn-sm" onClick={() => setConfirmRegen(false)}>Cancel</button>
          </div>
          {regenError && (
            <p className="mt-2 text-[13px] text-negative">
              {regenError.includes("OPENAI") || regenError.toLowerCase().includes("ai provider")
                ? "AI is not configured. Set OPENAI_API_KEY on the backend to enable analysis. Deterministic scores and the seeded demo analysis remain available."
                : regenError}
            </p>
          )}
        </div>
      )}

      {notAnalyzed && !confirmRegen && (
        <p className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] text-ink-soft">
          <strong className="font-semibold text-ink">Not analyzed yet.</strong> Evidence and the Founder Score below are ready —
          run analysis to generate the three screening axes, the Investment Arena, and the memo.
        </p>
      )}

      {/* section jump links */}
      <nav aria-label="Sections" className="sticky top-12 z-20 -mx-1 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-1 py-1.5 backdrop-blur lg:top-0">
        {sections.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="btn-ghost btn-sm">{label}</a>
        ))}
        <a href="#decision" className="btn-ghost btn-sm xl:hidden">Decision</a>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* main column */}
        <div className="min-w-0 space-y-5">
          <div id="overview" className="grid scroll-mt-16 gap-5 lg:grid-cols-2">
            <Section title="Founder Score" subtitle="Deterministic baseline · persists across companies">
              {o.founder_score ? (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <ScoreRing score={o.founder_score.score} size={80} />
                    <ConfidenceBar value={o.founder_score.confidence} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-5 text-ink-soft">{o.founder_score.explanation}</p>
                    <FounderScoreBreakdown components={o.founder_score.components} />
                  </div>
                </div>
              ) : <EmptyState title="No score yet" hint="Sync evidence to compute a Founder Score." />}
            </Section>
            <Section title="Founder Momentum" subtitle="Direction and rate of change over time">
              {o.momentum ? <MomentumChart momentum={o.momentum} /> : <EmptyState title="No momentum history" />}
            </Section>
          </div>

          <div id="screening" className="scroll-mt-16">
            <Section title="Screening" subtitle="Three independent axes — Founder · Market · Idea vs Market, never averaged">
              {o.assessment ? <ThreeAxes assessment={o.assessment} /> : (
                <EmptyState title="No assessment yet" hint="Run analysis to generate the three screening axes." />
              )}
            </Section>
          </div>

          {/* Investment Arena — the full memo drops down inline */}
          <div id="arena" className="scroll-mt-16">
            <InvestmentArena
              debate={o.debate || null}
              memo={o.memo ?? null}
              onGenerateMemo={generateMemo}
              memoBusy={memoBusy}
            />
          </div>

          <div id="claims" className="grid scroll-mt-16 gap-5">
            <Section title="Claims & trust scores" subtitle="Per-claim trust, verification status, and evidence links">
              {claims.data ? <ClaimsTable claims={claims.data.items} /> : <Spinner />}
            </Section>
            <Section title="Contradictions & missing information" subtitle="Surfaced from evidence">
              {contradictions.data?.items.length ? (
                <ul className="space-y-1.5">
                  {contradictions.data.items.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 rounded-md border border-negative/20 bg-negative-wash px-3 py-2 text-[13px] text-negative">
                      <Badge tone="bg-white text-negative">{c.severity}</Badge> <span>{c.description}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-muted">No contradictions detected.</p>}
            </Section>
          </div>

          <div id="evidence" className="scroll-mt-16">
            <Section
              title="Evidence"
              subtitle={`${founderEvidence.length} normalized, timestamped, attributed items`}
              right={
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {newIds.size ? (
                    <span className="flex items-center gap-2" data-testid="evidence-new-summary">
                      <Badge tone="bg-signal-wash text-caution">{newIds.size} new from web search</Badge>
                      <button className="btn-secondary btn-sm" onClick={markReviewed}>Mark reviewed</button>
                    </span>
                  ) : o.is_demo ? <DemoBadge /> : null}
                  {!o.is_demo && (o.company || o.founder) && <LeadWebCheck opportunityId={o.id} onUpdated={reload} />}
                </span>
              }
              flush
            >
              {founderEvidence.length ? (
                <div className="relative overflow-x-auto">
                  <table className="table min-w-[620px]">
                    <thead><tr><th>Evidence</th><th>Source</th><th>Status</th><th className="text-right">Date</th><th className="text-right">ID</th></tr></thead>
                    <tbody>
                      {founderEvidence.slice(0, 25).map((e) => (
                        <tr key={e.id} className={newIds.has(e.id) ? "bg-signal-wash/60" : undefined} data-testid={newIds.has(e.id) ? "evidence-new-row" : undefined}>
                          <td className="max-w-[320px]">
                            {newIds.has(e.id) && <Badge tone="mr-1.5 bg-signal-wash text-caution">New</Badge>}
                            {e.source_url
                              ? <a href={e.source_url} target="_blank" rel="noreferrer" className="text-ink hover:text-brand">{e.title}</a>
                              : <span className="text-ink">{e.title}</span>}
                          </td>
                          <td className="text-xs text-ink-muted">{e.source_name}</td>
                          <td><Badge tone={verificationTone(e.verification_status)}>{humanStatus(e.verification_status)}</Badge></td>
                          <td className="num text-right text-xs text-ink-muted">
                            <EvidenceDate e={e} />
                          </td>
                          <td className="text-right font-mono text-[11px] text-ink-faint">E{e.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {founderEvidence.length > 25 && <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">Showing the 25 most recent of {founderEvidence.length}.</p>}
                </div>
              ) : <p className="px-4 py-6 text-[13px] text-ink-muted">No evidence collected for this founder yet.</p>}
            </Section>
          </div>
        </div>

        {/* decision column */}
        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start" id="decision">
          <Section title="Recommendation & decision" subtitle="The system recommends; a human decides">
            <HumanDecisionPanel
              opportunityId={o.id}
              recommendation={o.current_recommendation || null}
              onDecision={reload}
              savedLocal={myDecision}
              onSavedLocal={(d) => { saveMyDecision(o.id, d); setMyDecision(d); }}
            />
          </Section>
          <Section title="Thesis fit" subtitle="Evaluated through the active thesis">
            {o.company ? (
              <div className="num text-3xl font-semibold text-ink">{Math.round(o.thesis_fit_score)}<span className="text-base font-normal text-ink-muted"> / 100</span></div>
            ) : (
              <p className="text-[13px] text-ink-muted">Not computed — fit is evaluated from a company, and this founder has none yet.</p>
            )}
            <p className="mt-2 text-xs leading-5 text-ink-muted">{o.surfaced_reason}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

// Web evidence carries how its date was established; anything unsupported is
// shown as unknown rather than guessed.
function EvidenceDate({ e }: { e: Evidence }) {
  const sv = (e.structured_value ?? {}) as { date_basis?: string | null; date_precision?: string | null; date_text?: string | null };
  if (!e.event_date) return e.kind.startsWith("web_") ? <span className="italic">Date unknown</span> : <>—</>;
  const d = new Date(e.event_date);
  const text = d.toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", year: "numeric", ...(sv.date_precision === "month" ? {} : { day: "numeric" }),
  });
  const title = sv.date_basis === "stated_in_source" ? `Stated in the source: “${sv.date_text}”`
    : sv.date_basis === "search_provider" ? "Published date reported by the search provider" : undefined;
  return <span title={title}>{text}{sv.date_basis === "search_provider" && " *"}</span>;
}
