import { WorkspaceNav } from "@/components/WorkspaceNav";

const VC_LINKS = [
  { href: "/vc", label: "Dashboard" },
  { href: "/vc/discovery", label: "Discovery" },
  { href: "/vc/thesis", label: "Thesis" },
  { href: "/vc/settings", label: "Settings" },
];

export default function VcLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceNav
        persona="VC"
        homeHref="/vc"
        links={VC_LINKS}
        switchHref="/"
        switchLabel="Switch role"
      />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
