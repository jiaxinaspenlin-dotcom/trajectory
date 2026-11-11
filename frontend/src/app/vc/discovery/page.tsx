import { redirect } from "next/navigation";

// Discovery now lives inside Founders; keep old links working.
export default function DiscoveryRedirect() {
  redirect("/vc/founders");
}
