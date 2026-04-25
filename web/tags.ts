import { getTags, TagEntry } from "./api.ts";

export interface TagsPaneHandle {
  el: HTMLElement;
  refresh: () => Promise<void>;
}

export function createTagsPane(
  onSelectFile: (path: string) => void
): TagsPaneHandle {
  const el = document.createElement("div");
  el.className = "tags-pane";
  el.innerHTML = `
    <div class="tags-header">Tags</div>
    <div class="tags-list"></div>
  `;

  const listEl = el.querySelector<HTMLElement>(".tags-list")!;

  async function refresh(): Promise<void> {
    listEl.innerHTML = '<div class="tags-loading">Loading…</div>';
    try {
      const entries = await getTags();
      render(entries);
    } catch {
      listEl.innerHTML = '<div class="tags-empty">Failed to load</div>';
    }
  }

  function render(entries: TagEntry[]): void {
    if (entries.length === 0) {
      listEl.innerHTML = '<div class="tags-empty">No tags found</div>';
      return;
    }

    listEl.innerHTML = "";
    for (const entry of entries) {
      const details = document.createElement("details");
      details.className = "tag-group";

      const summary = document.createElement("summary");
      summary.className = "tag-summary";
      summary.innerHTML = `
        <span class="tag-name">#${escapeHtml(entry.tag)}</span>
        <span class="tag-count">${entry.count}</span>
      `;
      details.appendChild(summary);

      const fileList = document.createElement("div");
      fileList.className = "tag-files";
      for (const filePath of entry.files) {
        const btn = document.createElement("button");
        btn.className = "tag-file-item";
        btn.textContent = filePath.split("/").pop()?.replace(/\.md$/, "") ?? filePath;
        btn.title = filePath;
        btn.addEventListener("click", () => onSelectFile(filePath));
        fileList.appendChild(btn);
      }
      details.appendChild(fileList);
      listEl.appendChild(details);
    }
  }

  return { el, refresh };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
