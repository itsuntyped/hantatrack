import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        bg: {
          base: "#0b0f14",
          panel: "#121821",
          muted: "#1a2230",
        },
        fg: {
          default: "#e5e7eb",
          muted: "#94a3b8",
          subtle: "#64748b",
        },
        status: {
          confirmed: "#ef4444",
          probable: "#f59e0b",
          suspected: "#eab308",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee: "marquee 240s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
