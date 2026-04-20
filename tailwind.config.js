/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./web/**/*.ts", "./web/index.html"],
  theme: {
    extend: {
      colors: {
        "ob-bg":      "#1e1e1e",
        "ob-bg2":     "#161616",
        "ob-bg3":     "#111111",
        "ob-surface": "#2a2a2a",
        "ob-border":  "#383838",
        "ob-text":    "#dcddde",
        "ob-muted":   "#888888",
        "ob-accent":  "#a78bfa",
        "ob-accent2": "#7c3aed",
        "ob-green":   "#6eb26e",
        "ob-red":     "#e06c75",
        "ob-yellow":  "#e5c07b",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
