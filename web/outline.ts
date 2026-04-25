export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
}

export interface OutlineHandle {
  el: HTMLElement;
  update: (content: string) => void;
  clear: () => void;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

export function parseHeadings(content: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const m = line.match(HEADING_RE);
    if (m) {
      headings.push({
        level: m[1]!.length,
        text: m[2]!.trim(),
        line: i + 1,
      });
    }
  }
  return headings;
}

export function createOutlinePanel(
  onJumpToLine: (line: number) => void
): OutlineHandle {
  const el = document.createElement("div");
  el.className = "outline-panel";
  el.innerHTML = `
    <div class="outline-header">Outline</div>
    <div class="outline-list"></div>
  `;

  const listEl = el.querySelector<HTMLElement>(".outline-list")!;

  function update(content: string): void {
    const headings = parseHeadings(content);
    if (headings.length === 0) {
      listEl.innerHTML = '<div class="outline-empty">No headings</div>';
      return;
    }

    listEl.innerHTML = "";
    const minLevel = Math.min(...headings.map((h) => h.level));

    for (const h of headings) {
      const item = document.createElement("button");
      item.className = "outline-item";
      item.style.paddingLeft = `${(h.level - minLevel) * 14 + 8}px`;
      item.textContent = h.text;
      item.title = `Line ${h.line}`;
      item.addEventListener("click", () => onJumpToLine(h.line));
      listEl.appendChild(item);
    }
  }

  function clear(): void {
    listEl.innerHTML = '<div class="outline-empty">No file open</div>';
  }

  return { el, update, clear };
}
