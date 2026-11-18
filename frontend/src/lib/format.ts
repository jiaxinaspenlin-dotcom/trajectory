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
// through this. Minor words stay lowercase unless first or last in a phrase or
// the particle of a phrasal verb (Fill In);
// both halves of a hyphenated word are capitalized; units, numbers, @handles and
// mixed-case names (GitHub, InsForge) are left exactly as they are.
const MINOR = new Set(
  "a an the and but or nor for as at by in of on per to via vs with from into than".split(" ")
);
// "in", "on" and "out" complete a verb here, so they are capitalized: Set Up, Fill In,
// Log Out, Opt In. After anything else they are prepositions ("7 in Pipeline").
const PARTICLES = new Set(["in", "on", "out"]);
const PHRASAL = new Set(
  ("fill filled filling log logged logging sign signed signing opt opted opting check checked checking " +
    "turn turned turning carry carried carrying zoom zoomed zooming plug plugged plugging type typed typing " +
    "hand handed handing read reading drill drilled drilling dial dialed dialing weigh weighed weighing " +
    "follow followed following find found finding point pointed pointing build built building").split(" ")
);
const NAMES: Record<string, string> = {
  github: "GitHub", openai: "OpenAI", tavily: "Tavily", ai: "AI", url: "URL", urls: "URLs", pdf: "PDF",
  yc: "YC", hn: "HN", swot: "SWOT", kpi: "KPI", kpis: "KPIs", api: "API", mau: "MAU", id: "ID", ids: "IDs",
  tam: "TAM", vc: "VC", ml: "ML", saas: "SaaS", b2b: "B2B", b2c: "B2C", llm: "LLM", llms: "LLMs", devops: "DevOps",
};
// unit words, left lowercase like 3d or 30d ("+16.4 pts")
const UNITS = new Set(["pt", "pts"]);
// tokens that end one phrase and start the next ("Recommended: Continue Diligence · Waiting 3d")
const BREAKS = new Set(["·", "—", "–", "/", "|", "→", "←"]);

function casePart(part: string, edge: boolean, afterVerb = false): string {
  const name = NAMES[part.toLowerCase()];
  if (name) return name;
  // units, values, handles, domains and abbreviations (3d, $250K, @ada, insforge.dev, e.g.)
  if (!/[a-z]/i.test(part) || /\d/.test(part) || part.startsWith("@") || /\.[a-z]/i.test(part)) return part;
  if (UNITS.has(part)) return part;
  if (/[A-Z]/.test(part.slice(1))) return part; // mixed case or acronym: a name, keep it
  const lower = part.toLowerCase();
  if (!edge && MINOR.has(lower) && !(afterVerb && PARTICLES.has(lower))) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function caseWord(word: string, edge: boolean, afterVerb = false): string {
  // keep surrounding punctuation: "(revenue", "users)", "next:"
  const m = word.match(/^([^A-Za-z0-9@$]*)(.*?)([^A-Za-z0-9%]*)$/);
  if (!m || !m[2]) return word;
  // paths and slash pairs are values: ada/ledgerkit, ai/ml
  if (m[2].includes("/")) return word;
  const [, lead, core, trail] = m;
  const parts = core.split("-");
  return lead + parts.map((p, i) => casePart(p, i === 0 ? edge || !!lead : true, i === 0 && !lead && afterVerb)).join("-") + trail;
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
  const afterVerb = (k: number) => {
    const prev = k >= 2 ? tokens[k - 2] : "";
    return PHRASAL.has(prev.toLowerCase()) && !BREAKS.has(prev);
  };
  return tokens.map((t, k) => (t.trim() && !BREAKS.has(t) ? caseWord(t, edges.has(k), afterVerb(k)) : t)).join("");
}

// A generated phrase shown as a label (a gap, an unknown): Title Case, unless it
// was written as a sentence.
export function labelPhrase(text: string): string {
  return /[.?!]["”)]?$/.test(text.trim()) ? text : titleCase(text);
}

// A piece of generated prose shown on its own (a SWOT quadrant, an explanation
// tooltip): a capital first letter and closing punctuation, words untouched.
export function asSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.?!…]["”)]?$/.test(s) ? s : `${s}.`;
}

// A source name is content ("GitHub ada/ledgerkit", a page title). Only the names
// Trajectory itself writes, as stored by older versions, are re-cased.
const OWN_SOURCES: Record<string, string> = { "Pitch deck": "Pitch Deck", "Founder application": "Founder Application" };
export function sourceName(name: string): string {
  const demo = / \(demo\)$/i.test(name);
  const base = demo ? name.slice(0, -" (demo)".length) : name;
  return `${OWN_SOURCES[base] ?? base}${demo ? " (Demo)" : ""}`;
}

// Sector and group names are labels wherever they are shown: "fintech" -> "Fintech",
// "ai/ml" -> "AI/ML", "devtools" -> "Developer Tools". Display only: the thesis and
// company profiles keep what was typed.
const SECTORS: Record<string, string> = { devtools: "Developer Tools", "dev tools": "Developer Tools", "dev-tools": "Developer Tools" };
export function sectorLabel(sector: string): string {
  const t = sector.trim();
  return SECTORS[t.toLowerCase()] ?? t.split("/").map((p) => titleCase(p.trim())).join("/");
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

// A momentum change in whole points, signed: "+10", "-3", "0".
export function signedPoints(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : String(r); // String(-0) is "0"
}

// Name the window a momentum change really covers. Young histories fall back
// to the first snapshot, so a "30-day" change can span only a few days.
export function momentumWindow(days: number | null | undefined, nominal = 30): { short: string; long: string; partial: boolean } {
  if (days == null || days >= nominal) return { short: `${nominal}d`, long: `${nominal}-Day`, partial: false };
  if (days <= 0) return { short: "<1d", long: "Since First Sync", partial: true };
  return { short: `${days}d`, long: `${days}-Day`, partial: true };
}
