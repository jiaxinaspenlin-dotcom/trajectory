import { WorkspaceNav } from "@/components/WorkspaceNav";

const VC_LINKS = [
  { href: "/vc", label: "Dashboard" },
  { href: "/vc/discovery", label: "Discovery" },
  { href: "/vc/thesis", label: "Thesis" },
];

// Login is disabled for now — the AuthGate wrapper was removed. The auth backend,
// lib, and AuthGate component remain in place; re-wrap with <AuthGate persona="VC">
// to turn login back on.
export default function VcLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceNav persona="VC" homeHref="/vc" links={VC_LINKS} />
      <main className="mx-auto w-full max-w-[1900px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}
