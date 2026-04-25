import { mkdir, stat } from "fs/promises";
import { config } from "../config.ts";
import { safeResolve, PathError } from "../paths.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleCreateFolder(req: Request): Promise<Response> {
  let body: { path?: string };
  try {
    body = (await req.json()) as { path?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const relPath = body.path;
  if (!relPath) return json({ error: "Missing path" }, 400);

  try {
    const abs = safeResolve(config.vaultPath, relPath);

    try {
      const st = await stat(abs);
      if (st.isDirectory()) return json({ error: "Folder already exists" }, 409);
      return json({ error: "A file with that name already exists" }, 409);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }

    await mkdir(abs, { recursive: true });
    return json({ ok: true, path: relPath });
  } catch (err) {
    if (err instanceof PathError) return json({ error: err.message }, 400);
    console.error("folder create error:", err);
    return json({ error: "Create folder failed" }, 500);
  }
}
