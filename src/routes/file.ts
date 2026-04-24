import { readFile, writeFile, rename, mkdir, unlink, stat } from "fs/promises";
import { dirname, basename, join } from "path";
import { config } from "../config.ts";
import { safeResolveStat, safeResolve } from "../paths.ts";
import { addToIndex, removeFromIndex } from "../wikilink-index.ts";
import { PathError } from "../paths.ts";

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
