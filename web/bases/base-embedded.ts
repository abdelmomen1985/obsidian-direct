import type { BaseTableCallbacks } from "./base-table.ts";
import type { IndexedNote, QueryResponse } from "./base-api.ts";
import { queryBaseInline } from "./base-api.ts";
import { buildCardList } from "./base-card-view.ts";

export function processEmbeddedBases(
  container: HTMLElement,
  callbacks: BaseTableCallbacks
): void {
  const codeBlocks = container.querySelectorAll<HTMLElement>(
    "pre > code.language-base, pre > code.language-bases"
  );

  codeBlocks.forEach((codeEl) => {
    const preEl = codeEl.parentElement;
    if (!preEl) return;

    const yamlContent = codeEl.textContent ?? "";
    if (!yamlContent.trim()) return;

    const wrapper = document.createElement("div");
    wrapper.className = "base-embedded";

    const header = document.createElement("div");
    header.className = "base-embedded-header";
    header.innerHTML = `
      <span class="base-embedded-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        Embedded Base
      </span>
      <button class="base-embedded-toggle" title="Toggle source">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>
    `;
    wrapper.appendChild(header);

    // rendered view
    const viewContainer = document.createElement("div");
    viewContainer.className = "base-embedded-view";
    viewContainer.innerHTML = '<div class="base-loading">Loading embedded base…</div>';
    wrapper.appendChild(viewContainer);

    // source view (hidden by default)
    const sourceView = document.createElement("pre");
    sourceView.className = "base-embedded-source hidden";
    sourceView.textContent = yamlContent;
    wrapper.appendChild(sourceView);

    // toggle between source and rendered
    const toggleBtn = header.querySelector(".base-embedded-toggle");
    toggleBtn?.addEventListener("click", () => {
      viewContainer.classList.toggle("hidden");
      sourceView.classList.toggle("hidden");
    });

    // load the embedded base query
    // embedded bases are inline YAML, so we send them to the server for processing
    void loadEmbeddedBase(viewContainer, yamlContent, callbacks);

    preEl.replaceWith(wrapper);
  });
}

async function loadEmbeddedBase(
  container: HTMLElement,
  yamlContent: string,
  callbacks: BaseTableCallbacks
): Promise<void> {
  try {
    const response = await queryBaseInline(yamlContent, 0);
    container.innerHTML = "";
    renderEmbeddedTable(container, response, callbacks);
  } catch (err) {
    container.innerHTML = `
      <div class="base-embedded-info">
        <p>Failed to render embedded base: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>
      </div>
    `;
  }
}

function renderEmbeddedTable(
  container: HTMLElement,
  response: QueryResponse,
  callbacks: BaseTableCallbacks
): void {
  const { definition, warnings, total } = response;
  const view = definition.views?.[0];

  if (warnings.length > 0) {
    const warn = document.createElement("div");
    warn.className = "base-warnings";
    warn.innerHTML = warnings
      .map((w) => `<div class="base-warning">${escapeHtml(w)}</div>`)
      .join("");
    container.appendChild(warn);
  }

  const notes = Array.isArray(response.notes)
    ? response.notes
    : Object.values(response.notes).flat();

  const info = document.createElement("div");
  info.className = "base-info-bar";
  info.textContent = `${notes.length} of ${total} notes`;
  container.appendChild(info);

  const columns = resolveColumnsForEmbed(response, view?.columns);

  if (view?.type === "list" || view?.type === "gallery") {
    container.appendChild(
      buildCardList(columns, notes, definition, view, callbacks)
    );
    return;
  }
  const table = document.createElement("table");
  table.className = "base-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = "base-th";
    const propDef = definition.properties?.find((p) => p.name === col);
    th.textContent = propDef?.label ?? formatColumnName(col);
    th.title = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const note of notes) {
    const tr = document.createElement("tr");
    tr.className = "base-tr";
    for (const col of columns) {
      const td = document.createElement("td");
      td.className = "base-td";
      const value = getCellValue(note, col);
      if (col === "file.name" || col === "file.path") {
        const link = document.createElement("a");
        link.href = "#";
        link.className = "base-note-link";
        link.textContent = String(value ?? note.name);
        link.addEventListener("click", (e) => {
          e.preventDefault();
          callbacks.onOpenNote(note.path);
        });
        td.appendChild(link);
      } else {
        td.textContent = formatValue(value);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function resolveColumnsForEmbed(
  response: QueryResponse,
  declared?: string[]
): string[] {
  if (declared && declared.length > 0) return declared;
  if (response.definition.properties && response.definition.properties.length > 0) {
    return response.definition.properties.filter((p) => !p.hidden).map((p) => p.name);
  }
  const out = new Set<string>(["file.name"]);
  const flat = Array.isArray(response.notes)
    ? response.notes
    : Object.values(response.notes).flat();
  for (const note of flat.slice(0, 50)) {
    for (const k of Object.keys(note.frontmatter)) out.add(k);
  }
  return [...out];
}

function getCellValue(note: IndexedNote, column: string): unknown {
  if (column.startsWith("formula:")) {
    return note.formulaValues?.[column.slice("formula:".length)];
  }
  switch (column) {
    case "file.name": return note.name;
    case "file.path": return note.path;
    case "file.folder": return note.folder;
    case "file.ext": return note.ext;
    case "file.mtime": return note.mtime;
    case "file.ctime": return note.ctime;
    case "file.tags":
    case "tags": return note.tags.join(", ");
    default: return note.frontmatter[column];
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && value > 1e12) return new Date(value).toLocaleString();
  return String(value);
}

function formatColumnName(col: string): string {
  if (col.startsWith("formula:")) return col.slice("formula:".length);
  if (col.startsWith("file.")) return col.slice("file.".length);
  return col.charAt(0).toUpperCase() + col.slice(1).replace(/[-_]/g, " ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
