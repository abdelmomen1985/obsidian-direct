import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";

// Set fallback env vars before any import that chains into config.ts.
// config.ts reads these at first-import time and caches them, so we must
// seed compatible values even if other test files will re-set them later
// (in particular AUTH_PASSWORD_HASH must hash the "testpassword" literal
// used by auth.test.ts so its verifyPassword test still passes regardless
// of which test file is imported first).
const tmpFallback = join("/tmp", `obs-test-vault-${process.pid}`);
process.env["VAULT_PATH"] ||= tmpFallback;
process.env["AUTH_PASSWORD_HASH"] ||= await Bun.password.hash("testpassword", { algorithm: "argon2id" });
process.env["SESSION_SECRET"] ||= "test_secret_32_chars_long_enough!!";
process.env["SESSION_TTL"] ||= "3600";
process.env["NODE_ENV"] ||= "development";

const { config } = await import("../src/config.ts");
const tmpVault = config.vaultPath;

const {
  handleCreateFile,
  handleCopyFile,
  handleRenameFile,
  deriveCopyPath,
} = await import("../src/routes/file.ts");
const { handleCreateFolder } = await import("../src/routes/folder.ts");
const { buildIndex } = await import("../src/wikilink-index.ts");

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<{ error?: string; path?: string; ok?: boolean }> {
  return (await res.json()) as { error?: string; path?: string; ok?: boolean };
}

beforeAll(async () => {
  await rm(tmpVault, { recursive: true, force: true });
  await mkdir(tmpVault, { recursive: true });
  await buildIndex(tmpVault);
});

afterAll(async () => {
  await rm(tmpVault, { recursive: true, force: true });
});

describe("deriveCopyPath", () => {
  it("appends (copy) for root-level file", () => {
    expect(deriveCopyPath("note.md")).toBe("note (copy).md");
  });

  it("appends (copy) preserving directory", () => {
    expect(deriveCopyPath("notes/a.md")).toBe("notes/a (copy).md");
  });

  it("handles nested directories", () => {
    expect(deriveCopyPath("a/b/c.md")).toBe("a/b/c (copy).md");
  });
});

describe("handleCreateFile", () => {
  it("creates a new .md file with given content", async () => {
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {
      path: "create-test.md",
      content: "# hello",
    }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.path).toBe("create-test.md");

    const text = await readFile(join(tmpVault, "create-test.md"), "utf-8");
    expect(text).toBe("# hello");
  });

  it("creates nested directories as needed", async () => {
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {
      path: "nested/dir/note.md",
    }));
    expect(res.status).toBe(200);
    const text = await readFile(join(tmpVault, "nested/dir/note.md"), "utf-8");
    expect(text).toBe("");
  });

  it("returns 409 if file already exists", async () => {
    await writeFile(join(tmpVault, "existing.md"), "x");
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {
      path: "existing.md",
    }));
    expect(res.status).toBe(409);
  });

  it("rejects non-md extensions", async () => {
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {
      path: "bad.txt",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects path traversal", async () => {
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {
      path: "../escape.md",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing path", async () => {
    const res = await handleCreateFile(jsonReq("http://x/api/file/create", {}));
    expect(res.status).toBe(400);
  });
});

describe("handleCopyFile", () => {
  it("copies a file to an auto-derived name", async () => {
    await writeFile(join(tmpVault, "src.md"), "content");
    const res = await handleCopyFile(jsonReq("http://x/api/file/copy", {
      srcPath: "src.md",
    }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.path).toBe("src (copy).md");

    const copied = await readFile(join(tmpVault, "src (copy).md"), "utf-8");
    expect(copied).toBe("content");
  });

  it("copies to an explicit destination path", async () => {
    await writeFile(join(tmpVault, "src2.md"), "abc");
    const res = await handleCopyFile(jsonReq("http://x/api/file/copy", {
      srcPath: "src2.md",
      destPath: "subdir/dest.md",
    }));
    expect(res.status).toBe(200);
    const copied = await readFile(join(tmpVault, "subdir/dest.md"), "utf-8");
    expect(copied).toBe("abc");
  });

  it("returns 409 when destination exists", async () => {
    await writeFile(join(tmpVault, "s.md"), "a");
    await writeFile(join(tmpVault, "s (copy).md"), "b");
    const res = await handleCopyFile(jsonReq("http://x/api/file/copy", {
      srcPath: "s.md",
    }));
    expect(res.status).toBe(409);
  });

  it("returns 404 when source missing", async () => {
    const res = await handleCopyFile(jsonReq("http://x/api/file/copy", {
      srcPath: "does-not-exist.md",
    }));
    expect(res.status).toBe(404);
  });

  it("rejects path traversal in srcPath", async () => {
    const res = await handleCopyFile(jsonReq("http://x/api/file/copy", {
      srcPath: "../escape.md",
    }));
    expect(res.status).toBe(400);
  });
});

describe("handleRenameFile", () => {
  it("renames a file", async () => {
    await writeFile(join(tmpVault, "before.md"), "body");
    const res = await handleRenameFile(jsonReq("http://x/api/file/rename", {
      oldPath: "before.md",
      newPath: "after.md",
    }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.path).toBe("after.md");

    const renamed = await readFile(join(tmpVault, "after.md"), "utf-8");
    expect(renamed).toBe("body");

    let oldExists = true;
    try { await stat(join(tmpVault, "before.md")); } catch { oldExists = false; }
    expect(oldExists).toBe(false);
  });

  it("returns 409 when destination exists", async () => {
    await writeFile(join(tmpVault, "o.md"), "1");
    await writeFile(join(tmpVault, "n.md"), "2");
    const res = await handleRenameFile(jsonReq("http://x/api/file/rename", {
      oldPath: "o.md",
      newPath: "n.md",
    }));
    expect(res.status).toBe(409);
  });

  it("returns 404 when source missing", async () => {
    const res = await handleRenameFile(jsonReq("http://x/api/file/rename", {
      oldPath: "nope.md",
      newPath: "other.md",
    }));
    expect(res.status).toBe(404);
  });

  it("rejects identical old/new path", async () => {
    const res = await handleRenameFile(jsonReq("http://x/api/file/rename", {
      oldPath: "same.md",
      newPath: "same.md",
    }));
    expect(res.status).toBe(400);
  });
});

describe("handleCreateFolder", () => {
  it("creates a new folder", async () => {
    const res = await handleCreateFolder(jsonReq("http://x/api/folder/create", {
      path: "new-folder",
    }));
    expect(res.status).toBe(200);
    const s = await stat(join(tmpVault, "new-folder"));
    expect(s.isDirectory()).toBe(true);
  });

  it("creates nested folders", async () => {
    const res = await handleCreateFolder(jsonReq("http://x/api/folder/create", {
      path: "a/b/c",
    }));
    expect(res.status).toBe(200);
    const s = await stat(join(tmpVault, "a/b/c"));
    expect(s.isDirectory()).toBe(true);
  });

  it("returns 409 when folder exists", async () => {
    await mkdir(join(tmpVault, "dup"), { recursive: true });
    const res = await handleCreateFolder(jsonReq("http://x/api/folder/create", {
      path: "dup",
    }));
    expect(res.status).toBe(409);
  });

  it("rejects path traversal", async () => {
    const res = await handleCreateFolder(jsonReq("http://x/api/folder/create", {
      path: "../escape",
    }));
    expect(res.status).toBe(400);
  });
});
