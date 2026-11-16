import { humanStatus } from "@/lib/format";
import { Shortlist, SHORTLIST_LABEL, sourceLabel, stageDot } from "@/lib/pipeline";
import { Badge } from "./ui";

// Shared stage: an outlined pill with the stage's dot, so it never competes with
// action buttons and stays distinct from the filled personal shortlist badge.
export function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge tone="border border-line-strong bg-white text-ink-soft">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${stageDot(stage)}`} />
      {humanStatus(stage)}
    </Badge>
  );
}

// Where the opportunity came from: quiet text, not a status.
export function SourceBadge({ entryType }: { entryType: string }) {
  return <Badge tone="bg-neutral-wash text-ink-muted">{sourceLabel(entryType)}</Badge>;
}

export function ProspectStatusBadge({ status }: { status: string }) {
  const tone = status === "saved" || status === "monitoring"
    ? "bg-positive-wash text-positive"
    : status === "dismissed"
    ? "bg-negative-wash text-negative"
    : "bg-neutral-wash text-neutral";
  return <Badge tone={tone}>{humanStatus(status)}</Badge>;
}

// Personal shortlist (this browser), never confused with the shared stage.
export function ShortlistBadge({ shortlist }: { shortlist: Shortlist }) {
  const tone = shortlist === "dismissed" ? "bg-negative-wash text-negative" : "bg-positive-wash text-positive";
  return <Badge tone={tone} title="Your shortlist (this browser)">{SHORTLIST_LABEL[shortlist]}</Badge>;
}
