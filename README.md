# Sandboxie

A containerized sandbox management system that provides isolated Linux terminal environments accessible via web browsers. Perfect for provisioning temporary development environments for friends, students, or workshop participants.

## Overview

Sandboxie creates isolated Podman containers for each user, providing a fully-featured Ubuntu 22.04 development environment with SSH access. Users connect through a web-based terminal or via Cloudflare Tunnel-proxied SSH. The system automatically handles DNS subdomain registration, resource limiting, and session lifecycle management.

### Key Features

- **Isolated Environments**: Each user gets a dedicated Podman container with no access to the host system
- **Web Terminal**: Browser-based terminal emulation via xterm.js and WebSocket
- **SSH Access**: Direct SSH connections through Cloudflare Tunnel (no port forwarding required)
- **HTTP Tunneling**: Expose web servers running in containers via Cloudflare Tunnel
- **Resource Control**: CPU and memory limits per session (cgroup v2 dependent)
- **Auto DNS**: Automatic subdomain creation via Cloudflare API
- **Admin Dashboard**: Web UI for session management, monitoring, and creation
- **Security First**: Rate-limited authentication, Argon2id password hashing, JWT tokens
- **AI Coding Agents**: Per-session Claude Code and Codex integration with task queue, real-time output streaming, and Web Push notifications
- **Single Binary Deployment**: Compile to a single executable with Bun

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) 1.3+ |
| Backend Framework | [Elysia.js](https://elysiajs.com) 1.2+ |
| Frontend | [Vite](https://vitejs.dev) + [SolidJS](https://www.solidjs.com) (CSR/SPA) |
| Styling | [Tailwind CSS](https://tailwindcss.com) 3.4 |
| Database | PostgreSQL 15 (Podman container) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Container Runtime | [Podman](https://podman.io) 5.4+ (rootless mode) |
| Terminal | [xterm.js](https://xtermjs.org) 6.0 + FitAddon + WebLinksAddon |
| SSH Client | [ssh2](https://github.com/mscdex/ssh2) |
| Tunnel/DNS | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) + DNS API |
| Password Hashing | Argon2id (via `Bun.password`) |
| E2E Testing | [Playwright](https://playwright.dev) 1.58 |

## Architecture

```
                                    ┌─────────────────────────────────────────────┐
                                    │              Cloudflare Edge                │
                                    │  ┌─────────────┐    ┌─────────────────────┐ │
                                    │  │  DNS CNAME  │    │  Cloudflare Tunnel  │ │
                                    │  │  Records    │───▶│  (cloudflared)      │ │
                                    │  └─────────────┘    └──────────┬──────────┘ │
                                    └──────────────────────────────────────────────┘
                                                                     │
                    ┌────────────────────────────────────────────────┼─────────────┐
                    │                     Host Server                │             │
                    │                                                ▼             │
                    │  ┌─────────────────────────────────────────────────────────┐ │
                    │  │                   Sandboxie Server                      │ │
                    │  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │ │
                    │  │  │  REST API    │  │  WebSocket   │  │ Static Files  │  │ │
                    │  │  │  (Elysia)    │  │  Terminal    │  │ (SPA)         │  │ │
                    │  │  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │ │
                    │  │         │                 │                              │ │
                    │  │  ┌──────┴─────────────────┴──────┐                       │ │
                    │  │  │         Services              │                       │ │
                    │  │  │  ┌─────────┐ ┌─────────────┐  │                       │ │
                    │  │  │  │ Podman  │ │ Cloudflare  │  │                       │ │
                    │  │  │  │ Manager │ │ DNS/Tunnel  │  │                       │ │
                    │  │  │  └────┬────┘ └─────────────┘  │                       │ │
                    │  │  └───────┼───────────────────────┘                       │ │
                    │  └──────────┼───────────────────────────────────────────────┘ │
                    │             │                                                 │
                    │  ┌──────────┼──────────────────────────────────────────────┐  │
                    │  │          ▼           Podman Containers                  │  │
                    │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
                    │  │  │ sandbox-alice│ │sandbox-bob  │  │sandbox-...  │      │  │
                    │  │  │  :2200→22   │  │  :2201→22   │  │  :22XX→22   │      │  │
                    │  │  │  :3200→80   │  │  :3201→80   │  │  :32XX→80   │      │  │
                    │  │  │  Ubuntu     │  │  Ubuntu     │  │  Ubuntu     │      │  │
                    │  │  │  22.04      │  │  22.04      │  │  22.04      │      │  │
                    │  │  └─────────────┘  └─────────────┘  └─────────────┘      │  │
                    │  └─────────────────────────────────────────────────────────┘  │
                    │                                                               │
                    │  ┌─────────────────┐                                          │
                    │  │   PostgreSQL    │                                          │
                    │  │   (sessions)    │                                          │
                    │  └─────────────────┘                                          │
                    └───────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Web Terminal**: Browser → Sandboxie WebSocket → ssh2 → Container SSH
2. **Direct SSH**: User SSH Client → cloudflared → Cloudflare Tunnel → Host Port → Container SSH
3. **HTTP Access**: Browser → Cloudflare Tunnel → Host Port → Container Port 80

## Project Structure

```
sandboxie/
├── backend/                              # Elysia.js backend server
│   ├── src/
│   │   ├── index.ts                     # Server entry point + static file serving
│   │   ├── config.ts                    # Environment variable loader with validation
│   │   ├── db/
│   │   │   ├── index.ts                 # Drizzle ORM client initialization
│   │   │   ├── schema.ts                # Session table schema (status enum, constraints)
│   │   │   └── migrate.ts               # Migration runner
│   │   ├── routes/
│   │   │   ├── auth.ts                  # POST /api/auth/login (rate-limited)
│   │   │   ├── sessions.ts              # Session CRUD endpoints (JWT protected)
│   │   │   └── terminal.ts              # WebSocket terminal proxy (ssh2)
│   │   ├── services/
│   │   │   ├── session.ts               # Session lifecycle (create/delete/restart)
│   │   │   ├── podman.ts                # Podman CLI wrapper (cgroup detection)
│   │   │   ├── cloudflare.ts            # DNS CNAME record management
│   │   │   ├── tunnel.ts                # Tunnel ingress config (YAML manipulation)
│   │   │   └── ssh.ts                   # SSH2 client connection handler
│   │   ├── middleware/
│   │   │   └── auth.ts                  # JWT verification guard (jwtPlugin + verifyAuth)
│   │   └── utils/
│   │       ├── password.ts              # Argon2id hashing utilities
│   │       └── port-allocator.ts        # SSH/HTTP port pool allocation
│   ├── drizzle/                         # SQL migration files
│   │   ├── 0000_initial.sql
│   │   └── 0001_add_http_port.sql
│   ├── drizzle.config.ts                # Drizzle Kit configuration
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                             # Vite + SolidJS frontend
│   ├── src/
│   │   ├── index.tsx                    # Application entry point
│   │   ├── App.tsx                      # Root router (Login/Dashboard/Terminal)
│   │   ├── api.ts                       # API client with auth header injection
│   │   ├── index.css                    # Tailwind CSS imports + global styles
│   │   ├── pages/
│   │   │   ├── Login.tsx                # Admin password form with rate limit display
│   │   │   ├── Dashboard.tsx            # Session management UI (create/delete/restart)
│   │   │   └── Terminal.tsx             # xterm.js terminal with mobile keyboard support
│   │   └── hooks/
│   │       └── useTerminal.ts           # Terminal state management hook
│   ├── build/                           # Production build output (served by backend)
│   ├── vite.config.ts                   # Vite configuration (SPA mode)
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   └── tsconfig.json
│
├── container/                            # Sandbox container image definition
│   ├── Containerfile                    # Ubuntu 22.04 + Node.js + Bun + dev tools
│   └── entrypoint.sh                    # User creation + SSH server + zsh setup
│
├── e2e/                                  # End-to-end tests
│   └── app.spec.ts                      # Playwright test suite
│
├── scripts/
│   ├── deploy.sh                        # Production deployment script
│   └── hash-password.ts                 # Admin password hash generator
│
├── docker-compose.yml                    # PostgreSQL 15 service definition
├── playwright.config.ts                  # Playwright test configuration
├── tsconfig.base.json                    # Shared TypeScript configuration
├── .env.example                          # Environment variable template
└── package.json                          # Bun workspace root (monorepo)
```

## Prerequisites

### System Requirements

- **OS**: Linux (tested on Debian 13/trixie, aarch64)
- **Runtime**: [Bun](https://bun.sh) v1.0 or later
- **Container**: [Podman](https://podman.io) v4.0+ (rootless mode recommended)
- **Database**: PostgreSQL 15 (provided via `docker-compose.yml`)
- **Tunnel**: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/) (optional, for SSH/HTTP access)

### Hardware Tested

- Raspberry Pi 5 (8GB RAM, Debian 13 trixie, aarch64)
- Standard x86_64 Linux servers

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/sandboxie.git
cd sandboxie
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Required | Description | Default |
|----------|:--------:|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | - |
| `DB_PASSWORD` | Yes | Database password (for docker-compose) | - |
| `ADMIN_PASSWORD_HASH` | Yes | Argon2id hash of admin password | - |
| `JWT_SECRET` | Yes | Secret key for JWT signing (min 32 chars) | - |
| `CF_API_TOKEN` | No | Cloudflare API token (Zone:Edit, DNS:Edit) | - |
| `CF_ZONE_ID` | No | Cloudflare Zone ID | - |
| `CF_DOMAIN` | No | Base domain (e.g., `sandbox.example.com`) | - |
| `CF_TUNNEL_ID` | No | Cloudflare Tunnel ID | - |
| `PORT` | No | Server listen port | `3000` |
| `HOST` | No | Server listen address | `0.0.0.0` |
| `SANDBOX_IMAGE` | No | Container image name | `localhost/sandboxie:latest` |
| `SSH_PORT_START` | No | SSH port range start | `2200` |
| `SSH_PORT_END` | No | SSH port range end | `2299` |
| `STATIC_DIR` | No | Frontend build directory | Auto-detected |

### 4. Generate Admin Password Hash

The admin password must be stored as an Argon2id hash for security:

```bash
bun run scripts/hash-password.ts your-secure-password
```

Copy the output hash to your `.env` file:

```env
ADMIN_PASSWORD_HASH=$argon2id$v=19$m=65536,t=2,p=1$...
```

### 5. Start PostgreSQL

```bash
bun run db:up
```

### 6. Run Database Migrations

```bash
# Generate migrations (if schema changed)
bun run db:generate

# Apply migrations
bun run db:migrate
```

### 7. Build the Sandbox Container Image

```bash
podman build -t localhost/sandboxie:latest container/
```

**Important**: The image name must use `localhost/` prefix for Podman to find it without registry lookups.

### 8. Build Frontend

```bash
bun run build
```

### 9. Start the Server

```bash
# Development mode (with hot reload)
bun run dev:backend

# Production mode
bun run start
```

Access the dashboard at `http://localhost:3000`.

## Cloudflare Tunnel Setup (Optional)

Cloudflare Tunnel enables secure SSH and HTTP access to containers without exposing ports publicly.

### 1. Install cloudflared

```bash
# macOS
brew install cloudflared

# Debian/Ubuntu
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### 2. Authenticate and Create Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create sandboxie
```

Note the Tunnel ID from the output.

### 3. Configure Tunnel

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Web dashboard
  - hostname: dashboard.example.com
    service: http://localhost:3000

  # SSH and HTTP rules are dynamically added by Sandboxie
  # Format: {username}-ssh-{domain} → ssh://127.0.0.1:{port}
  # Format: {username}-web-{domain} → http://127.0.0.1:{port}

  # Catch-all (required)
  - service: http_status:404
```

**Note**: Use `127.0.0.1` instead of `localhost` for SSH services. Podman rootless binds to IPv4 only, and `localhost` may resolve to IPv6.

### 4. Set Up DNS Records

For each subdomain pattern, create a CNAME record pointing to your tunnel:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `*-ssh-sandbox` | `<TUNNEL_ID>.cfargotunnel.com` | Proxied |
| CNAME | `*-web-sandbox` | `<TUNNEL_ID>.cfargotunnel.com` | Proxied |
| CNAME | `dashboard` | `<TUNNEL_ID>.cfargotunnel.com` | Proxied |

**Cloudflare Free Tier Limitation**: SSL certificates only cover one level of subdomains (`*.example.com`), not nested (`*.sandbox.example.com`). Use dash notation: `alice-ssh-sandbox.example.com`.

### 5. Start Tunnel Service

```bash
# Run as daemon
sudo cloudflared service install
sudo systemctl start cloudflared

# Or run manually
cloudflared tunnel run sandboxie
```

### 6. Update Environment Variables

```env
CF_API_TOKEN=your-api-token-with-dns-edit
CF_ZONE_ID=your-zone-id
CF_DOMAIN=sandbox.example.com
CF_TUNNEL_ID=your-tunnel-id
```

## Usage

### Admin Dashboard

1. Navigate to `http://localhost:3000` (or your configured domain)
2. Log in with your admin password
3. Create sessions using the "New Session" form:
   - **Username**: 2-30 characters, alphanumeric only
   - **Password**: SSH password for the container
   - **Memory Limit**: 256-512 MB (if cgroup memory controller available)
   - **CPU Limit**: 0.5-2 cores
   - **TTL**: Session lifetime in hours (0 = unlimited)

### Web Terminal

1. Click "Terminal" button on a session in the dashboard
2. Enter the session's SSH password
3. Use the terminal directly in your browser
4. Mobile users have access to modifier keys (Ctrl, Alt, Shift) via toolbar

### SSH Access via Cloudflare Tunnel

Add to `~/.ssh/config`:

```ssh-config
Host *-ssh-sandbox.example.com
    ProxyCommand cloudflared access ssh --hostname %h
    User <username>
```

Connect:

```bash
ssh alice-ssh-sandbox.example.com
# Password: <session password>
```

### HTTP Access via Cloudflare Tunnel

Start a web server inside the container:

```bash
# Python
python3 -m http.server 80

# Node.js (http-server)
npx http-server -p 80

# Node.js (serve)
npx serve -l 80
```

Access from browser: `https://alice-web-sandbox.example.com`

**Port Mapping**:
- SSH: `alice-ssh-sandbox.example.com` → Host `:2200-2299` → Container `:22`
- HTTP: `alice-web-sandbox.example.com` → Host `:3200-3299` → Container `:80`

## API Reference

All endpoints except `/api/auth/login` and `/api/health` require `Authorization: Bearer <token>` header.

### Authentication

#### POST `/api/auth/login`

Authenticate and receive JWT token.

**Request:**
```json
{
  "password": "admin-password"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (401):**
```json
{
  "error": "Invalid password"
}
```

**Response (429 - Rate Limited):**
```json
{
  "error": "Too many failed attempts. Try again in X minutes."
}
```

Rate limit: 5 failed attempts triggers 15-minute IP lockout.

### Health Check

#### GET `/api/health`

Check server status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Sessions

#### GET `/api/sessions`

List all sessions.

**Response:**
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "alice",
      "subdomain": "alice-sandbox.example.com",
      "sshPort": 2200,
      "httpPort": 3200,
      "containerName": "sandbox-alice",
      "memoryLimit": 256,
      "cpuLimit": 0.5,
      "status": "running",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "expiresAt": null,
      "lastAccessedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

#### POST `/api/sessions`

Create a new session.

**Request:**
```json
{
  "username": "alice",
  "password": "ssh-password",
  "memoryLimit": 256,
  "cpuLimit": 0.5,
  "ttl": 3600
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `username` | string | Yes | 2-30 chars, alphanumeric |
| `password` | string | Yes | SSH login password |
| `memoryLimit` | number | No | 256-512 MB, default 256 |
| `cpuLimit` | number | No | 0.5-2 cores, default 0.5 |
| `ttl` | number | No | Seconds until expiry, 0 = unlimited |

**Response (201):**
```json
{
  "session": { /* session object */ },
  "sshCommand": "ssh alice@alice-ssh-sandbox.example.com"
}
```

**Response (400):**
```json
{
  "error": "Username must be 2-30 alphanumeric characters"
}
```

**Response (409):**
```json
{
  "error": "Session with this username already exists"
}
```

#### DELETE `/api/sessions/:username`

Delete a session and its container.

**Response (200):**
```json
{
  "success": true
}
```

**Response (404):**
```json
{
  "error": "Session not found"
}
```

#### POST `/api/sessions/:username/restart`

Restart a session's container.

**Response (200):**
```json
{
  "success": true
}
```

#### GET `/api/sessions/:username/stats`

Get container resource usage.

**Response:**
```json
{
  "memoryUsage": 45.2,
  "cpuUsage": 12.5,
  "uptime": 3600
}
```

| Field | Unit | Description |
|-------|------|-------------|
| `memoryUsage` | MB | Current memory consumption |
| `cpuUsage` | % | CPU utilization percentage |
| `uptime` | seconds | Container uptime |

### WebSocket Terminal

#### WS `/api/terminal/:username`

Establish terminal connection to a session's container.

**Client Messages:**

```typescript
// Authenticate and start session
{ type: "auth", password: string, cols?: number, rows?: number }

// Send input data (base64 encoded)
{ type: "data", data: string }

// Resize terminal
{ type: "resize", cols: number, rows: number }

// Keep-alive ping
{ type: "ping" }
```

**Server Messages:**

```typescript
// Authentication successful
{ type: "authenticated" }

// Terminal output (base64 encoded)
{ type: "data", data: string }

// Error occurred
{ type: "error", message: string }

// Connection closed
{ type: "disconnect" }

// Ping response
{ type: "pong" }
```

## Sandbox Environment

Each session runs in an isolated Ubuntu 22.04 container with:

### Pre-installed Software

| Category | Packages |
|----------|----------|
| Shell | zsh (with completion, history, aliases) |
| Editors | vim, nano |
| Tools | git, curl, wget, tmux, gh (GitHub CLI) |
| Languages | Node.js 24.x, Python 3, Bun |
| System | sudo (apt/apt-get only), openssh-server |

### User Configuration

- **Shell**: zsh with colored prompt, completion, and useful aliases
- **Sudo**: Limited to `apt` and `apt-get` only (no other elevated commands)
- **Home**: `/home/<username>` with npm/pip user-install paths configured

### Security Restrictions

- Root login disabled via SSH
- No host filesystem access
- Network isolated (Podman default bridge)
- Resource limits enforced (CPU always, memory if cgroup available)

## Production Deployment

### Build and Deploy

```bash
bun run deploy
```

This script (`scripts/deploy.sh`):

1. Builds frontend to `frontend/build/`
2. Compiles backend to single binary (`bun build --compile`)
3. Copies binary and static files to `/opt/sandboxie/`
4. Restarts systemd service

**Note**: Do NOT use `--production` flag with `bun build --compile`. It causes Elysia runtime issues due to minification bugs.

### systemd Service

Create `~/.config/systemd/user/sandboxie.service`:

```ini
[Unit]
Description=Sandboxie Backend Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/sandboxie
ExecStart=/opt/sandboxie/sandboxie
EnvironmentFile=/opt/sandboxie/.env
Environment=STATIC_DIR=/opt/sandboxie/frontend/build
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Enable and start:

```bash
# Enable lingering (keeps service running after logout)
loginctl enable-linger $(whoami)

# Reload and start
systemctl --user daemon-reload
systemctl --user enable --now sandboxie

# Check status
systemctl --user status sandboxie

# View logs
journalctl --user -u sandboxie -f
```

### Environment File

Create `/opt/sandboxie/.env` with production values:

```env
DATABASE_URL=postgresql://sandboxie:password@localhost:5432/sandboxie
ADMIN_PASSWORD_HASH=$argon2id$v=19$m=65536,t=2,p=1$...
JWT_SECRET=your-very-long-secret-key-at-least-32-chars
CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-zone-id
CF_DOMAIN=sandbox.example.com
CF_TUNNEL_ID=your-tunnel-id
PORT=3000
HOST=0.0.0.0
```

## Database Schema

### Sessions Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Unique session identifier |
| `username` | varchar(30) | UNIQUE, NOT NULL | User identifier |
| `password` | varchar(255) | NOT NULL | Argon2id hashed SSH password |
| `subdomain` | varchar(255) | UNIQUE | Full subdomain (username-domain) |
| `sshPort` | integer | UNIQUE | Host port mapped to container :22 |
| `httpPort` | integer | UNIQUE | Host port mapped to container :80 |
| `containerName` | varchar(100) | UNIQUE | Podman container name |
| `memoryLimit` | integer | DEFAULT 256 | Memory limit in MB |
| `cpuLimit` | real | DEFAULT 0.5 | CPU cores limit |
| `status` | enum | NOT NULL | 'running', 'stopped', 'paused' |
| `createdAt` | timestamptz | DEFAULT now() | Creation timestamp |
| `expiresAt` | timestamptz | NULLABLE | TTL expiration timestamp |
| `lastAccessedAt` | timestamptz | | Last activity timestamp |

## Testing

### E2E Tests

```bash
# Start server first
bun run start &

# Run Playwright tests
bun test
```

Test coverage includes:
- Health check endpoint
- Static file serving (HTML, JS, CSS)
- SPA fallback routing
- Login form rendering
- Authentication flow
- Dashboard functionality
- Session creation UI
- API endpoint authentication

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'

# Test session creation (with token)
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username": "testuser", "password": "testpass"}'
```

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `bun run dev:backend` | Start backend in development mode (hot reload) |
| `bun run dev:frontend` | Start Vite dev server for frontend |
| `bun run build` | Build frontend for production |
| `bun run start` | Run production backend server |
| `bun run db:up` | Start PostgreSQL container |
| `bun run db:down` | Stop PostgreSQL container |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply database migrations |
| `bun run deploy` | Build and deploy to /opt/sandboxie/ |
| `bun test` | Run Playwright E2E tests |

## Known Limitations

### cgroup v2 Memory Controller

On some systems (notably Raspberry Pi 5 with default kernel), the cgroup v2 memory controller is not enabled. The application automatically detects this by checking `/sys/fs/cgroup/cgroup.controllers` and disables memory limiting if unavailable.

**Workaround**: If you need memory limits, enable the memory controller in your kernel boot parameters:
```
cgroup_enable=memory cgroup_memory=1
```

### Podman Restart Port Conflict

`podman restart` sometimes fails with "port already in use" errors. The application uses a stop → 1-second sleep → start pattern as a workaround.

### TTL Auto-Expiration

The `expiresAt` field is stored in the database, but automatic session cleanup via cron job is not yet implemented. Sessions with expired TTL must be manually deleted.

### Cloudflare DNS Graceful Degradation

If Cloudflare credentials are not configured or API calls fail, the application logs warnings but continues session creation. Sessions will be accessible via direct host ports but not via Cloudflare Tunnel subdomains.

### Bun Compilation

Using `bun build --compile --production` breaks Elysia at runtime due to minification bugs. Always compile without the `--production` flag:
```bash
bun build --compile --target=bun backend/src/index.ts --outfile sandboxie
```

## Security Considerations

### Authentication Security

- **Password Storage**: Admin and session passwords use Argon2id hashing (memory-hard, resistant to GPU attacks)
- **Rate Limiting**: 5 failed login attempts trigger 15-minute IP lockout
- **IP Detection**: Supports Cloudflare headers (CF-Connecting-IP, X-Forwarded-For)
- **JWT Tokens**: 24-hour expiry, signed with configurable secret

### Container Isolation

- **Rootless Podman**: Containers run without root privileges on host
- **Limited Sudo**: Users can only run apt/apt-get with sudo
- **No Host Access**: Containers have no access to host filesystem
- **Network Isolation**: Default Podman bridge network (containers cannot access each other)
- **Resource Limits**: CPU limits always enforced, memory limits when available

### Input Validation

- Username: 2-30 characters, alphanumeric only (prevents injection)
- Memory/CPU limits: Enforced ranges (256-512 MB, 0.5-2 cores)
- All API inputs validated before processing

## Troubleshooting

### Container Won't Start

```bash
# Check Podman logs
podman logs sandbox-<username>

# Check if image exists
podman images | grep sandboxie

# Rebuild image
podman build -t localhost/sandboxie:latest container/
```

### SSH Connection Refused

```bash
# Check if container is running
podman ps | grep sandbox-<username>

# Check SSH port mapping
podman port sandbox-<username>

# Test direct connection
ssh -p <port> <username>@localhost
```

### Cloudflare Tunnel Not Working

```bash
# Check tunnel status
cloudflared tunnel info <tunnel-id>

# Check ingress rules
cat /etc/cloudflared/config.yml

# Restart cloudflared
sudo systemctl restart cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### Database Connection Issues

```bash
# Check PostgreSQL container
podman ps | grep postgres

# View PostgreSQL logs
podman logs sandboxie-postgres

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Commit with conventional commit messages (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Elysia.js](https://elysiajs.com) - Fast and elegant HTTP framework
- [SolidJS](https://www.solidjs.com) - Reactive UI framework
- [xterm.js](https://xtermjs.org) - Terminal emulation
- [Podman](https://podman.io) - Daemonless container engine
- [Cloudflare](https://cloudflare.com) - Tunnel and DNS services
