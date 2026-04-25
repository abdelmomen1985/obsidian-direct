import { readFile } from "fs/promises";
import { join } from "path";
import { config } from "../config.ts";
import { getAllFiles } from "../wikilink-index.ts";

export interface BacklinkResult {
  path: string;
  context: string;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function extractLinkedNames(text: string): string[] {
  const names: string[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(text)) !== null) {
    const inner = m[1] ?? "";
    const bare = inner.split("#")[0]?.split("|")[0]?.trim().toLowerCase() ?? "";
    if (bare) names.push(bare);
  }
  return names;
}

export async function handleBacklinks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetPath = url.searchParams.get("path");
  if (!targetPath) {
    return new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetName = targetPath
    .split("/")
    .pop()
    ?.replace(/\.md$/i, "")
    .toLowerCase() ?? "";

  const files = getAllFiles();
  const results: BacklinkResult[] = [];

  for (const relPath of files) {
    if (relPath === targetPath) continue;
    const abs = join(config.vaultPath, relPath);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch {
      continue;
    }

    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const linked = extractLinkedNames(line);
      if (linked.includes(targetName)) {
        results.push({
          path: relPath,
          context: line.trim().slice(0, 120),
        });
        break;
      }
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}
