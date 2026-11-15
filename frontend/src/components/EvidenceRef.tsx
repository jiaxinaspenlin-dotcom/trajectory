"use client";

import { createContext, useContext } from "react";
import Link from "next/link";

// Where an evidence citation (E123) should point. Inside an opportunity record
// the provider links each citation to that exact entry in the Evidence tab;
// elsewhere (e.g. the printable memo) citations stay plain labels.
const EvidenceHref = createContext<((id: number) => string) | null>(null);

export function EvidenceLinkProvider({ href, children }: { href: (id: number) => string; children: React.ReactNode }) {
  return <EvidenceHref.Provider value={href}>{children}</EvidenceHref.Provider>;
}

export function EvidenceRef({ id }: { id: number }) {
  const href = useContext(EvidenceHref);
  const cls = "mr-1 inline-block rounded bg-surface-sunken px-1 font-mono text-xs";
  if (!href) return <span className={cls}>E{id}</span>;
  return (
    <Link href={href(id)} scroll={false} className={`${cls} text-brand hover:bg-brand-wash hover:underline`} title={`Open evidence E${id}`} aria-label={`Evidence E${id}`}>
      E{id}
    </Link>
  );
}
