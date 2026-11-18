import Link from "next/link";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";
import { ErrorPage } from "@/components/ErrorPage";

// Any URL that doesn't exist (and notFound() from a page).
export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
          <Link href="/" className="press flex items-center gap-2">
            <TrajectoryLogo size={22} />
            <span className="text-base font-semibold text-ink">Trajectory</span>
          </Link>
        </div>
      </header>
      <ErrorPage
        code="404"
        title="Page Not Found"
        body="The page you followed doesn't exist or has moved. Nothing was changed."
        action={<Link href="/" className="btn-primary">Back to Home</Link>}
      />
    </div>
  );
}
