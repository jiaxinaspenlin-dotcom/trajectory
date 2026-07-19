// Client-side auth: talks to the backend /api/auth endpoints and keeps the
// issued session token + account in localStorage. Accounts and sessions are
// persisted server-side in the database — this only holds the token for the
// logged-in browser. No credentials are ever stored client-side.

import { API_BASE, ApiError } from "@/lib/api";

export type Role = "investor" | "founder";
export type Persona = "VC" | "Founder";

export interface Account {
  id: number;
  email: string;
  display_name: string;
  role: Role;
}

export interface Session {
  token: string;
  account: Account;
}

// Sessions are stored per role so the investor and founder logins are
// independent in the same browser (a person can be signed into both at once).
const keyFor = (role: Role) => `trajectory_auth_${role}`;

export function personaRole(persona: Persona): Role {
  return persona === "VC" ? "investor" : "founder";
}

export function getSession(role: Role): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(role));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(role: Role, s: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(role), JSON.stringify(s));
}

export function clearSession(role: Role): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyFor(role));
}

export function getToken(role: Role): string | null {
  return getSession(role)?.token ?? null;
}

/** Stable per-account key used to namespace other browser-scoped stores. */
export function accountScope(role: Role): string {
  const s = getSession(role);
  return s ? `acct${s.account.id}` : "anon";
}

async function authRequest<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export async function signup(
  email: string,
  password: string,
  displayName: string,
  role: Role
): Promise<Session> {
  const r = await authRequest<{ token: string; account: Account }>("/api/auth/signup", {
    email,
    password,
    display_name: displayName,
    role,
  });
  const s = { token: r.token, account: r.account };
  setSession(role, s);
  return s;
}

export async function login(email: string, password: string, role: Role): Promise<Session> {
  const r = await authRequest<{ token: string; account: Account }>("/api/auth/login", {
    email,
    password,
    role,
  });
  const s = { token: r.token, account: r.account };
  setSession(role, s);
  return s;
}

/** Validate the stored token against the server; returns the fresh account or null. */
export async function fetchMe(role: Role): Promise<Account | null> {
  const token = getToken(role);
  if (!token) return null;
  try {
    const r = await authRequest<{ account: Account }>("/api/auth/me", undefined, token);
    return r.account;
  } catch {
    return null;
  }
}

export async function logout(role: Role): Promise<void> {
  const token = getToken(role);
  clearSession(role);
  if (token) {
    try {
      await authRequest("/api/auth/logout", {}, token);
    } catch {
      /* best-effort server-side invalidation */
    }
  }
}
