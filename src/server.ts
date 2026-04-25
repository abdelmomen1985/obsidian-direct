import { join } from "path";
import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { config } from "./config.ts";
import { verifySessionCookie } from "./auth.ts";
import { buildIndex } from "./wikilink-index.ts";
import { handleLogin, handleLogout } from "./routes/login.ts";
import { handleTree } from "./routes/tree.ts";
import {
  handleGetFile,
  handlePutFile,
  handleDeleteFile,
  handleMoveFile,
  handleCreateFile,
  handleCopyFile,
  handleRenameFile,
} from "./routes/file.ts";
import { handleCreateFolder } from "./routes/folder.ts";
import { handleSearch } from "./routes/search.ts";
import { handleResolveWikilink } from "./routes/wikilink.ts";
import {
  handleGetIndex,
  handleGetNoteMeta,
  handleRebuildIndex,
  handleGetBase,
  handleListBases,
  handleQuery,
  handleQueryInline,
  handleUpdateProperty,
  handleMutateBase,
  getVaultIndex,
} from "./routes/bases.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const STATIC_DIR = join(import.meta.dir, "..", "dist", "web");
const WEB_SRC_DIR = join(import.meta.dir, "..", "web");

async function serveStatic(pathname: string): Promise<Response | null> {
  const tryPaths = [
    join(STATIC_DIR, pathname === "/" ? "index.html" : pathname),
    join(STATIC_DIR, "index.html"),
  ];

  for (const filePath of tryPaths) {
    if (!existsSync(filePath)) continue;
    const s = await stat(filePath);
    if (!s.isFile()) continue;

    const ext = filePath.slice(filePath.lastIndexOf("."));
    const mime = MIME[ext] ?? "application/octet-stream";
    const buf = await readFile(filePath);
    return new Response(buf, { headers: { "Content-Type": mime } });
  }

  // Fallback: serve index.html for SPA routing
  const idx = join(STATIC_DIR, "index.html");
  if (existsSync(idx)) {
    const buf = await readFile(idx);
    return new Response(buf, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Dev fallback: serve from web/ source
  const srcIdx = join(WEB_SRC_DIR, "index.html");
  if (existsSync(srcIdx)) {
    const buf = await readFile(srcIdx);
    return new Response(buf, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return null;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

console.log(`Building wikilink index for vault: ${config.vaultPath}`);
await buildIndex(config.vaultPath);
console.log("Wikilink index ready.");

console.log("Building vault index for Bases...");
await getVaultIndex();
console.log("Vault index ready.");

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // Auth endpoints — no session required
    if (method === "POST" && path === "/api/login") return handleLogin(req);
    if (method === "POST" && path === "/api/logout") return handleLogout();

    // Protect all other /api/* routes
    if (path.startsWith("/api/")) {
      const cookie = req.headers.get("cookie");
      if (!(await verifySessionCookie(cookie))) return unauthorized();

      if (method === "GET" && path === "/api/tree") return handleTree();
      if (method === "GET" && path === "/api/file") return handleGetFile(req);
      if (method === "PUT" && path === "/api/file") return handlePutFile(req);
      if (method === "DELETE" && path === "/api/file") return handleDeleteFile(req);
      if (method === "POST" && path === "/api/file/move") return handleMoveFile(req);
      if (method === "POST" && path === "/api/file/create") return handleCreateFile(req);
      if (method === "POST" && path === "/api/file/copy") return handleCopyFile(req);
      if (method === "POST" && path === "/api/file/rename") return handleRenameFile(req);
      if (method === "POST" && path === "/api/folder/create") return handleCreateFolder(req);
      if (method === "GET" && path === "/api/search") return handleSearch(req);
      if (method === "GET" && path === "/api/resolve") return handleResolveWikilink(req);

      // Bases endpoints
      if (method === "GET" && path === "/api/bases/index") return handleGetIndex();
      if (method === "GET" && path === "/api/bases/note") return handleGetNoteMeta(req);
      if (method === "POST" && path === "/api/bases/rebuild") return handleRebuildIndex();
      if (method === "GET" && path === "/api/bases/base") return handleGetBase(req);
      if (method === "GET" && path === "/api/bases/list") return handleListBases();
      if (method === "GET" && path === "/api/bases/query") return handleQuery(req);
      if (method === "POST" && path === "/api/bases/query-inline") return handleQueryInline(req);
      if (method === "POST" && path === "/api/bases/property") return handleUpdateProperty(req);
      if (method === "POST" && path === "/api/bases/definition") return handleMutateBase(req);

      return notFound();
    }

    // Static files / SPA
    const staticResp = await serveStatic(path);
    if (staticResp) return staticResp;

    return new Response("Not Found", { status: 404 });
  },

  error(err) {
    console.error("Server error:", err);
    return new Response("Internal server error", { status: 500 });
  },
});

console.log(`Obsidian Direct running at http://0.0.0.0:${server.port}`);
