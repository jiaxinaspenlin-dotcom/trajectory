// Presentation helpers: label -> semantic color, formatting.

export function labelTone(label: string): string {
  switch (label) {
    case "Strong":
      return "bg-positive-wash text-positive";
    case "Promising":
      return "bg-brand-wash text-brand";
    case "Mixed":
      return "bg-caution-wash text-caution";
    case "Weak":
      return "bg-negative-wash text-negative";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function verificationTone(status: string): string {
  switch (status) {
    case "verified":
      return "bg-positive-wash text-positive";
    case "partially_verified":
      return "bg-brand-wash text-brand";
    case "founder_reported":
      return "bg-caution-wash text-caution";
    case "contradicted":
      return "bg-negative-wash text-negative";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function trajectoryTone(t: string): string {
  switch (t) {
    case "accelerating":
      return "bg-positive-wash text-positive";
    case "improving":
      return "bg-brand-wash text-brand";
    case "declining":
      return "bg-negative-wash text-negative";
    case "stable":
      return "bg-neutral-wash text-neutral";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

// Display text for stored values (enums, recommended actions, missing fields).
// Sentence case per docs/copy-style.md; known values are spelled out so names
// and acronyms come out right.
const DISPLAY: Record<string, string> = {
  // screening axes are names
  idea_vs_market: "Idea vs Market",
  // stored Title Case values
  "Insufficient Evidence": "Insufficient evidence",
  "Invite to Apply": "Invite to apply",
  "Schedule Interview": "Schedule interview",
  "Request Information": "Request information",
  "Continue Diligence": "Continue diligence",
  "Website or Product Link": "Website or product link",
  "GitHub Profile": "GitHub profile",
  "Traction Signal (Revenue or Users)": "Traction signal (revenue or users)",
  "Team Introduction": "Team introduction",
  // Founder Score components (keys from backend app/scoring/founder_score.py)
  leadership_collaboration: "Leadership & collaboration",
  evidence_reliability: "Reliability of evidence",
  // statuses that read better spelled out
  founder_reported: "Founder-reported",
  in_pipeline: "In Pipeline",
  in_diligence: "In Diligence",
  not_applicable: "Not applicable",
};

// Words that keep their capitals inside sentence-case text.
const NAMES: Record<string, string> = {
  github: "GitHub", openai: "OpenAI", tavily: "Tavily", ai: "AI", url: "URL", pdf: "PDF",
  yc: "YC", hn: "HN", swot: "SWOT", kpis: "KPIs", kpi: "KPI", api: "API", mau: "MAU",
};

export function humanStatus(s: string): string {
  if (DISPLAY[s]) return DISPLAY[s];
  const words = s.replace(/_/g, " ").trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const name = NAMES[w.toLowerCase()];
      if (name) return name;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export function scoreTone(score: number): string {
  if (score >= 70) return "text-positive";
  if (score >= 50) return "text-brand";
  if (score >= 35) return "text-caution";
  return "text-negative";
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// Name the window a momentum change really covers. Young histories fall back
// to the first snapshot, so a "30-day" change can span only a few days.
export function momentumWindow(days: number | null | undefined, nominal = 30): { short: string; long: string; partial: boolean } {
  if (days == null || days >= nominal) return { short: `${nominal}d`, long: `${nominal}-day`, partial: false };
  if (days <= 0) return { short: "<1d", long: "Since first sync", partial: true };
  return { short: `${days}d`, long: `${days}-day`, partial: true };
}
