import { describe, it, expect } from "bun:test";
import { safeResolve, PathError } from "../src/paths.ts";

const VAULT = "/home/user/vault";

describe("safeResolve", () => {
  it("allows a normal relative path", () => {
    const result = safeResolve(VAULT, "notes/daily.md");
    expect(result).toBe("/home/user/vault/notes/daily.md");
  });

  it("allows a file in the vault root", () => {
    expect(safeResolve(VAULT, "README.md")).toBe("/home/user/vault/README.md");
  });

  it("blocks path traversal with ../", () => {
    expect(() => safeResolve(VAULT, "../etc/passwd")).toThrow(PathError);
  });

  it("blocks double traversal", () => {
    expect(() => safeResolve(VAULT, "notes/../../etc/shadow")).toThrow(PathError);
  });

  it("blocks absolute path outside vault", () => {
    expect(() => safeResolve(VAULT, "/etc/passwd")).toThrow(PathError);
  });

  it("blocks null byte", () => {
    expect(() => safeResolve(VAULT, "notes\0evil")).toThrow(PathError);
  });

  it("blocks empty path", () => {
    expect(() => safeResolve(VAULT, "")).toThrow(PathError);
  });

  it("allows path with subdirectory", () => {
    const result = safeResolve(VAULT, "a/b/c/note.md");
    expect(result).toBe("/home/user/vault/a/b/c/note.md");
  });

  it("blocks a path that is the vault parent", () => {
    expect(() => safeResolve(VAULT, "..")).toThrow(PathError);
  });
});
