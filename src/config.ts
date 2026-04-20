import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";

// Explicitly load .env so the server works when invoked outside `bun run`
// (e.g. screen sessions, bash -c, systemd). Bun auto-loads only from cwd.
const envPath = join(import.meta.dir, "..", ".env");
if (existsSync(envPath)) {
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
    if (key && !(key in process.env)) {
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
