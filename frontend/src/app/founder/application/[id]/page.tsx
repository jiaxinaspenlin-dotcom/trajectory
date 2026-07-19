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
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const deckReady = data.document && data.document.status === "extracted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{data.company_name}</h1>
            <Badge tone="bg-positive-wash text-positive">under review</Badge>
          </div>
          <p className="text-sm text-ink-muted">{data.sector || "Sector not set"} · {data.geography || "Geography not set"}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/founder/applications" className="btn-secondary">My Applications</Link>
          {!deckReady && <Link href="/founder" className="btn-primary">Start / finish an application</Link>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pitch Deck" value={deckReady ? "Received" : "Pending"} sub={data.document ? `${data.document.num_pages} pages parsed` : "Not uploaded yet"} tone={deckReady ? "text-positive" : "text-caution"} />
        <Stat label="Users (Reported)" value={data.num_users ?? "—"} />
        <Stat label="Funding Requested" value={data.funding_requested ? `$${data.funding_requested.toLocaleString()}` : "—"} />
      </div>

      <Section title="First-Pass Screen" subtitle="Automated, before human review">
        <p className="text-sm text-ink-soft">{data.screen_summary || "Your application is queued for screening."}</p>
      </Section>

      <ProvideInfo app={data} onSaved={reload} />

      <div className="rounded-xl border border-line bg-surface-sunken p-4 text-sm text-ink-muted">
        A human investor reviews every application and makes the final decision. Trajectory never
        auto-invests or sends automated messages. You&rsquo;ll be contacted with a next step
        (interview, information request, or a pass) — the fund aims to respond promptly.
      </div>
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
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
        value={form[k]}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <Section
      title="What the Fund Still Needs From You"
      subtitle="Only what genuinely helps a confident decision — fill in what you can and submit"
    >
      {done && (
        <p className="mb-3 text-sm text-positive">You&rsquo;ve provided everything the fund asked for. 🎉 You can still update details below.</p>
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
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
          rows={2}
          placeholder="Founders, roles, relevant background…"
          value={form.team_info}
          onChange={(e) => setForm({ ...form, team_info: e.target.value })}
        />
      </label>

      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      {saved && !error && <p className="mt-2 text-sm text-positive">Saved — sent to the fund. Thank you!</p>}

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
