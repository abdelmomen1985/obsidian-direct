import { config } from "./config.ts";

const COOKIE_NAME = "session";

// In-memory rate limiter: ip -> { count, lockedUntil }
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return true;
  if (entry.lockedUntil > now) return false;
  if (entry.count >= MAX_ATTEMPTS) return false;
  return true;
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
  loginAttempts.set(ip, entry);
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

export async function verifyPassword(password: string): Promise<boolean> {
  return Bun.password.verify(password, config.passwordHash);
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(payload: string, sig: string): Promise<boolean> {
  const expected = await hmacSign(payload);
  // Constant-time compare via timing-safe equals
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionCookie(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ iat: now, exp: now + config.sessionTtl });
  const b64 = btoa(payload);
  const sig = await hmacSign(b64);
  const value = `${b64}.${sig}`;
  const secure = process.env["NODE_ENV"] !== "development" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${config.sessionTtl}`;
}

export async function verifySessionCookie(
  cookieHeader: string | null
): Promise<boolean> {
  if (!cookieHeader) return false;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k?.trim() ?? "", decodeURIComponent(v.join("="))];
    })
  );
  const raw = cookies[COOKIE_NAME];
  if (!raw) return false;

  const dot = raw.lastIndexOf(".");
  if (dot === -1) return false;
  const b64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  if (!(await hmacVerify(b64, sig))) return false;

  try {
    const { exp } = JSON.parse(atob(b64)) as { exp: number };
    return Math.floor(Date.now() / 1000) < exp;
  } catch {
    return false;
  }
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
