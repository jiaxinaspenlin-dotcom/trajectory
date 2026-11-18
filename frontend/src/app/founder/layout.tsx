import { FounderHeader } from "@/components/FounderHeader";

// Login is disabled for now — the AuthGate wrapper was removed. The auth backend,
// lib, and AuthGate component remain in place; re-wrap with <AuthGate persona="Founder">
// to turn login back on.
export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <FounderHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">{children}</main>
    </div>
  );
}
