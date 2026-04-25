import { describe, it, expect } from "bun:test";
import {
  executeQuery,
  groupNotes,
  evaluateFormulas,
  resolveProperty,
} from "../src/bases/filter-engine.ts";
import type { IndexedNote, BaseDefinition, FilterGroup } from "../src/bases/types.ts";

function makeNote(overrides: Partial<IndexedNote> = {}): IndexedNote {
  return {
    path: "notes/test.md",
    name: "test",
    folder: "notes",
    ext: ".md",
    mtime: Date.now(),
    ctime: Date.now() - 86400000,
    tags: [],
    frontmatter: {},
    ...overrides,
  };
}

function makeBase(overrides: Partial<BaseDefinition> = {}): BaseDefinition {
  return {
    rawYaml: "",
    unknownKeys: {},
    ...overrides,
  };
}

describe("resolveProperty", () => {
  const note = makeNote({
    name: "my-note",
    path: "folder/my-note.md",
    folder: "folder",
    frontmatter: { title: "Hello", nested: { deep: "value" }, count: 42 },
    tags: ["tag1", "tag2"],
  });

  it("resolves file.name", () => {
    expect(resolveProperty(note, "file.name")).toBe("my-note");
  });

  it("resolves file.path", () => {
    expect(resolveProperty(note, "file.path")).toBe("folder/my-note.md");
  });

  it("resolves file.folder", () => {
    expect(resolveProperty(note, "file.folder")).toBe("folder");
  });

  it("resolves frontmatter properties", () => {
    expect(resolveProperty(note, "title")).toBe("Hello");
    expect(resolveProperty(note, "count")).toBe(42);
  });

  it("resolves nested frontmatter via dot notation", () => {
    expect(resolveProperty(note, "nested.deep")).toBe("value");
  });

  it("returns undefined for missing properties", () => {
    expect(resolveProperty(note, "nonexistent")).toBeUndefined();
  });

  it("resolves tags", () => {
    expect(resolveProperty(note, "tags")).toEqual(["tag1", "tag2"]);
  });
});

describe("executeQuery", () => {
  const notes: IndexedNote[] = [
    makeNote({ path: "a.md", name: "a", frontmatter: { status: "active", priority: 1 }, tags: ["project"] }),
    makeNote({ path: "b.md", name: "b", frontmatter: { status: "archived", priority: 5 }, tags: ["archive"] }),
    makeNote({ path: "c.md", name: "c", frontmatter: { status: "active", priority: 3 }, tags: ["project", "important"] }),
    makeNote({ path: "d.md", name: "d", frontmatter: { status: "draft" }, tags: [] }),
  ];

  it("returns all notes with no filters", () => {
    const base = makeBase();
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  it("filters with eq operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "status", operator: "eq", value: "active" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(2);
    expect(result.notes.every((n) => n.frontmatter["status"] === "active")).toBe(true);
  });

  it("filters with neq operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "status", operator: "neq", value: "archived" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(3);
  });

  it("filters with gt operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "priority", operator: "gt", value: 2 }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(2);
  });

  it("filters with contains operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "status", operator: "contains", value: "act" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(2);
  });

  it("filters with exists operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "priority", operator: "exists" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(3);
  });

  it("filters with empty operator", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "priority", operator: "empty" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(1);
  });

  it("supports OR filter groups", () => {
    const base = makeBase({
      filters: {
        or: [
          { property: "status", operator: "eq", value: "active" },
          { property: "status", operator: "eq", value: "draft" },
        ],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(3);
  });

  it("supports NOT filter", () => {
    const base = makeBase({
      filters: {
        not: { property: "status", operator: "eq", value: "archived" },
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(3);
  });

  it("applies sorting", () => {
    const base = makeBase({
      views: [
        {
          name: "Test",
          type: "table",
          sort: [{ property: "priority", direction: "desc" }],
          _supported: true,
        },
      ],
    });
    const result = executeQuery(notes, base, 0);
    const priorities = result.notes
      .map((n) => n.frontmatter["priority"])
      .filter((p) => p !== undefined);
    expect(priorities[0]).toBe(5);
    expect(priorities[1]).toBe(3);
  });

  it("applies limit", () => {
    const base = makeBase({
      views: [
        { name: "Test", type: "table", limit: 2, _supported: true },
      ],
    });
    const result = executeQuery(notes, base, 0);
    expect(result.notes).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it("handles file.name filter", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "file.name", operator: "eq", value: "a" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]?.name).toBe("a");
  });

  it("handles file.hasTag filter", () => {
    const base = makeBase({
      filters: {
        and: [{ property: 'file.hasTag("project")', operator: "eq" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.notes).toHaveLength(2);
  });

  it("handles file.inFolder filter", () => {
    const notesWithFolders = [
      makeNote({ path: "projects/a.md", folder: "projects", name: "a" }),
      makeNote({ path: "archive/b.md", folder: "archive", name: "b" }),
      makeNote({ path: "projects/sub/c.md", folder: "projects/sub", name: "c" }),
    ];
    const base = makeBase({
      filters: {
        and: [{ property: 'file.inFolder("projects")', operator: "eq" }],
      },
    });
    const result = executeQuery(notesWithFolders, base);
    expect(result.notes).toHaveLength(2);
  });

  it("gracefully handles unsupported file.hasLink", () => {
    const base = makeBase({
      filters: {
        and: [{ property: 'file.hasLink("SomeNote")', operator: "eq" }],
      },
    });
    const result = executeQuery(notes, base);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.notes).toHaveLength(4); // all included when unsupported
  });

  it("combines base-level and view-level filters", () => {
    const base = makeBase({
      filters: {
        and: [{ property: "status", operator: "neq", value: "archived" }],
      },
      views: [
        {
          name: "Active",
          type: "table",
          filter: {
            and: [{ property: "status", operator: "eq", value: "active" }],
          },
          _supported: true,
        },
      ],
    });
    const result = executeQuery(notes, base, 0);
    expect(result.notes).toHaveLength(2);
  });
});

describe("groupNotes", () => {
  const notes: IndexedNote[] = [
    makeNote({ name: "a", frontmatter: { status: "active" } }),
    makeNote({ name: "b", frontmatter: { status: "archived" } }),
    makeNote({ name: "c", frontmatter: { status: "active" } }),
    makeNote({ name: "d", frontmatter: {} }),
  ];

  it("groups by frontmatter property", () => {
    const groups = groupNotes(notes, { property: "status" });
    expect(groups.get("active")).toHaveLength(2);
    expect(groups.get("archived")).toHaveLength(1);
    expect(groups.get("(empty)")).toHaveLength(1);
  });

  it("sorts groups", () => {
    const groups = groupNotes(notes, { property: "status", direction: "asc" });
    const keys = [...groups.keys()];
    expect(keys[0]).toBe("(empty)");
    expect(keys[1]).toBe("active");
  });
});

describe("evaluateFormulas", () => {
  const note = makeNote({
    name: "test-note",
    path: "folder/test-note.md",
    folder: "folder",
    frontmatter: { title: "Hello World", items: ["a", "b", "c"] },
  });

  it("evaluates property reference", () => {
    const result = evaluateFormulas(note, {
      val: { expression: "title" },
    });
    expect(result["val"]).toBe("Hello World");
  });

  it("evaluates concat formula", () => {
    const result = evaluateFormulas(note, {
      full: { expression: "concat(file.folder, '/', file.name)" },
    });
    expect(result["full"]).toBe("folder/test-note");
  });

  it("evaluates length formula", () => {
    const result = evaluateFormulas(note, {
      len: { expression: "length(title)" },
    });
    expect(result["len"]).toBe(11); // "Hello World".length
  });

  it("evaluates lower/upper formula", () => {
    const lower = evaluateFormulas(note, { l: { expression: "lower(title)" } });
    const upper = evaluateFormulas(note, { u: { expression: "upper(title)" } });
    expect(lower["l"]).toBe("hello world");
    expect(upper["u"]).toBe("HELLO WORLD");
  });

  it("evaluates default formula", () => {
    const result = evaluateFormulas(note, {
      d: { expression: "default(missing, 'fallback')" },
    });
    expect(result["d"]).toBe("fallback");
  });

  it("marks unsupported formulas", () => {
    const result = evaluateFormulas(note, {
      x: { expression: "someUnsupported(a, b, c)" },
    });
    expect(String(result["x"])).toContain("unsupported");
  });
});
