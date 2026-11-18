"use client";

import { humanStatus } from "@/lib/format";
import { opportunityName, sourceLabel } from "@/lib/pipeline";
import { ListSort, needsMe, waitedLong, waitingLabel } from "@/lib/pipelineBoard";
import { PipelineDeal } from "@/lib/types";
import { StageBadge } from "./DealBadges";
import { ArrowRightIcon, SortIcon } from "./icons";

// The Pipeline as a list: one row per deal, sortable by waiting, fit, score or
// stage, with a header that stays in view. A row opens the same preview as a
// board card (a table on wide screens, a stacked list below 1280px).
export function PipelineTable({ deals, sort, dir, onSort, selected, onSelect }: {
  deals: PipelineDeal[];
  sort: ListSort;
  dir: "asc" | "desc";
  onSort: (by: ListSort) => void;
  selected: number | null;
  onSelect: (d: PipelineDeal) => void;
}) {
  const Th = ({ by, children, className = "" }: { by: ListSort; children: React.ReactNode; className?: string }) => (
    <th scope="col" aria-sort={sort === by ? (dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <button type="button" className="press inline-flex items-center gap-1 rounded hover:text-ink" onClick={() => onSort(by)}>
        {children}<SortIcon dir={sort === by ? dir : null} />
      </button>
    </th>
  );
  return (
    <>
      <table className="table hidden xl:table" data-testid="pipeline-table">
        <thead>
          <tr>
            <th scope="col" className="pl-0">Opportunity</th>
            <Th by="stage">Stage</Th>
            <th scope="col">Next Action</th>
            <Th by="fit" className="text-right">Thesis Fit</Th>
            <Th by="score" className="text-right">Founder Score</Th>
            <Th by="waiting" className="pr-0 text-right">Waiting</Th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => (
            <tr key={d.id} data-testid={`deal-row-${d.id}`} onClick={() => onSelect(d)} aria-selected={selected === d.id}
              className={`table-row-link group animate-rise ${selected === d.id ? "bg-brand-wash" : ""}`} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <td className="max-w-[340px] pl-0">
                <button type="button" className="block max-w-full truncate text-left font-medium text-ink focus-visible:outline-offset-2" onClick={(e) => { e.stopPropagation(); onSelect(d); }} data-content>{opportunityName(d)}</button>
                <Sub d={d} />
              </td>
              <td><StageBadge stage={d.stage} /></td>
              <td><Action d={d} /></td>
              <td className="text-right"><Fit d={d} /></td>
              <td className="text-right">{d.founder_score ? <span className="num text-ink-soft">{Math.round(d.founder_score.score)}</span> : <span className="text-[13px] text-ink-muted">Not Scored</span>}</td>
              <td className={`num pr-0 text-right text-[13px] ${waitedLong(d) ? "font-medium text-caution" : "text-ink-muted"}`}>{d.age_days <= 0 ? "Today" : `${d.age_days}d`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line xl:hidden" aria-label="Deals">
        {deals.map((d, i) => (
          <li key={d.id} className="animate-rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <button type="button" data-testid={`deal-item-${d.id}`} onClick={() => onSelect(d)} aria-current={selected === d.id ? "true" : undefined}
              className={`row-interactive group -mx-3 block w-[calc(100%+1.5rem)] rounded-lg px-3 py-4 text-left ${selected === d.id ? "bg-brand-wash" : ""}`}>
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink" data-content>{opportunityName(d)}</span>
                  <Sub d={d} />
                </span>
                <StageBadge stage={d.stage} />
              </span>
              <span className="mt-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <Action d={d} />
                <span className="num flex gap-3 text-[13px] text-ink-muted">
                  <span>Fit <Fit d={d} /></span>
                  <span className={waitedLong(d) ? "font-medium text-caution" : ""}>{waitingLabel(d.age_days)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Sub({ d }: { d: PipelineDeal }) {
  const founderName = d.founder?.full_name;
  return (
    <span className="block truncate text-[13px] text-ink-muted">
      {sourceLabel(d.entry_type)} ·{" "}
      {d.company
        ? (founderName || d.company.one_liner ? <span data-content>{[founderName, d.company.one_liner].filter(Boolean).join(" · ")}</span> : "Founder Not Linked Yet")
        : "No Company Yet"}
      {d.is_demo && <span className="chip ml-2 bg-neutral-wash text-neutral">Demo</span>}
    </span>
  );
}

// The deal's next step, emphasized when a review is waiting on you.
function Action({ d }: { d: PipelineDeal }) {
  if (!d.next_action) return <span className="text-[13px] text-ink-muted">Nothing Waiting</span>;
  return (
    <span className="block">
      <span className={`inline-flex items-center gap-1.5 ${needsMe(d) ? "font-semibold text-ink" : "font-medium text-ink-soft"} group-hover:text-brand`}>
        {needsMe(d) && <span aria-label="Waiting on You" title="Waiting on You" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
        {d.next_action}
        <ArrowRightIcon size={14} className="slide-arrow" />
      </span>
      {d.next_action_detail && <span className="block text-[13px] text-ink-muted">{d.next_action_detail}</span>}
    </span>
  );
}

function Fit({ d }: { d: PipelineDeal }) {
  // thesis fit is computed from a company; GitHub-sourced founders without one carry a 0 placeholder
  if (!d.company) return <span className="text-[13px] text-ink-muted" title="Thesis Fit Needs a Company">No Company</span>;
  return (
    <span className="num text-ink-soft" title={d.thesis_fit_stale ? "Scored Against an Older Thesis" : undefined}>
      {Math.round(d.thesis_fit_score)}{d.thesis_fit_stale && <span className="ml-1 text-caution">{humanStatus("stale")}</span>}
    </span>
  );
}
