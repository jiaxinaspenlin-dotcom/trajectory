// Presentation helpers: label -> semantic color, formatting.

export function labelTone(label: string): string {
  switch (label) {
    case "Strong":
      return "bg-positive-wash text-positive";
    case "Promising":
      return "bg-brand-wash text-brand";
    case "Mixed":
      return "bg-caution-wash text-caution";
    case "Weak":
      return "bg-negative-wash text-negative";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function verificationTone(status: string): string {
  switch (status) {
    case "verified":
      return "bg-positive-wash text-positive";
    case "partially_verified":
      return "bg-brand-wash text-brand";
    case "founder_reported":
      return "bg-caution-wash text-caution";
    case "contradicted":
      return "bg-negative-wash text-negative";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function trajectoryTone(t: string): string {
  switch (t) {
    case "accelerating":
      return "bg-positive-wash text-positive";
    case "improving":
      return "bg-brand-wash text-brand";
    case "declining":
      return "bg-negative-wash text-negative";
    case "stable":
      return "bg-neutral-wash text-neutral";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function humanStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function scoreTone(score: number): string {
  if (score >= 70) return "text-positive";
  if (score >= 50) return "text-brand";
  if (score >= 35) return "text-caution";
  return "text-negative";
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
