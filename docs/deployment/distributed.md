# Distributed Chess Platform Infrastructure Guide

## 1. Architectural Overview

The Chess platform utilizes a horizontally scalable multi-instance Fastify architecture coordinated by Redis and backed by TiDB Cloud as the persistent authoritative source of truth.

```
                  +-----------------------------------+
                  |         Load Balancer             |
                  |     (e.g., NGINX / Cloudflare)    |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|   Fastify Instance A  |                       |   Fastify Instance B  |
|  (WebSocket + REST)   |                       |  (WebSocket + REST)   |
+-----------+-----------+                       +-----------+-----------+
            |                                               |
            |       +-------------------------------+       |
            +------>|          Redis 7+             |<------+
            |       |  - Distributed Matchmaking    |       |
            |       |  - Multi-Tab Presence Sets    |       |
            |       |  - Sliding-Window Rate Limits |       |
            |       |  - Distributed Locks          |       |
            |       |  - WebSocket Pub/Sub Bus      |       |
            |       +-------------------------------+       |
            |                                               |
            |       +-------------------------------+       |
            +------>|         TiDB Cloud            |<------+
                    |  - Authoritative Users        |
                    |  - Finished & Active Games    |
                    |  - Plies (game_moves)         |
                    |  - Rating History & Elo       |
                    |  - Audit Events & Fair Play   |
                    +-------------------------------+
```

---

## 2. Separation of Responsibilities

### TiDB Cloud (Sole Authoritative Persistent Source of Truth)
- **Authoritative state**: User accounts, credentials (hashed), ratings, completed games, individual plies (`game_moves`), tournament brackets, audit logs (`game_events`), and fair-play reports.
- **Rule of Authority**: If Redis state conflicts with TiDB Cloud, TiDB Cloud **always wins**. Redis is strictly ephemeral cache and coordination.

### Redis (Ephemeral Coordination & Low-Latency State)
- **Distributed Matchmaking**:
  - Rating/time-control queues: `chess:matchmaking:queue:<ratingType>:<timeControl>`
  - Atomic pair claiming using Lua script (`CLAIM_PAIR_LUA`) to prevent double-matching under high concurrency.
  - Active searcher metadata with auto-expiring TTL (300s).
- **Multi-Tab Presence**:
  - User active socket sets: `chess:presence:user:<userId>`
  - Socket heartbeat keys with 120s TTL: `chess:presence:socket:<socketId>`
  - Playing status keys: `chess:presence:playing:<userId>`
  - Global online set: `chess:presence:users`
- **Distributed Rate Limiting**:
  - Atomic sliding window Lua script (`RATE_LIMIT_LUA`) enforcing 60 requests/minute per authenticated user or IP address.
  - Enforced across all Fastify cluster nodes simultaneously.
- **WebSocket Pub/Sub Event Broker**:
  - Independent subscriber connection (`redis.duplicate()`) per Fastify instance.
  - Channels:
    - Game updates: `chess:pubsub:game:<gameId>`
    - Direct user notifications: `chess:pubsub:user:<userId>`
    - Presence broadcasts: `chess:pubsub:presence`
    - Tournament events: `chess:pubsub:tournament:<tournamentId>`

### Client-Side Engine Isolation
- Offline play (Computer vs Stockfish 18 WASM, Local 2-Player, and Board Analysis) executes **100% offline** directly inside browser WebAssembly/Web Workers with **zero dependency** on Redis, TiDB, or network availability.

---

## 3. Configuration & Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | Integer | `8000` | HTTP and WebSocket port for Fastify |
| `DB_MODE` | String | `mysql` | Set to `memory` for isolated local development/testing |
| `DATABASE_URL` | String | - | MySQL / TiDB Cloud connection string |
| `REDIS_HOST` | String | `127.0.0.1` | Redis server hostname |
| `REDIS_PORT` | Integer | `6379` | Redis server port |
| `REDIS_PASSWORD`| String | - | Redis authentication password |
| `REDIS_TLS` | Boolean | `false` | Enable TLS (`rejectUnauthorized: true`) for Upstash/Redis Cloud |
| `REDIS_REQUIRED`| Boolean| `false` | If `true`, server fails closed if Redis is unreachable |
| `JWT_SECRET` | String | - | Secret key used for signing JWT tokens |

---

## 4. Node Failure & Failover Reconnection

When a Fastify instance experiences an ungraceful crash:
1. **Socket Disconnection**: Connected clients detect socket close and automatically initiate reconnection with exponential backoff.
2. **Reconnection Route**: The load balancer routes the client's reconnection to any remaining healthy Fastify node.
3. **Session Rehydration**:
   - The new node checks its local cache. If absent, it queries `chess:game:meta:<gameId>` in Redis or `games` / `game_moves` in TiDB Cloud.
   - All executed plies are replayed into a fresh `@chess/core` session, restoring exact FEN, clock state, turn, and `stateVersion`.
4. **Zero State Loss**: The client receives a fresh `game:init` event with the synchronized FEN and resumes play seamlessly.

---

## 5. Docker Compose Deployment Example

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: chess-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass "production_secret"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "production_secret", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  server-1:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      - PORT=8001
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=production_secret
      - REDIS_REQUIRED=true
      - DATABASE_URL=mysql://root:password@tidb-host:4000/chess?ssl={"rejectUnauthorized":true}
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "8001:8001"

  server-2:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      - PORT=8002
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=production_secret
      - REDIS_REQUIRED=true
      - DATABASE_URL=mysql://root:password@tidb-host:4000/chess?ssl={"rejectUnauthorized":true}
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "8002:8002"

  load-balancer:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - server-1
      - server-2
```
