"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { humanStatus } from "@/lib/format";
import { nextActionHref, opportunityName, sourceLabel } from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { StageBadge } from "./DealBadges";
import { ArrowRightIcon } from "./icons";

// One row per deal. The whole row opens the deal's next action, and that action
// is shown once (a table on wide screens, a stacked list below 1280px).
export function PipelineTable({ deals }: { deals: PipelineDeal[] }) {
  const router = useRouter();
  return (
    <>
      <table className="table hidden xl:table">
        <thead>
          <tr>
            <th scope="col" className="pl-0">Opportunity</th>
            <th scope="col">Stage</th>
            <th scope="col">Next Action</th>
            <th scope="col" className="text-right" title="Fit Against Your Fund Thesis, 0–100">Thesis Fit</th>
            <th scope="col" className="text-right">Founder Score</th>
            <th scope="col" className="pr-0 text-right">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => {
            const href = nextActionHref(d.id, d.next_action_key);
            return (
              <tr key={d.id} data-testid={`deal-row-${d.id}`} onClick={() => router.push(href)} className="table-row-link group animate-rise" style={{ "--i": i } as React.CSSProperties}>
                <td className="max-w-[340px] pl-0">
                  <span className="block truncate font-medium text-ink" data-content>{opportunityName(d)}</span>
                  <Sub d={d} />
                </td>
                <td><StageBadge stage={d.stage} /></td>
                <td><Action d={d} href={href} /></td>
                <td className="text-right"><Fit d={d} /></td>
                <td className="text-right">{d.founder_score ? <span className="num text-ink-soft">{Math.round(d.founder_score.score)}</span> : <span className="text-[13px] text-ink-muted">Not Scored</span>}</td>
                <td className="num pr-0 text-right text-[13px] text-ink-muted">{waiting(d.age_days)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-line xl:hidden" aria-label="Deals">
        {deals.map((d, i) => {
          const href = nextActionHref(d.id, d.next_action_key);
          return (
            <li key={d.id} data-testid={`deal-card-${d.id}`} onClick={() => router.push(href)} className="row-interactive group animate-rise -mx-3 rounded-lg px-3 py-4" style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink" data-content>{opportunityName(d)}</span>
                  <Sub d={d} />
                </div>
                <StageBadge stage={d.stage} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <Action d={d} href={href} />
                <span className="num flex gap-3 text-[13px] text-ink-muted">
                  <span>Fit <Fit d={d} /></span>
                  <span>{waiting(d.age_days)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function waiting(days: number) {
  return days === 0 ? "Today" : `${days}d`;
}

function Sub({ d }: { d: PipelineDeal }) {
  const founderName = d.founder?.full_name;
  return (
    <p className="truncate text-[13px] text-ink-muted">
      {sourceLabel(d.entry_type)} ·{" "}
      {d.company
        ? (founderName || d.company.one_liner ? <span data-content>{[founderName, d.company.one_liner].filter(Boolean).join(" · ")}</span> : "Founder Not Linked Yet")
        : "No Company Yet"}
    </p>
  );
}

// The row's one action. A real link, so it is reachable by keyboard; the row
// click goes to the same place.
function Action({ d, href }: { d: PipelineDeal; href: string }) {
  if (!d.next_action) return <span className="text-[13px] text-ink-muted">None — Decided</span>;
  return (
    <span className="block">
      <Link href={href} onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1.5 rounded focus-visible:outline-offset-2 ${d.priority === 1 ? "font-semibold text-ink" : "font-medium text-ink-soft"} group-hover:text-brand`}>
        {d.priority === 1 && <span aria-label="Awaiting Your Review" title="Awaiting Your Review" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
        {d.next_action}
        <ArrowRightIcon size={14} className="slide-arrow" />
      </Link>
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
