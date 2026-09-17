/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3eee4",
        card: "#fffaf2",
        ink: "#2a241c",
        mute: "#7a7064",
        clay: "#b85c38",
        "clay-dark": "#8f4226",
        olive: "#6b7c5a",
        chip: "#efe4d4",
        line: "#e4d8c6",
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', "system-ui", "sans-serif"],
        serif: ['"Noto Serif SC"', "serif"],
      },
      boxShadow: {
        card: "0 10px 30px -18px rgba(90, 50, 20, 0.35)",
      },
    },
  },
  plugins: [],
};
