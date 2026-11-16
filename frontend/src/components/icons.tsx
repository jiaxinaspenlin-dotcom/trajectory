// Small inline icon set (1.5px stroke, 16px grid) so the app needs no icon dependency.

type IconProps = { className?: string; size?: number };

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}
    >
      {children}
    </svg>
  );
}

export const MapIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="4" cy="4.5" r="1.8" /><circle cx="12" cy="4" r="1.8" /><circle cx="8" cy="12" r="1.8" /><path d="M5.6 5.4 7 10.4M10.4 5 8.9 10.4M5.8 4.4h4.4" /></Svg>
);
export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="2" width="5" height="6" rx="1" /><rect x="9" y="2" width="5" height="3.5" rx="1" /><rect x="9" y="7.5" width="5" height="6.5" rx="1" /><rect x="2" y="10" width="5" height="4" rx="1" /></Svg>
);
export const FoundersIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="6" cy="5" r="2.5" /><path d="M1.8 13.5c.6-2.4 2.2-3.6 4.2-3.6s3.6 1.2 4.2 3.6" /><path d="M10.8 3a2.3 2.3 0 0 1 0 4.2M12.2 10.2c1 .5 1.7 1.6 2 3.3" /></Svg>
);
export const PipelineIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="2.5" width="3" height="11" rx="0.8" /><rect x="6.5" y="2.5" width="3" height="7.5" rx="0.8" /><rect x="11" y="2.5" width="3" height="4.5" rx="0.8" /></Svg>
);
export const FundIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 1.8 13.5 4v3.6c0 3.2-2.3 5.6-5.5 6.6-3.2-1-5.5-3.4-5.5-6.6V4L8 1.8Z" /><path d="M5.6 8.1 7.3 9.8l3.2-3.4" /></Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.3" /><path d="m10.3 10.3 3.4 3.4" /></Svg>
);
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></Svg>;
export const MenuIcon = (p: IconProps) => <Svg {...p}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>;
export const MinusIcon = (p: IconProps) => <Svg {...p}><path d="M3 8h10" /></Svg>;
export const ResetIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" /><path d="M2.6 2.6v2.8h2.8" /></Svg>
);
export const FilterIcon = (p: IconProps) => <Svg {...p}><path d="M2 3.5h12M4.5 8h7M7 12.5h2" /></Svg>;
export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 4h6M11.5 4h2M2.5 8h2M7.5 8h6M2.5 12h7M12.5 12h1" /><circle cx="10" cy="4" r="1.4" /><circle cx="6" cy="8" r="1.4" /><circle cx="11" cy="12" r="1.4" /></Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.6" cy="4" r=".6" fill="currentColor" /><circle cx="2.6" cy="8" r=".6" fill="currentColor" /><circle cx="2.6" cy="12" r=".6" fill="currentColor" /></Svg>
);
export const TableIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="2.5" width="12" height="11" rx="1" /><path d="M2 6h12M2 9.5h12M6.5 6v7.5" /></Svg>
);
export const ArrowRightIcon = (p: IconProps) => <Svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></Svg>;
export const ExternalIcon = (p: IconProps) => <Svg {...p}><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V4.8c0-.4.4-.8.8-.8h3.2" /></Svg>;
export const SortIcon = ({ dir, ...p }: IconProps & { dir: "asc" | "desc" | null }) => (
  <Svg {...p} size={p.size ?? 12}>
    <path d="M5 6.5 8 3.5l3 3" opacity={dir === "asc" ? 1 : 0.3} />
    <path d="M5 9.5 8 12.5l3-3" opacity={dir === "desc" ? 1 : 0.3} />
  </Svg>
);
export const SparkIcon = (p: IconProps) => <Svg {...p}><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2" /></Svg>;
export const LinkIcon = (p: IconProps) => <Svg {...p}><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.8-.8" /></Svg>;
export const ChevronDownIcon = (p: IconProps) => <Svg {...p}><path d="m4 6 4 4 4-4" /></Svg>;
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="3.5" cy="8" r="1.15" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1.15" fill="currentColor" stroke="none" /></Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>
);
export const InboxIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 9.5 3.6 3.2A1 1 0 0 1 4.6 2.5h6.8a1 1 0 0 1 1 .7L14 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5Z" /><path d="M2 9.5h3.5l1 1.5h3l1-1.5H14" /></Svg>
);
export const DocumentIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 1.8h5.2L12.5 5v8.2a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1Z" /><path d="M9 2v3.2h3.3M5.5 8.5h5M5.5 11h3.5" /></Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.8v3.8M8 11h.01" /></Svg>
);
export const CompassIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="6.2" /><path d="m10.6 5.4-1.6 3.6-3.6 1.6 1.6-3.6 3.6-1.6Z" /></Svg>
);
