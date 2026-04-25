import { describe, it, expect } from "bun:test";
import { applyMutation } from "../src/bases/base-editor.ts";
import { parseBaseYaml } from "../src/bases/base-parser.ts";

function reparse(yaml: string) {
  return parseBaseYaml(yaml).definition;
}

describe("applyMutation: addProperty", () => {
  it("adds a property to a base with no properties yet", () => {
    const { yaml } = applyMutation("views:\n  - name: V\n    type: table\n", {
      type: "addProperty",
      property: { name: "status", type: "select", label: "Status" },
    });
    const def = reparse(yaml);
    expect(def.properties).toHaveLength(1);
    expect(def.properties?.[0]?.name).toBe("status");
    expect(def.properties?.[0]?.label).toBe("Status");
  });

  it("appends to an existing properties list", () => {
    const start = "properties:\n  - name: title\n    type: text\n";
    const { yaml } = applyMutation(start, {
      type: "addProperty",
      property: { name: "due", type: "date" },
    });
    const def = reparse(yaml);
    expect(def.properties).toHaveLength(2);
    expect(def.properties?.[1]?.name).toBe("due");
  });

  it("treats addProperty for an existing name as an update", () => {
    const start = "properties:\n  - name: title\n    type: text\n";
    const { yaml } = applyMutation(start, {
      type: "addProperty",
      property: { name: "title", label: "Renamed" },
    });
    const def = reparse(yaml);
    expect(def.properties).toHaveLength(1);
    expect(def.properties?.[0]?.label).toBe("Renamed");
  });
});

describe("applyMutation: updateProperty", () => {
  it("updates label, type, width, hidden", () => {
    const start = "properties:\n  - name: title\n    type: text\n";
    const { yaml } = applyMutation(start, {
      type: "updateProperty",
      oldName: "title",
      property: { name: "title", label: "Title", width: 200, hidden: true },
    });
    const def = reparse(yaml);
    const p = def.properties?.[0];
    expect(p?.label).toBe("Title");
    expect(p?.width).toBe(200);
    expect(p?.hidden).toBe(true);
  });

  it("renames a property and updates references in views.columns", () => {
    const start =
      "properties:\n  - name: status\n    type: text\n" +
      "views:\n  - name: V\n    type: table\n    columns: [status, file.name]\n";
    const { yaml } = applyMutation(start, {
      type: "updateProperty",
      oldName: "status",
      property: { name: "state" },
    });
    const def = reparse(yaml);
    expect(def.properties?.[0]?.name).toBe("state");
    expect(def.views?.[0]?.columns).toEqual(["state", "file.name"]);
  });

  it("clears optional fields when set to null", () => {
    const start =
      "properties:\n  - name: status\n    type: text\n    label: Status\n    width: 200\n";
    const { yaml } = applyMutation(start, {
      type: "updateProperty",
      oldName: "status",
      property: { name: "status", label: null, width: null },
    });
    const def = reparse(yaml);
    expect(def.properties?.[0]?.label).toBeUndefined();
    expect(def.properties?.[0]?.width).toBeUndefined();
    expect(def.properties?.[0]?.type).toBe("text");
  });

  it("throws on rename collision", () => {
    const start = "properties:\n  - name: a\n    type: text\n  - name: b\n    type: text\n";
    expect(() =>
      applyMutation(start, {
        type: "updateProperty",
        oldName: "a",
        property: { name: "b" },
      })
    ).toThrow();
  });

  it("throws when property does not exist", () => {
    expect(() =>
      applyMutation("properties: []\n", {
        type: "updateProperty",
        oldName: "missing",
        property: { name: "missing", label: "x" },
      })
    ).toThrow();
  });
});

describe("applyMutation: removeProperty", () => {
  it("removes the property and prunes columns from views", () => {
    const start =
      "properties:\n  - name: status\n    type: text\n  - name: title\n    type: text\n" +
      "views:\n  - name: V\n    type: table\n    columns: [status, title, file.name]\n";
    const { yaml } = applyMutation(start, { type: "removeProperty", name: "status" });
    const def = reparse(yaml);
    expect(def.properties?.map((p) => p.name)).toEqual(["title"]);
    expect(def.views?.[0]?.columns).toEqual(["title", "file.name"]);
  });

  it("removes the empty properties key when last property removed", () => {
    const start = "properties:\n  - name: only\n    type: text\n";
    const { yaml } = applyMutation(start, { type: "removeProperty", name: "only" });
    const def = reparse(yaml);
    expect(def.properties).toBeUndefined();
  });
});

describe("applyMutation: columns", () => {
  it("adds a column to a view (creates columns key if missing)", () => {
    const start = "views:\n  - name: V\n    type: table\n";
    const { yaml } = applyMutation(start, {
      type: "addColumn",
      viewIndex: 0,
      column: "status",
    });
    const def = reparse(yaml);
    expect(def.views?.[0]?.columns).toEqual(["status"]);
  });

  it("does not add a duplicate column", () => {
    const start = "views:\n  - name: V\n    type: table\n    columns: [status]\n";
    const { yaml, changed } = applyMutation(start, {
      type: "addColumn",
      viewIndex: 0,
      column: "status",
    });
    expect(changed).toBe(false);
    const def = reparse(yaml);
    expect(def.views?.[0]?.columns).toEqual(["status"]);
  });

  it("removes a column", () => {
    const start = "views:\n  - name: V\n    type: table\n    columns: [a, b, c]\n";
    const { yaml } = applyMutation(start, {
      type: "removeColumn",
      viewIndex: 0,
      column: "b",
    });
    const def = reparse(yaml);
    expect(def.views?.[0]?.columns).toEqual(["a", "c"]);
  });

  it("reorders columns", () => {
    const start = "views:\n  - name: V\n    type: table\n    columns: [a, b, c]\n";
    const { yaml } = applyMutation(start, {
      type: "reorderColumns",
      viewIndex: 0,
      columns: ["c", "a", "b"],
    });
    const def = reparse(yaml);
    expect(def.views?.[0]?.columns).toEqual(["c", "a", "b"]);
  });

  it("throws when view index out of range", () => {
    expect(() =>
      applyMutation("views:\n  - name: V\n    type: table\n", {
        type: "addColumn",
        viewIndex: 5,
        column: "x",
      })
    ).toThrow();
  });
});

describe("applyMutation: views", () => {
  it("adds a view", () => {
    const start = "";
    const { yaml } = applyMutation(start, {
      type: "addView",
      view: { name: "All", type: "table" },
    });
    const def = reparse(yaml);
    expect(def.views).toHaveLength(1);
    expect(def.views?.[0]?.name).toBe("All");
  });

  it("removes a view", () => {
    const start =
      "views:\n  - name: A\n    type: table\n  - name: B\n    type: table\n";
    const { yaml } = applyMutation(start, { type: "removeView", viewIndex: 0 });
    const def = reparse(yaml);
    expect(def.views).toHaveLength(1);
    expect(def.views?.[0]?.name).toBe("B");
  });
});
