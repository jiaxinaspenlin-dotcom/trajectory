// Remounts on every navigation inside /vc, so each page arrives with a short
// fade-and-rise instead of a hard cut (instant under reduced motion).
export default function VcTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page h-full">{children}</div>;
}
