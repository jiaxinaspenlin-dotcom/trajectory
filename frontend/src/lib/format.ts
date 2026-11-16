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

// ---- Title Case (docs/copy-style.md) ----------------------------------------
// Labels, headings and short phrases are Title Case; full sentences are not run
// through this. Minor words stay lowercase unless first or last in a phrase;
// both halves of a hyphenated word are capitalized; units, numbers, @handles and
// mixed-case names (GitHub, InsForge) are left exactly as they are.
const MINOR = new Set(
  "a an the and but or nor for so yet as at by in of off on per to up via vs with from into than".split(" ")
);
const NAMES: Record<string, string> = {
  github: "GitHub", openai: "OpenAI", tavily: "Tavily", ai: "AI", url: "URL", urls: "URLs", pdf: "PDF",
  yc: "YC", hn: "HN", swot: "SWOT", kpi: "KPI", kpis: "KPIs", api: "API", mau: "MAU", id: "ID", ids: "IDs",
  tam: "TAM", vc: "VC",
};
// tokens that end one phrase and start the next ("Recommended: Continue Diligence · Waiting 3d")
const BREAKS = new Set(["·", "—", "–", "/", "|", "→", "←"]);

function casePart(part: string, edge: boolean): string {
  // units, values, handles, domains and abbreviations (3d, $250K, @ada, insforge.dev, e.g.)
  if (!/[a-z]/i.test(part) || /\d/.test(part) || part.startsWith("@") || /\.[a-z]/i.test(part)) return part;
  const name = NAMES[part.toLowerCase()];
  if (name) return name;
  if (/[A-Z]/.test(part.slice(1))) return part; // mixed case or acronym: a name, keep it
  const lower = part.toLowerCase();
  if (!edge && MINOR.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function caseWord(word: string, edge: boolean): string {
  // keep surrounding punctuation: "(revenue", "users)", "next:"
  const m = word.match(/^([^A-Za-z0-9@$]*)(.*?)([^A-Za-z0-9%]*)$/);
  if (!m || !m[2]) return word;
  const [, lead, core, trail] = m;
  const parts = core.split("-");
  return lead + parts.map((p, i) => casePart(p, i === 0 ? edge || !!lead : true)).join("-") + trail;
}

export function titleCase(text: string): string {
  const tokens = text.split(/(\s+)/);
  const words = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.trim() && !BREAKS.has(t));
  // phrase edges: first/last word overall, around break tokens, and after a colon
  const edges = new Set<number>();
  let startNext = true;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (!t.trim()) continue;
    if (BREAKS.has(t)) { startNext = true; continue; }
    if (startNext) { edges.add(k); startNext = false; }
    if (/[:]$/.test(t)) startNext = true;
  }
  for (let w = 0; w < words.length; w++) {
    const k = words[w].i;
    const next = tokens.slice(k + 1).find((t) => t.trim());
    if (w === words.length - 1 || /[:]$/.test(words[w].t) || (next && BREAKS.has(next))) edges.add(k);
  }
  return tokens.map((t, k) => (t.trim() && !BREAKS.has(t) ? caseWord(t, edges.has(k)) : t)).join("");
}

// Display text for stored values (enums, recommended actions, missing fields):
// Title Case, with a few values spelled out where the words need help.
const DISPLAY: Record<string, string> = {
  // Founder Score components (keys from backend app/scoring/founder_score.py)
  leadership_collaboration: "Leadership & Collaboration",
  evidence_reliability: "Reliability of Evidence",
  founder_reported: "Founder-Reported",
};

export function humanStatus(s: string): string {
  return DISPLAY[s] ?? titleCase(s.replace(/_/g, " ").trim());
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
  if (days == null || days >= nominal) return { short: `${nominal}d`, long: `${nominal}-Day`, partial: false };
  if (days <= 0) return { short: "<1d", long: "Since First Sync", partial: true };
  return { short: `${days}d`, long: `${days}-Day`, partial: true };
}
