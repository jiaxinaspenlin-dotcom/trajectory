import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no runtime request to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Trajectory — Venture research & deal workflow",
  description:
    "Source founders from public evidence, screen and diligence deals, and record investor decisions. Humans approve every consequential action.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Persona layouts (/vc, /founder) provide their own navigation; the root is bare.
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
