import { marked } from "marked";
import DOMPurify from "dompurify";
import { resolveWikilink } from "./api.ts";

marked.setOptions({ gfm: true, breaks: true });

// Custom renderer to turn [[wikilinks]] into clickable spans
const wikilinkRe = /\[\[([^\]]+)\]\]/g;

function processWikilinks(html: string): string {
  // Replace [[Name]] and [[Name|Alias]] patterns (they appear as text in the rendered HTML)
  return html.replace(/\[\[([^\]]+?)\]\]/g, (_, inner) => {
    const [nameAndHeading, alias] = inner.split("|") as [string, string | undefined];
    const [name, heading] = (nameAndHeading ?? "").split("#") as [string, string | undefined];
    const display = alias ?? (heading ? `${name}#${heading}` : name) ?? inner;
    return `<a href="#" class="wikilink" data-wikilink="${encodeURIComponent(name?.trim() ?? "")}">${display}</a>`;
  });
}

// ── Callout blocks ──────────────────────────────────────────────────────────
// Obsidian syntax: > [!type] Title
// Supports: note, tip, warning, danger, info, abstract, todo, success, question, failure, bug, example, quote

const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
  note:     { icon: "📝", color: "var(--ob-accent)" },
  tip:      { icon: "💡", color: "var(--ob-green)" },
  hint:     { icon: "💡", color: "var(--ob-green)" },
  important:{ icon: "🔥", color: "var(--ob-accent)" },
  warning:  { icon: "⚠️", color: "var(--ob-yellow)" },
  caution:  { icon: "⚠️", color: "var(--ob-yellow)" },
  danger:   { icon: "⛔", color: "var(--ob-red)" },
  error:    { icon: "⛔", color: "var(--ob-red)" },
  info:     { icon: "ℹ️", color: "var(--ob-accent)" },
  abstract: { icon: "📋", color: "var(--ob-accent)" },
  summary:  { icon: "📋", color: "var(--ob-accent)" },
  todo:     { icon: "☑️", color: "var(--ob-accent)" },
  success:  { icon: "✅", color: "var(--ob-green)" },
  check:    { icon: "✅", color: "var(--ob-green)" },
  done:     { icon: "✅", color: "var(--ob-green)" },
  question: { icon: "❓", color: "var(--ob-yellow)" },
  help:     { icon: "❓", color: "var(--ob-yellow)" },
  faq:      { icon: "❓", color: "var(--ob-yellow)" },
  failure:  { icon: "❌", color: "var(--ob-red)" },
  fail:     { icon: "❌", color: "var(--ob-red)" },
  missing:  { icon: "❌", color: "var(--ob-red)" },
  bug:      { icon: "🐛", color: "var(--ob-red)" },
  example:  { icon: "📖", color: "var(--ob-accent)" },
  quote:    { icon: "💬", color: "var(--ob-muted)" },
  cite:     { icon: "💬", color: "var(--ob-muted)" },
};

function processCallouts(html: string): string {
  // Match blockquotes that start with [!type]
  return html.replace(
    /<blockquote>\s*<p>\s*\[!(\w+)\]([+-]?)[ ]*([^<]*?)\n?([\s\S]*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_, type, foldChar, title, body, rest) => {
      const typeLower = (type as string).toLowerCase();
      const meta = CALLOUT_TYPES[typeLower] ?? CALLOUT_TYPES["note"]!;
      const displayTitle = (title as string).trim() || typeLower.charAt(0).toUpperCase() + typeLower.slice(1);
      const isFoldable = foldChar === "+" || foldChar === "-";
      const isOpen = foldChar !== "-";
      const bodyContent = ((body as string) + (rest as string)).trim();

      if (isFoldable) {
        return `<div class="callout callout-${typeLower}" data-callout-type="${typeLower}">
          <details${isOpen ? " open" : ""}>
            <summary class="callout-title"><span class="callout-icon">${meta.icon}</span> ${escapeHtml(displayTitle)}</summary>
            <div class="callout-body">${bodyContent}</div>
          </details>
        </div>`;
      }

      return `<div class="callout callout-${typeLower}" data-callout-type="${typeLower}">
        <div class="callout-title"><span class="callout-icon">${meta.icon}</span> ${escapeHtml(displayTitle)}</div>
        <div class="callout-body">${bodyContent}</div>
      </div>`;
    }
  );
}

// ── Mermaid support ─────────────────────────────────────────────────────────
let mermaidPromise: Promise<void> | null = null;
let mermaidInitialized = false;

interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
}

function getMermaid(): MermaidApi | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).mermaid as MermaidApi | undefined;
}

async function ensureMermaid(): Promise<void> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    script.async = true;
    script.onload = () => {
      const mermaid = getMermaid();
      if (!mermaidInitialized && mermaid) {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
        });
        mermaidInitialized = true;
      }
      resolve();
    };
    script.onerror = () => {
      mermaidPromise = null;
      resolve();
    };
    document.head.appendChild(script);
  });
  return mermaidPromise;
}

export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll<HTMLElement>("code.language-mermaid");
  if (codeBlocks.length === 0) return;

  await ensureMermaid();
  const mermaid = getMermaid();
  if (!mermaid) return;

  let idx = 0;
  for (const code of codeBlocks) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;
    const text = code.textContent ?? "";
    try {
      const { svg } = await mermaid.render(`mermaid-${Date.now()}-${idx++}`, text);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch {
      // Leave code block as-is on render failure
    }
  }
}

// ── Interactive checkboxes ──────────────────────────────────────────────────
export function attachCheckboxHandlers(
  container: HTMLElement,
  onToggle: (lineIndex: number, checked: boolean) => void
): void {
  container.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.tagName !== "INPUT" || target.type !== "checkbox") return;
    if (!target.classList.contains("task-checkbox")) return;

    const lineStr = target.dataset["line"];
    if (lineStr === undefined) return;
    const line = parseInt(lineStr, 10);
    if (isNaN(line)) return;

    onToggle(line, target.checked);
  });
}

// Mark task checkboxes with line numbers so toggling can update the source
function processTaskCheckboxes(html: string, sourceLines: string[]): string {
  let cbIndex = 0;
  return html.replace(
    /<li>\s*<input\s+[^>]*type="checkbox"[^>]*>\s*/gi,
    (match) => {
      const isChecked = /checked/i.test(match);
      const lineNum = findTaskLine(sourceLines, cbIndex, isChecked);
      cbIndex++;
      const checkedAttr = isChecked ? " checked" : "";
      return `<li><input type="checkbox" class="task-checkbox" data-line="${lineNum}"${checkedAttr}> `;
    }
  );
}

function findTaskLine(lines: string[], targetIdx: number, _isChecked: boolean): number {
  let found = 0;
  let inCodeBlock = false;
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === 0 && line === "---") { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (line === "---") inFrontmatter = false; continue; }
    if (/^```/.test(line)) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (/- \[[ xX]\]/.test(line)) {
      if (found === targetIdx) return i;
      found++;
    }
  }
  return -1;
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const MEANINGFUL_RE = /\S/g;

function detectRtl(frontMatterRaw: string, body: string): boolean {
  if (/\blang\s*:\s*ar\b/i.test(frontMatterRaw) ||
      /\bdirection\s*:\s*rtl\b/i.test(frontMatterRaw)) return true;
  const arabic = (body.match(ARABIC_RE) ?? []).length;
  if (arabic === 0) return false;
  const meaningful = (body.match(MEANINGFUL_RE) ?? []).length;
  return meaningful > 0 && arabic / meaningful > 0.15;
}

export interface MarkdownResult {
  html: string;
  isRtl: boolean;
}

export function renderMarkdown(markdown: string): MarkdownResult {
  const fmMatch = markdown.match(/^---[\s\S]*?---\n?/);
  const frontMatterRaw = fmMatch ? fmMatch[0] : "";
  const stripped = markdown.replace(/^---[\s\S]*?---\n?/, "");
  const isRtl = detectRtl(frontMatterRaw, stripped);
  const raw = marked.parse(stripped) as string;
  const withLinks = processWikilinks(raw);
  const withCallouts = processCallouts(withLinks);
  const sourceLines = markdown.split("\n");
  const withCheckboxes = processTaskCheckboxes(withCallouts, sourceLines);
  const html = DOMPurify.sanitize(withCheckboxes, {
    ADD_ATTR: ["data-wikilink", "type", "disabled", "checked", "data-line", "data-callout-type"],
    ADD_TAGS: ["a", "input", "details", "summary"],
    ALLOWED_ATTR: [
      "href", "class", "data-wikilink", "src", "alt", "title", "target",
      "rel", "type", "disabled", "checked", "data-line", "open", "data-callout-type",
    ],
  });
  return { html, isRtl };
}

export function attachWikilinkHandlers(
  container: HTMLElement,
  onNavigate: (path: string) => void
): void {
  container.addEventListener("click", async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wikilink");
    if (!target) return;
    e.preventDefault();

    const name = decodeURIComponent(target.dataset["wikilink"] ?? "");
    if (!name) return;

    try {
      const result = await resolveWikilink(name);
      if (result.found) {
        onNavigate(result.path);
      } else {
        alert(`Note not found: "${name}"`);
      }
    } catch {
      alert("Failed to resolve wikilink");
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
