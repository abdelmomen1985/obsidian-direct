import { resolve, sep, extname } from "path";
import { realpath } from "fs/promises";
import { existsSync } from "fs";

const READ_EXTS = new Set([
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);
const WRITE_EXTS = new Set([".md"]);

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

export function safeResolve(vaultRoot: string, relPath: string): string {
  if (!relPath || relPath.includes("\0")) throw new PathError("Invalid path");
  const abs = resolve(vaultRoot, relPath);
  if (!abs.startsWith(vaultRoot + sep) && abs !== vaultRoot) {
    throw new PathError("Path escapes vault root");
  }
  return abs;
}

export async function safeResolveStat(
  vaultRoot: string,
  relPath: string,
  mode: "read" | "write"
): Promise<string> {
  const abs = safeResolve(vaultRoot, relPath);
  const ext = extname(abs).toLowerCase();

  if (mode === "write" && !WRITE_EXTS.has(ext)) {
    throw new PathError("Only .md files may be written");
  }
  if (mode === "read" && !READ_EXTS.has(ext)) {
    throw new PathError("Extension not allowed");
  }

  // Resolve symlinks and recheck for existing files
  if (existsSync(abs)) {
    const real = await realpath(abs);
    if (!real.startsWith(vaultRoot + sep) && real !== vaultRoot) {
      throw new PathError("Symlink escapes vault root");
    }
  }

  return abs;
}

export function toRelPath(vaultRoot: string, absPath: string): string {
  return absPath.slice(vaultRoot.length + 1);
}
