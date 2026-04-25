import { parseDocument } from "yaml";
import type {
  BaseDefinition,
  FilterGroup,
  FilterCondition,
  FilterOperator,
  FormulaDefinition,
  PropertyDefinition,
  ViewDefinition,
  ViewType,
  SortDefinition,
  GroupDefinition,
} from "./types.ts";

const SUPPORTED_VIEW_TYPES: ViewType[] = ["table"];
const KNOWN_TOP_LEVEL_KEYS = new Set([
  "filters",
  "formulas",
  "properties",
  "views",
]);

const VALID_OPERATORS: FilterOperator[] = [
  "eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists", "empty",
];

export interface ParseResult {
  definition: BaseDefinition;
  warnings: string[];
}

export function parseBaseYaml(yaml: string): ParseResult {
  const warnings: string[] = [];
  const doc = parseDocument(yaml, { keepSourceTokens: true });

  if (doc.errors.length > 0) {
    warnings.push(
      ...doc.errors.map((e) => `YAML parse error: ${e.message}`)
    );
  }

  const raw = doc.toJSON();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      definition: {
        rawYaml: yaml,
        rawDocument: doc,
        unknownKeys: {},
      },
      warnings: ["Base file does not contain a YAML mapping"],
    };
  }

  const obj = raw as Record<string, unknown>;
  const unknownKeys: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      unknownKeys[key] = obj[key];
    }
  }

  const filters = parseFilters(obj["filters"], warnings);
  const formulas = parseFormulas(obj["formulas"], warnings);
  const properties = parseProperties(obj["properties"], warnings);
  const views = parseViews(obj["views"], warnings);

  return {
    definition: {
      filters: filters ?? undefined,
      formulas: formulas ?? undefined,
      properties: properties ?? undefined,
      views: views ?? undefined,
      unknownKeys,
      rawYaml: yaml,
      rawDocument: doc,
    },
    warnings,
  };
}

function parseFilters(
  raw: unknown,
  warnings: string[]
): FilterGroup | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("filters: expected a mapping");
    return null;
  }
  return parseFilterGroup(raw as Record<string, unknown>, warnings);
}

function parseFilterGroup(
  obj: Record<string, unknown>,
  warnings: string[]
): FilterGroup {
  const group: FilterGroup = {};

  if ("and" in obj && Array.isArray(obj["and"])) {
    group.and = (obj["and"] as unknown[])
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item)
      )
      .map((item) => {
        if ("property" in item && "operator" in item) {
          return parseFilterCondition(item, warnings);
        }
        return parseFilterGroup(item, warnings);
      });
  }

  if ("or" in obj && Array.isArray(obj["or"])) {
    group.or = (obj["or"] as unknown[])
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item)
      )
      .map((item) => {
        if ("property" in item && "operator" in item) {
          return parseFilterCondition(item, warnings);
        }
        return parseFilterGroup(item, warnings);
      });
  }

  if ("not" in obj && typeof obj["not"] === "object" && obj["not"] !== null) {
    const notObj = obj["not"] as Record<string, unknown>;
    if ("property" in notObj && "operator" in notObj) {
      group.not = parseFilterCondition(notObj, warnings);
    } else {
      group.not = parseFilterGroup(notObj, warnings);
    }
  }

  // direct condition at top level (shorthand)
  if ("property" in obj && "operator" in obj) {
    group.and = [parseFilterCondition(obj, warnings)];
  }

  return group;
}

function parseFilterCondition(
  obj: Record<string, unknown>,
  warnings: string[]
): FilterCondition {
  const property = String(obj["property"] ?? "");
  const rawOp = String(obj["operator"] ?? "eq");
  const operator: FilterOperator = VALID_OPERATORS.includes(rawOp as FilterOperator)
    ? (rawOp as FilterOperator)
    : "eq";

  if (!VALID_OPERATORS.includes(rawOp as FilterOperator)) {
    warnings.push(`Unknown filter operator: "${rawOp}", defaulting to "eq"`);
  }

  return {
    property,
    operator,
    value: obj["value"],
  };
}

function parseFormulas(
  raw: unknown,
  warnings: string[]
): Record<string, FormulaDefinition> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("formulas: expected a mapping");
    return null;
  }

  const result: Record<string, FormulaDefinition> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") {
      result[key] = { expression: val };
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      result[key] = {
        expression: String(obj["expression"] ?? ""),
        type: typeof obj["type"] === "string" ? obj["type"] : undefined,
      };
    } else {
      warnings.push(`formulas.${key}: expected string or mapping`);
    }
  }
  return result;
}

function parseProperties(
  raw: unknown,
  warnings: string[]
): PropertyDefinition[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    warnings.push("properties: expected a list");
    return null;
  }

  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
    .map((item) => {
      const name = String(item["name"] ?? "");
      if (!name) warnings.push("properties: found entry without name");
      return {
        name,
        type: typeof item["type"] === "string" ? item["type"] : undefined,
        label: typeof item["label"] === "string" ? item["label"] : undefined,
        hidden: typeof item["hidden"] === "boolean" ? item["hidden"] : undefined,
        width: typeof item["width"] === "number" ? item["width"] : undefined,
      };
    });
}

function parseViews(
  raw: unknown,
  warnings: string[]
): ViewDefinition[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    warnings.push("views: expected a list");
    return null;
  }

  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
    .map((item) => {
      const name = String(item["name"] ?? "Untitled View");
      const type = String(item["type"] ?? "table") as ViewType;
      const supported = SUPPORTED_VIEW_TYPES.includes(type);

      if (!supported) {
        warnings.push(
          `View "${name}" uses unsupported type "${type}" — it will be shown as a placeholder`
        );
      }

      let filter: FilterGroup | undefined;
      if (item["filter"] && typeof item["filter"] === "object" && !Array.isArray(item["filter"])) {
        filter = parseFilterGroup(item["filter"] as Record<string, unknown>, warnings);
      }

      let sort: SortDefinition[] | undefined;
      if (Array.isArray(item["sort"])) {
        sort = (item["sort"] as unknown[])
          .filter((s): s is Record<string, unknown> =>
            s !== null && typeof s === "object" && !Array.isArray(s)
          )
          .map((s) => ({
            property: String(s["property"] ?? ""),
            direction: s["direction"] === "desc" ? "desc" as const : "asc" as const,
          }));
      }

      let group: GroupDefinition | undefined;
      if (item["group"] && typeof item["group"] === "object" && !Array.isArray(item["group"])) {
        const g = item["group"] as Record<string, unknown>;
        group = {
          property: String(g["property"] ?? ""),
          direction: g["direction"] === "desc" ? "desc" as const : "asc" as const,
        };
      }

      const columns = Array.isArray(item["columns"])
        ? (item["columns"] as unknown[]).filter((c): c is string => typeof c === "string")
        : undefined;

      const limit = typeof item["limit"] === "number" ? item["limit"] : undefined;

      return {
        name,
        type,
        filter,
        sort,
        group,
        columns,
        limit,
        _supported: supported,
        _unsupportedReason: supported
          ? undefined
          : `View type "${type}" is not yet supported`,
      };
    });
}
