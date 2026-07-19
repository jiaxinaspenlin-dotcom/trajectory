// Trajectory brand mark, coded as SVG (not an image): an upward zig-zag
// trajectory line with rounded caps and an amber dot at the leading tip.
export function TrajectoryLogo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Trajectory"
      className={className}
    >
      <polyline
        points="3.4,18 9,10.6 12.6,13.1 17.6,6.6"
        fill="none"
        stroke="#1f2937"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20.8" cy="3.7" r="2.05" fill="#f5a623" />
    </svg>
  );
}
