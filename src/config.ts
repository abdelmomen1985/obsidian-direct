import { resolve } from "path";

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
