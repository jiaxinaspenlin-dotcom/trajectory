import { WorkspaceNav } from "@/components/WorkspaceNav";

const FOUNDER_LINKS = [
  { href: "/founder", label: "My applications" },
  { href: "/founder/apply", label: "Apply" },
];

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceNav
        persona="Founder"
        homeHref="/founder"
        links={FOUNDER_LINKS}
        switchHref="/"
        switchLabel="Switch role"
      />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
