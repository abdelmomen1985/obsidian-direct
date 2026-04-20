import { readFile } from "fs/promises";
import { join } from "path";
import { config } from "../config.ts";
import { getAllFiles } from "../wikilink-index.ts";

export interface SearchResult {
  path: string;
  lineNumber: number;
  snippet: string;
}

const MAX_RESULTS = 100;
const SNIPPET_CONTEXT = 60;

export async function handleSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ error: "Query too short" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const queryLower = query.toLowerCase();
  const files = getAllFiles();
  const results: SearchResult[] = [];

  for (const relPath of files) {
    if (results.length >= MAX_RESULTS) break;
    const abs = join(config.vaultPath, relPath);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch {
      continue;
    }

    const lines = text.split("\n");
    for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
      const line = lines[i] ?? "";
      const idx = line.toLowerCase().indexOf(queryLower);
      if (idx === -1) continue;

      const start = Math.max(0, idx - SNIPPET_CONTEXT);
      const end = Math.min(line.length, idx + query.length + SNIPPET_CONTEXT);
      const snippet =
        (start > 0 ? "…" : "") +
        line.slice(start, end) +
        (end < line.length ? "…" : "");

      results.push({ path: relPath, lineNumber: i + 1, snippet });
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}
