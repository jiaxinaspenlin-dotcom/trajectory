import type { Config } from "tailwindcss";

// Trajectory design system. A white page, confident type, generous space and one
// strong accent (cobalt) reserved for the next action, links and focus. Hierarchy
// comes from size, weight and space; borders, fills and badges are used sparingly.
// Token names are shared by every page, so changing them here restyles the product.
//
// Type scale (16px root): display 40/44 · page 30/36 · title 20/28 · section 17/24
// · body 15/24 · meta 13/20 · 2xs 11/16. Spacing follows the 4px grid.
//
// Motion (globals.css has the CSS variables; lib/motion.ts the hooks): fast 140ms
// for press and hover, base 200ms for state changes, slow 320ms for drawers and
// panels, reveal 480ms for content entering the viewport. Only transform and
// opacity animate; prefers-reduced-motion turns all of it into instant changes.
//
// Contrast on white (measured): ink 18.6 · soft 12.3 · muted 6.0 · faint 4.8 ·
// brand 6.6 (white on brand 6.6) · positive 5.4 · caution 5.4 · negative 6.6.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b1220",
          soft: "#273142",
          muted: "#5b6475",
          faint: "#6b7385",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f5f6f8",
          raised: "#ffffff",
        },
        canvas: "#ffffff",
        line: {
          DEFAULT: "#eaecf0",
          strong: "#d5d9e0",
        },
        brand: {
          DEFAULT: "#3047e8",
          soft: "#5468f0",
          deep: "#2236c4",
          wash: "#eef1fe",
        },
        // Trajectory's amber tip: used sparingly for "new"
        signal: { DEFAULT: "#e8950c", wash: "#fff6e5" },
        positive: { DEFAULT: "#0e7a4f", wash: "#ecfdf3" },
        caution: { DEFAULT: "#b54708", wash: "#fffaeb" },
        negative: { DEFAULT: "#b42318", wash: "#fef3f2" },
        neutral: { DEFAULT: "#475467", wash: "#f2f4f7" },
        bull: "#0e7a4f",
        bear: "#b54708",
        referee: "#3047e8",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        display: ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.03em", fontWeight: "650" }],
        page: ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.025em", fontWeight: "650" }],
        title: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        section: ["1.0625rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.5rem" }],
        meta: ["0.8125rem", { lineHeight: "1.25rem" }],
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04)",
        hover: "0 1px 2px rgba(16,24,40,0.04), 0 6px 16px -6px rgba(16,24,40,0.12)",
        focus: "0 1px 2px rgba(16,24,40,0.05), 0 0 0 1px rgba(48,71,232,0.2)",
        raised: "0 8px 24px -6px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.06)",
        overlay: "0 20px 48px -12px rgba(16,24,40,0.24), 0 4px 10px rgba(16,24,40,0.06)",
        hairline: "0 1px 0 #eaecf0",
      },
      borderRadius: {
        DEFAULT: "0.3125rem",
        md: "0.5rem",
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "200ms",
        slow: "320ms",
      },
    },
  },
  plugins: [],
};
export default config;
