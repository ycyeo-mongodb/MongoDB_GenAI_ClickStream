import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mongo: {
          green: "#00684A",
          "green-dark": "#004D36",
          "green-light": "#00ED64",
          "green-tint": "#E3FCF7",
          slate: "#1A1A2E",
        },
      },
      animation: {
        "slide-in": "slideIn 0.4s ease-out",
        "pulse-glow": "pulseGlow 2s infinite",
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(0, 104, 74, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(0, 104, 74, 0.6)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
