import type { Config } from "tailwindcss";

// Restrained, institutional design system: neutral slate base + semantic status.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f8fafc",
          raised: "#ffffff",
        },
        line: "#e2e8f0",
        brand: {
          DEFAULT: "#1e40af",
          soft: "#3b82f6",
          wash: "#eff6ff",
        },
        // semantic status
        positive: { DEFAULT: "#047857", wash: "#ecfdf5" },
        caution: { DEFAULT: "#b45309", wash: "#fffbeb" },
        negative: { DEFAULT: "#b91c1c", wash: "#fef2f2" },
        neutral: { DEFAULT: "#475569", wash: "#f1f5f9" },
        bull: "#047857",
        bear: "#b45309",
        referee: "#1e40af",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
        raised: "0 4px 12px rgba(15,23,42,0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
export default config;
