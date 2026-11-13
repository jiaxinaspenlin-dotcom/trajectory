"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner, Stat } from "@/components/ui";

interface ApplicationDetail {
  id: number;
  company_id: number;
  company_name: string;
  founder_names: string[];
  sector: string | null;
  geography: string | null;
  website: string | null;
  product_link: string | null;
  github_profile: string | null;
  team_info: string | null;
  missing_fields: string[];
  screen_summary: string;
  current_revenue: number | null;
  num_users: number | null;
  funding_requested: number | null;
  document: { id: number; num_pages: number; status: string; page_count: number } | null;
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useFetch<ApplicationDetail>(`/api/applications/${id}`);

  if (loading) return <Spinner label="Loading application…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const deckReady = data.document && data.document.status === "extracted";

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <Link href="/founder/applications" className="hover:text-brand">My applications</Link>
        <span className="mx-1.5 text-ink-faint">/</span>
        <span className="text-ink-soft">{data.company_name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{data.company_name}</h1>
            <Badge tone="bg-brand-wash text-brand">Under review</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-muted">{data.sector || "Sector not set"} · {data.geography || "Location not set"}</p>
        </div>
        {!deckReady && <Link href="/founder" className="btn-primary">Finish your application</Link>}
      </div>

      {/* status timeline */}
      <ol className="grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-white text-[13px]" aria-label="Application status">
        {[
          ["Application received", true],
          ["Pitch deck read", !!deckReady],
          ["Human review", false],
        ].map(([label, done], i) => (
          <li key={String(label)} className={`flex items-center gap-2 px-4 py-2.5 ${i > 0 ? "border-l border-line" : ""}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${done ? "bg-positive text-white" : i === 2 ? "bg-brand-wash text-brand" : "bg-line text-ink-muted"}`}>{done ? "✓" : i + 1}</span>
            <span className={done ? "text-ink" : "text-ink-muted"}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pitch deck" value={deckReady ? "Received" : "Pending"} sub={data.document ? `${data.document.num_pages} pages parsed` : "Not uploaded yet"} tone={deckReady ? "text-positive" : "text-caution"} />
        <Stat label="Users (reported)" value={data.num_users ?? "—"} />
        <Stat label="Funding requested" value={data.funding_requested ? `$${data.funding_requested.toLocaleString()}` : "—"} />
      </div>

      <Section title="First-pass screen" subtitle="Automated, before human review">
        <p className="text-[13px] leading-6 text-ink-soft">{data.screen_summary || "Your application is queued for screening."}</p>
      </Section>

      <ProvideInfo app={data} onSaved={reload} />

      <p className="text-xs leading-5 text-ink-muted">
        A human investor reviews every application and makes the final decision. Trajectory never auto-invests or sends automated
        messages. You&rsquo;ll be contacted with a next step — an interview, an information request, or a pass.
      </p>
    </div>
  );
}

function ProvideInfo({ app, onSaved }: { app: ApplicationDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    website: "", product_link: "", github_profile: "", num_users: "", current_revenue: "",
    team_info: "", customer_info: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // prefill from whatever is already on the application
  useEffect(() => {
    setForm((f) => ({
      ...f,
      website: app.website || "",
      product_link: app.product_link || "",
      github_profile: app.github_profile || "",
      num_users: app.num_users != null ? String(app.num_users) : "",
      current_revenue: app.current_revenue != null ? String(app.current_revenue) : "",
      team_info: app.team_info || "",
    }));
  }, [app.website, app.product_link, app.github_profile, app.num_users, app.current_revenue, app.team_info]);

  async function submit() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {};
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.product_link.trim()) payload.product_link = form.product_link.trim();
      if (form.github_profile.trim()) payload.github_profile = form.github_profile.trim();
      if (form.num_users.trim()) payload.num_users = Number(form.num_users);
      if (form.current_revenue.trim()) payload.current_revenue = Number(form.current_revenue);
      if (form.team_info.trim()) payload.team_info = form.team_info.trim();
      if (form.customer_info.trim()) payload.customer_info = form.customer_info.trim();
      await api.patch<ApplicationDetail>(`/api/applications/${app.id}`, payload);
      setSaved(true);
      onSaved(); // refresh so the "still needs" list updates
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const done = app.missing_fields.length === 0;

  const field = (k: keyof typeof form, label: string, ph = "", type = "text") => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        className="input mt-1"
        value={form[k]}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <Section
      title="What would help the fund decide"
      subtitle={app.missing_fields.length ? `${app.missing_fields.length} item${app.missing_fields.length === 1 ? "" : "s"} outstanding — fill in what you can` : "Everything requested has been provided"}
    >
      {done && (
        <p className="mb-3 text-[13px] text-positive">You&rsquo;ve provided everything the fund asked for. You can still update details below.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {field("website", "Website", "https://…")}
        {field("product_link", "Product / demo link", "https://…")}
        {field("github_profile", "GitHub username", "e.g. yourhandle")}
        {field("num_users", "Current users", "e.g. 1200", "number")}
        {field("current_revenue", "Current revenue ($)", "e.g. 5000", "number")}
        {field("customer_info", "Customer / pilot info", "e.g. 2 paid pilots")}
      </div>
      <label className="mt-3 block">
        <span className="label">Team</span>
        <textarea
          className="textarea mt-1"
          rows={2}
          placeholder="Founders, roles, relevant background…"
          value={form.team_info}
          onChange={(e) => setForm({ ...form, team_info: e.target.value })}
        />
      </label>

      {error && <p className="mt-2 text-[13px] text-negative">{error}</p>}
      {saved && !error && <p className="mt-2 text-[13px] text-positive">Saved — sent to the fund. Thank you!</p>}

      <div className="mt-3 flex items-center gap-2">
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? "Submitting…" : "Submit to the fund"}
        </button>
        <span className="text-xs text-ink-muted">
          Adding a GitHub username lets the fund verify your work with real public activity.
        </span>
      </div>
    </Section>
  );
}
