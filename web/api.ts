export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

export interface SearchResult {
  path: string;
  lineNumber: number;
  snippet: string;
}

export type ResolveResult =
  | { found: true; path: string }
  | { found: false; candidates: string[] };

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
  return res;
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Login failed");
  }
}

export async function logout(): Promise<void> {
  await apiFetch("/api/logout", { method: "POST" });
}

export async function getTree(): Promise<TreeNode[]> {
  const res = await apiFetch("/api/tree");
  if (!res.ok) throw new Error("Failed to load tree");
  return res.json() as Promise<TreeNode[]>;
}

export async function getFile(path: string): Promise<string> {
  const res = await apiFetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to load file");
  const data = await res.json() as { content: string };
  return data.content;
}

export async function saveFile(path: string, content: string): Promise<void> {
  const res = await apiFetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Save failed");
  }
}

export async function search(query: string): Promise<SearchResult[]> {
  const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json() as Promise<SearchResult[]>;
}

export async function resolveWikilink(name: string): Promise<ResolveResult> {
  const res = await apiFetch(`/api/resolve?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Resolve failed");
  return res.json() as Promise<ResolveResult>;
}

export async function deleteFile(path: string): Promise<void> {
  const res = await apiFetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Delete failed");
  }
}

export async function moveFile(path: string, destDir: string): Promise<string> {
  const res = await apiFetch("/api/file/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, destDir }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Move failed");
  }
  const data = await res.json() as { newPath: string };
  return data.newPath;
}

export async function createFile(path: string, content = ""): Promise<string> {
  const res = await apiFetch("/api/file/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Create failed");
  }
  const data = await res.json() as { path: string };
  return data.path;
}

export async function copyFile(srcPath: string, destPath?: string): Promise<string> {
  const res = await apiFetch("/api/file/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ srcPath, destPath }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Copy failed");
  }
  const data = await res.json() as { path: string };
  return data.path;
}

export async function renameFile(oldPath: string, newPath: string): Promise<string> {
  const res = await apiFetch("/api/file/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newPath }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Rename failed");
  }
  const data = await res.json() as { path: string };
  return data.path;
}

export interface BacklinkResult {
  path: string;
  context: string;
}

export interface TagEntry {
  tag: string;
  count: number;
  files: string[];
}

export async function getBacklinks(path: string): Promise<BacklinkResult[]> {
  const res = await apiFetch(`/api/backlinks?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to load backlinks");
  return res.json() as Promise<BacklinkResult[]>;
}

export async function getTags(): Promise<TagEntry[]> {
  const res = await apiFetch("/api/tags");
  if (!res.ok) throw new Error("Failed to load tags");
  return res.json() as Promise<TagEntry[]>;
}

export async function getTagFiles(tag: string): Promise<string[]> {
  const res = await apiFetch(`/api/tags/files?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error("Failed to load tag files");
  return res.json() as Promise<string[]>;
}

export async function createFolder(path: string): Promise<string> {
  const res = await apiFetch("/api/folder/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? "Create folder failed");
  }
  const data = await res.json() as { path: string };
  return data.path;
}
