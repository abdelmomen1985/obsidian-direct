import type {
  IndexedNote,
  BaseDefinition,
  ViewDefinition,
} from "./base-api.ts";
import {
  getCellValue,
  formatValue,
  formatColumnName,
} from "./base-cell.ts";
import type { BaseTableCallbacks } from "./base-table.ts";

/**
 * Build a card-list (a.k.a. list/gallery) view for a Base view definition.
 * Each note becomes a card; the first column (or `file.name`) is used as
 * the title, and remaining columns are rendered as label/value rows.
 */
export function buildCardList(
  columns: string[],
  notes: IndexedNote[],
  definition: BaseDefinition,
  view: ViewDefinition | undefined,
  callbacks: BaseTableCallbacks
): HTMLElement {
  const grid = document.createElement("div");
  const layout = view?.type === "gallery" ? "gallery" : "list";
  grid.className = `base-card-${layout}`;

  // pick a title column: prefer file.name if listed, else the first column,
  // else fallback to file.name.
  const titleCol =
    columns.find((c) => c === "file.name") ??
    columns[0] ??
    "file.name";
  const detailCols = columns.filter((c) => c !== titleCol);

  for (const note of notes) {
    const card = document.createElement("div");
    card.className = "base-card";

    const titleEl = document.createElement("a");
    titleEl.href = "#";
    titleEl.className = "base-card-title";
    const titleVal = getCellValue(note, titleCol);
    titleEl.textContent = formatValue(titleVal) || note.name;
    titleEl.addEventListener("click", (e) => {
      e.preventDefault();
      callbacks.onOpenNote(note.path);
    });
    card.appendChild(titleEl);

    if (note.folder) {
      const folder = document.createElement("div");
      folder.className = "base-card-folder";
      folder.textContent = note.folder;
      card.appendChild(folder);
    }

    if (detailCols.length > 0) {
      const meta = document.createElement("dl");
      meta.className = "base-card-meta";
      for (const col of detailCols) {
        const value = getCellValue(note, col);
        const formatted = formatValue(value);
        if (!formatted) continue;
        const propDef = definition.properties?.find((p) => p.name === col);
        const label = propDef?.label ?? formatColumnName(col);

        const dt = document.createElement("dt");
        dt.className = "base-card-meta-label";
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.className = "base-card-meta-value";
        dd.textContent = formatted;
        meta.appendChild(dt);
        meta.appendChild(dd);
      }
      if (meta.childElementCount > 0) card.appendChild(meta);
    }

    if (note.tags && note.tags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "base-card-tags";
      for (const tag of note.tags) {
        const chip = document.createElement("span");
        chip.className = "base-card-tag";
        chip.textContent = tag;
        tags.appendChild(chip);
      }
      card.appendChild(tags);
    }

    grid.appendChild(card);
  }

  if (notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "base-card-empty";
    empty.textContent = "No matching notes";
    grid.appendChild(empty);
  }

  return grid;
}
