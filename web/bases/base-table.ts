import type {
  IndexedNote,
  BaseDefinition,
  ViewDefinition,
  QueryResponse,
  PropertyDefinition,
} from "./base-api.ts";
import { queryBase, updateProperty } from "./base-api.ts";

export interface BaseTableCallbacks {
  onOpenNote: (path: string) => void;
  onRefresh: () => void;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export function createBaseTableView(
  basePath: string,
  callbacks: BaseTableCallbacks
): { el: HTMLElement; refresh: () => Promise<void> } {
  const container = document.createElement("div");
  container.className = "base-view";

  let currentViewIndex = 0;
  let currentSort: SortState | null = null;
  let lastResponse: QueryResponse | null = null;

  async function refresh(): Promise<void> {
    try {
      container.innerHTML = '<div class="base-loading">Loading base…</div>';
      const response = await queryBase(basePath, currentViewIndex);
      lastResponse = response;
      render(response);
    } catch (err) {
      container.innerHTML = `<div class="base-error">${err instanceof Error ? err.message : "Failed to load base"}</div>`;
    }
  }

  function render(response: QueryResponse): void {
    container.innerHTML = "";

    const { definition, warnings, total } = response;

    // warnings bar
    if (warnings.length > 0) {
      const warningsEl = document.createElement("div");
      warningsEl.className = "base-warnings";
      warningsEl.innerHTML = warnings
        .map((w) => `<div class="base-warning">${escapeHtml(w)}</div>`)
        .join("");
      container.appendChild(warningsEl);
    }

    // view tabs
    if (definition.views && definition.views.length > 1) {
      const tabs = document.createElement("div");
      tabs.className = "base-view-tabs";
      definition.views.forEach((view, idx) => {
        const tab = document.createElement("button");
        tab.className =
          "base-view-tab" + (idx === currentViewIndex ? " active" : "");
        tab.textContent = view.name;
        tab.addEventListener("click", () => {
          currentViewIndex = idx;
          currentSort = null;
          void refresh();
        });
        tabs.appendChild(tab);
      });
      container.appendChild(tabs);
    }

    const view = definition.views?.[currentViewIndex];

    // unsupported view type
    if (view && !view._supported) {
      const placeholder = document.createElement("div");
      placeholder.className = "base-unsupported-view";
      placeholder.innerHTML = `
        <div class="base-unsupported-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
        </div>
        <div class="base-unsupported-text">${escapeHtml(view._unsupportedReason ?? `View type "${view.type}" is not yet supported`)}</div>
        <div class="base-unsupported-hint">The view definition is preserved and will work when this view type is implemented.</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // determine columns
    const columns = resolveColumns(response, definition, view);
    const notes = Array.isArray(response.notes)
      ? response.notes
      : Object.values(response.notes).flat();

    // info bar
    const infoBar = document.createElement("div");
    infoBar.className = "base-info-bar";
    infoBar.textContent = `${notes.length} of ${total} notes`;
    container.appendChild(infoBar);

    // grouped rendering
    if (!Array.isArray(response.notes)) {
      const grouped = response.notes as Record<string, IndexedNote[]>;
      for (const [groupKey, groupNotes] of Object.entries(grouped)) {
        const groupEl = document.createElement("div");
        groupEl.className = "base-group";

        const groupHeader = document.createElement("div");
        groupHeader.className = "base-group-header";
        groupHeader.textContent = groupKey;
        groupEl.appendChild(groupHeader);

        groupEl.appendChild(
          buildTable(columns, groupNotes, definition, callbacks)
        );
        container.appendChild(groupEl);
      }
    } else {
      container.appendChild(
        buildTable(columns, notes, definition, callbacks)
      );
    }
  }

  void refresh();
  return { el: container, refresh };
}

function resolveColumns(
  response: QueryResponse,
  definition: BaseDefinition,
  view: ViewDefinition | undefined
): string[] {
  // use view-defined columns if available
  if (view?.columns && view.columns.length > 0) {
    return view.columns;
  }

  // use property definitions
  if (definition.properties && definition.properties.length > 0) {
    return definition.properties
      .filter((p) => !p.hidden)
      .map((p) => p.name);
  }

  // auto-detect from notes
  const columnSet = new Set<string>(["file.name"]);
  const notes = Array.isArray(response.notes)
    ? response.notes
    : Object.values(response.notes).flat();

  for (const note of notes.slice(0, 50)) {
    for (const key of Object.keys(note.frontmatter)) {
      columnSet.add(key);
    }
    if (note.formulaValues) {
      for (const key of Object.keys(note.formulaValues)) {
        columnSet.add(`formula:${key}`);
      }
    }
  }
  return [...columnSet];
}

function buildTable(
  columns: string[],
  notes: IndexedNote[],
  definition: BaseDefinition,
  callbacks: BaseTableCallbacks
): HTMLElement {
  const table = document.createElement("table");
  table.className = "base-table";

  // header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = "base-th";

    const propDef = definition.properties?.find((p) => p.name === col);
    const label = propDef?.label ?? formatColumnName(col);
    th.textContent = label;
    th.title = col;

    if (propDef?.width) {
      th.style.width = `${propDef.width}px`;
    }

    // sort on click
    th.addEventListener("click", () => {
      // re-sort in-memory (simple client-side toggle)
      const sortedNotes = [...notes].sort((a, b) => {
        const aVal = getCellValue(a, col);
        const bVal = getCellValue(b, col);
        const cmp = compareValues(aVal, bVal);
        // toggle direction
        const existingDir = th.dataset["sortDir"];
        return existingDir === "asc" ? -cmp : cmp;
      });
      const newDir = th.dataset["sortDir"] === "asc" ? "desc" : "asc";

      // re-render just the tbody
      const tbody = table.querySelector("tbody");
      if (tbody) {
        tbody.innerHTML = "";
        for (const note of sortedNotes) {
          tbody.appendChild(buildRow(columns, note, definition, callbacks));
        }
      }

      // update sort indicators
      thead.querySelectorAll("th").forEach((h) => {
        h.classList.remove("sort-asc", "sort-desc");
        delete h.dataset["sortDir"];
      });
      th.dataset["sortDir"] = newDir;
      th.classList.add(`sort-${newDir}`);
    });

    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // body
  const tbody = document.createElement("tbody");
  for (const note of notes) {
    tbody.appendChild(buildRow(columns, note, definition, callbacks));
  }
  table.appendChild(tbody);

  return table;
}

function buildRow(
  columns: string[],
  note: IndexedNote,
  definition: BaseDefinition,
  callbacks: BaseTableCallbacks
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "base-tr";

  for (const col of columns) {
    const td = document.createElement("td");
    td.className = "base-td";

    const value = getCellValue(note, col);

    // file.name is a clickable link
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
    } else if (col.startsWith("formula:")) {
      // formula columns are read-only
      td.textContent = formatValue(value);
      td.classList.add("base-td-formula");
    } else if (col.startsWith("file.")) {
      // file properties are read-only
      td.textContent = formatValue(value);
      td.classList.add("base-td-readonly");
    } else {
      // editable frontmatter property
      td.textContent = formatValue(value);
      td.classList.add("base-td-editable");
      td.addEventListener("dblclick", () => {
        startCellEdit(td, note, col, callbacks);
      });
    }

    tr.appendChild(td);
  }

  return tr;
}

function startCellEdit(
  td: HTMLTableCellElement,
  note: IndexedNote,
  property: string,
  callbacks: BaseTableCallbacks
): void {
  const currentValue = note.frontmatter[property];
  const input = document.createElement("input");
  input.className = "base-cell-input";
  input.type = "text";
  input.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : "";

  td.textContent = "";
  td.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newValue = parseInputValue(input.value);
    td.textContent = formatValue(newValue);
    try {
      await updateProperty(note.path, property, newValue, note.mtime);
      note.frontmatter[property] = newValue;
      callbacks.onRefresh();
    } catch (err) {
      td.textContent = formatValue(currentValue);
      if (err instanceof Error && err.message.startsWith("CONFLICT:")) {
        alert("This file was modified externally. Please refresh.");
      } else {
        alert(err instanceof Error ? err.message : "Update failed");
      }
    }
  };

  let cancelled = false;
  input.addEventListener("blur", () => { if (!cancelled) void commit(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      cancelled = true;
      td.textContent = formatValue(currentValue);
    }
  });
}

function getCellValue(note: IndexedNote, column: string): unknown {
  if (column.startsWith("formula:")) {
    const key = column.slice("formula:".length);
    return note.formulaValues?.[key];
  }

  switch (column) {
    case "file.name":
      return note.name;
    case "file.path":
      return note.path;
    case "file.folder":
      return note.folder;
    case "file.ext":
      return note.ext;
    case "file.mtime":
      return note.mtime;
    case "file.ctime":
      return note.ctime;
    case "file.tags":
    case "tags":
      return note.tags.join(", ");
    default:
      return note.frontmatter[column];
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "number" && value > 1e12) return new Date(value).toLocaleString();
  return String(value);
}

function formatColumnName(col: string): string {
  if (col.startsWith("formula:")) return col.slice("formula:".length);
  if (col.startsWith("file.")) return col.slice("file.".length);
  return col.charAt(0).toUpperCase() + col.slice(1).replace(/[-_]/g, " ");
}

function parseInputValue(str: string): unknown {
  const trimmed = str.trim();
  if (trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  // check for list (comma-separated)
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((s) => s.trim());
  }
  return trimmed;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
