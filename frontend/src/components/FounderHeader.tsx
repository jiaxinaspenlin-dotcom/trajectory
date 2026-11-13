"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrajectoryLogo } from "./TrajectoryLogo";

const LINKS = [
  { href: "/founder", label: "Apply" },
  { href: "/founder/applications", label: "My applications" },
];

// Founder portal header: the same visual system as the investor workspace,
// pared down for applicants (two destinations, no investor tooling).
export function FounderHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <TrajectoryLogo size={20} />
          <span className="text-[14px] font-semibold text-ink">Trajectory</span>
          <span className="hidden text-[13px] text-ink-muted sm:inline">· Founder portal</span>
        </Link>
        <nav className="flex items-center gap-0.5" aria-label="Founder portal">
          {LINKS.map((l) => {
            const active = l.href === "/founder" ? pathname === "/founder" : pathname.startsWith("/founder/application");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${active ? "bg-brand-wash text-brand" : "text-ink-soft hover:bg-neutral-wash"}`}
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
