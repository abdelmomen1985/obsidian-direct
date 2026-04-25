import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { VaultIndex } from "../src/bases/vault-index.ts";

const TEST_VAULT = join(import.meta.dir, "__vault_test__");

function setupVault(): void {
  mkdirSync(join(TEST_VAULT, "notes"), { recursive: true });
  mkdirSync(join(TEST_VAULT, "projects"), { recursive: true });
  mkdirSync(join(TEST_VAULT, ".hidden"), { recursive: true });

  writeFileSync(
    join(TEST_VAULT, "notes/daily.md"),
    `---\ntitle: Daily Note\ntags:\n  - daily\n  - journal\n---\n# Daily\n\nSome #inline-tag content.`
  );

  writeFileSync(
    join(TEST_VAULT, "notes/meeting.md"),
    `---\ntitle: Meeting Notes\nstatus: active\npriority: 3\n---\n# Meeting\n\nDiscussion points.`
  );

  writeFileSync(
    join(TEST_VAULT, "projects/readme.md"),
    `---\ntitle: Project README\ntags: project, docs\n---\n# Project\n\nDocumentation.`
  );

  writeFileSync(
    join(TEST_VAULT, "root-note.md"),
    `# Root Note\n\nNo frontmatter here.`
  );

  // hidden dir should be ignored
  writeFileSync(
    join(TEST_VAULT, ".hidden/secret.md"),
    `---\ntitle: Secret\n---\nHidden`
  );
}

function cleanupVault(): void {
  try {
    rmSync(TEST_VAULT, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("VaultIndex", () => {
  beforeEach(() => {
    cleanupVault();
    setupVault();
  });

  afterEach(() => {
    cleanupVault();
  });

  it("builds index from vault", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    expect(index.getNoteCount()).toBe(4);
  });

  it("indexes note metadata correctly", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const daily = index.getNote("notes/daily.md");
    expect(daily).toBeDefined();
    expect(daily?.name).toBe("daily");
    expect(daily?.folder).toBe("notes");
    expect(daily?.ext).toBe(".md");
    expect(daily?.frontmatter["title"]).toBe("Daily Note");
  });

  it("extracts frontmatter tags", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const daily = index.getNote("notes/daily.md");
    expect(daily?.tags).toContain("daily");
    expect(daily?.tags).toContain("journal");
  });

  it("extracts inline tags", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const daily = index.getNote("notes/daily.md");
    expect(daily?.tags).toContain("inline-tag");
  });

  it("handles notes without frontmatter", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const root = index.getNote("root-note.md");
    expect(root).toBeDefined();
    expect(root?.frontmatter).toEqual({});
    expect(root?.folder).toBe("");
  });

  it("skips hidden directories", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const hidden = index.getNote(".hidden/secret.md");
    expect(hidden).toBeUndefined();
  });

  it("returns all notes", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const all = index.getAllNotes();
    expect(all.length).toBe(4);
  });

  it("filters notes by folder", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const notesInFolder = index.getNotesInFolder("notes");
    expect(notesInFolder.length).toBe(2);
  });

  it("filters notes by tag", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const tagged = index.getNotesWithTag("daily");
    expect(tagged.length).toBe(1);
    expect(tagged[0]?.name).toBe("daily");
  });

  it("handles comma-separated string tags", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const project = index.getNote("projects/readme.md");
    expect(project?.tags).toContain("project");
    expect(project?.tags).toContain("docs");
  });

  it("includes mtime and ctime", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    const daily = index.getNote("notes/daily.md");
    expect(daily?.mtime).toBeGreaterThan(0);
    expect(daily?.ctime).toBeGreaterThan(0);
  });

  it("removes notes from index", async () => {
    const index = new VaultIndex(TEST_VAULT);
    await index.build();

    expect(index.getNoteCount()).toBe(4);
    index.removeNote("notes/daily.md");
    expect(index.getNoteCount()).toBe(3);
    expect(index.getNote("notes/daily.md")).toBeUndefined();
  });
});
