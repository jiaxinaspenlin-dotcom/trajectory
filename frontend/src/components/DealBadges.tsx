import { humanStatus } from "@/lib/format";
import { Shortlist, SHORTLIST_LABEL, sourceLabel, stageTone } from "@/lib/pipeline";
import { Badge } from "./ui";

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={stageTone(stage)}>{humanStatus(stage)}</Badge>;
}

export function SourceBadge({ entryType }: { entryType: string }) {
  const tone = entryType === "inbound"
    ? "border border-positive/30 bg-positive-wash text-positive"
    : "border border-line bg-white text-ink-soft";
  return <Badge tone={tone}>{sourceLabel(entryType)}</Badge>;
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
