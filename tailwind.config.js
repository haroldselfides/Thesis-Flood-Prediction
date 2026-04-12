/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Flood hazard levels
        hazard: {
          very_low: "#2ecc71",
          low: "#f1c40f",
          moderate: "#e67e22",
          high: "#e74c3c",
          very_high: "#8e44ad",
        },
        // App brand palette — inspired by Mayon/water
        brand: {
          50: "#eef6fc",
          100: "#d4eaf7",
          200: "#a9d5ef",
          300: "#6db8e3",
          400: "#3a9ad4",
          500: "#1a7bb8",
          600: "#0f6298",
          700: "#0d4f7a",
          800: "#0e4165",
          900: "#0b3354",
          950: "#072138",
        },
        surface: {
          0: "#ffffff",
          1: "#f8fafb",
          2: "#f0f4f7",
          3: "#e2e8ed",
        },
      },
      fontFamily: {
        display: ['"DM Sans"', "system-ui", "sans-serif"],
        body: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
