import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trajectory — VC Intelligence",
  description:
    "AI venture-capital operating system: Sourcing → Screening → Diligence → Decision. Humans approve all consequential actions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Persona layouts (/vc, /founder) provide their own navigation; the root is bare.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
