# Phase 9: Security Architecture, Abuse Prevention & Production Hardening

## 1. Executive Summary

This document details the security architecture, threat models, defensive controls, and operational guardrails for the **Educational Stockfish Online Chess Platform**.

Phase 9 establishes defense-in-depth protections across all layers of the platform, enforcing the core architectural invariant:
* **TiDB / Persistent MySQL**: The sole authoritative source of truth for accounts, games, moves, tournaments, ratings, and audit events.
* **Redis 8+**: Ephemeral coordination, distributed locks, sliding-window rate limiting, WebSocket pub/sub, presence tracking, and rebuildable caches.
* **Completely Independent Offline Engine**: Stockfish 18 WASM, Computer Mode, Local 2-Player, and offline analysis execute entirely in the client browser with zero network or backend dependencies.

---

## 2. Threat Model

| Threat Actor | Vector | Potential Impact | Mitigations |
| :--- | :--- | :--- | :--- |
| **Anonymous Attacker** | Login brute force, registration spam, endpoint enumeration, oversized payloads, WebSocket frame flooding | Denial of service, account takeover, resource exhaustion | Distributed sliding-window rate limits (auth: 20/min), strict 64 KB request body limit, 64 KB WebSocket frame cap, unauthenticated connection 60s idle timeout, account enumeration-resistant error responses (`INVALID_CREDENTIALS`). |
| **Authenticated Attacker** | IDOR/BOLA attacks on games/challenges, unauthorized tournament actions, turn spoofing, rating falsification | Tampering with other players' games, stealing private data, fraudulent Elo gains | Object-level authorization checks on all mutating routes, server-authoritative chess engine (`@chess/core`) validating turn/legality, atomic database transactions for ratings, unrated tournament game isolation. |
| **Malicious Organizer** | Arbitrary score inflation, unauthorized tournament starts, round tampering | Compromised tournament integrity | Server-authoritative Swiss/Arena pairing algorithms, strict RBAC middleware requiring `TOURNAMENT_ORGANIZER` or `ADMIN`, tiebreak and standings calculated directly from authoritative game records. |
| **Compromised Client** | Forged WebSocket events, altered client-side state, fabricated timestamps/FEN | Desynchronization, client-side cheating | The server never trusts client-reported FEN, clocks, turn, or results. All state transitions advance monotonically via server-incremented `stateVersion`. |

---

## 3. Authentication & Password Security

1. **Password Hashing**:
   * Stored passwords are never plaintext.
   * Node.js native `crypto.scrypt` with a cryptographically secure 16-byte random salt and 64-byte derived key.
   * Verification utilizes constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
2. **Account Enumeration Defense**:
   * Login endpoints return a uniform `401 INVALID_CREDENTIALS` error regardless of whether the email/username exists or the password was incorrect.
   * Response latency differences between existing and non-existing accounts are neutralized through dummy hash evaluations.
3. **Session & Token Management**:
   * JSON Web Tokens (JWT) signed with HMAC-SHA256 (`HS256`) and enforced expiration.
   * Tokens must be presented via `Authorization: Bearer <token>` or WebSocket `auth:token` handshake.
   * Expired, altered, or unsigned tokens are strictly rejected with `401 UNAUTHORIZED`.

---

## 4. Authorization & RBAC Hardening

* **Authoritative Server Enforcement**:
  User roles (`PLAYER`, `TOURNAMENT_ORGANIZER`, `ADMIN`) are stored authoritatively in the database. Token claims are cross-validated on sensitive operations.
* **Role Guards**:
  Routes under `/api/admin/*` and organizer tournament controls (`/api/tournaments/:id/start`, `/api/tournaments/:id/pair`, `/api/tournaments/:id/finish`, `/api/tournaments/:id/cancel`) require explicit role authorization via `requireRole(...)`. Unauthorized requests yield `403 FORBIDDEN`.
* **Object-Level Authorization (BOLA/IDOR)**:
  * Challenges: Only the recipient can accept or decline; only the creator can cancel. Third parties receive `403 UNAUTHORIZED`.
  * Games: Only assigned players (`whitePlayerId`, `blackPlayerId`) can resign or offer/respond to draws.
  * Audit Events: Only players in the game or users with `ADMIN` role can inspect raw audit event logs.

---

## 5. Input Validation & SQL / Injection Defense

1. **SQL Parameterization**:
   * All database queries in `apps/server/src/db/*` use parameterized SQL placeholders (`?`).
   * No query string concatenation or template literal interpolation of user input exists in SQL statements.
   * Dynamic column names in `UPDATE` queries are restricted to hardcoded string literal allowlists.
2. **Pagination Guardrails**:
   * List endpoints (`/api/tournaments`, `/api/leaderboards/:ratingType`, `/api/games/history`) clamp `limit` to maximum 100 items.
   * Non-integer, negative, or `NaN` parameters are rejected with `400 INVALID_INPUT` or normalized safely.
3. **Type Confusion Defense**:
   * Authentication and challenge endpoints explicitly verify that credentials and usernames are strings (`typeof val === 'string'`), preventing object-injection crashes.

---

## 6. Rate Limiting Architecture

* **Distributed Coordination**:
  Implemented via `apps/server/src/middleware/rateLimitMiddleware.js` using Redis sorted sets (sliding-window log) keyed by `chess:rate:<scope>:<identifier>`.
* **Graceful Fallback**:
  If Redis is unavailable in development or test modes (`REDIS_REQUIRED=false`), an in-memory sliding window provides localized protection. In production (`REDIS_REQUIRED=true`), failures fail closed.
* **Configured Thresholds**:
  * `auth:login`: 20 requests / minute per IP or identifier.
  * `auth:register`: 15 requests / minute per IP.
  * `matchmaking:join`: 30 requests / minute per user.
  * `challenges:create`: 25 requests / minute per user.
  * WebSocket messages: 10 messages / second per connection or authenticated user.
* Exceeding quotas returns `429 RATE_LIMIT_EXCEEDED` accompanied by standard `Retry-After` headers.

---

## 7. WebSocket Security & Framing

1. **Frame Size Caps**:
   * Fastify WebSocket server enforces a strict `maxPayload: 64 * 1024` (64 KB).
   * Messages exceeding this boundary are rejected at the TCP/protocol framing layer without parsing.
2. **Unauthenticated Connection Timeout**:
   * Unauthenticated sockets that fail to complete `auth:token` authentication within 60 seconds are terminated with code `4401`.
3. **Message Routing & Schema Validation**:
   * Raw messages undergo length checks before `JSON.parse`.
   * Unparseable frames yield `INVALID_JSON`.
   * Unsupported events yield `UNKNOWN_EVENT`.
   * Moves submitted on unauthenticated connections yield `UNAUTHORIZED`.
4. **Connection Cleanup & Presence**:
   * Disconnected sockets automatically unsubscribe from tournament Pub/Sub channels and broadcast presence updates.

---

## 8. Game & Rating Integrity

* **Authoritative Engine**:
  The backend maintains `@chess/core` engine state in `ActiveGameSession`. All moves (`move:submit`) must be validated for legal turn, legal square transitions, and valid promotion pieces.
* **Concurrency & Turn Guards**:
  Moves require a distributed lock (`chess:game:lock:<gameId>`). A move is rejected if:
  * The user is not in the game (`NOT_YOUR_TURN`).
  * It is not the user's turn (`NOT_YOUR_TURN`).
  * The move is illegal (`INVALID_MOVE`).
  * The game has already ended (`GAME_FINISHED`).
  * The client's `expectedStateVersion` is lower than the server's `stateVersion` (`STALE_STATE`).
* **Move Idempotency**:
  Duplicate client submissions with identical `clientMoveId` return the cached move result with `isDuplicate: true` without double-advancing the state version or clock.
* **Rating Isolation**:
  * Tournament games are flagged `rated: false`. Rating adjustments are completely bypassed upon game conclusion.
  * Rated game completions calculate Elo atomically inside a database transaction with `SELECT ... FOR UPDATE` status checks to prevent double-updates.

---

## 9. Secret Exposure & Information Leakage

1. **Profile Privacy**:
   * `GET /api/users/me` strips `passwordHash`, `password`, and `salt`.
   * `GET /api/users/:username` exposes only public data (username, statistics, ratings, recent public games). Email addresses and internal roles are suppressed.
2. **Error Masking**:
   * Fastify global error handler intercepts all HTTP 500 errors.
   * Internal database connection strings, database hosts, SQL syntax messages, and stack traces are logged server-side but masked from HTTP responses with a uniform `{ error: 'INTERNAL_SERVER_ERROR' }` payload.
3. **Frontend Bundle Hygiene**:
   * Web client Vite configuration strictly isolates browser environment variables (`VITE_*`). Backend credentials (`DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`) are never included in frontend builds.

---

## 10. Security Headers & CORS

Every HTTP response includes hardened security headers configured via `apps/server/src/middleware/securityHeaders.js`:
* `X-Content-Type-Options: nosniff`
* `X-Frame-Options: SAMEORIGIN`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `Permissions-Policy: camera=(), microphone=(), geolocation=()`
* `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; ...` (calibrated to allow Stockfish WASM multithreaded web workers while blocking unauthorized scripts).
* `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enabled in production HTTPS environments).

---

## 11. Incident Response Runbooks

### Incident A: Redis Outage / Restart
1. **Symptoms**: Readiness probe `/api/readiness` returns `503` (when `REDIS_REQUIRED=true`).
2. **Impact**: Matchmaking and rate-limiting coordination pause. Active in-memory games continue; database records remain safe.
3. **Action**:
   * Restart Redis service (`redis-server`).
   * Fastify instances auto-reconnect via `ioredis` exponential retry strategy.
   * Verify `/api/readiness` returns `200 status: 'ready'`.

### Incident B: TiDB / MySQL Connectivity Failure
1. **Symptoms**: Database write operations error; `/api/readiness` returns `503`.
2. **Impact**: Game finalization and user registration queue. Active moves continue in ephemeral memory.
3. **Action**:
   * Check connection pool health and TiDB cluster status.
   * Verify network routing between Fastify nodes and TiDB port 4000.
   * Once connectivity resumes, pool auto-recovers.

### Incident C: Credential Compromise / Account Abuse
1. **Symptoms**: Spikes in 429 errors from single IP addresses; suspicious rating changes.
2. **Action**:
   * Revoke existing user tokens by updating user's security stamp or password.
   * IP-based rate limiting immediately suppresses automated brute-force scripts.
   * Audit events table (`game_events`) provides immutable forensic trail of all game plies, resignations, and draw requests.

---

## 12. Known Limitations & Upstream Vulnerabilities

1. **Fastify v4 Upstream Dependency Audit (Moderate)**:
   * `npm audit` reports moderate advisory warnings in `fastify <= 5.12.0` regarding `find-my-way` deep parameter parsing and `Content-Type` header DoS.
   * **Mitigation**: Upgrading to Fastify v5 is a major breaking change for `@fastify/websocket` v8 and plugin ecosystems. The vulnerability is fully mitigated at the application layer by:
     * Enforcing `bodyLimit: 64 * 1024` (64 KB) on all requests.
     * Enforcing explicit route parameter validation with strict allowlists.
     * Disabling HTTP/2.
   * **Severity**: LOW (Mitigated).
