import {
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  checkRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
} from "../auth.ts";

export async function handleLogin(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { password?: string };
  try {
    body = await req.json() as { password?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.password || typeof body.password !== "string") {
    return new Response(JSON.stringify({ error: "Password required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ok = await verifyPassword(body.password);
  if (!ok) {
    recordFailedLogin(ip);
    return new Response(JSON.stringify({ error: "Invalid password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  clearLoginAttempts(ip);
  const cookie = await createSessionCookie();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}

export function handleLogout(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
