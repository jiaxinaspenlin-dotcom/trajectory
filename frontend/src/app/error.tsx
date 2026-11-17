"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";
import { ErrorPage } from "@/components/ErrorPage";

// An unexpected error outside the investor workspace (landing, founder portal).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="min-h-[100dvh] bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
          <Link href="/" className="press flex items-center gap-2">
            <TrajectoryLogo size={22} />
            <span className="text-base font-semibold text-ink">Trajectory</span>
          </Link>
        </div>
      </header>
      <ErrorPage
        code="Error"
        title="Something Went Wrong"
        body="This page hit an unexpected problem. Your data is safe; nothing was sent or saved. Try again, or go back home."
        action={<button className="btn-primary" onClick={reset}>Try Again</button>}
      />
    </div>
  );
}
