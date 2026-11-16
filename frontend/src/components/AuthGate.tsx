"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { fetchMe, getSession, login, personaRole, Persona, signup } from "@/lib/auth";
import { Spinner } from "@/components/ui";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";

type Status = "loading" | "authed" | "anon";

// Gates a persona's workspace behind login/signup. Renders the children only
// when a valid session for the matching role exists; otherwise shows the form.
export function AuthGate({ persona, children }: { persona: Persona; children: React.ReactNode }) {
  const role = personaRole(persona);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const s = getSession(role);
    if (!s) {
      setStatus("anon");
      return;
    }
    // optimistic: show the workspace, then confirm the token is still valid
    setStatus("authed");
    fetchMe(role).then((acct) => {
      if (!acct || acct.role !== role) setStatus("anon");
    });
  }, [role]);

  if (status === "loading") return <div className="grid min-h-screen place-items-center"><Spinner label="Loading…" /></div>;
  if (status === "anon") return <AuthForm persona={persona} onAuthed={() => setStatus("authed")} />;
  return <>{children}</>;
}

function AuthForm({ persona, onAuthed }: { persona: Persona; onAuthed: () => void }) {
  const role = personaRole(persona);
  const isVC = persona === "VC";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = isVC ? "text-brand" : "text-positive";
  const chip = isVC ? "bg-brand-wash text-brand" : "bg-positive-wash text-positive";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signup(email.trim(), password, name.trim(), role);
      else await login(email.trim(), password, role);
      onAuthed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <TrajectoryLogo size={20} />
            Trajectory
          </Link>
          <div className="mt-2 flex justify-center">
            <span className={`chip ${chip}`}>{isVC ? "Investor Workspace" : "Founder Portal"}</span>
          </div>
          <h1 className="mt-3 text-xl font-semibold text-ink">
            {mode === "login" ? "Sign In" : "Create Your Account"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isVC ? "Access your fund's pipeline, discovery, and decisions." : "Apply to the fund and track your applications."}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-3 p-5">
          {mode === "signup" && (
            <label className="block">
              <span className="label">Name</span>
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isVC ? "Your name" : "Founder name"}
                required
              />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </label>

          {error && <p className="text-sm text-negative">{error}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            className={`font-medium ${accent}`}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
          >
            {mode === "login" ? "Create an Account" : "Sign In"}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-ink-muted">
          <Link href="/" className="hover:text-ink-soft">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
