"use client";

import { useEffect } from "react";
import { ErrorPage } from "@/components/ErrorPage";

// An unexpected error inside the investor workspace: the shell and nav stay.
export default function VcError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <ErrorPage
      code="Error"
      title="Something Went Wrong"
      body="This page hit an unexpected problem. Your data is safe; nothing was sent or saved. Try again, or use the navigation to keep working."
      action={<button className="btn-primary" onClick={reset}>Try Again</button>}
    />
  );
}
