"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Account, getSession, logout } from "@/lib/auth";
import { TrajectoryLogo } from "./TrajectoryLogo";
import { CloseIcon, DashboardIcon, FoundersIcon, FundIcon, MapIcon, MenuIcon, PipelineIcon } from "./icons";

export const INVESTOR_NAV = [
  { href: "/vc/map", label: "Map", icon: MapIcon },
  { href: "/vc", label: "Dashboard", icon: DashboardIcon },
  { href: "/vc/founders", label: "Founders", icon: FoundersIcon },
  { href: "/vc/pipeline", label: "Pipeline", icon: PipelineIcon },
  { href: "/vc/fund", label: "Fund", icon: FundIcon, also: ["/vc/thesis"] },
];

export function isNavActive(pathname: string, item: { href: string; also?: string[] }): boolean {
  if (item.href === "/vc") return pathname === "/vc";
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {INVESTOR_NAV.map((item) => {
        const active = isNavActive(pathname, item);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                active ? "bg-brand-wash text-brand" : "text-ink-soft hover:bg-neutral-wash hover:text-ink"
              }`}
            >
              <Icon className={active ? "text-brand" : "text-ink-muted"} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RailFooter({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => { setAccount(getSession("investor")?.account ?? null); }, []);
  return (
    <div className="space-y-0.5 border-t border-line pt-3 text-xs">
      <Link href="/founder" onClick={onNavigate} className="flex h-7 items-center rounded-md px-2.5 text-ink-muted hover:bg-neutral-wash hover:text-ink">
        Founder portal
      </Link>
      <Link href="/" onClick={onNavigate} className="flex h-7 items-center rounded-md px-2.5 text-ink-muted hover:bg-neutral-wash hover:text-ink">
        About Trajectory
      </Link>
      {account && (
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <span className="truncate text-ink-muted" title={account.email}>{account.display_name}</span>
          <button className="btn-ghost btn-sm" onClick={async () => { await logout("investor"); router.replace("/"); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function InvestorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/vc/map";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // close the phone menu on navigation and on Escape
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-[100dvh] lg:flex">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-52 shrink-0 flex-col border-r border-line bg-white px-3 py-3 lg:flex">
        <Link href="/vc" className="mb-4 flex h-8 items-center gap-2 px-1.5">
          <TrajectoryLogo size={20} />
          <span className="text-[14px] font-semibold text-ink">Trajectory</span>
        </Link>
        <nav aria-label="Investor workspace" className="flex-1">
          <NavLinks pathname={pathname} />
        </nav>
        <RailFooter />
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-white px-3 lg:hidden">
        <Link href="/vc" className="flex items-center gap-2">
          <TrajectoryLogo size={20} />
          <span className="text-[14px] font-semibold text-ink">Trajectory</span>
        </Link>
        <button
          ref={menuButton}
          type="button"
          className="icon-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="investor-mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 top-12 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/20" onClick={() => setMenuOpen(false)} aria-hidden />
          <nav id="investor-mobile-nav" aria-label="Investor workspace" className="relative w-64 border-r border-line bg-white p-3 shadow-overlay">
            <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-4"><RailFooter onNavigate={() => setMenuOpen(false)} /></div>
          </nav>
        </div>
      )}

      <main className={fullBleed ? "relative h-[calc(100dvh-3rem)] min-w-0 flex-1 lg:h-[100dvh]" : "min-w-0 flex-1"}>
        {fullBleed ? children : <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>}
      </main>
    </div>
  );
}
