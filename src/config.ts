import { resolve, join, dirname } from "path";
import { existsSync, readFileSync } from "fs";

// Explicitly load .env with our own parser.
// Bun's built-in .env loader chokes on $ characters in values (e.g. bcrypt hashes).
const thisDir = dirname(new URL(import.meta.url).pathname);
const candidates = [".env", join(thisDir, ".env"), join(thisDir, "..", ".env")];
const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Always overwrite — Bun's auto-loader may set empty values for $-prefixed strings
    if (key) {
      process.env[key] = val;
    }
  }
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  vaultPath: resolve(required("VAULT_PATH")),
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  passwordHash: required("AUTH_PASSWORD_HASH"),
  sessionSecret: required("SESSION_SECRET"),
  sessionTtl: parseInt(process.env["SESSION_TTL"] ?? "604800", 10),
};
