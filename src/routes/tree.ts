import { readdir } from "fs/promises";
import { join, extname } from "path";
import { config } from "../config.ts";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

async function buildTree(dir: string, root: string): Promise<TreeNode[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    const relPath = full.slice(root.length + 1);

    if (entry.isDirectory()) {
      const children = await buildTree(full, root);
      nodes.push({ name: entry.name, path: relPath, type: "directory", children });
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function handleTree(): Promise<Response> {
  try {
    const tree = await buildTree(config.vaultPath, config.vaultPath);
    return new Response(JSON.stringify(tree), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tree error:", err);
    return new Response(JSON.stringify({ error: "Failed to read vault" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
