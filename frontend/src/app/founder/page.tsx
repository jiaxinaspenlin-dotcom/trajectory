"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Button, ErrorState } from "@/components/ui";
import { CheckIcon, DocumentIcon } from "@/components/icons";
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
    <div className="space-y-10">
      <div className="animate-rise">
        <h1 className="text-[1.75rem] font-[650] leading-9 tracking-[-0.025em] text-ink sm:text-page">Apply to the Fund</h1>
        <p className="mt-1.5 text-body text-ink-muted">A company name and a PDF pitch deck are all you need. Everything else is optional.</p>
      </div>

      {/* progress: three steps as one bar that fills */}
      <ol className="grid grid-cols-3 gap-2" aria-label="Application Steps">
        {["Company", "Pitch Deck", "Submitted"].map((label, idx) => {
          const done = step > idx + 1;
          const current = step === idx + 1;
          return (
            <li key={label} aria-current={current ? "step" : undefined}>
              <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="block h-full origin-left rounded-full bg-brand transition-transform duration-[500ms] ease-out" style={{ transform: `scaleX(${done || current ? 1 : 0})` }} />
              </span>
              <span className={`mt-2 flex items-center gap-1.5 text-sm ${current ? "font-medium text-ink" : done ? "text-ink-soft" : "text-ink-muted"}`}>
                {done && <CheckIcon size={13} className="text-positive" />}
                <span className="num text-ink-faint">{idx + 1}</span> {label}
              </span>
            </li>
          );
        })}
      </ol>

      {error && <ErrorState message={error} />}

      {/* Step 1: company (a one-line summary once it's done) */}
      {appResult ? (
        <p className="animate-fade flex items-center gap-2 text-body text-ink-soft">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-positive-wash text-positive"><CheckIcon size={13} /></span>
          Company: <span className="font-medium text-ink" data-content>{companyName}</span>
        </p>
      ) : (
        <section aria-labelledby="step-company" className="animate-rise">
          <h2 id="step-company" className="text-title text-ink">Company</h2>
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (companyName && !appResult) createApp(); }}>
            <label className="block">
              <span className="label">Company Name *</span>
              <input
                className="input mt-1"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Northwind Labs"
              />
            </label>
            <details className="group mt-4" open={Object.values(optional).some(Boolean)}>
              <summary className="link cursor-pointer text-sm">Add Optional Details</summary>
              <div className="animate-fade mt-3 grid gap-3 sm:grid-cols-2">
                {OPTIONAL.map(([k, label, ph]) => (
                  <label key={k} className="block">
                    <span className="label">{label}</span>
                    <input className="input mt-1" placeholder={ph} value={optional[k]} onChange={(e) => setOptional({ ...optional, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
            </details>
            <Button type="submit" variant="primary" size="lg" className="mt-6 w-full sm:w-auto" disabled={!companyName} busy={status === "creating"}>Continue to Pitch Deck</Button>
          </form>
        </section>
      )}

      {/* Step 1 result: first-pass screen */}
      {appResult && (
        <section aria-labelledby="step-screen" className="animate-rise rounded-2xl bg-surface-sunken px-5 py-4">
          <h2 id="step-screen" className="text-section text-ink">First-Pass Screen</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{appResult.screen_summary}</p>
          {appResult.missing_fields?.length > 0 && (
            <div className="mt-3">
              <span className="label">Information That Would Help</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {appResult.missing_fields.map((m: string) => <Badge key={m} tone="bg-caution-wash text-caution">{humanStatus(m)}</Badge>)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Step 2: pitch deck */}
      {appResult && !uploadResult && (
        <section aria-labelledby="step-deck" className="animate-rise">
          <h2 id="step-deck" className="text-title text-ink">Pitch Deck</h2>
          <p className="mt-1 text-meta text-ink-muted">PDF only. Validated, stored securely, and read automatically.</p>
          <label className={`press mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-base focus-within:border-brand ${
            file ? "border-brand/50 bg-brand-wash" : "border-line-strong hover:border-brand/50 hover:bg-surface-sunken"}`}>
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <span className={`grid h-11 w-11 place-items-center rounded-full ${file ? "bg-brand text-white" : "bg-white text-brand shadow-card"}`}><DocumentIcon size={20} /></span>
            <span className="text-body font-medium text-ink">{file ? <span data-content>{file.name}</span> : "Choose PDF"}</span>
            <span className="text-meta text-ink-muted">{file ? "Change File" : "No File Selected"}</span>
          </label>
          <Button variant="primary" size="lg" className="mt-6 w-full sm:w-auto" onClick={uploadDeck} disabled={!file} busy={status === "uploading"}>Submit Application</Button>
          {status === "uploading" && <p className="mt-2 text-meta text-ink-muted" role="status">Reading Your Deck…</p>}
        </section>
      )}

      {/* Step 3: submitted */}
      {uploadResult && (
        <div ref={submittedRef} tabIndex={-1} className="animate-rise scroll-mt-6 rounded-2xl bg-positive-wash px-5 py-6 focus:outline-none sm:px-7">
          <p className="flex items-center gap-2.5 text-title text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-positive text-white"><CheckIcon size={16} className="check-draw" /></span>
            Application Submitted
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            We read <strong>{uploadResult.num_pages}</strong> page(s) of your deck ({uploadResult.extraction_status}).
            {uploadResult.extracted_fields?.missing?.length > 0 && (
              <> The deck appears to be missing: {uploadResult.extracted_fields.missing.join(", ")}.</>
            )}
          </p>
          <h3 className="mt-5 text-[15px] font-semibold text-ink">What Happens Next</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-ink-soft">
            <li>Your application is now with the fund, waiting for review.</li>
            <li>An investor reviews it — a person makes every decision.</li>
            <li>Check its status any time. If the fund needs more, it&apos;s listed under <em>What Would Help the Fund Decide</em>.</li>
          </ol>
          {/* wraps on phones, so the page never scrolls sideways */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={`/founder/application/${appResult.application_id}`} className="btn-primary">View Application Status</Link>
            <Link href="/founder/applications" className="btn-ghost">My Applications</Link>
          </div>
        </div>
      )}
    </div>
  );
}
