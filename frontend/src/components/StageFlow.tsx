"use client";

import Link from "next/link";
import { stageDot } from "@/lib/pipeline";
import { useSeen } from "@/lib/motion";

const STAGES = ["sourcing", "screening", "diligence", "decision"] as const;

// The four stages as one connected bar, each segment as wide as its share. Used
// on the Dashboard and above the Pipeline board, so the two read as one system.
// Each segment fills in the first time it's seen; hovering one dims the others.
export function StageFlow({ counts, hover = null, onHover, hrefFor, thin = false }: {
  counts: Record<string, number>;
  hover?: string | null;
  onHover?: (stage: string | null) => void;
  hrefFor?: (stage: string) => string;
  thin?: boolean;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const total = STAGES.reduce((a, s) => a + (counts[s] || 0), 0) || 1;
  return (
    <div ref={ref} className={`flex w-full gap-1 overflow-hidden rounded-full ${thin ? "h-1.5" : "h-3"}`} aria-hidden data-testid="stage-flow">
      {STAGES.map((s, i) => {
        const n = counts[s] || 0;
        if (!n) return null;
        const cls = `h-full origin-left rounded-full transition-[transform,opacity] duration-[500ms] ease-out ${stageDot(s)} ${hover && hover !== s ? "opacity-35" : ""}`;
        const style = { flexGrow: n / total, transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: seen ? `${i * 90}ms` : "0ms" };
        return hrefFor
          ? <Link key={s} href={hrefFor(s)} tabIndex={-1} onMouseEnter={() => onHover?.(s)} className={cls} style={style} />
          : <span key={s} onMouseEnter={() => onHover?.(s)} className={cls} style={style} />;
      })}
    </div>
  );
}
