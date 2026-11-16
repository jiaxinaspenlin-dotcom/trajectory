"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Account, getSession, logout } from "@/lib/auth";
import { ToastProvider } from "./Toast";
import { TrajectoryLogo } from "./TrajectoryLogo";
import { CloseIcon, DashboardIcon, FoundersIcon, FundIcon, MapIcon, MenuIcon, PipelineIcon } from "./icons";

export const INVESTOR_NAV = [
  // Dashboard is the investor landing page (/vc), so it leads the rail
  { href: "/vc", label: "Dashboard", icon: DashboardIcon },
  { href: "/vc/map", label: "Map", icon: MapIcon },
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
    <ul className="space-y-1">
      {INVESTOR_NAV.map((item) => {
        const active = isNavActive(pathname, item);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors ${
                active ? "bg-neutral-wash text-ink" : "text-ink-soft hover:bg-neutral-wash/70 hover:text-ink"
              }`}
            >
              {/* blue is kept for actions; the current page is marked in ink */}
              <Icon size={18} className={active ? "text-ink" : "text-ink-muted"} />
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
    <div className="space-y-0.5 border-t border-line pt-3 text-sm">
      <Link href="/founder" onClick={onNavigate} className="flex h-9 items-center rounded-md px-3 text-ink-muted hover:bg-neutral-wash hover:text-ink">
        Founder portal
      </Link>
      <Link href="/" onClick={onNavigate} className="flex h-9 items-center rounded-md px-3 text-ink-muted hover:bg-neutral-wash hover:text-ink">
        About Trajectory
      </Link>
      {account && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
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
    <ToastProvider>
    <div className="min-h-[100dvh] lg:flex">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-56 shrink-0 flex-col border-r border-line bg-white px-3 py-4 lg:flex">
        <Link href="/vc" className="mb-5 flex h-10 items-center gap-2.5 px-3">
          <TrajectoryLogo size={22} />
          <span className="text-base font-semibold text-ink">Trajectory</span>
        </Link>
        <nav aria-label="Investor workspace" className="flex-1" data-tour="nav">
          <NavLinks pathname={pathname} />
        </nav>
        <RailFooter />
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Link href="/vc" className="flex items-center gap-2">
          <TrajectoryLogo size={22} />
          <span className="text-base font-semibold text-ink">Trajectory</span>
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
        <div className="fixed inset-0 top-14 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/20" onClick={() => setMenuOpen(false)} aria-hidden />
          <nav id="investor-mobile-nav" aria-label="Investor workspace" className="relative w-64 border-r border-line bg-white p-3 shadow-overlay">
            <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-4"><RailFooter onNavigate={() => setMenuOpen(false)} /></div>
          </nav>
        </div>
      )}

      <main className={fullBleed ? "relative h-[calc(100dvh-3.5rem)] min-w-0 flex-1 lg:h-[100dvh]" : "min-w-0 flex-1"}>
        {/* 24–32px padding beside the rail; wide pages use the width up to a generous cap */}
        {fullBleed ? children : <div className="w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>}
      </main>
    </div>
    </ToastProvider>
  );
}
