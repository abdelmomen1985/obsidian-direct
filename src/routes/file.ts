import { readFile, writeFile, rename, mkdir, unlink, stat, copyFile } from "fs/promises";
import { dirname, basename, join, extname } from "path";
import { config } from "../config.ts";
import { safeResolveStat, safeResolve } from "../paths.ts";
import { addToIndex, removeFromIndex } from "../wikilink-index.ts";
import { PathError } from "../paths.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function exists(abs: string): Promise<boolean> {
  try {
    await stat(abs);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

export function deriveCopyPath(srcRel: string): string {
  const dir = dirname(srcRel);
  const ext = extname(srcRel);
  const base = basename(srcRel, ext);
  const name = `${base} (copy)${ext}`;
  return dir === "." ? name : `${dir}/${name}`;
}

export async function handleGetFile(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path");
  if (!relPath) {
    return new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const abs = await safeResolveStat(config.vaultPath, relPath, "read");
    const text = await readFile(abs, "utf-8");
    return new Response(JSON.stringify({ content: text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PathError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
    return new Response(JSON.stringify({ error: isNotFound ? "File not found" : "Read failed" }), {
      status: isNotFound ? 404 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleDeleteFile(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path");
  if (!relPath) {
    return new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const abs = await safeResolveStat(config.vaultPath, relPath, "write");
    await unlink(abs);
    removeFromIndex(relPath);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PathError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Delete failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleMoveFile(req: Request): Promise<Response> {
  let body: { path?: string; destDir?: string };
  try {
    body = await req.json() as { path?: string; destDir?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { path: relPath, destDir } = body;
  if (!relPath || typeof destDir !== "string") {
    return new Response(JSON.stringify({ error: "Missing path or destDir" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const srcAbs = await safeResolveStat(config.vaultPath, relPath, "write");
    const fileName = basename(srcAbs);
    const destRelPath = destDir ? `${destDir}/${fileName}` : fileName;
    const destAbs = safeResolve(config.vaultPath, destRelPath);

    if (srcAbs === destAbs) {
      return new Response(JSON.stringify({ error: "File is already in that directory" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await mkdir(dirname(destAbs), { recursive: true });

    try {
      await stat(destAbs);
      return new Response(
        JSON.stringify({ error: `A file named "${fileName}" already exists at the destination` }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }

    await rename(srcAbs, destAbs);

    removeFromIndex(relPath);
    addToIndex(destRelPath);

    return new Response(JSON.stringify({ ok: true, newPath: destRelPath }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PathError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("move error:", err);
    return new Response(JSON.stringify({ error: "Move failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handlePutFile(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const relPath = url.searchParams.get("path");
  if (!relPath) {
    return new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { content?: string };
  try {
    body = await req.json() as { content?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body.content !== "string") {
    return new Response(JSON.stringify({ error: "content must be a string" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const abs = await safeResolveStat(config.vaultPath, relPath, "write");
    await mkdir(dirname(abs), { recursive: true });

    // Atomic write: tmp file → rename
    const tmp = `${abs}.tmp-${process.pid}`;
    await writeFile(tmp, body.content, "utf-8");
    await rename(tmp, abs);

    addToIndex(relPath);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PathError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("write error:", err);
    return new Response(JSON.stringify({ error: "Write failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleCreateFile(req: Request): Promise<Response> {
  let body: { path?: string; content?: string };
  try {
    body = (await req.json()) as { path?: string; content?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const relPath = body.path;
  const content = typeof body.content === "string" ? body.content : "";
  if (!relPath) return json({ error: "Missing path" }, 400);

  try {
    const abs = await safeResolveStat(config.vaultPath, relPath, "write");
    if (await exists(abs)) {
      return json({ error: "A file with that name already exists" }, 409);
    }

    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}`;
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, abs);

    addToIndex(relPath);
    return json({ ok: true, path: relPath });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    console.error("create error:", err);
    return json({ error: "Create failed" }, 500);
  }
}

export async function handleCopyFile(req: Request): Promise<Response> {
  let body: { srcPath?: string; destPath?: string };
  try {
    body = (await req.json()) as { srcPath?: string; destPath?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const srcRel = body.srcPath;
  if (!srcRel) return json({ error: "Missing srcPath" }, 400);

  const destRel = body.destPath && body.destPath.trim() !== "" ? body.destPath : deriveCopyPath(srcRel);

  try {
    const srcAbs = await safeResolveStat(config.vaultPath, srcRel, "read");
    const destAbs = await safeResolveStat(config.vaultPath, destRel, "write");

    if (!(await exists(srcAbs))) {
      return json({ error: "Source file not found" }, 404);
    }
    if (await exists(destAbs)) {
      return json({ error: "Destination file already exists" }, 409);
    }

    await mkdir(dirname(destAbs), { recursive: true });
    await copyFile(srcAbs, destAbs);

    addToIndex(destRel);
    return json({ ok: true, path: destRel });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    console.error("copy error:", err);
    return json({ error: "Copy failed" }, 500);
  }
}

export async function handleRenameFile(req: Request): Promise<Response> {
  let body: { oldPath?: string; newPath?: string };
  try {
    body = (await req.json()) as { oldPath?: string; newPath?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const oldRel = body.oldPath;
  const newRel = body.newPath;
  if (!oldRel || !newRel) return json({ error: "Missing oldPath or newPath" }, 400);
  if (oldRel === newRel) return json({ error: "Old and new paths are identical" }, 400);

  try {
    const oldAbs = await safeResolveStat(config.vaultPath, oldRel, "write");
    const newAbs = await safeResolveStat(config.vaultPath, newRel, "write");

    if (!(await exists(oldAbs))) {
      return json({ error: "Source file not found" }, 404);
    }
    if (await exists(newAbs)) {
      return json({ error: "A file with that name already exists" }, 409);
    }

    await mkdir(dirname(newAbs), { recursive: true });
    await rename(oldAbs, newAbs);

    removeFromIndex(oldRel);
    addToIndex(newRel);

    return json({ ok: true, path: newRel });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    console.error("rename error:", err);
    return json({ error: "Rename failed" }, 500);
  }
}
