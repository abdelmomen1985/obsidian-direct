import { readdir, readFile, stat } from "fs/promises";
import { watch, type FSWatcher } from "fs";
import { join, basename, extname, dirname, relative } from "path";
import {
  parseFrontmatter,
  extractInlineTags,
  extractFrontmatterTags,
} from "./frontmatter.ts";
import type { IndexedNote } from "./types.ts";

export class VaultIndex {
  private notes = new Map<string, IndexedNote>();
  private vaultRoot: string;
  private watcher: FSWatcher | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  async build(): Promise<void> {
    const files = await this.walkVault(this.vaultRoot);
    const newNotes = new Map<string, IndexedNote>();
    for (const absPath of files) {
      const relPath = relative(this.vaultRoot, absPath);
      try {
        const note = await this.indexFile(absPath, relPath);
        if (note) newNotes.set(relPath, note);
      } catch {
        // skip files that can't be read
      }
    }
    this.notes = newNotes;
  }

  startWatching(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(
        this.vaultRoot,
        { recursive: true },
        (_event, filename) => {
          if (!filename) return;
          const fn = filename.toString();
          if (fn.startsWith(".") || fn.includes("/.") || fn.includes("\\.")) return;
          if (extname(fn).toLowerCase() !== ".md") return;
          void this.reindexFile(fn);
        }
      );
    } catch {
      // watch not supported on all platforms; degrade gracefully
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getNote(relPath: string): IndexedNote | undefined {
    return this.notes.get(relPath);
  }

  getAllNotes(): IndexedNote[] {
    return [...this.notes.values()];
  }

  getNoteCount(): number {
    return this.notes.size;
  }

  getNotesInFolder(folder: string): IndexedNote[] {
    return this.getAllNotes().filter((n) => n.folder === folder || n.folder.startsWith(folder + "/"));
  }

  getNotesWithTag(tag: string): IndexedNote[] {
    return this.getAllNotes().filter((n) => n.tags.includes(tag));
  }

  removeNote(relPath: string): void {
    this.notes.delete(relPath);
  }

  private async reindexFile(relPath: string): Promise<void> {
    const absPath = join(this.vaultRoot, relPath);
    try {
      const s = await stat(absPath);
      if (!s.isFile()) {
        this.notes.delete(relPath);
        return;
      }
      const note = await this.indexFile(absPath, relPath);
      if (note) {
        this.notes.set(relPath, note);
      }
    } catch {
      this.notes.delete(relPath);
    }
  }

  private async indexFile(
    absPath: string,
    relPath: string
  ): Promise<IndexedNote | null> {
    const ext = extname(absPath).toLowerCase();
    if (ext !== ".md") return null;

    let content: string;
    try {
      content = await readFile(absPath, "utf-8");
    } catch {
      return null;
    }

    let fileStat;
    try {
      fileStat = await stat(absPath);
    } catch {
      return null;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const fmTags = extractFrontmatterTags(frontmatter);
    const inlineTags = extractInlineTags(body);
    const allTags = [...new Set([...fmTags, ...inlineTags])];

    return {
      path: relPath,
      name: basename(relPath, ".md"),
      folder: dirname(relPath) === "." ? "" : dirname(relPath),
      ext,
      mtime: fileStat.mtimeMs,
      ctime: fileStat.birthtimeMs || fileStat.ctimeMs,
      tags: allTags,
      frontmatter,
    };
  }

  private async walkVault(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walkVault(full)));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        files.push(full);
      }
    }
    return files;
  }
}
