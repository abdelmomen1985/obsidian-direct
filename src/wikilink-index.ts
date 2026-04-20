import { readdir } from "fs/promises";
import { join, basename, extname, relative } from "path";

type Index = Map<string, string[]>;

let index: Index = new Map();
let vaultRoot = "";

async function walkVault(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkVault(full, root)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(relative(root, full));
    }
  }
  return files;
}

export async function buildIndex(root: string): Promise<void> {
  vaultRoot = root;
  const files = await walkVault(root, root);
  const newIndex: Index = new Map();
  for (const relPath of files) {
    const key = basename(relPath, ".md").toLowerCase();
    const existing = newIndex.get(key) ?? [];
    existing.push(relPath);
    newIndex.set(key, existing);
  }
  index = newIndex;
}

export function addToIndex(relPath: string): void {
  const key = basename(relPath, ".md").toLowerCase();
  const existing = index.get(key) ?? [];
  if (!existing.includes(relPath)) {
    existing.push(relPath);
    index.set(key, existing);
  }
}

export function removeFromIndex(relPath: string): void {
  const key = basename(relPath, ".md").toLowerCase();
  const existing = index.get(key);
  if (!existing) return;
  const filtered = existing.filter((p) => p !== relPath);
  if (filtered.length === 0) index.delete(key);
  else index.set(key, filtered);
}

export type ResolveResult =
  | { found: true; path: string }
  | { found: false; candidates: string[] };

export function resolveWikilink(name: string): ResolveResult {
  // Strip heading and alias: [[Name#Heading|Alias]] → name = "Name"
  const bare = name.split("#")[0]?.split("|")[0]?.trim() ?? name;

  // Explicit path: contains "/" — try direct match first
  if (bare.includes("/")) {
    const lower = bare.toLowerCase().replace(/\.md$/i, "");
    for (const paths of index.values()) {
      for (const p of paths) {
        if (p.toLowerCase().replace(/\.md$/, "") === lower) {
          return { found: true, path: p };
        }
      }
    }
    return { found: false, candidates: [] };
  }

  const key = bare.toLowerCase();
  const matches = index.get(key);
  if (!matches || matches.length === 0) {
    return { found: false, candidates: [] };
  }
  if (matches.length === 1) {
    return { found: true, path: matches[0]! };
  }

  // Ambiguous: return shortest path as best guess + all candidates
  const sorted = [...matches].sort((a, b) => a.length - b.length);
  return { found: true, path: sorted[0]!, ...(sorted.length > 1 ? {} : {}) };
}

export function getAllFiles(): string[] {
  const all: string[] = [];
  for (const paths of index.values()) all.push(...paths);
  return all;
}
