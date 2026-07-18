"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";
import { addMyAppId } from "@/lib/myApps";

export default function ApplyFlow() {
  const [companyName, setCompanyName] = useState("");
  const [optional, setOptional] = useState({ github_profile: "", website: "", sector: "", geography: "", num_users: "", team_info: "" });
  const [appResult, setAppResult] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Apply to the fund</h1>
        <p className="text-sm text-ink-muted">
          You only need a company name and a PDF pitch deck. We ask for nothing you don&rsquo;t need to provide.
        </p>
      </div>

      {/* stepper */}
      <ol className="flex items-center gap-2 text-xs">
        {[["1", "Company"], ["2", "Pitch deck"], ["3", "Submitted"]].map(([n, label], idx) => {
          const active = step >= idx + 1;
          return (
            <li key={n} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${active ? "bg-positive text-white" : "bg-line text-ink-muted"}`}>{n}</span>
              <span className={active ? "font-medium text-ink" : "text-ink-muted"}>{label}</span>
              {idx < 2 && <span className="mx-1 h-px w-6 bg-line" />}
            </li>
          );
        })}
      </ol>

      {error && <ErrorState message={error} />}

      {/* Step 1: company */}
      <Section title="1. Company" subtitle="Company name is required; everything else is optional">
        <label className="block">
          <span className="label">Company name *</span>
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm disabled:bg-surface-sunken"
            value={companyName}
            disabled={!!appResult}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Northwind Labs"
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([["github_profile", "GitHub username (optional)"], ["website", "Website (optional)"], ["sector", "Sector (optional)"], ["geography", "Geography (optional)"], ["num_users", "Current users (optional)"], ["team_info", "Team (optional)"]] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="label">{label}</span>
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm disabled:bg-surface-sunken"
                value={(optional as any)[k]}
                disabled={!!appResult}
                onChange={(e) => setOptional({ ...optional, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {!appResult && (
          <button className="btn-primary mt-3" onClick={createApp} disabled={!companyName || status === "creating"}>
            {status === "creating" ? "Starting…" : "Continue to pitch deck"}
          </button>
        )}
      </Section>

      {/* Step 1 result: first-pass screen */}
      {appResult && (
        <Section title="First-pass screen" subtitle="Automatic, before the deck">
          <p className="text-sm text-ink-soft">{appResult.screen_summary}</p>
          {appResult.missing_fields?.length > 0 && (
            <div className="mt-2">
              <span className="label">Information that would help</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {appResult.missing_fields.map((m: string) => <Badge key={m} tone="bg-caution-wash text-caution">{m}</Badge>)}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Step 2: pitch deck */}
      {appResult && !uploadResult && (
        <Section title="2. Pitch deck (PDF)" subtitle="Validated, stored securely, and read automatically">
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          <button className="btn-primary ml-3" onClick={uploadDeck} disabled={!file || status === "uploading"}>
            {status === "uploading" ? "Uploading & reading…" : "Submit application"}
          </button>
          {status === "uploading" && <div className="mt-2"><Spinner label="Reading your deck…" /></div>}
        </Section>
      )}

      {/* Step 3: submitted */}
      {uploadResult && (
        <Section title="Application submitted 🎉" subtitle="Thank you — the fund will review it">
          <p className="text-sm text-ink-soft">
            We read <strong>{uploadResult.num_pages}</strong> page(s) of your deck ({uploadResult.extraction_status}).
            {uploadResult.extracted_fields?.missing?.length > 0 && (
              <> The deck appears to be missing: {uploadResult.extracted_fields.missing.join(", ")}.</>
            )}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            A human investor reviews every application and makes the final decision — the fund aims to respond promptly.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/founder/application/${appResult.application_id}`} className="btn-primary">
              View my application status →
            </Link>
            <Link href="/founder/applications" className="btn-secondary">My applications</Link>
          </div>
        </Section>
      )}
    </div>
  );
}
