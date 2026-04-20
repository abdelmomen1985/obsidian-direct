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

export function renderMarkdown(markdown: string): string {
  // Strip YAML frontmatter
  const stripped = markdown.replace(/^---[\s\S]*?---\n?/, "");
  const raw = marked.parse(stripped) as string;
  const withLinks = processWikilinks(raw);
  return DOMPurify.sanitize(withLinks, {
    ADD_ATTR: ["data-wikilink"],
    ADD_TAGS: ["a"],
    ALLOWED_ATTR: ["href", "class", "data-wikilink", "src", "alt", "title", "target", "rel"],
  });
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
