import { describe, it, expect, beforeAll } from "bun:test";

// Set up env before importing auth/config
process.env["VAULT_PATH"] = "/tmp/vault";
process.env["AUTH_PASSWORD_HASH"] = await Bun.password.hash("testpassword", { algorithm: "argon2id" });
process.env["SESSION_SECRET"] = "test_secret_32_chars_long_enough!!";
process.env["SESSION_TTL"] = "3600";
process.env["NODE_ENV"] = "development";

const { createSessionCookie, verifySessionCookie, clearSessionCookie } = await import("../src/auth.ts");

describe("session cookie", () => {
  it("creates a valid cookie that verifies", async () => {
    const cookie = await createSessionCookie();
    expect(cookie).toContain("session=");

    // Extract just the value from the Set-Cookie header
    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const cookieHeader = `session=${value}`;
    const valid = await verifySessionCookie(cookieHeader);
    expect(valid).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await createSessionCookie();
    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const tampered = value.slice(0, -4) + "XXXX";
    const valid = await verifySessionCookie(`session=${tampered}`);
    expect(valid).toBe(false);
  });

  it("rejects a cookie with wrong key", async () => {
    const cookie = await createSessionCookie();
    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const [b64] = value.split(".");
    // Create a fake signature
    const fakeValue = `${b64}.fakesig`;
    const valid = await verifySessionCookie(`session=${fakeValue}`);
    expect(valid).toBe(false);
  });

  it("rejects null cookie header", async () => {
    const valid = await verifySessionCookie(null);
    expect(valid).toBe(false);
  });

  it("rejects empty cookie header", async () => {
    const valid = await verifySessionCookie("");
    expect(valid).toBe(false);
  });

  it("clearSessionCookie sets Max-Age=0", () => {
    const header = clearSessionCookie();
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("session=");
  });
});

describe("verifyPassword", () => {
  it("accepts correct password", async () => {
    const { verifyPassword } = await import("../src/auth.ts");
    const ok = await verifyPassword("testpassword");
    expect(ok).toBe(true);
  });

  it("rejects wrong password", async () => {
    const { verifyPassword } = await import("../src/auth.ts");
    const ok = await verifyPassword("wrongpassword");
    expect(ok).toBe(false);
  });
});
