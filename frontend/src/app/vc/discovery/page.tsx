import { redirect } from "next/navigation";

// Discovery now lives inside Founders (sourcing drawer); keep old links working.
export default function DiscoveryRedirect() {
  redirect("/vc/founders?source=open");
}
