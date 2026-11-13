"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { PipelineStatus } from "@/lib/myWorkspace";
import { inPipeline, leadStatus } from "@/lib/pipeline";
import { FounderLead } from "@/lib/types";
import { ProspectStatusBadge, StageBadge } from "./DealBadges";
import { SortIcon } from "./icons";
import { Badge } from "./ui";

const STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "monitoring", label: "Monitoring" },
  { value: "dismissed", label: "Dismissed" },
];

export type FounderSortKey = "founder" | "company" | "score" | "momentum" | "evidence" | "status";
type Sort = { key: FounderSortKey; dir: "asc" | "desc" } | null;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function sortValue(l: FounderLead, key: FounderSortKey, overlay: Record<number, PipelineStatus>): string | number {
  switch (key) {
    case "founder": return (l.founder?.full_name || l.company?.name || "").toLowerCase();
    case "company": return (l.company?.name || l.top_project?.name || "~").toLowerCase();
    case "score": return l.founder_score?.score ?? -1;
    case "momentum": return l.momentum?.change_30d ?? -1e9;
    case "evidence": return l.evidence_count;
    case "status": return `${inPipeline(l) ? 0 : 1}${leadStatus(l, overlay[l.id] ?? null)}`;
  }
}

export function sortFounderLeads(leads: FounderLead[], sort: Sort, overlay: Record<number, PipelineStatus>): FounderLead[] {
  if (!sort) return leads;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => {
    const va = sortValue(a, sort.key, overlay);
    const vb = sortValue(b, sort.key, overlay);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  });
}

export function FoundersTable({
  leads,
  overlay,
  onSetStatus,
  onMoveToScreening,
}: {
  leads: FounderLead[];
  overlay: Record<number, PipelineStatus>;
  onSetStatus: (id: number, status: PipelineStatus | null) => void;
  // investor-approved transition into Screening (shared, on the same opportunity ID)
  onMoveToScreening: (id: number) => Promise<void>;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  async function confirmMove(id: number) {
    setBusy(id);
    setRowError(null);
    try {
      await onMoveToScreening(id);
      setConfirming(null);
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : "Could not move to screening." });
    } finally {
      setBusy(null);
    }
  }

  function toggleSort(key: FounderSortKey) {
    // numeric columns start high-to-low; text columns A–Z; third click clears
    const first = key === "founder" || key === "company" || key === "status" ? "asc" : "desc";
    setSort((s) => (s?.key !== key ? { key, dir: first } : s.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null));
  }

  const Th = ({ k, children, className = "" }: { k: FounderSortKey; children: React.ReactNode; className?: string }) => {
    const dir = sort?.key === k ? sort.dir : null;
    return (
      <th scope="col" className={className} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
          {children}<SortIcon dir={dir} />
        </button>
      </th>
    );
  };

  const rows = sortFounderLeads(leads, sort, overlay);

  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-[980px]">
        <thead>
          <tr>
            <Th k="founder">Founder</Th>
            <Th k="company">Company / project</Th>
            <Th k="score" className="text-right">Score</Th>
            <Th k="momentum">Momentum</Th>
            <Th k="evidence" className="text-right">Evidence</Th>
            <Th k="status">Status</Th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const href = `/vc/opportunities/${l.id}`;
            const status = leadStatus(l, overlay[l.id] ?? null);
            const m = l.momentum;
            return (
              <tr key={l.id} data-testid={`founder-row-${l.id}`} onClick={() => router.push(href)} className="table-row-link">
                <td>
                  <Link href={href} onClick={stop} className="font-medium text-ink hover:text-brand">
                    {l.founder?.full_name || l.company?.name || `Opportunity #${l.id}`}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    {l.founder?.github_username && (
                      <a href={`https://github.com/${l.founder.github_username}`} target="_blank" rel="noreferrer" onClick={stop} className="hover:text-brand">
                        @{l.founder.github_username} ↗
                      </a>
                    )}
                    {l.founder?.location && <span>{l.founder.location}</span>}
                    {!l.founder && <span>Founder not linked yet</span>}
                  </div>
                </td>

                <td className="max-w-[260px]">
                  {l.company ? (
                    <>
                      <p className="truncate text-ink">{l.company.name}</p>
                      {l.company.one_liner && <p className="truncate text-xs text-ink-muted">{l.company.one_liner}</p>}
                    </>
                  ) : l.top_project ? (
                    <>
                      <p className="text-xs text-ink-muted">No company yet · top project</p>
                      <span className="flex items-center gap-1.5">
                        {l.top_project.url ? (
                          <a href={l.top_project.url} target="_blank" rel="noreferrer" onClick={stop} className="truncate text-brand hover:underline">{l.top_project.name} ↗</a>
                        ) : <span className="truncate text-ink">{l.top_project.name}</span>}
                        {l.top_project.stars != null && (
                          <span className="num text-xs text-ink-muted" title="External interest only, not traction">★ {l.top_project.stars}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <p className="text-xs text-ink-muted">No company yet</p>
                  )}
                </td>

                <td className="text-right">
                  {l.founder_score ? (
                    <span className="num font-semibold text-ink" title={`Confidence ${Math.round(l.founder_score.confidence * 100)}%`}>
                      {Math.round(l.founder_score.score)}
                    </span>
                  ) : <span className="text-xs text-ink-muted">Not scored</span>}
                </td>

                <td>
                  {m ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={trajectoryTone(m.trajectory)}>{humanStatus(m.trajectory)}</Badge>
                      {m.change_30d != null && (
                        <span className={`num text-xs ${m.change_30d >= 0 ? "text-positive" : "text-negative"}`}>
                          {m.change_30d >= 0 ? "+" : ""}{Math.round(m.change_30d)} / 30d
                        </span>
                      )}
                    </span>
                  ) : <span className="text-xs text-ink-muted">No history</span>}
                </td>

                <td className="text-right">
                  {l.evidence_count
                    ? <span className="num text-ink-soft">{l.evidence_count}</span>
                    : <span className="text-xs text-ink-muted">No evidence collected yet</span>}
                </td>

                <td onClick={stop}>
                  <div className="flex flex-wrap items-center gap-1">
                    <ProspectStatusBadge status={status} />
                    {inPipeline(l) && <StageBadge stage={l.stage} />}
                  </div>
                  <select
                    aria-label={`Prospect status for ${l.founder?.full_name || l.id}`}
                    className="mt-1 h-6 rounded border border-line bg-white px-1 text-[11px] text-ink-soft"
                    value={overlay[l.id] ?? ""}
                    onChange={(e) => onSetStatus(l.id, (e.target.value || null) as PipelineStatus | null)}
                  >
                    {/* the blank option is an action, not a value: the badge above shows the current status */}
                    <option value="">{overlay[l.id] ? "Clear my status" : "Set my status…"}</option>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>

                <td className="text-right" onClick={stop}>
                  <div className="flex items-center justify-end gap-1">
                    {inPipeline(l) ? (
                      <Link href={`/vc/pipeline?stage=${l.stage}`} className="btn-ghost btn-sm">View in Pipeline</Link>
                    ) : confirming === l.id ? (
                      <>
                        <button className="btn-primary btn-sm" onClick={() => confirmMove(l.id)} disabled={busy === l.id}>
                          {busy === l.id ? "Moving…" : "Confirm move"}
                        </button>
                        <button className="btn-ghost btn-sm" onClick={() => setConfirming(null)} disabled={busy === l.id}>Cancel</button>
                      </>
                    ) : (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => { setConfirming(l.id); setRowError(null); }}
                        title="Approve moving this founder into Screening. Nothing is sent to the founder."
                      >
                        Move to Screening
                      </button>
                    )}
                    <Link href={href} className="btn-ghost btn-sm">Review →</Link>
                  </div>
                  {confirming === l.id && (
                    <p className="mt-1 text-[11px] text-ink-muted">Moves this lead into the fund&apos;s Pipeline at Screening. No outreach is sent.</p>
                  )}
                  {rowError?.id === l.id && <p className="mt-1 text-[11px] text-negative" role="alert">{rowError.message}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
