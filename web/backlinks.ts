import { getBacklinks, BacklinkResult } from "./api.ts";
import { t } from "./i18n.ts";

export interface BacklinksHandle {
  el: HTMLElement;
  update: (path: string) => Promise<void>;
  clear: () => void;
}

export function createBacklinksPanel(
  onNavigate: (path: string) => void
): BacklinksHandle {
  const el = document.createElement("div");
  el.className = "backlinks-panel";
  el.innerHTML = `
    <div class="backlinks-header">${t("panel.backlinks")}</div>
    <div class="backlinks-list"></div>
  `;

  const listEl = el.querySelector<HTMLElement>(".backlinks-list")!;

  async function update(path: string): Promise<void> {
    listEl.innerHTML = `<div class="backlinks-loading">${t("panel.backlinksLoading")}</div>`;
    try {
      const results = await getBacklinks(path);
      render(results);
    } catch {
      listEl.innerHTML = `<div class="backlinks-empty">${t("panel.backlinksFailed")}</div>`;
    }
  }

  function render(results: BacklinkResult[]): void {
    if (results.length === 0) {
      listEl.innerHTML = `<div class="backlinks-empty">${t("panel.backlinksEmpty")}</div>`;
      return;
    }

    listEl.innerHTML = "";
    for (const r of results) {
      const item = document.createElement("button");
      item.className = "backlink-item";
      const name = r.path.split("/").pop()?.replace(/\.md$/, "") ?? r.path;
      item.innerHTML = `
        <span class="backlink-name">${escapeHtml(name)}</span>
        <span class="backlink-context">${escapeHtml(r.context)}</span>
      `;
      item.addEventListener("click", () => onNavigate(r.path));
      listEl.appendChild(item);
    }
  }

  function clear(): void {
    listEl.innerHTML = `<div class="backlinks-empty">${t("panel.backlinksNoFile")}</div>`;
  }

  return { el, update, clear };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
