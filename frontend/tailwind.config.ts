import type { Config } from "tailwindcss";

// Trajectory design system: a light, restrained research-tool palette.
// Neutral slate ink on white, hairline dividers, one blue accent for actions and
// selection, and semantic colors reserved for status. Token names are shared by
// every page, so changing them here restyles the whole product.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b1220",
          soft: "#2b3648",
          muted: "#667085",
          faint: "#98a2b3",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f7f8fa",
          raised: "#ffffff",
        },
        canvas: "#fbfbfc",
        line: {
          DEFAULT: "#e6e8ec",
          strong: "#d0d5dd",
        },
        brand: {
          DEFAULT: "#1f4fd8",
          soft: "#3b6cf0",
          deep: "#163ca8",
          wash: "#eef3ff",
        },
        // Trajectory's amber tip — used sparingly for "new" and highlights
        signal: { DEFAULT: "#e8950c", wash: "#fff6e5" },
        // semantic status
        positive: { DEFAULT: "#067647", wash: "#ecfdf3" },
        caution: { DEFAULT: "#b54708", wash: "#fffaeb" },
        negative: { DEFAULT: "#b42318", wash: "#fef3f2" },
        neutral: { DEFAULT: "#475467", wash: "#f2f4f7" },
        bull: "#067647",
        bear: "#b54708",
        referee: "#1f4fd8",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04)",
        raised: "0 8px 24px -6px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.06)",
        overlay: "0 16px 40px -12px rgba(16,24,40,0.22), 0 4px 10px rgba(16,24,40,0.06)",
      },
      borderRadius: {
        DEFAULT: "0.3125rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.625rem",
      },
    },
  },
  plugins: [],
};
export default config;
