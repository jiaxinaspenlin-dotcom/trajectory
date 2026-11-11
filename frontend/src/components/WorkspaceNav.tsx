"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Account, getSession, logout, personaRole } from "@/lib/auth";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";

export interface NavLink {
  href: string;
  label: string;
}

export function WorkspaceNav({
  persona,
  homeHref,
  links,
}: {
  persona: "VC" | "Founder";
  homeHref: string;
  links: NavLink[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const role = personaRole(persona);
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => { setAccount(getSession(role)?.account ?? null); }, [role]);

  async function signOut() {
    await logout(role);
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1900px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-3">
          <Link href={homeHref} className="flex items-center gap-2">
            <TrajectoryLogo size={22} />
            <span className="text-sm font-semibold text-ink">Trajectory</span>
          </Link>
          <span className={`chip hidden sm:inline-flex ${persona === "VC" ? "bg-brand-wash text-brand" : "bg-positive-wash text-positive"}`}>
            {persona === "VC" ? "Investor Workspace" : "Founder Portal"}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {/* scrolls sideways on narrow screens instead of widening the page */}
          <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1" aria-label="Primary">
            {links.map((l) => {
              const active = l.href === homeHref ? pathname === homeHref : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-brand-wash text-brand" : "text-ink-soft hover:bg-surface-sunken"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          {account && (
            <div className="flex items-center gap-2 border-l border-line pl-3">
              <span className="hidden text-xs text-ink-muted sm:inline" title={account.email}>{account.display_name}</span>
              <button className="btn-ghost text-xs" onClick={signOut}>Sign Out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
