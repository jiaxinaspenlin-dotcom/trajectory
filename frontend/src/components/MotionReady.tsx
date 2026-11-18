"use client";

import { useEffect } from "react";
import { markHydrated } from "@/lib/motion";

// Switches entrance motion on once the first page has hydrated. Rendered after the
// page in the root layout, so its effect runs after every page component's.
export function MotionReady() {
  useEffect(() => { markHydrated(); }, []);
  return null;
}
