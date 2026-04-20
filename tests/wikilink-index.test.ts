import { describe, it, expect, beforeAll } from "bun:test";
import { buildIndex, resolveWikilink, addToIndex, removeFromIndex } from "../src/wikilink-index.ts";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";

const VAULT = "/tmp/wikilink-test-vault";

beforeAll(async () => {
  await rm(VAULT, { recursive: true, force: true });
  await mkdir(join(VAULT, "folder"), { recursive: true });
  await writeFile(join(VAULT, "Note One.md"), "# Note One");
  await writeFile(join(VAULT, "Note Two.md"), "# Note Two");
  await writeFile(join(VAULT, "folder", "Note One.md"), "# Note One in folder");
  await writeFile(join(VAULT, "folder", "Unique.md"), "# Unique");
  await buildIndex(VAULT);
});

describe("resolveWikilink", () => {
  it("resolves an unambiguous note", () => {
    const result = resolveWikilink("Note Two");
    expect(result).toMatchObject({ found: true, path: "Note Two.md" });
  });

  it("resolves a unique note in subfolder", () => {
    const result = resolveWikilink("Unique");
    expect(result).toMatchObject({ found: true, path: "folder/Unique.md" });
  });

  it("resolves ambiguous note to shortest path", () => {
    // "Note One" exists at root and folder/ — shortest is root
    const result = resolveWikilink("Note One");
    expect(result).toMatchObject({ found: true, path: "Note One.md" });
  });

  it("returns found:false for a missing note", () => {
    const result = resolveWikilink("Does Not Exist");
    expect(result).toMatchObject({ found: false });
  });

  it("strips heading from wikilink name", () => {
    const result = resolveWikilink("Note Two#Some Heading");
    expect(result).toMatchObject({ found: true, path: "Note Two.md" });
  });

  it("strips alias from wikilink name", () => {
    const result = resolveWikilink("Unique|My Alias");
    expect(result).toMatchObject({ found: true, path: "folder/Unique.md" });
  });

  it("is case-insensitive", () => {
    const result = resolveWikilink("note two");
    expect(result).toMatchObject({ found: true, path: "Note Two.md" });
  });
});

describe("addToIndex / removeFromIndex", () => {
  it("adds and removes entries correctly", () => {
    addToIndex("New Note.md");
    expect(resolveWikilink("New Note")).toMatchObject({ found: true, path: "New Note.md" });
    removeFromIndex("New Note.md");
    expect(resolveWikilink("New Note")).toMatchObject({ found: false });
  });
});
