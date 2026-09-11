# Production Architecture Specification

## 1. Executive Summary

The Educational Stockfish Online Chess Platform is a horizontally scalable, distributed web application delivering real-time competitive chess, full tournament systems (Swiss & Arena), social infrastructure, fair-play monitoring, and client-side Stockfish 18 WebAssembly (WASM) analysis.

```
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

## 2. Invariant Separation of Responsibilities

### TiDB (Persistent Authoritative Source of Truth)
TiDB Cloud (MySQL 8.0 wire-compatible distributed SQL) is the **sole authoritative persistent datastore**.
- If any discrepancy arises between in-memory cache, Redis, and TiDB, **TiDB always wins**.
- All persistent transactions (rating updates, game completions, tournament pairings, user registrations) commit to TiDB.
- **Durable Relational Domains**:
  1. `users`: Credentials, account roles (PLAYER, TOURNAMENT_ORGANIZER, ARBITER, ADMIN), ban status.
  2. `user_ratings`: Category ratings (bullet, blitz, rapid, classical) with game win/loss/draw statistics.
  3. `rating_history`: Historical ledger of every rating change tied to a game ID.
  4. `games`: Server-authoritative game states, clocks, FEN, PGN, results, and termination reasons.
  5. `game_moves`: Contiguous, indexed ply records with SAN, UCI, timestamps, and fenAfter.
  6. `game_events`: Tamper-evident audit trail (`GAME_CREATED`, `GAME_STARTED`, `MOVE_PLAYED`, `GAME_FINISHED`, etc.).
  7. `tournaments`: Brackets, rules, time controls, scoring parameters, and lifecycle states.
  8. `tournament_entries`: Registered participants, points, tiebreak scores, and seeds.
  9. `tournament_rounds`: Round sequences and metadata.
  10. `tournament_pairings`: Assigned boards, white/black allocations, and associated game IDs.
  11. `friendships`: Social graph relationships and status (PENDING, ACCEPTED, BLOCKED).
  12. `challenges`: Direct user-to-user challenges with color preferences and expirations.
  13. `fair_play_analyses`: Server-evaluated move times, standard deviations, and cheat detection signals.

### Redis 8+ (Ephemeral Coordination & Cache)
Redis is strictly an ephemeral acceleration and coordination layer:
- **Distributed Locking (`withLock`)**: Atomic redlock pattern with TTL safety preventing concurrent move submissions, duplicate tournament registrations, or double game completions.
- **Cross-Node WebSocket Pub/Sub**: Instances publish move, chat, and room events to Redis channels (`chess:game:<id>`, `chess:user:<id>`); peer instances fan out to locally connected WebSocket clients.
- **Matchmaking Queues**: Sorted sets and atomic Lua pairing scripts ensuring players are matched without race conditions across nodes.
- **Sliding-Window Rate Limiting**: Distributed rate limit keys preventing DoS and abuse across all server instances.
- **Presence Tracking**: Ephemeral sets tracking online status with 120s sliding socket heartbeats.
- **Rebuildable Cache**: Game metadata cached with 2-hour TTL; if Redis is flushed completely (`FLUSHALL`), instances seamlessly rebuild metadata from TiDB on demand.

### Stockfish 18 WASM (Browser Independence)
- Compiled WebAssembly binary (`stockfish.wasm` ~7.0 MB) and Web Worker (`stockfish.js` ~10.0 MB).
- Runs 100% inside the player's browser via dedicated background worker thread.
- Zero network dependency on Fastify, Redis, or TiDB.
- Functions seamlessly offline in Computer Play, Local 2-Player, and Engine Analysis modes.

---

## 3. Communication Protocols

| Communication Path | Protocol | Purpose | Authentication |
|---|---|---|---|
| Client ↔ Server | HTTPS (REST) | Auth, Profiles, Tournaments, History | Bearer JWT / HttpOnly Cookie |
| Client ↔ Server | WSS (WebSocket) | Low-latency chess moves, clocks, game chat | Ticket/Bearer Handshake |
| Server ↔ Redis | RESP3 / Redis Protocol | Distributed locks, Pub/Sub, presence | Protected Auth URL |
| Server ↔ TiDB | MySQL Wire Protocol (TLS) | Authoritative transactional queries | TLS 1.3 / User + Password |
| Client ↔ Stockfish | Worker `postMessage` | UCI engine commands & evaluations | In-browser memory bus |
