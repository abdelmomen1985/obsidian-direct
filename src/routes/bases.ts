import { readFile, writeFile, rename, stat } from "fs/promises";
import { readdir } from "fs/promises";
import { join, extname, relative } from "path";
import { config } from "../config.ts";
import { safeResolveStat } from "../paths.ts";
import { PathError } from "../paths.ts";
import { VaultIndex } from "../bases/vault-index.ts";
import { parseBaseYaml } from "../bases/base-parser.ts";
import {
  executeQuery,
  groupNotes,
  evaluateFormulas,
} from "../bases/filter-engine.ts";
import { updateFrontmatterProperty } from "../bases/frontmatter.ts";
import { applyMutation, type Mutation } from "../bases/base-editor.ts";
import type { BaseDefinition } from "../bases/types.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Singleton vault index ────────────────────────────────────────────────────

let vaultIndex: VaultIndex | null = null;

export async function getVaultIndex(): Promise<VaultIndex> {
  if (!vaultIndex) {
    vaultIndex = new VaultIndex(config.vaultPath);
    await vaultIndex.build();
    vaultIndex.startWatching();
  }
  return vaultIndex;
}

// ── Index endpoints ──────────────────────────────────────────────────────────

export async function handleGetIndex(): Promise<Response> {
  const index = await getVaultIndex();
  return json({
    notes: index.getAllNotes(),
    count: index.getNoteCount(),
  });
}

export async function handleGetNoteMeta(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path");
  if (!relPath) return json({ error: "Missing path" }, 400);

  const index = await getVaultIndex();
  const note = index.getNote(relPath);
  if (!note) return json({ error: "Note not found in index" }, 404);
  return json(note);
}

export async function handleRebuildIndex(): Promise<Response> {
  const index = await getVaultIndex();
  await index.build();
  return json({ ok: true, count: index.getNoteCount() });
}

// ── .base file endpoints ─────────────────────────────────────────────────────

export async function handleGetBase(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path");
  if (!relPath) return json({ error: "Missing path" }, 400);

  try {
    const abs = await safeResolveStat(config.vaultPath, relPath, "read");
    const ext = extname(abs).toLowerCase();
    if (ext !== ".base") return json({ error: "Not a .base file" }, 400);

    const content = await readFile(abs, "utf-8");
    const { definition, warnings } = parseBaseYaml(content);

    return json({
      path: relPath,
      definition: serializeDefinition(definition),
      warnings,
    });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    return json(
      { error: isNotFound ? "Base file not found" : "Read failed" },
      isNotFound ? 404 : 500
    );
  }
}

export async function handleListBases(): Promise<Response> {
  try {
    const bases = await findBaseFiles(config.vaultPath, config.vaultPath);
    return json({ bases });
  } catch (err) {
    console.error("list bases error:", err);
    return json({ error: "Failed to list .base files" }, 500);
  }
}

async function findBaseFiles(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const bases: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      bases.push(...(await findBaseFiles(full, root)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".base") {
      bases.push(relative(root, full));
    }
  }
  return bases;
}

// ── Query endpoint ───────────────────────────────────────────────────────────

export async function handleQuery(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const basePath = url.searchParams.get("base");
  const viewIndexStr = url.searchParams.get("view");
  const viewIndex = viewIndexStr ? parseInt(viewIndexStr, 10) : 0;

  if (!basePath) return json({ error: "Missing base path" }, 400);

  try {
    const abs = await safeResolveStat(config.vaultPath, basePath, "read");
    const ext = extname(abs).toLowerCase();
    if (ext !== ".base") return json({ error: "Not a .base file" }, 400);
    const content = await readFile(abs, "utf-8");
    const baseStat = await stat(abs);
    const { definition, warnings: parseWarnings } = parseBaseYaml(content);

    const index = await getVaultIndex();
    const allNotes = index.getAllNotes();
    const result = executeQuery(allNotes, definition, viewIndex);

    // compute formula values for each note
    const notesWithFormulas = result.notes.map((note) => {
      const formulaValues = definition.formulas
        ? evaluateFormulas(note, definition.formulas)
        : {};
      return { ...note, formulaValues };
    });

    // handle grouping
    const view = definition.views?.[viewIndex];
    let grouped: Record<string, typeof notesWithFormulas> | null = null;
    if (view?.group) {
      const groups = groupNotes(result.notes, view.group);
      grouped = {};
      for (const [key, notes] of groups.entries()) {
        grouped[key] = notes.map((note) => {
          const formulaValues = definition.formulas
            ? evaluateFormulas(note, definition.formulas)
            : {};
          return { ...note, formulaValues };
        });
      }
    }

    return json({
      notes: grouped ?? notesWithFormulas,
      total: result.total,
      warnings: [...parseWarnings, ...result.warnings],
      definition: serializeDefinition(definition),
      mtime: baseStat.mtimeMs,
    });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    return json(
      { error: isNotFound ? "Base file not found" : "Query failed" },
      isNotFound ? 404 : 500
    );
  }
}

// ── Property editing endpoint ────────────────────────────────────────────────

export async function handleUpdateProperty(req: Request): Promise<Response> {
  let body: {
    notePath?: string;
    property?: string;
    value?: unknown;
    mtime?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { notePath, property, value, mtime: clientMtime } = body;
  if (!notePath || !property) {
    return json({ error: "Missing notePath or property" }, 400);
  }

  try {
    const abs = await safeResolveStat(config.vaultPath, notePath, "write");

    // read current content
    let content: string;
    try {
      content = await readFile(abs, "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return json({ error: "Note not found" }, 404);
      }
      throw e;
    }

    // check mtime for conflict detection
    const currentStat = await stat(abs);
    if (typeof clientMtime === "number" && currentStat.mtimeMs > clientMtime) {
      return json({
        error: "File has been modified since it was loaded. Please reload.",
        conflict: true,
        currentMtime: currentStat.mtimeMs,
      }, 409);
    }

    // update the frontmatter property
    const updatedContent = updateFrontmatterProperty(content, property, value);

    // atomic write
    const tmp = `${abs}.tmp-${process.pid}`;
    await writeFile(tmp, updatedContent, "utf-8");
    await rename(tmp, abs);

    // re-index this note (single-file, not a full vault rescan)
    const idx = await getVaultIndex();
    await idx.reindexNote(notePath);

    const updated = idx.getNote(notePath);
    return json({ ok: true, mtime: updated?.mtime });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    console.error("update property error:", err);
    return json({ error: "Update failed" }, 500);
  }
}

// ── Base definition mutation endpoint ────────────────────────────────────────

export async function handleMutateBase(req: Request): Promise<Response> {
  let body: { basePath?: string; mutation?: Mutation; mtime?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { basePath, mutation, mtime: clientMtime } = body;
  if (!basePath) return json({ error: "Missing basePath" }, 400);
  if (!mutation || typeof mutation !== "object" || !("type" in mutation)) {
    return json({ error: "Missing or invalid mutation" }, 400);
  }

  try {
    const abs = await safeResolveStat(config.vaultPath, basePath, "write");
    const ext = extname(abs).toLowerCase();
    if (ext !== ".base") return json({ error: "Not a .base file" }, 400);

    const content = await readFile(abs, "utf-8");
    const currentStat = await stat(abs);
    if (typeof clientMtime === "number" && currentStat.mtimeMs > clientMtime) {
      return json(
        {
          error: "Base file was modified externally. Please reload.",
          conflict: true,
          currentMtime: currentStat.mtimeMs,
        },
        409
      );
    }

    const result = applyMutation(content, mutation);
    const tmp = `${abs}.tmp-${process.pid}`;
    await writeFile(tmp, result.yaml, "utf-8");
    await rename(tmp, abs);

    const newStat = await stat(abs);
    const { definition, warnings } = parseBaseYaml(result.yaml);

    return json({
      ok: true,
      changed: result.changed,
      yaml: result.yaml,
      mtime: newStat.mtimeMs,
      definition: serializeDefinition(definition),
      warnings,
    });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    const msg = err instanceof Error ? err.message : "Mutation failed";
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) return json({ error: "Base file not found" }, 404);
    return json({ error: msg }, 400);
  }
}

// ── Inline YAML query (for embedded bases in markdown) ───────────────────────

export async function handleQueryInline(req: Request): Promise<Response> {
  let body: { yaml?: string; viewIndex?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const yaml = body.yaml ?? "";
  const viewIndex = typeof body.viewIndex === "number" ? body.viewIndex : 0;
  if (!yaml.trim()) return json({ error: "Missing yaml" }, 400);

  try {
    const { definition, warnings: parseWarnings } = parseBaseYaml(yaml);
    const index = await getVaultIndex();
    const allNotes = index.getAllNotes();
    const result = executeQuery(allNotes, definition, viewIndex);

    const notesWithFormulas = result.notes.map((note) => {
      const formulaValues = definition.formulas
        ? evaluateFormulas(note, definition.formulas)
        : {};
      return { ...note, formulaValues };
    });

    const view = definition.views?.[viewIndex];
    let grouped: Record<string, typeof notesWithFormulas> | null = null;
    if (view?.group) {
      const groups = groupNotes(result.notes, view.group);
      grouped = {};
      for (const [key, notes] of groups.entries()) {
        grouped[key] = notes.map((note) => {
          const formulaValues = definition.formulas
            ? evaluateFormulas(note, definition.formulas)
            : {};
          return { ...note, formulaValues };
        });
      }
    }

    return json({
      notes: grouped ?? notesWithFormulas,
      total: result.total,
      warnings: [...parseWarnings, ...result.warnings],
      definition: serializeDefinition(definition),
    });
  } catch (err) {
    console.error("inline query error:", err);
    return json({ error: "Query failed" }, 500);
  }
}

// ── Serialization helper ─────────────────────────────────────────────────────

function serializeDefinition(def: BaseDefinition): Record<string, unknown> {
  return {
    filters: def.filters ?? null,
    formulas: def.formulas ?? null,
    properties: def.properties ?? null,
    views: def.views ?? null,
    unknownKeys: def.unknownKeys,
  };
}
