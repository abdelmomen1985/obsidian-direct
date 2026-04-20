# Obsidian Direct

Web editor for your Obsidian vault — runs on the SSH server that hosts the vault, exposes a password-protected browser UI with file tree, CodeMirror editor, live preview, `[[wikilinks]]`, and full-text search.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- Your Obsidian vault accessible as a local directory on the server
- A reverse proxy (Caddy recommended) for HTTPS

## Setup

### 1. Clone & install

```bash
git clone https://github.com/youruser/obsidian-direct
cd obsidian-direct
bun install
```

### 2. Hash your password

```bash
bun run hash
# → prints AUTH_PASSWORD_HASH=...
```

### 3. Create `.env`

```bash
cp .env.example .env
# Edit .env:
VAULT_PATH=/absolute/path/to/your/vault
PORT=3000
AUTH_PASSWORD_HASH=<paste hash from step 2>
SESSION_SECRET=$(openssl rand -hex 32)
```

### 4. Build the frontend

```bash
bun run build
```

### 5. Start the server

```bash
bun run start
```

### 6. Reverse proxy (Caddy)

```bash
sudo cp caddy/Caddyfile.example /etc/caddy/Caddyfile
# Edit domain, then:
sudo systemctl reload caddy
```

See `caddy/Caddyfile.example` for details.

### 7. Run as a service (systemd)

```bash
sudo cp systemd/obsidian-web.service.example /etc/systemd/system/obsidian-web.service
# Edit User and paths, then:
sudo systemctl daemon-reload
sudo systemctl enable --now obsidian-web
```

## Development

```bash
# Watch server + rebuild frontend on changes:
bun run dev
```

The server watches `src/` with `--watch` and the frontend rebuilds on change.

## Testing

```bash
bun test
```

Covers path traversal prevention, session cookie signing/verification, and wikilink resolution.

## Security notes

- All file paths are validated to stay within `VAULT_PATH` (symlinks resolved and re-checked).
- Writes restricted to `.md` files; reads allow `.md` and common image extensions.
- Writes are atomic: a `.tmp` file is written first, then renamed.
- Login attempts are rate-limited to 5 per IP per 60 seconds.
- Session cookies are HMAC-SHA256 signed with `SESSION_SECRET`.

## Out of scope (v1)

Attachment uploads, graph view, tags pane, multi-user, real-time collaboration, mobile layout.
