import { describe, it, expect } from "bun:test";
import { parseBaseYaml } from "../src/bases/base-parser.ts";

describe("parseBaseYaml", () => {
  it("parses a basic base definition", () => {
    const yaml = `
filters:
  and:
    - property: status
      operator: eq
      value: published
views:
  - name: All Notes
    type: table
    columns:
      - file.name
      - status
      - tags
`;
    const { definition, warnings } = parseBaseYaml(yaml);
    expect(definition.filters).toBeDefined();
    expect(definition.filters?.and).toHaveLength(1);
    expect(definition.views).toHaveLength(1);
    expect(definition.views?.[0]?.name).toBe("All Notes");
    expect(definition.views?.[0]?.type).toBe("table");
    expect(definition.views?.[0]?._supported).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("preserves unknown top-level keys", () => {
    const yaml = `
custom_key: some_value
another_key:
  nested: true
views:
  - name: Test
    type: table
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.unknownKeys["custom_key"]).toBe("some_value");
    expect(definition.unknownKeys["another_key"]).toEqual({ nested: true });
  });

  it("warns on unsupported view types", () => {
    const yaml = `
views:
  - name: Board View
    type: board
  - name: Table View
    type: table
`;
    const { definition, warnings } = parseBaseYaml(yaml);
    expect(definition.views).toHaveLength(2);
    expect(definition.views?.[0]?._supported).toBe(false);
    expect(definition.views?.[0]?._unsupportedReason).toContain("board");
    expect(definition.views?.[1]?._supported).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("supports list and gallery view types", () => {
    const yaml = `
views:
  - name: Cards
    type: list
    columns: [file.name]
  - name: Photos
    type: gallery
    columns: [file.name, cover]
`;
    const { definition, warnings } = parseBaseYaml(yaml);
    expect(definition.views).toHaveLength(2);
    expect(definition.views?.[0]?.type).toBe("list");
    expect(definition.views?.[0]?._supported).toBe(true);
    expect(definition.views?.[1]?.type).toBe("gallery");
    expect(definition.views?.[1]?._supported).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("parses formulas", () => {
    const yaml = `
formulas:
  full_path: "concat(file.folder, '/', file.name)"
  name_upper:
    expression: "upper(file.name)"
    type: string
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.formulas).toBeDefined();
    expect(definition.formulas?.["full_path"]?.expression).toBe(
      "concat(file.folder, '/', file.name)"
    );
    expect(definition.formulas?.["name_upper"]?.type).toBe("string");
  });

  it("parses properties list", () => {
    const yaml = `
properties:
  - name: title
    type: text
    label: Title
    width: 200
  - name: status
    type: select
    hidden: true
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.properties).toHaveLength(2);
    expect(definition.properties?.[0]?.name).toBe("title");
    expect(definition.properties?.[0]?.width).toBe(200);
    expect(definition.properties?.[1]?.hidden).toBe(true);
  });

  it("parses filter conditions with various operators", () => {
    const yaml = `
filters:
  and:
    - property: count
      operator: gt
      value: 10
    - property: status
      operator: contains
      value: active
  or:
    - property: tags
      operator: exists
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.filters?.and).toHaveLength(2);
  });

  it("warns on unknown filter operators", () => {
    const yaml = `
filters:
  and:
    - property: status
      operator: banana
      value: test
`;
    const { definition, warnings } = parseBaseYaml(yaml);
    expect(warnings.some((w) => w.includes("banana"))).toBe(true);
  });

  it("parses nested filter groups", () => {
    const yaml = `
filters:
  or:
    - and:
        - property: status
          operator: eq
          value: active
        - property: priority
          operator: gt
          value: 3
    - property: starred
      operator: eq
      value: true
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.filters?.or).toHaveLength(2);
  });

  it("handles empty YAML", () => {
    const { definition, warnings } = parseBaseYaml("");
    expect(definition.rawYaml).toBe("");
    expect(warnings.length).toBeGreaterThanOrEqual(0);
  });

  it("handles invalid YAML gracefully", () => {
    const { warnings } = parseBaseYaml("{{invalid yaml");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("parses view with sort and group", () => {
    const yaml = `
views:
  - name: Grouped
    type: table
    sort:
      - property: date
        direction: desc
      - property: title
        direction: asc
    group:
      property: status
      direction: asc
    limit: 50
`;
    const { definition } = parseBaseYaml(yaml);
    const view = definition.views?.[0];
    expect(view?.sort).toHaveLength(2);
    expect(view?.sort?.[0]?.direction).toBe("desc");
    expect(view?.group?.property).toBe("status");
    expect(view?.limit).toBe(50);
  });

  it("parses not filter", () => {
    const yaml = `
filters:
  not:
    property: archived
    operator: eq
    value: true
`;
    const { definition } = parseBaseYaml(yaml);
    expect(definition.filters?.not).toBeDefined();
  });
});
