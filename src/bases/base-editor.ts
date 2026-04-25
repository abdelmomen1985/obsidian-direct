import { parseDocument, isMap, isSeq, YAMLMap, YAMLSeq, Scalar } from "yaml";
import type { Document } from "yaml";

export interface PropertyPatch {
  name: string;
  type?: string | null;
  label?: string | null;
  width?: number | null;
  hidden?: boolean | null;
}

export type Mutation =
  | { type: "addProperty"; property: PropertyPatch }
  | { type: "updateProperty"; oldName: string; property: PropertyPatch }
  | { type: "removeProperty"; name: string }
  | { type: "addColumn"; viewIndex: number; column: string; index?: number }
  | { type: "removeColumn"; viewIndex: number; column: string }
  | { type: "reorderColumns"; viewIndex: number; columns: string[] }
  | { type: "addView"; view: { name: string; type?: string } }
  | { type: "removeView"; viewIndex: number };

export interface MutationResult {
  yaml: string;
  changed: boolean;
}

/**
 * Apply a structural mutation to a .base YAML document, preserving existing
 * formatting where possible. Returns the new YAML text.
 */
export function applyMutation(yaml: string, mutation: Mutation): MutationResult {
  const doc = parseDocument(yaml.length > 0 ? yaml : "{}");

  switch (mutation.type) {
    case "addProperty":
      return finish(doc, addProperty(doc, mutation.property));
    case "updateProperty":
      return finish(doc, updateProperty(doc, mutation.oldName, mutation.property));
    case "removeProperty":
      return finish(doc, removeProperty(doc, mutation.name));
    case "addColumn":
      return finish(doc, addColumn(doc, mutation.viewIndex, mutation.column, mutation.index));
    case "removeColumn":
      return finish(doc, removeColumn(doc, mutation.viewIndex, mutation.column));
    case "reorderColumns":
      return finish(doc, reorderColumns(doc, mutation.viewIndex, mutation.columns));
    case "addView":
      return finish(doc, addView(doc, mutation.view));
    case "removeView":
      return finish(doc, removeView(doc, mutation.viewIndex));
  }
}

function finish(doc: Document, changed: boolean): MutationResult {
  return { yaml: doc.toString(), changed };
}

// ── Properties ───────────────────────────────────────────────────────────────

function getOrCreateSeq(doc: Document, key: string): YAMLSeq {
  const existing = doc.get(key);
  if (isSeq(existing)) return existing;
  const seq = new YAMLSeq();
  doc.set(key, seq);
  return seq;
}

function findPropertyMap(seq: YAMLSeq, name: string): { map: YAMLMap; index: number } | null {
  for (let i = 0; i < seq.items.length; i++) {
    const item = seq.items[i];
    if (isMap(item)) {
      const n = item.get("name");
      if ((typeof n === "string" ? n : (n as Scalar | undefined)?.value) === name) {
        return { map: item, index: i };
      }
    }
  }
  return null;
}

function buildPropertyMap(patch: PropertyPatch): YAMLMap {
  const map = new YAMLMap();
  map.set("name", patch.name);
  if (patch.type != null) map.set("type", patch.type);
  if (patch.label != null) map.set("label", patch.label);
  if (typeof patch.width === "number") map.set("width", patch.width);
  if (typeof patch.hidden === "boolean") map.set("hidden", patch.hidden);
  return map;
}

function addProperty(doc: Document, patch: PropertyPatch): boolean {
  if (!patch.name) throw new Error("Property name is required");
  const seq = getOrCreateSeq(doc, "properties");
  if (findPropertyMap(seq, patch.name)) {
    // already exists — treat as update so callers don't need to choose
    return updateProperty(doc, patch.name, patch);
  }
  seq.add(buildPropertyMap(patch));
  return true;
}

function updateProperty(doc: Document, oldName: string, patch: PropertyPatch): boolean {
  const seq = doc.get("properties");
  if (!isSeq(seq)) throw new Error(`Property "${oldName}" not found`);
  const found = findPropertyMap(seq, oldName);
  if (!found) throw new Error(`Property "${oldName}" not found`);

  const map = found.map;

  if (patch.name && patch.name !== oldName) {
    // ensure new name not already in use
    if (findPropertyMap(seq, patch.name)) {
      throw new Error(`Property "${patch.name}" already exists`);
    }
    map.set("name", patch.name);
    // also rename in any view's columns list and sort/group property references
    renameInViews(doc, oldName, patch.name);
  }
  applyOptional(map, "type", patch.type);
  applyOptional(map, "label", patch.label);
  applyOptional(map, "width", patch.width);
  applyOptional(map, "hidden", patch.hidden);
  return true;
}

function applyOptional(
  map: YAMLMap,
  key: string,
  value: string | number | boolean | null | undefined
): void {
  if (value === undefined) return;
  if (value === null) map.delete(key);
  else map.set(key, value);
}

function removeProperty(doc: Document, name: string): boolean {
  const seq = doc.get("properties");
  if (!isSeq(seq)) return false;
  const found = findPropertyMap(seq, name);
  if (!found) return false;
  seq.delete(found.index);
  if (seq.items.length === 0) doc.delete("properties");
  // also drop the column from any view
  const views = doc.get("views");
  if (isSeq(views)) {
    for (let i = 0; i < views.items.length; i++) {
      const v = views.items[i];
      if (isMap(v)) removeColumnFromViewMap(v, name);
    }
  }
  return true;
}

function renameInViews(doc: Document, oldName: string, newName: string): void {
  const views = doc.get("views");
  if (!isSeq(views)) return;
  for (const v of views.items) {
    if (!isMap(v)) continue;
    const cols = v.get("columns");
    if (isSeq(cols)) {
      for (let i = 0; i < cols.items.length; i++) {
        const item = cols.items[i];
        const val = typeof item === "string" ? item : (item as Scalar | undefined)?.value;
        if (val === oldName) cols.set(i, newName);
      }
    }
  }
}

// ── Views and columns ────────────────────────────────────────────────────────

function getView(doc: Document, viewIndex: number): YAMLMap {
  const views = doc.get("views");
  if (!isSeq(views)) throw new Error("No views defined");
  const view = views.items[viewIndex];
  if (!isMap(view)) throw new Error(`View at index ${viewIndex} not found`);
  return view;
}

function getOrCreateColumns(view: YAMLMap): YAMLSeq {
  const cols = view.get("columns");
  if (isSeq(cols)) return cols;
  const seq = new YAMLSeq();
  view.set("columns", seq);
  return seq;
}

function columnExists(seq: YAMLSeq, column: string): boolean {
  for (const item of seq.items) {
    const val = typeof item === "string" ? item : (item as Scalar | undefined)?.value;
    if (val === column) return true;
  }
  return false;
}

function addColumn(doc: Document, viewIndex: number, column: string, index?: number): boolean {
  if (!column) throw new Error("Column name is required");
  const view = getView(doc, viewIndex);
  const cols = getOrCreateColumns(view);
  if (columnExists(cols, column)) return false;
  if (typeof index === "number" && index >= 0 && index < cols.items.length) {
    cols.items.splice(index, 0, column as unknown as never);
  } else {
    cols.add(column);
  }
  return true;
}

function removeColumnFromViewMap(view: YAMLMap, column: string): boolean {
  const cols = view.get("columns");
  if (!isSeq(cols)) return false;
  for (let i = 0; i < cols.items.length; i++) {
    const item = cols.items[i];
    const val = typeof item === "string" ? item : (item as Scalar | undefined)?.value;
    if (val === column) {
      cols.delete(i);
      return true;
    }
  }
  return false;
}

function removeColumn(doc: Document, viewIndex: number, column: string): boolean {
  const view = getView(doc, viewIndex);
  return removeColumnFromViewMap(view, column);
}

function reorderColumns(doc: Document, viewIndex: number, columns: string[]): boolean {
  const view = getView(doc, viewIndex);
  const seq = new YAMLSeq();
  for (const c of columns) seq.add(c);
  view.set("columns", seq);
  return true;
}

function addView(
  doc: Document,
  view: { name: string; type?: string }
): boolean {
  if (!view.name) throw new Error("View name is required");
  const seq = getOrCreateSeq(doc, "views");
  const map = new YAMLMap();
  map.set("name", view.name);
  map.set("type", view.type ?? "table");
  seq.add(map);
  return true;
}

function removeView(doc: Document, viewIndex: number): boolean {
  const views = doc.get("views");
  if (!isSeq(views)) return false;
  if (viewIndex < 0 || viewIndex >= views.items.length) return false;
  views.delete(viewIndex);
  if (views.items.length === 0) doc.delete("views");
  return true;
}
