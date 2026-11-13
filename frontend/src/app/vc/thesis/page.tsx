import { redirect } from "next/navigation";

// The thesis now lives on the Fund profile; keep old links working.
export default function ThesisRedirect() {
  redirect("/vc/fund");
}
