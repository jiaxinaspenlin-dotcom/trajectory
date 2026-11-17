"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { CompassIcon } from "./icons";

// The shape shared by the 404 and error pages: what happened in one sentence,
// one way forward, and quiet links to the two front doors.
export function ErrorPage({ code, title, body, action }: { code: string; title: string; body: string; action: ReactNode }) {
  return (
    <div className="animate-rise mx-auto flex max-w-xl flex-col items-start px-5 py-20 sm:py-28">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-wash text-brand"><CompassIcon size={22} /></span>
      <p className="num mt-6 font-mono text-meta text-ink-faint">{code}</p>
      <h1 className="mt-1 text-[2rem] font-[650] leading-tight tracking-[-0.03em] text-ink sm:text-display">{title}</h1>
      <p className="mt-3 text-body leading-7 text-ink-muted">{body}</p>
      <div className="mt-8 flex flex-wrap items-center gap-3">{action}</div>
      <p className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/vc" className="link">Investor Workspace</Link>
        <Link href="/founder" className="link">Founder Portal</Link>
      </p>
    </div>
  );
}
