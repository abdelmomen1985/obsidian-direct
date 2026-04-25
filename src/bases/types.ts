import type { Document } from "yaml";

// ── Vault index types ────────────────────────────────────────────────────────

export interface IndexedNote {
  path: string;
  name: string;
  folder: string;
  ext: string;
  mtime: number;
  ctime: number;
  tags: string[];
  frontmatter: Record<string, unknown>;
}

// ── Base definition types ────────────────────────────────────────────────────

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "exists"
  | "empty";

export interface FilterCondition {
  property: string;
  operator: FilterOperator;
  value?: unknown | undefined;
  _sourceIndex?: number | undefined;
}

export interface FilterGroup {
  and?: Array<FilterGroup | FilterCondition> | undefined;
  or?: Array<FilterGroup | FilterCondition> | undefined;
  not?: FilterGroup | FilterCondition | undefined;
  _sourceIndex?: number | undefined;
}

export interface FormulaDefinition {
  expression: string;
  type?: string | undefined;
}

export interface PropertyDefinition {
  name: string;
  type?: string | undefined;
  label?: string | undefined;
  hidden?: boolean | undefined;
  width?: number | undefined;
}

export type ViewType = "table" | "board" | "calendar" | "gallery" | "list";

export interface SortDefinition {
  property: string;
  direction: "asc" | "desc";
}

export interface GroupDefinition {
  property: string;
  direction?: "asc" | "desc" | undefined;
}

export interface ViewDefinition {
  name: string;
  type: ViewType;
  filter?: FilterGroup | undefined;
  sort?: SortDefinition[] | undefined;
  group?: GroupDefinition | undefined;
  columns?: string[] | undefined;
  limit?: number | undefined;
  _supported: boolean;
  _unsupportedReason?: string | undefined;
}

export interface BaseDefinition {
  filters?: FilterGroup | undefined;
  formulas?: Record<string, FormulaDefinition> | undefined;
  properties?: PropertyDefinition[] | undefined;
  views?: ViewDefinition[] | undefined;
  unknownKeys: Record<string, unknown>;
  rawYaml: string;
  rawDocument?: Document | undefined;
}

// ── Query result types ───────────────────────────────────────────────────────

export interface QueryResult {
  notes: IndexedNote[];
  total: number;
  warnings: string[];
}

export interface EvalResult {
  supported: boolean;
  matches: boolean;
  reason?: string | undefined;
}
