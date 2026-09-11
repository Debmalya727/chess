# Production Deployment & Configuration Guide

## 1. Clean Checkout & Installation

The Chess platform is built as a monorepo with deterministic dependency resolution. All production builds must be initiated from a clean git checkout without untracked files or manual environment hacks.

### Prerequisites
- **Node.js**: v20.x or v22.x LTS (tested on Node v22.14.0)
- **npm**: v10.x+
- **Redis**: v7.2+ or v8.x
- **TiDB Cloud / MariaDB / MySQL**: v8.0 wire-compatible (TLS enabled in production)

### Deterministic Install
```bash
# Clean install honoring committed package-lock.json
npm ci
```

---

## 2. Production Environment Configuration

Create a secure `.env` file or supply environment variables via container secrets / orchestrator.

### Required Variables
| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enables production security policies & rate limits |
| `PORT` | **Yes** | `8000` | Fastify HTTP/WebSocket listening port |
| `HOST` | No | `0.0.0.0` | Bind host IP |
| `DB_HOST` | **Yes** | `gateway01.us-east-1.prod.tidbcloud.com` | TiDB Cloud Cluster Host |
| `DB_PORT` | No | `4000` | TiDB SQL Port |
| `DB_USER` | **Yes** | `prod_app_user` | TiDB Database Username |
| `DB_PASSWORD` | **Yes** | `[SECURE_SECRET]` | TiDB Database Password |
| `DB_DATABASE` | **Yes** | `chess_prod` | Authoritative Database Name |
| `DB_SSL` | **Yes** | `true` | Enforce TLS connection to database |
| `REDIS_URL` | **Yes** | `rediss://default:[TOKEN]@redis.internal:6379` | TLS Redis cluster connection string |
| `REDIS_REQUIRED` | **Yes** | `true` | In production, server readiness rejects if Redis down |
| `JWT_SECRET` | **Yes** | `[MIN_32_CHAR_CRYPTOGRAPHIC_KEY]` | Secret for signing player tokens |
| `CORS_ORIGIN` | **Yes** | `https://chess.example.com` | Comma-separated allowed frontend origins |

> [!CAUTION]
> In production (`NODE_ENV=production`), `REDIS_REQUIRED` must be set to `true`. Never use default secrets or wildcard CORS (`*`) in production deployments.

---

## 3. Production Build Process

Build all shared packages, frontend assets, and engine loaders:

```bash
# Clean production build
npm run build
```

Expected output:
- `apps/web/client/dist/` contains production HTML, bundled CSS/JS, and `/engine/` directory with `stockfish.js` and `stockfish.wasm`.
- Build completes with zero lint errors and zero build failures.

---

## 4. Production Service Startup

Launch instances behind your reverse proxy / load balancer:

```bash
# Start Fastify backend instance
NODE_ENV=production node apps/server/src/index.js
```

### Multi-Instance Cluster Example
- **Instance A**: `PORT=8001 HOST=127.0.0.1 NODE_ENV=production node apps/server/src/index.js`
- **Instance B**: `PORT=8002 HOST=127.0.0.1 NODE_ENV=production node apps/server/src/index.js`

---

## 5. Reverse Proxy & TLS Boundary

```
[Browser Client]
       │
       │ HTTPS / WSS (TLS 1.3 - Public Cert e.g., Let's Encrypt / Cloudflare)
       ▼
[Reverse Proxy / NGINX / Caddy]
       │
       │ HTTP / WS (Internal VPC / Private Network)
       ▼
[Fastify Instances A & B]
       │
       ├─► [Redis 8+ via TLS/mTLS] (Internal / Protected)
       └─► [TiDB Cloud via TLS 1.3] (Authoritative DB)
```

### Example NGINX Location Block
```nginx
upstream chess_backend {
    ip_hash; # Sticky sessions optional but beneficial for WebSocket locality
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
}

server {
    listen 443 ssl http2;
    server_name chess.example.com;

    ssl_certificate /etc/letsencrypt/live/chess.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chess.example.com/privkey.pem;

    # Static Web Client
    location / {
        root /var/www/chess/apps/web/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # Stockfish WASM Assets (Enable Gzip / WASM Mime)
    location /engine/ {
        root /var/www/chess/apps/web/client/dist;
        types {
            application/wasm wasm;
            application/javascript js;
        }
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # REST API & WebSocket Server
    location ~ ^/(api|health|readiness|ws) {
        proxy_pass http://chess_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Health and Readiness Semantics

The platform provides dedicated, standards-compliant observability endpoints:

### Liveness: `GET /health`
- **Purpose**: Process liveness probe. Indicates if the Node.js event loop is responsive.
- **HTTP 200**: Service process is healthy and answering HTTP requests.

### Readiness: `GET /readiness`
- **Purpose**: Traffic routing probe. Indicates if backend dependencies are available.
- **HTTP 200**:
  - TiDB connection pool responsive (`SELECT 1` succeeds).
  - Redis responsive (`PING` returns `PONG`).
- **HTTP 503**:
  - TiDB connection failed, or
  - Redis disconnected (when `REDIS_REQUIRED=true`).
  - Orchestrators/load balancers stop forwarding ingress traffic until dependencies recover.

---

## 7. Complete Production Environment Variable Inventory

| Variable | Required? | Scope | Secret? | Vercel Environment | Description |
|---|---|---|---|---|---|
| `NODE_ENV` | Optional | Backend | No | Production, Preview, Development | Runtime mode (`production` enables security headers, strict error masking) |
| `PORT` | Optional | Backend | No | Production, Preview, Development | Fastify server port (default `8000`) |
| `HOST` | Optional | Backend | No | Production, Preview, Development | Fastify server host (default `0.0.0.0`) |
| `JWT_SECRET` | **Yes** | Backend | **Yes** | Production, Preview, Development | Cryptographic key for signing user authentication tokens |
| `DB_HOST` | **Yes** | Backend | No | Production, Preview, Development | TiDB Cloud / MySQL database host |
| `DB_PORT` | Optional | Backend | No | Production, Preview, Development | TiDB / MySQL port (default `3306`, TiDB Cloud default `4000`) |
| `DB_USER` | **Yes** | Backend | No | Production, Preview, Development | Database user |
| `DB_PASSWORD` | **Yes** | Backend | **Yes** | Production, Preview, Development | Database user password |
| `DB_NAME` | Optional | Backend | No | Production, Preview, Development | Database name (default `chess_platform`) |
| `DB_SSL` | Optional | Backend | No | Production, Preview, Development | Enforce TLS connection (`true` for TiDB Cloud) |
| `DB_SSL_CA` | Optional | Backend | **Yes** | Production, Preview, Development | Optional CA certificate for custom TLS verification |
| `DB_MODE` | Optional | Backend | No | Preview, Development | Fallback switch: `memory` for isolated tests |
| `REDIS_URL` | Optional | Backend | **Yes** | Production, Preview, Development | Connection string for Upstash / Redis Cloud (`rediss://...`) |
| `REDIS_HOST` | Optional | Backend | No | Production, Preview, Development | Standalone Redis host (default `127.0.0.1`) |
| `REDIS_PORT` | Optional | Backend | No | Production, Preview, Development | Standalone Redis port (default `6379`) |
| `REDIS_USERNAME`| Optional | Backend | No | Production, Preview, Development | Redis ACL username |
| `REDIS_PASSWORD`| Optional | Backend | **Yes** | Production, Preview, Development | Redis password / token |
| `REDIS_TLS` | Optional | Backend | No | Production, Preview, Development | Enforce TLS on standalone connection |
| `REDIS_REQUIRED`| **Yes** | Backend | No | Production | In production, server reports `not_ready` (503) if Redis is down |
| `REDIS_CONNECT_TIMEOUT` | Optional | Backend | No | Production, Preview, Development | Connection timeout in ms (default `5000`) |
| `CORS_ORIGIN` | **Yes** | Backend | No | Production, Preview | Allowed origin(s) e.g. `https://client-*.vercel.app` |
| `RATING_INITIAL`| Optional | Backend | No | Production, Preview, Development | Initial player rating (default `1500`) |
| `RATING_K_FACTOR`| Optional| Backend | No | Production, Preview, Development | Elo K-factor (default `32`) |
| `VITE_API_URL` | Optional | Frontend | No | Production, Preview | Backend API base URL (`https://.../api`) |
| `VITE_WS_URL` | Optional | Frontend | No | Production, Preview | Backend WebSocket URL (`wss://.../ws`) |

> [!CAUTION]
> **Zero Secret Leakage Audit**: None of `DB_PASSWORD`, `REDIS_URL`, `REDIS_PASSWORD`, or `JWT_SECRET` are ever prefixed with `VITE_` or included in frontend client bundles. Frontend Vite variables are strictly restricted to public URLs.

---

## 8. Vercel Preview Deployments

### Project 1: Chess Web (`apps/web/client`)
- **Live Preview URL**: `https://client-4a6237sgk-debmalya-pandas-projects.vercel.app`
- **Build Status**: 100% Clean build (Vite 4.5.14).
- **Static Assets**: Stockfish 18 WASM (`/engine/stockfish.js` [10.5 MB] and `/engine/stockfish.wasm` [7.3 MB]) served directly with HTTP 200 and immutable caching.
- **Routing**: Client SPA fallback (`/(.*)` -> `/index.html`) fully verified.
- **Offline Independence**: 100% offline verification confirmed: Computer Mode, Local 2-Player, and Engine Analysis operate with 0 backend network calls.

### Project 2: Chess API (`apps/server`)
- **Live Preview URL**: `https://server-qp9z1e482-debmalya-pandas-projects.vercel.app`
- **Aliased URL**: `https://server-mauve-kappa-32.vercel.app`
- **Runtime**: Fastify 4.29.1 on Node.js 22.x (Vercel Serverless Functions with Fluid Compute).
- **REST Status**:
  - `GET /health` -> 200 OK
  - `GET /api/health` -> 200 OK
  - `GET /readiness` -> 200 OK
  - `POST /api/auth/register` -> 201 Created (generates valid JWT)
  - `GET /api/auth/me` -> 200 OK (authenticates with Bearer token)

---

## 9. Vercel Limitations Audit & WebSocket Incompatibility Report

| Capability | Vercel Platform Behavior | Application Requirement | Status | Verification Evidence |
|---|---|---|---|---|
| **Fastify REST** | Serverless function invokes Fastify via request event dispatch | Stateless REST routing | **PASS** | `GET /health` returned 200 OK, `POST /auth/register` returned 201 Created |
| **Stockfish WASM** | Served as static assets via Vercel Edge CDN | Browser-side engine execution | **PASS** | Assets loaded via HTTP 200, 0 backend dependency |
| **Fastify WebSocket** | Vercel serverless environment does not forward Node `http.Server` raw duplex upgrade stream to `@fastify/websocket` | Long-lived WebSocket connection on `/ws` | **VERCEL WEBSOCKET COMPATIBILITY BLOCKER** | Connection to `wss://server-qp9z1e482-debmalya-pandas-projects.vercel.app/ws` returned `404 Not Found` |
| **Game Longevity** | Function duration is capped by platform limits (15s–60s on Hobby; 300s/900s on Pro) | 10+0 and 30-minute games | **FAIL** | Long games severed by serverless execution timeouts |
| **Background Timers** | Invocation frozen when idle; event loop paused | Continuous 1-second clock ticks & timeouts | **FAIL** | Serverless instances cannot maintain background `setInterval` |
| **Persistent Pub/Sub**| Ephemeral instances cannot maintain standing listener connections | Cross-instance event distribution | **FAIL** | Subscriber sockets closed when container scales down |

### Verdict on Pure Vercel Deployment
```text
VERCEL WEBSOCKET COMPATIBILITY BLOCKER
```
The Educational Stockfish Online Chess Platform **cannot run its full real-time multiplayer engine exclusively on Vercel Serverless Functions** without compromising its server-authoritative clock ticking, WebSocket connection durability, and Redis Pub/Sub architecture.

---

## 10. Recommended Production Topology

To preserve all certified platform invariants while leveraging Vercel's global CDN:

```text
┌─────────────────────────────────────────────────────────────┐
│                         VERCEL CDN                          │
│                                                             │
│  Chess Web (React + Vite + Stockfish 18 WASM)               │
│  - 0 backend calls for Computer, Local 2P, & Analysis       │
│  - Static asset edge delivery with immutable caching        │
└──────────────────────────────┬──────────────────────────────┘
                               │
            HTTPS / WSS        │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               CONTAINER / PAAS BACKEND                      │
│        (Render, Fly.io, Railway, or AWS ECS/Fargate)        │
│                                                             │
│  Chess API (Persistent Fastify Server)                      │
│  - Full Fastify WebSocket support (GET /ws)                 │
│  - Persistent 1-second clock tick intervals                 │
│  - Authoritative game validation & ratings                  │
│  - Redis Pub/Sub listener loops                             │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
        ┌───────────────┐             ┌───────────────┐
        │  TiDB Cloud   │             │  Redis Cloud  │
        │  AUTHORITATIVE│             │   EPHEMERAL   │
        └───────────────┘             └───────────────┘
```
