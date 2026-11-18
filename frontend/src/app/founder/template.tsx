// Each founder portal page arrives with a short fade-and-rise.
export default function FounderTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
