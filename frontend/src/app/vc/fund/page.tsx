"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { humanStatus } from "@/lib/format";
import { Thesis } from "@/lib/types";
import { Badge, Drawer, EmptyState, ErrorState, PageHeader, Section, Spinner } from "@/components/ui";

const EMPTY = {
  fund_name: "", sectors: "", stages: "", geographies: "",
  min_check_size: 0, max_check_size: 0, target_ownership: 0, risk_tolerance: "balanced",
  traction_preferences: "", founder_preferences: "",
  excluded_sectors: "", excluded_geographies: "", excluded_business_models: "",
  custom_description: "",
};
type Form = typeof EMPTY;

function toList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function toForm(t: Thesis): Form {
  return {
    fund_name: t.fund_name,
    sectors: t.sectors.join(", "),
    stages: t.stages.join(", "),
    geographies: t.geographies.join(", "),
    min_check_size: t.min_check_size,
    max_check_size: t.max_check_size,
    target_ownership: t.target_ownership,
    risk_tolerance: t.risk_tolerance,
    traction_preferences: t.traction_preferences,
    founder_preferences: t.founder_preferences,
    excluded_sectors: t.excluded_sectors.join(", "),
    excluded_geographies: t.excluded_geographies.join(", "),
    excluded_business_models: t.excluded_business_models.join(", "),
    custom_description: t.custom_description,
  };
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

export default function FundPage() {
  return (
    <Suspense fallback={<Spinner label="Loading fund…" />}>
      <Fund />
    </Suspense>
  );
}

function Fund() {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?edit=1 opens the editor, so "Edit" links and refreshes land in the right place
  const editing = params.get("edit") === "1";
  const setEditing = useCallback(
    (open: boolean) => router.replace(open ? `${pathname}?edit=1` : pathname, { scroll: false }),
    [pathname, router]
  );

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<{ thesis: Thesis | null }>("/api/thesis")
      .then((r) => setThesis(r.thesis))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load the fund"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const header = (
    <PageHeader
      title={thesis?.fund_name || "Fund"}
      subtitle="Your fund profile and investment thesis — every sourcing result, score, and recommendation is evaluated through it."
      actions={<button className="btn-primary" onClick={() => setEditing(true)}>{thesis ? "Edit thesis" : "Set up thesis"}</button>}
    />
  );

  return (
    <div className="space-y-5">
      {header}
      {impact && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-brand/25 bg-brand-wash px-4 py-3 text-[13px] text-brand" role="status">
          <span><strong className="font-semibold">Thesis saved.</strong> {impact}</span>
          <button className="btn-ghost btn-sm" onClick={() => setImpact(null)}>Dismiss</button>
        </div>
      )}
      {loading ? <Spinner label="Loading fund…" /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : thesis ? (
        <Profile t={thesis} />
      ) : (
        <EmptyState
          title="No thesis yet"
          hint="Define your sectors, stages, geographies, and check sizes. Trajectory scores every founder and deal against it."
          action={<button className="btn-primary" onClick={() => setEditing(true)}>Set up thesis</button>}
        />
      )}
      <ThesisEditor
        open={editing}
        existing={thesis}
        onClose={() => setEditing(false)}
        onSaved={(t, summary) => { setThesis(t); setImpact(summary); setEditing(false); }}
      />
    </div>
  );
}

function Profile({ t }: { t: Thesis }) {
  const weights = Object.entries(t.score_weights || {}).filter(([, w]) => typeof w === "number");
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Section title="Investment focus">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Chips label="Sectors" items={t.sectors} />
            <Chips label="Stages" items={t.stages} />
            <Chips label="Geographies" items={t.geographies} />
          </dl>
          {t.custom_description && (
            <p className="mt-4 border-t border-line pt-3 text-[13px] leading-6 text-ink-soft">{t.custom_description}</p>
          )}
        </Section>

        <Section title="What we look for">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Text label="Founders" value={t.founder_preferences} />
            <Text label="Traction" value={t.traction_preferences} />
          </dl>
        </Section>

        <Section title="Exclusions" subtitle="Hard filters — floored in scoring">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Chips label="Sectors" items={t.excluded_sectors} tone="bg-negative-wash text-negative" empty="None" />
            <Chips label="Geographies" items={t.excluded_geographies} tone="bg-negative-wash text-negative" empty="None" />
            <Chips label="Business models" items={t.excluded_business_models} tone="bg-negative-wash text-negative" empty="None" />
          </dl>
        </Section>
      </div>

      <div className="space-y-5">
        <Section title="Terms">
          <dl className="divide-y divide-line text-[13px]">
            <Term label="Check size" value={t.min_check_size || t.max_check_size ? `${money(t.min_check_size)} – ${money(t.max_check_size)}` : "Not set"} />
            <Term label="Target ownership" value={t.target_ownership ? `${t.target_ownership}%` : "Not set"} />
            <Term label="Risk tolerance" value={humanStatus(t.risk_tolerance || "—")} />
            <Term label="Status" value={t.is_active ? "Active thesis" : "Inactive"} />
            {t.updated_at && <Term label="Last updated" value={new Date(t.updated_at).toLocaleDateString()} />}
          </dl>
        </Section>
        {weights.length > 0 && (
          <Section title="Founder score weights" subtitle="How the deterministic score is composed">
            <ul className="space-y-2">
              {weights.map(([k, w]) => (
                <li key={k}>
                  <div className="flex justify-between text-xs"><span className="text-ink-soft">{humanStatus(k)}</span><span className="num text-ink-muted">{Math.round(Number(w) * 100)}%</span></div>
                  <div className="mt-1 h-1 rounded-full bg-line"><div className="h-1 rounded-full bg-brand" style={{ width: `${Math.min(100, Number(w) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Chips({ label, items, tone, empty = "Any" }: { label: string; items: string[]; tone?: string; empty?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 flex flex-wrap gap-1">
        {items.length ? items.map((s) => <Badge key={s} tone={tone}>{s}</Badge>) : <span className="text-[13px] text-ink-faint">{empty}</span>}
      </dd>
    </div>
  );
}

function Text({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-[13px] leading-6 text-ink-soft">{value || <span className="text-ink-faint">Not specified</span>}</dd>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function ThesisEditor({ open, existing, onClose, onSaved }: {
  open: boolean;
  existing: Thesis | null;
  onClose: () => void;
  onSaved: (t: Thesis, impactSummary: string) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setForm(existing ? toForm(existing) : EMPTY); setError(null); }
  }, [open, existing]);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      fund_name: form.fund_name,
      sectors: toList(form.sectors), stages: toList(form.stages), geographies: toList(form.geographies),
      min_check_size: Number(form.min_check_size), max_check_size: Number(form.max_check_size),
      target_ownership: Number(form.target_ownership), risk_tolerance: form.risk_tolerance,
      traction_preferences: form.traction_preferences, founder_preferences: form.founder_preferences,
      excluded_sectors: toList(form.excluded_sectors), excluded_geographies: toList(form.excluded_geographies),
      excluded_business_models: toList(form.excluded_business_models), custom_description: form.custom_description,
    };
    try {
      const r = existing
        ? await api.put<{ thesis: Thesis; impact: { summary: string } }>(`/api/thesis/${existing.id}`, payload)
        : await api.post<{ thesis: Thesis; impact: { summary: string } }>("/api/thesis", payload);
      onSaved(r.thesis, r.impact.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof Form, label: string, ph = "", type = "text", hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} className="input mt-1" value={form[k] as string | number} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? "Edit thesis" : "Set up thesis"}
      subtitle="Saving re-evaluates fit for every opportunity. Prior versions of scores are kept."
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.fund_name}>{saving ? "Saving…" : existing ? "Save changes" : "Create thesis"}</button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorState message={error} />}
        <fieldset className="space-y-3">
          <legend className="text-[13px] font-semibold text-ink">Fund & focus</legend>
          {field("fund_name", "Fund name", "Northstar Ventures")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("sectors", "Sectors", "fintech, ai/ml, devtools", "text", "Comma-separated")}
            {field("stages", "Stages", "pre-seed, seed", "text", "Comma-separated")}
            {field("geographies", "Geographies", "Boston, San Francisco", "text", "Comma-separated")}
            <label className="block">
              <span className="label">Risk tolerance</span>
              <select className="select mt-1" value={form.risk_tolerance} onChange={(e) => setForm({ ...form, risk_tolerance: e.target.value })}>
                {["conservative", "balanced", "aggressive"].map((r) => <option key={r} value={r}>{humanStatus(r)}</option>)}
                {!["conservative", "balanced", "aggressive"].includes(form.risk_tolerance) && <option value={form.risk_tolerance}>{form.risk_tolerance}</option>}
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-line pt-4">
          <legend className="text-[13px] font-semibold text-ink">Terms</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("min_check_size", "Min check ($)", "250000", "number")}
            {field("max_check_size", "Max check ($)", "1500000", "number")}
            {field("target_ownership", "Target ownership %", "8", "number")}
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-line pt-4">
          <legend className="text-[13px] font-semibold text-ink">What we look for</legend>
          {field("founder_preferences", "Founder preferences", "Technical founders with repeated execution")}
          {field("traction_preferences", "Traction preferences", "Evidence of product adoption")}
          <label className="block">
            <span className="label">Thesis description</span>
            <textarea className="textarea mt-1" rows={3} value={form.custom_description} onChange={(e) => setForm({ ...form, custom_description: e.target.value })} />
          </label>
        </fieldset>
        <fieldset className="space-y-3 border-t border-line pt-4">
          <legend className="text-[13px] font-semibold text-ink">Exclusions <span className="font-normal text-ink-muted">— hard filters</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("excluded_sectors", "Sectors", "gambling")}
            {field("excluded_geographies", "Geographies", "")}
            {field("excluded_business_models", "Business models", "services agency")}
          </div>
        </fieldset>
      </div>
    </Drawer>
  );
}
