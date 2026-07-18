import { WorkspaceNav } from "@/components/WorkspaceNav";

const FOUNDER_LINKS = [
  { href: "/founder", label: "Apply" },
  { href: "/founder/applications", label: "My applications" },
];

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceNav persona="Founder" homeHref="/founder" links={FOUNDER_LINKS} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
