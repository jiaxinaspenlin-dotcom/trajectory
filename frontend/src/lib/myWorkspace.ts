// Per-browser investor workspace — the investor-side mirror of lib/myApps.ts.
// There's no login in this prototype, so an investor's pipeline (which prospects
// they've Saved / are Monitoring / Dismissed) and their recorded decisions are
// scoped to THIS browser's localStorage rather than shared across everyone who
// opens the investor workspace.
//
// The underlying opportunities, and the audit record of every human decision,
// still live in the backend database (real, non-demo data). This module only
// scopes *whose* pipeline and decisions are shown — exactly how the founder side
// keeps applications in the DB but tracks ownership in the browser.

export type PipelineStatus = "saved" | "monitoring" | "dismissed";

const PIPELINE_KEY = "trajectory_investor_pipeline";
const DECISIONS_KEY = "trajectory_investor_decisions";

export interface LocalDecision {
  decision: string;
  chosen_action: string;
  decided_by: string;
  notes: string;
  decided_at: string;
  system_recommended_action: string | null;
}

function readMap<T>(key: string): Record<number, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<number, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, map: Record<number, T>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore quota / serialization errors */
  }
}

// ---- pipeline (saved / monitoring / dismissed) ----------------------------

export function getPipeline(): Record<number, PipelineStatus> {
  return readMap<PipelineStatus>(PIPELINE_KEY);
}

export function getPipelineStatus(id: number): PipelineStatus | null {
  return getPipeline()[id] ?? null;
}

export function setPipelineStatus(id: number, status: PipelineStatus): void {
  const map = getPipeline();
  map[id] = status;
  writeMap(PIPELINE_KEY, map);
}

export function clearPipelineStatus(id: number): void {
  const map = getPipeline();
  delete map[id];
  writeMap(PIPELINE_KEY, map);
}

// ---- recorded human decisions ---------------------------------------------

export function getMyDecisions(): Record<number, LocalDecision> {
  return readMap<LocalDecision>(DECISIONS_KEY);
}

export function getMyDecision(id: number): LocalDecision | null {
  return getMyDecisions()[id] ?? null;
}

export function saveMyDecision(id: number, decision: LocalDecision): void {
  const map = getMyDecisions();
  map[id] = decision;
  writeMap(DECISIONS_KEY, map);
}
