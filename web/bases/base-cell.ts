import type { IndexedNote } from "./base-api.ts";

export function getCellValue(note: IndexedNote, column: string): unknown {
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

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "number" && value > 1e12) return new Date(value).toLocaleString();
  return String(value);
}

export function formatColumnName(col: string): string {
  if (col.startsWith("formula:")) return col.slice("formula:".length);
  if (col.startsWith("file.")) return col.slice("file.".length);
  return col.charAt(0).toUpperCase() + col.slice(1).replace(/[-_]/g, " ");
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export function applyClientSort(notes: IndexedNote[], sort: SortState): IndexedNote[] {
  return [...notes].sort((a, b) => {
    const aVal = getCellValue(a, sort.column);
    const bVal = getCellValue(b, sort.column);
    const cmp = compareValues(aVal, bVal);
    return sort.direction === "desc" ? -cmp : cmp;
  });
}
