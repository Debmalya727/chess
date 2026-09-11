<div align="center">

# ♟️ Educational Stockfish Online Chess Platform

**High-Throughput Distributed Online Chess Platform with Server-Authoritative Logic, TiDB Cloud Persistence, Redis 8+ Ephemeral Coordination, and Stockfish 18 WASM Offline Analysis**

[![Core Platform Production Certified](https://img.shields.io/badge/Status-CORE%20PLATFORM%20PRODUCTION%20CERTIFIED-success?style=for-the-badge&logo=checkmarx)](docs/architecture.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B%20%7C%2022%2B-green.svg)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.28-black.svg)](https://fastify.dev/)
[![TiDB](https://img.shields.io/badge/Database-TiDB%20Cloud-blue.svg)](https://tidbcloud.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis%208+-red.svg)](https://redis.io/)
[![Stockfish 18 WASM](https://img.shields.io/badge/Stockfish-18%20WASM-orange.svg)](https://stockfishchess.org/)

[Architecture](docs/architecture.md) • [Deployment](docs/deployment.md) • [Disaster Recovery](docs/disaster-recovery.md) • [Operations](docs/operations.md) • [Security](docs/security.md)

---

</div>

> [!NOTE]
> **Core Roadmap Status**: This platform has successfully completed all 10 engineering phases (Phases 1 through 10) and is officially **CORE PLATFORM PRODUCTION CERTIFIED**. It provides server-authoritative multiplayer chess, distributed matchmaking, competitive Swiss and Arena tournaments, social graph, durable audit logs, fair-play monitoring, and zero-dependency offline browser Stockfish 18 WASM analysis.

---

## 🏗️ Production Architecture

```text
                         Internet
                            │
                            ▼
                    Reverse Proxy /
                    Load Balancer (TLS Termination)
                            │
                ┌───────────┴───────────┐
                │                       │
         Fastify Node A          Fastify Node B
         (REST + WSS)            (REST + WSS)
                │                       │
                └───────────┬───────────┘
                            │
                         Redis 8+
         ┌──────────────────┴──────────────────┐
         │ Ephemeral Distributed Coordination  │
         │ - Distributed Locks (withLock)      │
         │ - Cross-Node Pub/Sub Broadcasts     │
         │ - Sliding-Window Rate Limits        │
         │ - Heartbeat Presence & Matchmaking  │
         │ - Rebuildable Metadata Cache        │
         └──────────────────┬──────────────────┘
                            │
                       TiDB Cloud
         ┌──────────────────┴──────────────────┐
         │ AUTHORITATIVE PERSISTENT SOURCE      │
         │ OF TRUTH                            │
         │ - Users & Password Hashes           │
         │ - Ratings & Rating History          │
         │ - Games, Plies & PGNs               │
         │ - Tournaments, Rounds & Pairings    │
         │ - Social Friendships & Challenges   │
         │ - Durable Audit Events & Fair Play  │
         └─────────────────────────────────────┘

         Browser Client (Independent)
         ┌─────────────────────────────────────┐
         │ Stockfish 18 WASM Engine            │
         │ - 100% Client-Side Web Worker       │
         │ - Zero Backend Network Dependency   │
         │ - Local 2P, Computer Mode, Analysis │
         └─────────────────────────────────────┘
```

---

## 📚 Technical Documentation Directory

- **[System Architecture](docs/architecture.md)**: Detailed breakdown of the multi-instance architecture, TiDB relational domains, Redis coordination, and offline WASM engine.
- **[Deployment & Configuration](docs/deployment.md)**: Reproducible build process, environment variables reference, reverse proxy/TLS boundary, and health/readiness probe contracts.
- **[Disaster Recovery & Backups](docs/disaster-recovery.md)**: TiDB point-in-time recovery (PITR), Redis total-loss drills, failover mechanics, and data integrity verification.
- **[Operations & Runbook](docs/operations.md)**: Fast incident response runbooks, zero-downtime rolling restart sequences, secret rotation protocols, and rollback procedures.
- **[Security & Hardening](docs/security.md)**: Complete security architecture covering BOLA, SQL injection protection, timing attack mitigation, CSP/security headers, and error sanitization.

---

## 🌟 Key Platform Features

- ⚡ **Horizontal Fastify Multi-Instance Backend**: Stateless Fastify cluster with WebSocket connection multiplexing and distributed event fanout.
- ♟️ **Server-Authoritative Chess Logic**: Server-validated moves, authoritative clocks, anti-premove validation, and monotonic ply ordering.
- 🏆 **Comprehensive Tournaments**: Real-time Arena (berserk, streak scoring, dynamic pairing) and FIDE-standard Swiss tournaments (Buchholz tiebreaks, color balancing, odd-player byes).
- 🤝 **Social & Fair Play System**: Friendships, direct challenges, blocklists, multi-tab presence, and server-side move-time standard deviation cheat detection.
- 🤖 **Stockfish 18 WebAssembly Engine**: 100% client-side engine evaluation, multi-PV analysis, and computer play with zero backend calls.
- 🛡️ **Enterprise Production Hardening**: Strict rate limiting, resource quotas (64KB payload limits), sanitized error responses, and durable audit logs.

---

## 🚀 Quickstart & Reproduction

### Prerequisites
- Node.js v20+ or v22+
- Redis 7.2+ or 8+
- TiDB Cloud, MySQL 8.0+, or MariaDB (in-memory mode available via `DB_MODE=memory`)
- **Stockfish Engine** *(Optional)*: Recommended for full performance. Auto-detected via `STOCKFISH_PATH` or system `PATH`.

### Clean Build & Verification
```bash
# 1. Clean reproducible installation
npm ci

# 2. Production build
npm run build

# 3. Execute complete regression and smoke suite
node tests/e2e/phase10-release-smoke.e2e.cjs
```

### Provider-Agnostic Production Startup

On any server or cloud hosting platform (Render, Railway, Fly.io, Heroku, VPS, Replit):

```bash
# 1. Install dependencies & auto-build static frontend
npm install

# 2. Start native Fastify server
npm start
```
The server reads dynamic environment variables (`PORT` and `HOST`) and serves both the REST API and the React web application on **`http://localhost:8000`** (or your platform's assigned `$PORT`).

---

## 🛠️ Local Development

Run server and client concurrently in development mode:

```bash
# Terminal 1: Fastify Backend
npm run dev:server

# Terminal 2: React + Vite Frontend
npm run dev:client
```
Open **`http://localhost:3000`** in your browser.

---

## 🐳 Docker Deployment (Optional)

Docker is provided strictly as an optional deployment convenience.

```bash
# Using Docker Compose
docker-compose up --build -d

# Or manual Docker command
docker build -t educational-stockfish-chess .
docker run --rm -p 8000:8000 -e PORT=8000 educational-stockfish-chess
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8000

# Stockfish Executable Path (Optional - Auto-detected if in system PATH)
STOCKFISH_PATH=/usr/games/stockfish

# Engine Settings
STOCKFISH_THREADS=2
STOCKFISH_HASH=128
ENGINE_TIME_LIMIT=3000
ENGINE_MAX_DEPTH=22
MULTI_PV=3
MAX_CONCURRENT_ANALYSIS=4

# Security
CORS_ORIGIN=*
```

---

## 📡 API & WebSocket Documentation

### REST Endpoints

#### `GET /api/health`
Response:
```json
{
  "status": "ok",
  "engine": "stockfish",
  "stockfishAvailable": true
}
```

#### `GET /api/engine`
Response:
```json
{
  "name": "Stockfish 16+ UCI Engine",
  "engine": "stockfish",
  "stockfishAvailable": true,
  "threads": 2,
  "hash": 128,
  "multiPv": 3,
  "maxDepth": 22,
  "timeLimitMs": 3000
}
```

#### `POST /api/analyze`
Request Body:
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "depth": 20,
  "multipv": 3
}
```

---

### WebSocket Protocol (`/ws/analysis`)

**Client ➔ Server (Start Analysis):**
```json
{
  "action": "start",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 20,
  "multipv": 3
}
```

**Server ➔ Client (Streaming Analysis Update):**
```json
{
  "type": "analysis:update",
  "engine": "stockfish",
  "engineAvailable": true,
  "lines": [
    {
      "multipv": 1,
      "depth": 18,
      "score": { "type": "cp", "value": 42 },
      "mate": null,
      "bestMove": "e2e4",
      "pv": ["e2e4", "e7e5", "g1f3", "b8c6"]
    }
  ]
}
```

---

## 🎓 Educational Computer Science Concepts

This project serves as a practical implementation for learning core software engineering concepts:

- **IPC Process Management**: Asynchronous stdin/stdout communication with native subprocesses.
- **UCI Protocol Parsing**: Parsing structured stream output lines (`info depth ... multipv ... score ...`).
- **Real-Time WebSockets**: Streaming asynchronous server events directly to React components.
- **Game Tree Search**: Minimax algorithm, Alpha-Beta pruning, Piece-Square Tables (PST), and evaluation functions.

---

## 🖥️ Desktop Pygame Application

The original Python Pygame application remains available as an optional offline desktop component:

```bash
cd apps/desktop
python -m venv .venv
# Activate virtual environment
pip install python-chess pygame python-dotenv
python main.py
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
