"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Section, ErrorState, Spinner, Badge } from "@/components/ui";

export default function ApplyPage() {
  const [companyName, setCompanyName] = useState("");
  const [optional, setOptional] = useState({ github_profile: "", website: "", sector: "", geography: "", num_users: "", team_info: "" });
  const [appResult, setAppResult] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [status, setStatus] = useState<"idle" | "creating" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-xl font-semibold text-ink">Founder application</h1>
        <p className="text-sm text-ink-muted">
          Minimum required: a company name and a PDF pitch deck. We only ask for what’s genuinely needed
          for a confident decision.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <Section title="1. Company" subtitle="Company name is required">
        <label className="block">
          <span className="label">Company name *</span>
          <input className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([["github_profile", "GitHub username (optional)"], ["website", "Website (optional)"], ["sector", "Sector (optional)"], ["geography", "Geography (optional)"], ["num_users", "Current users (optional)"], ["team_info", "Team (optional)"]] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="label">{label}</span>
              <input className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" value={(optional as any)[k]} onChange={(e) => setOptional({ ...optional, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="btn-primary mt-3" onClick={createApp} disabled={!companyName || status === "creating"}>
          {status === "creating" ? "Creating…" : "Create application"}
        </button>
      </Section>

      {appResult && (
        <>
          <Section title="First-pass screen" subtitle="Automatic, before the deck">
            <p className="text-sm text-ink-soft">{appResult.screen_summary}</p>
            {appResult.missing_fields?.length > 0 && (
              <div className="mt-2">
                <span className="label">Information we still need</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {appResult.missing_fields.map((m: string) => <Badge key={m} tone="bg-caution-wash text-caution">{m}</Badge>)}
                </div>
              </div>
            )}
            <p className="mt-2 text-sm text-ink-muted">Thesis fit: {Math.round(appResult.thesis_fit_score)} / 100</p>
          </Section>

          <Section title="2. Pitch deck (PDF)" subtitle="Validated, stored outside any public directory, and parsed">
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            <button className="btn-primary ml-3" onClick={uploadDeck} disabled={!file || status === "uploading"}>
              {status === "uploading" ? "Uploading & parsing…" : "Upload deck"}
            </button>
            {status === "uploading" && <div className="mt-2"><Spinner label="Extracting text…" /></div>}
            {uploadResult && (
              <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3 text-sm">
                <p className="font-medium text-ink">
                  Extraction: {uploadResult.extraction_status} · {uploadResult.num_pages} page(s)
                </p>
                {uploadResult.extracted_fields?.missing?.length > 0 && (
                  <p className="mt-1 text-xs text-ink-muted">Deck appears to be missing: {uploadResult.extracted_fields.missing.join(", ")}</p>
                )}
                <p className="mt-1 text-xs text-ink-muted">{uploadResult.note}</p>
                <Link href={`/opportunities/${appResult.opportunity_id}`} className="btn-secondary mt-2">
                  Go to founder workflow →
                </Link>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
