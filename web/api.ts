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
