// Client-side scoping of "my applications". There's no login in this prototype,
// so a founder's own submissions are tracked in the browser's localStorage
// rather than showing every application in the database.

const KEY = "trajectory_my_apps";

export function getMyAppIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return arr.map(Number).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export function addMyAppId(id: number): void {
  if (typeof window === "undefined") return;
  const ids = getMyAppIds();
  if (!ids.includes(id)) {
    window.localStorage.setItem(KEY, JSON.stringify([id, ...ids]));
  }
}
