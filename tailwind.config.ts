import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#5a8ef8",
          500: "#3568ee",
          600: "#1f4bd3",
          700: "#1a3aa8",
          800: "#1b3488",
          900: "#1c306b",
          950: "#132049",
        },
        // saffron from the NVS emblem (kept under the name "gold" used across the app)
        gold: {
          50: "#fff6ea",
          100: "#ffe4bf",
          400: "#f9a03f",
          500: "#f28a1a",
          600: "#d96a0b",
        },
        // green of the emblem's wheat leaves
        leaf: {
          50: "#eefaf0",
          100: "#d3f1d9",
          500: "#3a9a4b",
          600: "#2b7f3b",
          700: "#23662f",
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
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
