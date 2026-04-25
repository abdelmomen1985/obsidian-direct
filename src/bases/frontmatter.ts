import { Document, parseDocument } from "yaml";

const FM_REGEX = /^---\r?\n([\s\S]*?)(?:\r?\n)?---(?:\r?\n|$)/;

export interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
  rawFrontmatter: string;
  document: Document | null;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = FM_REGEX.exec(content);
  if (!match) {
    return {
      frontmatter: {},
      body: content,
      rawFrontmatter: "",
      document: null,
    };
  }

  const rawFrontmatter = match[1] ?? "";
  const fullMatch = match[0] ?? "";
  const body = content.slice(fullMatch.length);

  try {
    const doc = parseDocument(rawFrontmatter, { keepSourceTokens: true });
    const parsed = doc.toJSON();
    const frontmatter =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { frontmatter, body, rawFrontmatter, document: doc };
  } catch {
    return { frontmatter: {}, body, rawFrontmatter, document: null };
  }
}

export function extractInlineTags(body: string): string[] {
  const tags = new Set<string>();
  const tagRe = /(?:^|\s)#([a-zA-Z_][\w/-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    if (m[1]) tags.add(m[1]);
  }
  return [...tags];
}

export function extractFrontmatterTags(
  frontmatter: Record<string, unknown>
): string[] {
  const raw = frontmatter["tags"];
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string").map((t) => t.trim());
  }
  return [];
}

export function updateFrontmatterProperty(
  content: string,
  key: string,
  value: unknown
): string {
  const match = FM_REGEX.exec(content);
  if (!match) {
    const doc = new Document({});
    doc.set(key, value);
    const yaml = doc.toString().trimEnd();
    return `---\n${yaml}\n---\n${content}`;
  }

  const rawFm = match[1] ?? "";
  const fullMatch = match[0] ?? "";
  const body = content.slice(fullMatch.length);

  const doc = parseDocument(rawFm, { keepSourceTokens: true });
  doc.set(key, value);
  const updatedYaml = doc.toString().trimEnd();

  return `---\n${updatedYaml}\n---\n${body}`;
}

export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  originalDoc?: Document | null
): string {
  let doc: Document;
  if (originalDoc) {
    doc = originalDoc.clone() as Document;
    for (const [k, v] of Object.entries(frontmatter)) {
      doc.set(k, v);
    }
  } else {
    doc = new Document(frontmatter);
  }

  const yaml = doc.toString().trimEnd();
  if (!yaml || yaml === "{}" || yaml === "{}\\n") {
    return body;
  }
  return `---\n${yaml}\n---\n${body}`;
}
