import { readFile } from "fs/promises";
import { join } from "path";
import { config } from "../config.ts";
import { getAllFiles } from "../wikilink-index.ts";

export interface TagEntry {
  tag: string;
  count: number;
  files: string[];
}

const TAG_RE = /(?:^|\s)#([a-zA-Z\u0600-\u06FF][\w\u0600-\u06FF/-]*)/g;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]+`/g;
const FRONTMATTER_RE = /^---[\s\S]*?---\n?/;

function extractTags(text: string): string[] {
  const stripped = text
    .replace(FRONTMATTER_RE, "")
    .replace(CODE_BLOCK_RE, "")
    .replace(INLINE_CODE_RE, "");
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(stripped)) !== null) {
    const tag = m[1] ?? "";
    if (tag) tags.push(tag.toLowerCase());
  }
  return [...new Set(tags)];
}

export async function handleTags(_req: Request): Promise<Response> {
  const files = getAllFiles();
  const tagMap = new Map<string, string[]>();

  for (const relPath of files) {
    const abs = join(config.vaultPath, relPath);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch {
      continue;
    }

    const tags = extractTags(text);
    for (const tag of tags) {
      const existing = tagMap.get(tag) ?? [];
      existing.push(relPath);
      tagMap.set(tag, existing);
    }
  }

  const entries: TagEntry[] = [];
  for (const [tag, files] of tagMap) {
    entries.push({ tag, count: files.length, files });
  }
  entries.sort((a, b) => b.count - a.count);

  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleTagFiles(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tag = url.searchParams.get("tag");
  if (!tag) {
    return new Response(JSON.stringify({ error: "Missing tag" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetTag = tag.toLowerCase();
  const files = getAllFiles();
  const matching: string[] = [];

  for (const relPath of files) {
    const abs = join(config.vaultPath, relPath);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch {
      continue;
    }

    const tags = extractTags(text);
    if (tags.includes(targetTag)) {
      matching.push(relPath);
    }
  }

  return new Response(JSON.stringify(matching), {
    headers: { "Content-Type": "application/json" },
  });
}
