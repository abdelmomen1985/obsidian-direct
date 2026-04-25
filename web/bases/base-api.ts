export interface IndexedNote {
  path: string;
  name: string;
  folder: string;
  ext: string;
  mtime: number;
  ctime: number;
  tags: string[];
  frontmatter: Record<string, unknown>;
  formulaValues?: Record<string, unknown>;
}

export interface FilterCondition {
  property: string;
  operator: string;
  value?: unknown;
}

export interface FilterGroup {
  and?: Array<FilterGroup | FilterCondition>;
  or?: Array<FilterGroup | FilterCondition>;
  not?: FilterGroup | FilterCondition;
}

export interface PropertyDefinition {
  name: string;
  type?: string;
  label?: string;
  hidden?: boolean;
  width?: number;
}

export interface SortDefinition {
  property: string;
  direction: "asc" | "desc";
}

export interface GroupDefinition {
  property: string;
  direction?: "asc" | "desc";
}

export interface ViewDefinition {
  name: string;
  type: string;
  filter?: FilterGroup;
  sort?: SortDefinition[];
  group?: GroupDefinition;
  columns?: string[];
  limit?: number;
  _supported: boolean;
  _unsupportedReason?: string;
}

export interface BaseDefinition {
  filters: FilterGroup | null;
  formulas: Record<string, { expression: string; type?: string }> | null;
  properties: PropertyDefinition[] | null;
  views: ViewDefinition[] | null;
  unknownKeys: Record<string, unknown>;
}

export interface QueryResponse {
  notes: IndexedNote[] | Record<string, IndexedNote[]>;
  total: number;
  warnings: string[];
  definition: BaseDefinition;
  mtime?: number;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
  return res;
}

export async function getBasesList(): Promise<string[]> {
  const res = await apiFetch("/api/bases/list");
  if (!res.ok) throw new Error("Failed to list bases");
  const data = (await res.json()) as { bases: string[] };
  return data.bases;
}

export async function getBase(path: string): Promise<{ definition: BaseDefinition; warnings: string[] }> {
  const res = await apiFetch(`/api/bases/base?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to load base");
  return (await res.json()) as { definition: BaseDefinition; warnings: string[] };
}

export async function queryBase(
  basePath: string,
  viewIndex = 0
): Promise<QueryResponse> {
  const res = await apiFetch(
    `/api/bases/query?base=${encodeURIComponent(basePath)}&view=${viewIndex}`
  );
  if (!res.ok) throw new Error("Query failed");
  return (await res.json()) as QueryResponse;
}

export async function updateProperty(
  notePath: string,
  property: string,
  value: unknown,
  mtime?: number
): Promise<void> {
  const body: Record<string, unknown> = { notePath, property, value };
  if (mtime !== undefined) body["mtime"] = mtime;

  const res = await apiFetch("/api/bases/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string; conflict?: boolean };
    if (data.conflict) {
      throw new Error("CONFLICT: " + (data.error ?? "File modified"));
    }
    throw new Error(data.error ?? "Update failed");
  }
}

export async function getVaultIndex(): Promise<{ notes: IndexedNote[]; count: number }> {
  const res = await apiFetch("/api/bases/index");
  if (!res.ok) throw new Error("Failed to load index");
  return (await res.json()) as { notes: IndexedNote[]; count: number };
}

// ── Base definition mutations ────────────────────────────────────────────────

export interface PropertyPatch {
  name: string;
  type?: string | null;
  label?: string | null;
  width?: number | null;
  hidden?: boolean | null;
}

export type BaseMutation =
  | { type: "addProperty"; property: PropertyPatch }
  | { type: "updateProperty"; oldName: string; property: PropertyPatch }
  | { type: "removeProperty"; name: string }
  | { type: "addColumn"; viewIndex: number; column: string; index?: number }
  | { type: "removeColumn"; viewIndex: number; column: string }
  | { type: "reorderColumns"; viewIndex: number; columns: string[] }
  | { type: "addView"; view: { name: string; type?: string } }
  | { type: "removeView"; viewIndex: number };

export interface MutationResponse {
  ok: true;
  changed: boolean;
  yaml: string;
  mtime: number;
  definition: BaseDefinition;
  warnings: string[];
}

export async function mutateBase(
  basePath: string,
  mutation: BaseMutation,
  mtime?: number
): Promise<MutationResponse> {
  const body: Record<string, unknown> = { basePath, mutation };
  if (mtime !== undefined) body["mtime"] = mtime;

  const res = await apiFetch("/api/bases/definition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; conflict?: boolean };
    if (data.conflict) throw new Error("CONFLICT: " + (data.error ?? "Base modified"));
    throw new Error(data.error ?? "Mutation failed");
  }
  return (await res.json()) as MutationResponse;
}

export async function queryBaseInline(yaml: string, viewIndex = 0): Promise<QueryResponse> {
  const res = await apiFetch("/api/bases/query-inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml, viewIndex }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Inline query failed");
  }
  return (await res.json()) as QueryResponse;
}
