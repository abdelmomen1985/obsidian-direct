import { resolveWikilink } from "../wikilink-index.ts";

export function handleResolveWikilink(req: Request): Response {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return new Response(JSON.stringify({ error: "Missing name" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = resolveWikilink(name);
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}
