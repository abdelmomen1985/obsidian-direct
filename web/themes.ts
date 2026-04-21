interface Theme {
  name: string;
  label: string;
  vars: Record<string, string>;
}

const themes: Theme[] = [
  {
    name: "obsidian",
    label: "Obsidian Dark",
    vars: {
      "--ob-bg":      "oklch(0.145 0 0)",
      "--ob-bg2":     "oklch(0.205 0 0)",
      "--ob-bg3":     "oklch(0.10 0 0)",
      "--ob-surface": "oklch(0.269 0 0)",
      "--ob-border":  "oklch(0.30 0 0)",
      "--ob-text":    "oklch(0.985 0 0)",
      "--ob-muted":   "oklch(0.708 0 0)",
      "--ob-accent":  "oklch(0.65 0.18 264)",
      "--ob-accent2": "oklch(0.55 0.18 264)",
      "--ob-green":   "oklch(0.627 0.194 153)",
      "--ob-red":     "oklch(0.637 0.237 25)",
      "--ob-yellow":  "oklch(0.769 0.147 84)",
    },
  },
  {
    name: "light",
    label: "Light",
    vars: {
      "--ob-bg":      "oklch(1 0 0)",
      "--ob-bg2":     "oklch(0.97 0 0)",
      "--ob-bg3":     "oklch(0.94 0 0)",
      "--ob-surface": "oklch(0.91 0 0)",
      "--ob-border":  "oklch(0.85 0 0)",
      "--ob-text":    "oklch(0.145 0 0)",
      "--ob-muted":   "oklch(0.45 0 0)",
      "--ob-accent":  "oklch(0.488 0.243 264)",
      "--ob-accent2": "oklch(0.38 0.243 264)",
      "--ob-green":   "oklch(0.47 0.15 153)",
      "--ob-red":     "oklch(0.57 0.245 27)",
      "--ob-yellow":  "oklch(0.55 0.15 84)",
    },
  },
  {
    name: "midnight",
    label: "Midnight Blue",
    vars: {
      "--ob-bg":      "oklch(0.12 0.04 240)",
      "--ob-bg2":     "oklch(0.18 0.04 240)",
      "--ob-bg3":     "oklch(0.08 0.03 240)",
      "--ob-surface": "oklch(0.24 0.04 240)",
      "--ob-border":  "oklch(0.28 0.04 240)",
      "--ob-text":    "oklch(0.94 0.01 240)",
      "--ob-muted":   "oklch(0.65 0.02 240)",
      "--ob-accent":  "oklch(0.65 0.18 240)",
      "--ob-accent2": "oklch(0.55 0.18 240)",
      "--ob-green":   "oklch(0.627 0.194 153)",
      "--ob-red":     "oklch(0.637 0.237 25)",
      "--ob-yellow":  "oklch(0.769 0.147 84)",
    },
  },
  {
    name: "forest",
    label: "Forest",
    vars: {
      "--ob-bg":      "oklch(0.14 0.02 150)",
      "--ob-bg2":     "oklch(0.20 0.025 150)",
      "--ob-bg3":     "oklch(0.10 0.015 150)",
      "--ob-surface": "oklch(0.26 0.03 150)",
      "--ob-border":  "oklch(0.30 0.03 150)",
      "--ob-text":    "oklch(0.94 0.01 150)",
      "--ob-muted":   "oklch(0.65 0.02 150)",
      "--ob-accent":  "oklch(0.65 0.18 150)",
      "--ob-accent2": "oklch(0.55 0.18 150)",
      "--ob-green":   "oklch(0.70 0.22 153)",
      "--ob-red":     "oklch(0.637 0.237 25)",
      "--ob-yellow":  "oklch(0.769 0.147 84)",
    },
  },
];

const STORAGE_KEY = "obsidian-direct-theme";

class ThemeManager {
  private current: string;

  constructor() {
    this.current = localStorage.getItem(STORAGE_KEY) ?? "obsidian";
    this.apply(this.current);
  }

  apply(name: string): void {
    const theme = themes.find((t) => t.name === name) ?? themes[0]!;
    const root = document.documentElement;
    for (const [prop, val] of Object.entries(theme.vars)) {
      root.style.setProperty(prop, val);
    }
    this.current = theme.name;
    localStorage.setItem(STORAGE_KEY, theme.name);
  }

  getThemes(): Theme[] { return themes; }
  getCurrent(): string { return this.current; }
}

export const themeManager = new ThemeManager();
