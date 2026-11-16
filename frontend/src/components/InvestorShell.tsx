"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Account, getSession, logout } from "@/lib/auth";
import { useIndicator, usePresence } from "@/lib/motion";
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
  const ref = useRef<HTMLUListElement>(null);
  // the current page's highlight slides between items
  const box = useIndicator(ref, "a[aria-current='page']", [pathname]);
  return (
    <ul ref={ref} className="relative space-y-0.5">
      {box && (
        <li aria-hidden className="pointer-events-none absolute left-0 top-0 w-full rounded-md bg-neutral-wash transition-transform duration-slow ease-out"
          style={{ height: box.h, transform: `translateY(${box.y}px)` }} />
      )}
      {INVESTOR_NAV.map((item) => {
        const active = isNavActive(pathname, item);
        const Icon = item.icon;
        return (
          <li key={item.href} className="relative">
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`press group flex h-10 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-fast ${
                active ? `text-ink ${box ? "" : "bg-neutral-wash"}` : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              {/* blue is kept for actions; the current page is marked in ink */}
              <Icon size={18} className={`transition-transform duration-base ease-out group-hover:scale-110 ${active ? "text-brand" : "text-ink-faint group-hover:text-ink-soft"}`} />
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
      <Link href="/founder" onClick={onNavigate} className="press flex h-9 items-center rounded-md px-3 text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink">
        Founder Portal
      </Link>
      <Link href="/" onClick={onNavigate} className="press flex h-9 items-center rounded-md px-3 text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink">
        About Trajectory
      </Link>
      {account && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="truncate text-ink-muted" title={account.email}>{account.display_name}</span>
          <button className="btn-ghost btn-sm" onClick={async () => { await logout("investor"); router.replace("/"); }}>Sign Out</button>
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
  const menu = usePresence(menuOpen, 220);

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
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5 lg:flex">
        <Link href="/vc" className="press mb-6 flex h-10 items-center gap-2.5 px-3">
          <TrajectoryLogo size={22} />
          <span className="text-base font-semibold text-ink">Trajectory</span>
        </Link>
        <nav aria-label="Investor Workspace" className="flex-1" data-tour="nav">
          <NavLinks pathname={pathname} />
        </nav>
        <RailFooter />
      </aside>

      {/* phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/vc" className="flex items-center gap-2">
          <TrajectoryLogo size={22} />
          <span className="text-base font-semibold text-ink">Trajectory</span>
        </Link>
        <button
          ref={menuButton}
          type="button"
          className="icon-btn"
          aria-label={menuOpen ? "Close Menu" : "Open Menu"}
          aria-expanded={menuOpen}
          aria-controls="investor-mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </header>
      {menu.mounted && (
        <div className="fixed inset-0 top-14 z-40 lg:hidden">
          <div className={`absolute inset-0 bg-ink/25 scrim-${menu.state}`} onClick={() => setMenuOpen(false)} aria-hidden />
          <nav id="investor-mobile-nav" aria-label="Investor Workspace" className={`rail-${menu.state} relative h-full w-72 max-w-[85vw] bg-white p-3 shadow-overlay`}>
            <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-4"><RailFooter onNavigate={() => setMenuOpen(false)} /></div>
          </nav>
        </div>
      )}

      {/* --sticky-top: where sticky table headers stop, under the condensed page header */}
      <main className={fullBleed ? "relative h-[calc(100dvh-3.5rem)] min-w-0 flex-1 lg:h-[100dvh]" : "min-w-0 flex-1 [--sticky-top:7rem] lg:[--sticky-top:3.5rem]"}>
        {/* generous space beside the rail; reading width capped so lines stay comfortable */}
        {fullBleed ? children : <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</div>}
      </main>
    </div>
    </ToastProvider>
  );
}
