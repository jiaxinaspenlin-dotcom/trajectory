"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIndicator } from "@/lib/motion";
import { TrajectoryLogo } from "./TrajectoryLogo";

const LINKS = [
  { href: "/founder", label: "Apply" },
  { href: "/founder/applications", label: "My Applications" },
];

// Founder portal header: the same visual system as the investor workspace,
// pared down for applicants (two destinations, no investor tooling).
export function FounderHeader() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const box = useIndicator(nav, "a[aria-current='page']", [pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="press flex items-center gap-2">
          <TrajectoryLogo size={20} />
          <span className="text-[15px] font-semibold text-ink">Trajectory</span>
          <span className="hidden text-sm text-ink-muted sm:inline">· Founder Portal</span>
        </Link>
        <nav ref={nav} data-print-hide className="relative flex items-center gap-0.5" aria-label="Founder Portal">
          {box && <span aria-hidden className="absolute left-0 top-0 rounded-md bg-brand-wash transition-transform duration-slow ease-out"
            style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }} />}
          {LINKS.map((l) => {
            const active = l.href === "/founder" ? pathname === "/founder" : pathname.startsWith("/founder/application");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`press relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast ${active ? `text-brand ${box ? "" : "bg-brand-wash"}` : "text-ink-soft hover:bg-surface-sunken hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
