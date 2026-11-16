"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";
import { addMyAppId } from "@/lib/myApps";
import { humanStatus } from "@/lib/format";

export default function ApplyFlow() {
  const [companyName, setCompanyName] = useState("");
  const [optional, setOptional] = useState({ github_profile: "", website: "", sector: "", geography: "", num_users: "", team_info: "" });
  const [appResult, setAppResult] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  // after submitting, move the founder (and screen readers) to the confirmation
  const submittedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!uploadResult) return;
    submittedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    submittedRef.current?.focus({ preventScroll: true });
  }, [uploadResult]);
  const [status, setStatus] = useState<"idle" | "creating" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  const step = uploadResult ? 3 : appResult ? 2 : 1;

  async function createApp() {
    setStatus("creating"); setError(null);
    try {
      const payload: any = { company_name: companyName };
      if (optional.github_profile) payload.github_profile = optional.github_profile;
      if (optional.website) payload.website = optional.website;
      if (optional.sector) payload.sector = optional.sector;
      if (optional.geography) payload.geography = optional.geography;
      if (optional.num_users) payload.num_users = Number(optional.num_users);
      if (optional.team_info) payload.team_info = optional.team_info;
      const r = await api.post<any>("/api/applications", payload);
      setAppResult(r);
      addMyAppId(r.application_id); // scope this application to this browser
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setStatus("idle"); }
  }

  async function uploadDeck() {
    if (!file || !appResult) return;
    setStatus("uploading"); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.upload<any>(`/api/applications/${appResult.application_id}/upload-deck`, form);
      setUploadResult(r);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setStatus("idle"); }
  }

  const OPTIONAL: [keyof typeof optional, string, string][] = [
    ["github_profile", "GitHub Username", "e.g. yourhandle"], ["website", "Website", "https://"],
    ["sector", "Sector", "e.g. fintech"], ["geography", "Location", "e.g. Boston"],
    ["num_users", "Current Users", "e.g. 1200"], ["team_info", "Team", "Founders and Roles"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Apply to the Fund</h1>
        <p className="mt-0.5 text-sm text-ink-muted">A company name and a PDF pitch deck are all you need. Everything else is optional.</p>
      </div>

      {/* stepper */}
      <ol className="grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-white text-sm" aria-label="Application Steps">
        {[["1", "Company"], ["2", "Pitch Deck"], ["3", "Submitted"]].map(([n, label], idx) => {
          const done = step > idx + 1;
          const current = step === idx + 1;
          return (
            <li key={n} aria-current={current ? "step" : undefined} className={`flex items-center gap-2 px-4 py-2.5 ${idx > 0 ? "border-l border-line" : ""} ${current ? "bg-brand-wash" : ""}`}>
              <span className={`num grid h-5 w-5 place-items-center rounded-full text-xs font-semibold ${done ? "bg-positive text-white" : current ? "bg-brand text-white" : "bg-line text-ink-muted"}`}>{done ? "✓" : n}</span>
              <span className={current ? "font-medium text-ink" : "text-ink-muted"}>{label}</span>
            </li>
          );
        })}
      </ol>

      {error && <ErrorState message={error} />}

      {/* Step 1: company */}
      <Section title="Company" subtitle="Company name is required.">
        <form onSubmit={(e) => { e.preventDefault(); if (companyName && !appResult) createApp(); }}>
          <label className="block">
            <span className="label">Company Name *</span>
            <input
              className="input mt-1"
              value={companyName}
              disabled={!!appResult}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Northwind Labs"
            />
          </label>
          <details className="mt-3 group" open={Object.values(optional).some(Boolean)}>
            <summary className="cursor-pointer text-sm font-medium text-ink-soft hover:text-ink">Add Optional Details</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OPTIONAL.map(([k, label, ph]) => (
                <label key={k} className="block">
                  <span className="label">{label}</span>
                  <input className="input mt-1" placeholder={ph} value={optional[k]} disabled={!!appResult} onChange={(e) => setOptional({ ...optional, [k]: e.target.value })} />
                </label>
              ))}
            </div>
          </details>
          {!appResult && (
            <button type="submit" className="btn-primary mt-4" disabled={!companyName || status === "creating"}>
              {status === "creating" ? "Starting…" : "Continue to Pitch Deck"}
            </button>
          )}
        </form>
      </Section>

      {/* Step 1 result: first-pass screen */}
      {appResult && (
        <Section title="First-Pass Screen" subtitle="Automatic, Before the Deck">
          <p className="text-sm leading-6 text-ink-soft">{appResult.screen_summary}</p>
          {appResult.missing_fields?.length > 0 && (
            <div className="mt-3">
              <span className="label">Information That Would Help</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {appResult.missing_fields.map((m: string) => <Badge key={m} tone="bg-caution-wash text-caution">{humanStatus(m)}</Badge>)}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Step 2: pitch deck */}
      {appResult && !uploadResult && (
        <Section title="Pitch Deck" subtitle="PDF Only — Validated, Stored Securely, and Read Automatically">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file ? "Change File" : "Choose PDF"}
            </label>
            <span className="text-sm text-ink-muted">{file ? <span data-content>{file.name}</span> : "No File Selected"}</span>
          </div>
          <button className="btn-primary mt-4" onClick={uploadDeck} disabled={!file || status === "uploading"}>
            {status === "uploading" ? "Uploading & Reading…" : "Submit Application"}
          </button>
          {status === "uploading" && <div className="mt-2"><Spinner label="Reading Your Deck…" /></div>}
        </Section>
      )}

      {/* Step 3: submitted */}
      {uploadResult && (
        <div ref={submittedRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
        <Section title="Application Submitted" subtitle="The fund will review it.">
          <p className="text-sm leading-6 text-ink-soft">
            We read <strong>{uploadResult.num_pages}</strong> page(s) of your deck ({uploadResult.extraction_status}).
            {uploadResult.extracted_fields?.missing?.length > 0 && (
              <> The deck appears to be missing: {uploadResult.extracted_fields.missing.join(", ")}.</>
            )}
          </p>
          <h3 className="mt-4 text-[15px] font-semibold text-ink">What Happens Next</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-ink-soft">
            <li>Your application is now with the fund, waiting for review.</li>
            <li>An investor reviews it — a person makes every decision.</li>
            <li>Check its status any time. If the fund needs more, it&apos;s listed under <em>What Would Help the Fund Decide</em>.</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <Link href={`/founder/application/${appResult.application_id}`} className="btn-primary">View Application Status →</Link>
            <Link href="/founder/applications" className="btn-secondary">My Applications</Link>
          </div>
        </Section>
        </div>
      )}
    </div>
  );
}
