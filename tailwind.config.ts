import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0f",
          soft: "#12121a",
          card: "#1a1a26",
          elev: "#24243a",
        },
        brand: {
          DEFAULT: "#ffcc00",
          glow: "#ffd93d",
        },
        accent: {
          pink: "#ff2d95",
          cyan: "#00e5ff",
          violet: "#8a5cff",
        },
        rarity: {
          common: "#b0b0b0",
          uncommon: "#5ce1a7",
          rare: "#5ab0ff",
          epic: "#b86cff",
          legendary: "#ffb84d",
          mythic: "#ff4d6d",
        },
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(255, 204, 0, 0.45)",
        "glow-pink": "0 0 40px -8px rgba(255, 45, 149, 0.45)",
        "glow-cyan": "0 0 40px -8px rgba(0, 229, 255, 0.45)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.03)" },
        },
      },
      animation: {
        shimmer: "shimmer 3s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
