/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./web/**/*.ts", "./web/index.html"],
  theme: {
    extend: {
      colors: {
        "ob-bg":      "var(--ob-bg)",
        "ob-bg2":     "var(--ob-bg2)",
        "ob-bg3":     "var(--ob-bg3)",
        "ob-surface": "var(--ob-surface)",
        "ob-border":  "var(--ob-border)",
        "ob-text":    "var(--ob-text)",
        "ob-muted":   "var(--ob-muted)",
        "ob-accent":  "var(--ob-accent)",
        "ob-accent2": "var(--ob-accent2)",
        "ob-green":   "var(--ob-green)",
        "ob-red":     "var(--ob-red)",
        "ob-yellow":  "var(--ob-yellow)",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
