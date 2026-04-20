# Obsidian Direct — Setup Report

**Date:** 2026-04-20  
**Server:** Ubuntu (local)  
**Bun version:** 1.3.13  
**Port:** 5013  
**Vault path:** `/home/ubuntu/Documents/mo2-obsidian`

---

## 1. Setup Steps

1. **Cloned repo** from GitHub → `~/dev/obsidian-direct`
2. **Installed Bun** v1.3.13 via official installer (`~/.bun/bin/bun`)
3. **Ran `bun install`** — 85 packages installed
4. **Built frontend** — `bun run build` → 153 modules bundled (1.66 MB)
5. **Generated `.env`** with bcrypt password hash and session secret
6. **Launched via screen** session `obsidian-direct` on port 5013

---

## 2. Issues Found & Fixes

### Issue 1: Bun 1.3.13 Does Not Support argon2id

**Error:**

```
error: Password verification failed with error "UnsupportedAlgorithm"
code: "PASSWORD_UNSUPPORTED_ALGORITHM"
```

**Cause:** The `hash-password.ts` script defaults to `algorithm: "argon2id"`, but Bun v1.3.13 only supports **bcrypt** for `Bun.password.hash()` / `Bun.password.verify()`.

**Fix:** Regenerated the password hash using bcrypt:

```js
Bun.password.hash("trato2026", { algorithm: "bcrypt" });
// → $2b$10$...
```

### Issue 2: `.env` Not Auto-Loaded

**Error:**

```
error: Missing required env var: AUTH_PASSWORD_HASH
```

**Cause:** Bun's `.env` auto-loading doesn't work in all contexts (e.g., `bun run` via screen). The project has no explicit dotenv dependency.

**Fix:** Source the `.env` manually before starting:

```bash
set -a && source .env && set +a && bun run start
```

---

## 3. Runtime Configuration

| Variable            | Value                                  |
|---------------------|----------------------------------------|
| `VAULT_PATH`        | `/home/ubuntu/Documents/mo2-obsidian`  |
| `PORT`              | `5013`                                 |
| `AUTH_PASSWORD_HASH`| `$2b$10$...` (bcrypt)                 |
| `SESSION_SECRET`    | 64-char hex (openssl rand)             |
| `SESSION_TTL`       | `604800` (7 days)                      |

**Login password:** `trato2026`

---

## 4. How to Manage the Server

```bash
# Attach to session
screen -r obsidian-direct

# Stop server
screen -S obsidian-direct -X quit

# Start server
screen -dmS obsidian-direct bash -c \
  'export PATH="$HOME/.bun/bin:$PATH" && cd /home/ubuntu/dev/obsidian-direct && \
   set -a && source .env && set +a && bun run start 2>&1 | tee /tmp/obsidian-direct.log'

# View logs
cat /tmp/obsidian-direct.log
```

---

## 5. Recommendations

- **Upgrade Bun** — Newer versions (>1.4) may support argon2id natively. Once upgraded, re-run `bun run hash` with the default algorithm for stronger password hashing.
- **Add dotenv loading** — Consider adding `import "dotenv/config"` or relying on Bun's auto-load more explicitly to avoid the manual `source .env` workaround.
- **HTTPS** — The server currently runs on plain HTTP. Use a reverse proxy (Caddy recommended in the README) for production use.
