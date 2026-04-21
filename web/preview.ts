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
  const html = DOMPurify.sanitize(withLinks, {
    ADD_ATTR: ["data-wikilink"],
    ADD_TAGS: ["a"],
    ALLOWED_ATTR: ["href", "class", "data-wikilink", "src", "alt", "title", "target", "rel"],
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
