import type {
  IndexedNote,
  FilterGroup,
  FilterCondition,
  FilterOperator,
  EvalResult,
  SortDefinition,
  GroupDefinition,
  FormulaDefinition,
  QueryResult,
  BaseDefinition,
  ViewDefinition,
} from "./types.ts";

// ── Public API ───────────────────────────────────────────────────────────────

export function executeQuery(
  notes: IndexedNote[],
  base: BaseDefinition,
  viewIndex = 0
): QueryResult {
  const warnings: string[] = [];
  const view = base.views?.[viewIndex];

  // apply base-level filters first
  let filtered = notes;
  if (base.filters) {
    filtered = applyFilter(filtered, base.filters, warnings);
  }

  // apply view-level filter
  if (view?.filter) {
    filtered = applyFilter(filtered, view.filter, warnings);
  }

  // apply sorting
  const sortDefs = view?.sort;
  if (sortDefs && sortDefs.length > 0) {
    filtered = applySorting(filtered, sortDefs);
  }

  // apply limit
  const total = filtered.length;
  if (view?.limit && view.limit > 0) {
    filtered = filtered.slice(0, view.limit);
  }

  return { notes: filtered, total, warnings };
}

export function groupNotes(
  notes: IndexedNote[],
  group: GroupDefinition
): Map<string, IndexedNote[]> {
  const groups = new Map<string, IndexedNote[]>();
  for (const note of notes) {
    const val = resolveProperty(note, group.property);
    const key = val === undefined || val === null ? "(empty)" : String(val);
    const arr = groups.get(key) ?? [];
    arr.push(note);
    groups.set(key, arr);
  }

  // sort group keys
  const sorted = new Map(
    [...groups.entries()].sort(([a], [b]) =>
      group.direction === "desc" ? b.localeCompare(a) : a.localeCompare(b)
    )
  );
  return sorted;
}

export function evaluateFormulas(
  note: IndexedNote,
  formulas: Record<string, FormulaDefinition>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, formula] of Object.entries(formulas)) {
    result[key] = evaluateFormula(note, formula);
  }
  return result;
}

// ── Filter evaluation ────────────────────────────────────────────────────────

function applyFilter(
  notes: IndexedNote[],
  filter: FilterGroup,
  warnings: string[]
): IndexedNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const result = evaluateFilterGroup(note, filter);
    if (!result.supported) {
      const reason = result.reason ?? "Unsupported filter expression";
      if (!seen.has(reason)) {
        seen.add(reason);
        warnings.push(reason);
      }
      return true; // include note if filter can't be evaluated
    }
    return result.matches;
  });
}

function evaluateFilterGroup(
  note: IndexedNote,
  group: FilterGroup
): EvalResult {
  let hasAnyBranch = false;

  if (group.and) {
    hasAnyBranch = true;
    for (const item of group.and) {
      const result = isFilterCondition(item)
        ? evaluateCondition(note, item)
        : evaluateFilterGroup(note, item);
      if (!result.supported) return result;
      if (!result.matches) return { supported: true, matches: false };
    }
  }

  if (group.or) {
    hasAnyBranch = true;
    let anyMatch = false;
    for (const item of group.or) {
      const result = isFilterCondition(item)
        ? evaluateCondition(note, item)
        : evaluateFilterGroup(note, item);
      if (!result.supported) { if (!anyMatch) return result; }
      if (result.matches) { anyMatch = true; break; }
    }
    if (!anyMatch) return { supported: true, matches: false };
  }

  if (group.not) {
    hasAnyBranch = true;
    const inner = isFilterCondition(group.not)
      ? evaluateCondition(note, group.not)
      : evaluateFilterGroup(note, group.not);
    if (!inner.supported) return inner;
    if (inner.matches) return { supported: true, matches: false };
  }

  // all present branches matched (or empty group matches everything)
  return { supported: true, matches: true };
}

function isFilterCondition(
  item: FilterGroup | FilterCondition
): item is FilterCondition {
  return "property" in item && "operator" in item;
}

function evaluateCondition(
  note: IndexedNote,
  condition: FilterCondition
): EvalResult {
  const { property, operator, value } = condition;

  // file helper functions
  if (property.startsWith("file.")) {
    return evaluateFileHelper(note, property, operator, value);
  }

  const noteVal = resolveProperty(note, property);
  return evaluateOperator(noteVal, operator, value);
}

function evaluateFileHelper(
  note: IndexedNote,
  property: string,
  operator: FilterOperator,
  value: unknown
): EvalResult {
  // file.hasTag("tag")
  const hasTagMatch = /^file\.hasTag\(["'](.+?)["']\)$/.exec(property);
  if (hasTagMatch) {
    const tag = hasTagMatch[1] ?? "";
    const has = note.tags.includes(tag);
    return { supported: true, matches: operator === "eq" ? has : !has };
  }

  // file.inFolder("folder")
  const inFolderMatch = /^file\.inFolder\(["'](.+?)["']\)$/.exec(property);
  if (inFolderMatch) {
    const folder = inFolderMatch[1] ?? "";
    const inFolder = note.folder === folder || note.folder.startsWith(folder + "/");
    return { supported: true, matches: operator === "eq" ? inFolder : !inFolder };
  }

  // file.hasLink("Note") — not implemented but gracefully degraded
  const hasLinkMatch = /^file\.hasLink\(["'](.+?)["']\)$/.exec(property);
  if (hasLinkMatch) {
    return {
      supported: false,
      matches: true,
      reason: `file.hasLink() is not yet supported`,
    };
  }

  // standard file properties
  const fileProps: Record<string, unknown> = {
    "file.name": note.name,
    "file.path": note.path,
    "file.folder": note.folder,
    "file.ext": note.ext,
    "file.mtime": note.mtime,
    "file.ctime": note.ctime,
    "file.tags": note.tags,
  };

  if (property in fileProps) {
    return evaluateOperator(fileProps[property], operator, value);
  }

  return {
    supported: false,
    matches: true,
    reason: `Unknown file property: "${property}"`,
  };
}

function evaluateOperator(
  noteVal: unknown,
  operator: FilterOperator,
  filterVal: unknown
): EvalResult {
  switch (operator) {
    case "exists":
      return { supported: true, matches: noteVal !== undefined && noteVal !== null };
    case "empty":
      return {
        supported: true,
        matches: noteVal === undefined || noteVal === null || noteVal === "",
      };
    case "eq":
      return { supported: true, matches: looseEqual(noteVal, filterVal) };
    case "neq":
      return { supported: true, matches: !looseEqual(noteVal, filterVal) };
    case "gt":
      return { supported: true, matches: compareValues(noteVal, filterVal) > 0 };
    case "lt":
      return { supported: true, matches: compareValues(noteVal, filterVal) < 0 };
    case "gte":
      return { supported: true, matches: compareValues(noteVal, filterVal) >= 0 };
    case "lte":
      return { supported: true, matches: compareValues(noteVal, filterVal) <= 0 };
    case "contains":
      return { supported: true, matches: containsValue(noteVal, filterVal) };
    default:
      return {
        supported: false,
        matches: true,
        reason: `Unsupported operator: "${operator as string}"`,
      };
  }
}

// ── Sorting ──────────────────────────────────────────────────────────────────

function applySorting(
  notes: IndexedNote[],
  sorts: SortDefinition[]
): IndexedNote[] {
  return [...notes].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = resolveProperty(a, sort.property);
      const bVal = resolveProperty(b, sort.property);
      const cmp = compareValues(aVal, bVal);
      if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

// ── Formula evaluation ───────────────────────────────────────────────────────

function evaluateFormula(
  note: IndexedNote,
  formula: FormulaDefinition
): unknown {
  const expr = formula.expression.trim();

  // simple property reference: "frontmatter.field"
  if (/^[\w.]+$/.test(expr)) {
    return resolveProperty(note, expr);
  }

  // concat("a", prop, "b")
  const concatMatch = /^concat\((.+)\)$/.exec(expr);
  if (concatMatch) {
    const args = splitArgs(concatMatch[1] ?? "");
    return args
      .map((arg) => {
        const strMatch = /^["'](.*)["']$/.exec(arg.trim());
        if (strMatch) return strMatch[1];
        return String(resolveProperty(note, arg.trim()) ?? "");
      })
      .join("");
  }

  // length(prop)
  const lengthMatch = /^length\((.+)\)$/.exec(expr);
  if (lengthMatch) {
    const val = resolveProperty(note, lengthMatch[1]?.trim() ?? "");
    if (typeof val === "string") return val.length;
    if (Array.isArray(val)) return val.length;
    return 0;
  }

  // lower(prop), upper(prop)
  const lowerMatch = /^lower\((.+)\)$/.exec(expr);
  if (lowerMatch) {
    const val = resolveProperty(note, lowerMatch[1]?.trim() ?? "");
    return typeof val === "string" ? val.toLowerCase() : val;
  }

  const upperMatch = /^upper\((.+)\)$/.exec(expr);
  if (upperMatch) {
    const val = resolveProperty(note, upperMatch[1]?.trim() ?? "");
    return typeof val === "string" ? val.toUpperCase() : val;
  }

  // default(prop, fallback)
  const defaultMatch = /^default\((.+)\)$/.exec(expr);
  if (defaultMatch) {
    const args = splitArgs(defaultMatch[1] ?? "");
    if (args.length >= 2) {
      const val = resolveProperty(note, args[0]?.trim() ?? "");
      if (val !== undefined && val !== null && val !== "") return val;
      const fallback = args[1]?.trim() ?? "";
      const strMatch = /^["'](.*)["']$/.exec(fallback);
      return strMatch ? strMatch[1] : fallback;
    }
  }

  return `[unsupported formula: ${expr}]`;
}

function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let inStr: string | null = null;
  let depth = 0;

  for (const ch of argsStr) {
    if (inStr) {
      current += ch;
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

// ── Property resolution ──────────────────────────────────────────────────────

export function resolveProperty(note: IndexedNote, property: string): unknown {
  // file.* properties
  if (property === "file.name") return note.name;
  if (property === "file.path") return note.path;
  if (property === "file.folder") return note.folder;
  if (property === "file.ext") return note.ext;
  if (property === "file.mtime") return note.mtime;
  if (property === "file.ctime") return note.ctime;
  if (property === "file.tags" || property === "tags") return note.tags;

  // frontmatter property (nested via dot notation)
  const parts = property.split(".");
  let current: unknown = note.frontmatter;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Utility functions ────────────────────────────────────────────────────────

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  const aStr = String(a);
  const bStr = String(b);

  // try numeric comparison
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;

  return aStr.localeCompare(bStr);
}

function containsValue(noteVal: unknown, filterVal: unknown): boolean {
  if (noteVal === null || noteVal === undefined) return false;
  const searchStr = String(filterVal ?? "").toLowerCase();

  if (Array.isArray(noteVal)) {
    return noteVal.some(
      (item) => String(item).toLowerCase().includes(searchStr)
    );
  }

  return String(noteVal).toLowerCase().includes(searchStr);
}
