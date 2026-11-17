"use client";

import Link from "next/link";
import { humanStatus, sourceName } from "@/lib/format";
import { evidenceHref } from "@/lib/pipeline";
import { Evidence, Opportunity } from "@/lib/types";
import { AlertIcon, CheckIcon } from "./icons";

// What a card from the Dashboard deck lands on, before the rest of the record:
// the one thing to look at. The record's header holds the one next action.

export interface ApplicationDetail {
  id: number;
  company_name: string;
  github_profile: string | null;
  website: string | null;
  product_link: string | null;
  missing_fields: string[];
  current_revenue: number | null;
  num_users: number | null;
  funding_requested: number | null;
  document: { num_pages: number; status: string } | null;
}

const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);
const verified = (e: Evidence) => e.verification_status === "verified";

// An inbound application: the automated first-pass screen, read by the investor.
export function ApplicationScreen({ o, app, evidence }: { o: Opportunity; app: ApplicationDetail | null; evidence: Evidence[] }) {
  const publicSignals = evidence.filter((e) => verified(e) && e.source_type.startsWith("github"));
  const shows: { text: React.ReactNode; note?: string }[] = [];
  if (publicSignals.length) shows.push({ text: `${publicSignals.length} Verified Public GitHub ${publicSignals.length === 1 ? "Signal" : "Signals"}` });
  if (app?.num_users != null) shows.push({ text: `${app.num_users.toLocaleString()} Users`, note: "Founder-Reported" });
  if (app?.current_revenue != null) shows.push({ text: `${money(app.current_revenue)} Revenue`, note: "Founder-Reported" });
  if (app?.funding_requested != null) shows.push({ text: `Raising ${money(app.funding_requested)}`, note: "Founder-Reported" });
  if (app?.document) shows.push({ text: `Pitch Deck · ${app.document.num_pages} ${app.document.num_pages === 1 ? "Page" : "Pages"}`, note: app.document.status === "extracted" ? undefined : humanStatus(app.document.status) });
  if (app?.product_link || app?.website) shows.push({ text: "Live Product Link" });
  const missing = app?.missing_fields ?? [];
  return (
    <section aria-labelledby="focus-title" className="rounded-2xl bg-surface-sunken p-5 sm:p-6" data-testid="application-screen">
      <p className="label">New Inbound Application</p>
      <h2 id="focus-title" className="mt-1 text-title text-ink">First-Pass Screen</h2>
      <FitLine o={o} />
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="label">What It Shows</p>
          {shows.length ? (
            <ul className="mt-2 space-y-2">
              {shows.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[15px] text-ink-soft">
                  <span aria-hidden className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-positive text-white"><CheckIcon size={10} /></span>
                  <span>{s.text}{s.note && <span className="chip ml-2 bg-caution-wash text-caution">{s.note}</span>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-muted">{app ? "Nothing beyond the company name yet." : "Loading the application…"}</p>}
        </div>
        <div>
          <p className="label">Missing</p>
          {missing.length ? (
            <ul className="mt-2 space-y-2">
              {missing.map((m) => (
                <li key={m} className="flex items-start gap-2 text-[15px] text-ink-soft">
                  <AlertIcon size={16} className="mt-1 shrink-0 text-caution" />{humanStatus(m)}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-muted">{app ? "Nothing required is missing." : "…"}</p>}
        </div>
      </div>
      <p className="mt-5 text-[13px] text-ink-muted">Next: Run Analysis scores the three screening axes and drafts the debate and memo. Nothing is sent to the founder.</p>
    </section>
  );
}

// A sourced lead: what the evidence says, before deciding whether it enters the
// Pipeline. Move to Screening (in the header) asks before it moves anything.
export function LeadEvidence({ o, evidence, onRunAnalysis }: { o: Opportunity; evidence: Evidence[]; onRunAnalysis: () => void }) {
  const ok = evidence.filter(verified);
  const top = [...ok, ...evidence.filter((e) => !verified(e))].slice(0, 4);
  return (
    <section aria-labelledby="focus-title" className="rounded-2xl bg-surface-sunken p-5 sm:p-6" data-testid="lead-evidence">
      <p className="label">New Lead</p>
      <h2 id="focus-title" className="mt-1 text-title text-ink">Evidence Summary</h2>
      <FitLine o={o} />
      <p className="mt-4 text-[15px] text-ink-soft">
        <span className="num font-semibold text-ink">{evidence.length}</span> {evidence.length === 1 ? "Item" : "Items"} of Evidence ·{" "}
        <span className="num font-semibold text-ink">{ok.length}</span> Verified
        {o.founder_score && <> · Founder Score <span className="num font-semibold text-ink">{Math.round(o.founder_score.score)}</span></>}
      </p>
      {top.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {top.map((e) => (
            <li key={e.id}>
              <Link href={evidenceHref(o.id, e.id)} scroll={false} className="row-interactive -mx-3 flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-ink" data-content>{e.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-[13px] text-ink-muted">
                  <span className="hidden truncate sm:inline sm:max-w-[10rem]" data-content>{sourceName(e.source_name)}</span>
                  <span className={verified(e) ? "text-positive" : "text-caution"}>{humanStatus(e.verification_status)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-ink-muted">No evidence collected yet.</p>}
      <p className="mt-4 text-[13px] text-ink-muted">
        Moving to Screening puts it in the Pipeline. Nothing is sent to the founder.{" "}
        <button type="button" className="link text-[13px]" onClick={onRunAnalysis}>Run Analysis First</button>
      </p>
    </section>
  );
}

function FitLine({ o }: { o: Opportunity }) {
  return (
    <p className="mt-2 text-[15px] text-ink-soft">
      {o.company ? <>Thesis Fit <span className="num font-semibold text-ink">{Math.round(o.thesis_fit_score)}</span> / 100{o.thesis_fit_stale && <span className="chip ml-2 bg-caution-wash text-caution">Not Current</span>}</> : "Thesis Fit Needs a Company"}
      {o.surfaced_reason && <span className="mt-1 block text-sm text-ink-muted">{o.surfaced_reason}</span>}
    </p>
  );
}
