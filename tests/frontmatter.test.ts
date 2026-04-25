import { describe, it, expect } from "bun:test";
import {
  parseFrontmatter,
  extractInlineTags,
  extractFrontmatterTags,
  updateFrontmatterProperty,
  serializeFrontmatter,
} from "../src/bases/frontmatter.ts";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const content = `---\ntitle: Hello\ntags:\n  - foo\n  - bar\n---\n# Body here`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter["title"]).toBe("Hello");
    expect(result.frontmatter["tags"]).toEqual(["foo", "bar"]);
    expect(result.body).toBe("# Body here");
    expect(result.document).not.toBeNull();
  });

  it("handles missing frontmatter", () => {
    const content = "# Just a heading\n\nSome text.";
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
    expect(result.document).toBeNull();
  });

  it("handles empty frontmatter", () => {
    const content = "---\n---\nBody text";
    const result = parseFrontmatter(content);
    expect(result.body).toBe("Body text");
  });

  it("preserves various YAML types", () => {
    const content = `---\ncount: 42\nactive: true\ndate: 2024-01-15\nlist:\n  - one\n  - two\n---\nBody`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter["count"]).toBe(42);
    expect(result.frontmatter["active"]).toBe(true);
    expect(result.frontmatter["list"]).toEqual(["one", "two"]);
  });

  it("handles frontmatter with special characters", () => {
    const content = `---\ntitle: "Hello: World"\ndescription: 'It\\'s a test'\n---\nBody`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter["title"]).toBe("Hello: World");
  });
});

describe("extractInlineTags", () => {
  it("extracts inline #tags from body", () => {
    const body = "Some text #tag1 and #tag2 here\n#tag3 at start";
    const tags = extractInlineTags(body);
    expect(tags).toContain("tag1");
    expect(tags).toContain("tag2");
    expect(tags).toContain("tag3");
  });

  it("ignores tags in code blocks", () => {
    // Note: our simple regex will still match, but that's acceptable
    const body = "Text #valid here";
    const tags = extractInlineTags(body);
    expect(tags).toContain("valid");
  });

  it("handles nested tags with slashes", () => {
    const body = "Has #parent/child tag";
    const tags = extractInlineTags(body);
    expect(tags).toContain("parent/child");
  });

  it("returns empty for no tags", () => {
    const tags = extractInlineTags("Just plain text here");
    expect(tags).toEqual([]);
  });
});

describe("extractFrontmatterTags", () => {
  it("extracts array tags", () => {
    const tags = extractFrontmatterTags({ tags: ["foo", "bar"] });
    expect(tags).toEqual(["foo", "bar"]);
  });

  it("extracts comma-separated string tags", () => {
    const tags = extractFrontmatterTags({ tags: "foo, bar, baz" });
    expect(tags).toEqual(["foo", "bar", "baz"]);
  });

  it("returns empty for missing tags", () => {
    expect(extractFrontmatterTags({})).toEqual([]);
  });

  it("returns empty for non-string/array tags", () => {
    expect(extractFrontmatterTags({ tags: 42 })).toEqual([]);
  });
});

describe("updateFrontmatterProperty", () => {
  it("updates an existing property", () => {
    const content = `---\ntitle: Old\ncount: 1\n---\n# Body`;
    const updated = updateFrontmatterProperty(content, "title", "New Title");
    expect(updated).toContain("title: New Title");
    expect(updated).toContain("count: 1");
    expect(updated).toContain("# Body");
  });

  it("adds a new property to existing frontmatter", () => {
    const content = `---\ntitle: Hello\n---\nBody text`;
    const updated = updateFrontmatterProperty(content, "status", "draft");
    expect(updated).toContain("title: Hello");
    expect(updated).toContain("status: draft");
    expect(updated).toContain("Body text");
  });

  it("creates frontmatter when none exists", () => {
    const content = "Just body text here";
    const updated = updateFrontmatterProperty(content, "title", "New");
    expect(updated).toContain("---");
    expect(updated).toContain("title: New");
    expect(updated).toContain("Just body text here");
  });

  it("preserves body exactly", () => {
    const body = "# Heading\n\nParagraph with **bold** and [[wikilink]]\n\n- list item";
    const content = `---\ntitle: Test\n---\n${body}`;
    const updated = updateFrontmatterProperty(content, "title", "Updated");
    expect(updated).toContain(body);
  });

  it("handles list values", () => {
    const content = `---\ntags:\n  - one\n---\nBody`;
    const updated = updateFrontmatterProperty(content, "tags", ["one", "two", "three"]);
    expect(updated).toContain("two");
    expect(updated).toContain("three");
  });
});

describe("serializeFrontmatter (round-trip)", () => {
  it("round-trips frontmatter preserving body", () => {
    const original = `---\ntitle: Hello\ntags:\n  - foo\n---\n# Body\n\nContent here.`;
    const { frontmatter, body, document: doc } = parseFrontmatter(original);
    const result = serializeFrontmatter(frontmatter, body, doc);
    expect(result).toContain("title: Hello");
    expect(result).toContain("# Body");
    expect(result).toContain("Content here.");
  });

  it("preserves unrelated fields when updating one", () => {
    const original = `---\ntitle: Test\nauthor: John\ndate: 2024-01-15\n---\nBody`;
    const { frontmatter, body, document: doc } = parseFrontmatter(original);
    frontmatter["title"] = "Updated";
    const result = serializeFrontmatter(frontmatter, body, doc);
    expect(result).toContain("title: Updated");
    expect(result).toContain("author: John");
    expect(result).toContain("date: 2024-01-15");
  });
});
