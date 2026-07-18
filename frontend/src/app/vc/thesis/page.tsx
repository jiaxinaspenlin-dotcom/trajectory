"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Section, Spinner, ErrorState } from "@/components/ui";
import { Thesis } from "@/lib/types";

const EMPTY = {
  fund_name: "", sectors: "", stages: "", geographies: "",
  min_check_size: 0, max_check_size: 0, target_ownership: 0, risk_tolerance: "balanced",
  traction_preferences: "", founder_preferences: "",
  excluded_sectors: "", excluded_geographies: "", excluded_business_models: "",
  custom_description: "",
};

function toList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export default function ThesisPage() {
  const [form, setForm] = useState(EMPTY);
  const [existing, setExisting] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ thesis: Thesis | null }>("/api/thesis").then((r) => {
      if (r.thesis) {
        setExisting(r.thesis);
        setForm({
          fund_name: r.thesis.fund_name,
          sectors: r.thesis.sectors.join(", "),
          stages: r.thesis.stages.join(", "),
          geographies: r.thesis.geographies.join(", "),
          min_check_size: r.thesis.min_check_size,
          max_check_size: r.thesis.max_check_size,
          target_ownership: r.thesis.target_ownership,
          risk_tolerance: r.thesis.risk_tolerance,
          traction_preferences: r.thesis.traction_preferences,
          founder_preferences: r.thesis.founder_preferences,
          excluded_sectors: r.thesis.excluded_sectors.join(", "),
          excluded_geographies: r.thesis.excluded_geographies.join(", "),
          excluded_business_models: r.thesis.excluded_business_models.join(", "),
          custom_description: r.thesis.custom_description,
        });
      }
    }).catch((e) => setError(String(e.message))).finally(() => setLoading(false));
  }, []);

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
      setExisting(r.thesis);
      setImpact(r.impact.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading thesis…" />;

  const field = (k: keyof typeof EMPTY, label: string, ph = "", type = "text") => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        value={form[k] as string | number}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Investment Thesis</h1>
        <p className="text-sm text-ink-muted">
          Configure your fund’s thesis. Every sourcing result, score, ranking and recommendation is
          evaluated through it — nothing is hardcoded to a single fund.
        </p>
      </div>

      {error && <ErrorState message={error} />}
      {impact && <div className="rounded-lg border border-brand/30 bg-brand-wash p-3 text-sm text-brand">{impact}</div>}

      <Section title="Fund & Focus">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("fund_name", "Fund name", "Northstar Ventures")}
          {field("risk_tolerance", "Risk tolerance", "balanced")}
          {field("sectors", "Sectors (comma-separated)", "fintech, ai/ml, devtools")}
          {field("stages", "Stages", "pre-seed, seed")}
          {field("geographies", "Geographies", "Boston, San Francisco")}
          {field("target_ownership", "Target ownership %", "8", "number")}
          {field("min_check_size", "Min check size ($)", "250000", "number")}
          {field("max_check_size", "Max check size ($)", "1500000", "number")}
        </div>
      </Section>

      <Section title="Preferences">
        <div className="grid gap-4">
          {field("traction_preferences", "Traction preferences", "Evidence of product adoption")}
          {field("founder_preferences", "Founder preferences", "Technical founders with repeated execution")}
          <label className="block">
            <span className="label">Custom thesis description</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              rows={3} value={form.custom_description}
              onChange={(e) => setForm({ ...form, custom_description: e.target.value })}
            />
          </label>
        </div>
      </Section>

      <Section title="Exclusions" subtitle="Hard filters — these are floored in scoring">
        <div className="grid gap-4 sm:grid-cols-3">
          {field("excluded_sectors", "Excluded sectors", "gambling")}
          {field("excluded_geographies", "Excluded geographies", "")}
          {field("excluded_business_models", "Excluded business models", "services agency")}
        </div>
      </Section>

      <div className="flex justify-end gap-2">
        <button className="btn-primary" onClick={save} disabled={saving || !form.fund_name}>
          {saving ? "Saving…" : existing ? "Update thesis" : "Create thesis"}
        </button>
      </div>
    </div>
  );
}
