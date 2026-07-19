import { WorkspaceNav } from "@/components/WorkspaceNav";

const FOUNDER_LINKS = [
  { href: "/founder", label: "Apply" },
  { href: "/founder/applications", label: "My Applications" },
];

// Login is disabled for now — the AuthGate wrapper was removed. The auth backend,
// lib, and AuthGate component remain in place; re-wrap with <AuthGate persona="Founder">
// to turn login back on.
export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceNav persona="Founder" homeHref="/founder" links={FOUNDER_LINKS} />
      <main className="mx-auto w-full max-w-[1900px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}
