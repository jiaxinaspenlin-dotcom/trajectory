import { InvestorShell } from "@/components/InvestorShell";

// Login is disabled for now — the AuthGate wrapper was removed. The auth backend,
// lib, and AuthGate component remain in place; re-wrap with <AuthGate persona="VC">
// to turn login back on.
export default function VcLayout({ children }: { children: React.ReactNode }) {
  return <InvestorShell>{children}</InvestorShell>;
}
