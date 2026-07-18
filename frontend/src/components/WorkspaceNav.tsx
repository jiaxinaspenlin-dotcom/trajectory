"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const tone = persona === "VC" ? "bg-brand text-white" : "bg-positive text-white";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={homeHref} className="flex items-center gap-2">
            <span className={`grid h-7 w-7 place-items-center rounded-md text-sm font-bold ${tone}`}>T</span>
            <span className="text-sm font-semibold text-ink">Trajectory</span>
          </Link>
          <span className={`chip ${persona === "VC" ? "bg-brand-wash text-brand" : "bg-positive-wash text-positive"}`}>
            {persona === "VC" ? "Investor Workspace" : "Founder Portal"}
          </span>
        </div>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {links.map((l) => {
            const active = l.href === homeHref ? pathname === homeHref : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand-wash text-brand" : "text-ink-soft hover:bg-surface-sunken"
                }`}
                aria-current={active ? "page" : undefined}
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
