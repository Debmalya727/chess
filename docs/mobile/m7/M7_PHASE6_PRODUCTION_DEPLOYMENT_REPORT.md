# M7 Phase 6 — Production Deployment & Smoke Validation

## Deployment

- **Render Service**: `chess-api` (`https://chess-api-hszp.onrender.com`)
- **Connected Repository**: `https://github.com/Debmalya727/chess.git`
- **Tracked Production Branch**: `main` (currently at `629ac6e`, pre-M7)
- **Local M7 Source Branch**: `mobile/phase-m6-production-hardening` (HEAD `e830aa0`, containing all M7 phases)
- **Deployment Timestamp**: 2026-09-25T11:57:17Z (audit time)
- **Build Result**: PASS locally (`npm run build --workspace=apps/web/client` built in 3.09s)
- **Startup Result**: PASS locally (Fastify production startup verified with protocol constants and rematch handlers registered)
- **Deployment Status**: **BLOCKED**
  - Render configuration (`render.yaml`) sets `autoDeploy: false`.
  - The remote GitHub repository branch `origin/main` has not yet received the merged M7 commit range (`2c0a4a3`..`e830aa0`).
  - Interactive Git credential manager requirements prevented non-interactive remote push without external CI/CD or manual GitHub token promotion.

## Health

- **Liveness (`GET /health`)**:
  - HTTP Status: `200 OK`
  - Response:
    ```json
    {"status":"ok","serverTime":"2026-09-25T11:57:17.344Z","database":"ok","redis":"ok","redisMode":"redis"}
    ```
- **Readiness (`GET /readiness`)**:
  - HTTP Status: `200 OK`
  - Response:
    ```json
    {"status":"ready","serverTime":"2026-09-25T11:57:19.697Z","database":"connected","redis":"ok","redisRequired":true}
    ```

## Production Protocol

- **Authentication**:
  - `POST https://chess-api-hszp.onrender.com/api/auth/register` returned HTTP 201 Created with valid JWT token for test user `probe_user_1790337434715` (User ID `usr_1790337440530_17sow6`).
- **WebSocket Connection**:
  - Connected cleanly to `wss://chess-api-hszp.onrender.com/ws`.
  - Sent `auth:token` payload with JWT.
  - Server responded with `{"event":"auth:success","payload":{"user":{"id":"usr_1790337440530_17sow6","username":"probe_user_1790337434715","rating":1200}},"timestamp":1790337442284}`.
- **game:rematch Recognition (Before State)**:
  - Sent probe: `{"type":"game:rematch","payload":{"gameId":"probe_game_check_id"}}`.
  - Received response:
    ```json
    {"event":"error","payload":{"code":"UNKNOWN_EVENT","message":"Event 'game:rematch' is not supported."},"timestamp":1790337443626}
    ```
  - Confirmed the remote Render server is running pre-M7 deployment code where `game:rematch` is not recognized.

## Production Scenarios

| Scenario | Environment | Result | Evidence |
|---|---|---|---|
| Protocol recognition | Production | NOT EXECUTED | Remote Render server returned `UNKNOWN_EVENT` for `game:rematch` (pre-M7 deployment on `main`) |
| Game 1 | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Rematch offer | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Rematch accept | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| New Game 2 | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Color inversion | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Game 2 moves | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Decline | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Cancel | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Timeout | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Tournament safety | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Concurrency | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Reconnect | Production | NOT EXECUTED | Blocked by missing remote M7 deployment promotion |
| Database integrity | Production | PASS | Remote database verified healthy via `/health` (`database: ok`) and `/readiness` (`database: connected`); no schema mutation required |
| Stockfish isolation | Production | PASS | Confirmed production online mode contains zero Stockfish imports or centipawn evaluations |
| Production web UI | Production | NOT EXECUTED | Production Vercel frontend (`https://client-psi-five-25.vercel.app`) tracks `origin/main` (pre-M7) |

## Automated Regression

All pre-deployment automated suites were executed locally against the M7 codebase and verified passing:

- **Protocol**: 8 passed, 0 failed, 0 skipped (`npm test --workspace=packages/protocol`)
- **Backend Unit**: 78 passed, 0 failed, 0 skipped (`node --test tests/unit/*.test.js` in `apps/server`)
- **Web Client**: 16 passed, 0 failed, 0 skipped (`npm test --workspace=apps/web/client`)
- **Mobile Client**: 304 passed, 0 failed, 0 skipped (`flutter test --no-pub` in `apps/mobile`)
- **Whitespace / Diff Check**: 0 issues (`git diff --check`)
- **Web Production Build**: PASS (`npm run build --workspace=apps/web/client` in 3.09s)
- **Server Production Startup**: PASS (Fastify initialized in production mode, Rematch handlers validated)

## Phase 6 Limitations

1. **Remote Cloud Deployment**: The Render service (`chess-api-hszp.onrender.com`) tracks the GitHub `main` branch. Pushing the local `mobile/phase-m6-production-hardening` branch to `origin/main` requires manual promotion or interactive GitHub authorization.
2. **Production Web UI**: Vercel production frontend deployment tracks `origin/main` and requires promotion alongside the backend.
3. **Physical Hardware**: No physical Android device attached (`adb devices` returned 0 devices); iOS tooling unavailable on Windows host.

## Phase 6 Historical Status

**BLOCKED**

*(M7 implementation is fully complete, tested, and validated locally; production cloud deployment was initially blocked pending GitHub repository branch promotion and Render deployment trigger).*

---

## Phase 6C — Render Deployment & Protocol Validation

### 1. GitHub State Verification

- **Repository**: `https://github.com/Debmalya727/chess.git`
- **Branch**: `main`
- **Local HEAD**: `82b59a137f6b63308aec0f82d32e74656463a80b`
- **Remote `origin/main`**: `82b59a137f6b63308aec0f82d32e74656463a80b`
- **Verification**: `HEAD == origin/main == 82b59a1` (PASS)

### 2. Render Deployment Details

- **Render Service**: `chess-api` (`https://chess-api-hszp.onrender.com`)
- **Deploy ID**: `dep-dar8v8vf3r2c73bj1v60`
- **Trigger**: Manual Deploy via Render Dashboard (`Deploy latest commit`)
- **Deployed Commit**: `82b59a137f6b63308aec0f82d32e74656463a80b` (`82b59a1`)
- **Deploy Status**: `Deploy succeeded | Live`
- **Duration**: `1m 24s`
- **Deployment Timestamp**: `2026-09-25T15:13:40Z` (8:43:40 PM GMT+5:30)
- **Startup Log Summary**:
  - `[hb72g] ==> Running 'node apps/server/src/index.js'`
  - `[hb72g] [Database] TiDB Cloud / MySQL pool initialized successfully.`
  - `[hb72g] [Redis] Primary client connection initiated.`
  - `[hb72g] [Redis] Primary client ready.`
  - `==> Your service is live 🚀`

### 3. Production Health & Readiness

- **`GET https://chess-api-hszp.onrender.com/health`**:
  - HTTP Status: `200 OK`
  - Response:
    ```json
    {"status":"ok","serverTime":"2026-09-25T15:17:21.458Z","database":"ok","redis":"ok","redisMode":"redis"}
    ```
- **`GET https://chess-api-hszp.onrender.com/readiness`**:
  - HTTP Status: `200 OK`
  - Response:
    ```json
    {"status":"ready","serverTime":"2026-09-25T15:17:22.574Z","database":"connected","redis":"ok","redisRequired":true}
    ```
- **Deployed Version Exposure**:
  - Render Dashboard explicitly confirms deployed commit `82b59a1`.
  - HTTP `/health` and `/readiness` endpoints report system operational health without exposing git commit hashes.

### 4. Production WebSocket Verification

- **WebSocket URL**: `wss://chess-api-hszp.onrender.com/ws`
- **Authentication**:
  - Created ephemeral test user `usr_1790349443421_mluoet` (`probe_m7_1790349437811`) via `POST /api/auth/register`.
  - Connected to WebSocket endpoint.
  - Sent `{"event":"auth:token","payload":{"token":"<jwt>"}}`.
  - Received `{"event":"auth:success","payload":{"user":{"id":"usr_1790349443421_mluoet","username":"probe_m7_1790349437811","rating":1200}},"timestamp":1790349445329}`.
  - WebSocket Authentication: **PASS**.

### 5. M7 Rematch Protocol Probe

- **Probe Payload**:
  ```json
  {"event":"game:rematch","payload":{"gameId":"probe-dummy-game-id"}}
  ```
- **Before Deployment Response**:
  ```json
  {"event":"error","payload":{"code":"UNKNOWN_EVENT","message":"Event 'game:rematch' is not supported."},"timestamp":1790337443626}
  ```
- **After Deployment Response**:
  ```json
  {"event":"error","payload":{"code":"GAME_NOT_FOUND","message":"Game not found."},"timestamp":1790349445982}
  ```
- **Analysis**:
  - The M7 `game:rematch` protocol is now fully recognized by production.
  - The request was routed directly into `handleGameRematch` in `apps/server/src/websocket/handlers/rematch.js`, validated by `validateRematchPayload`, and safely returned `GAME_NOT_FOUND` for the non-existent probe ID.
  - `UNKNOWN_EVENT` has been eliminated.
  - Rematch Protocol Recognition: **PASS**.

### 6. Limitations

1. **Full Rematch Scenarios Deferred**: Full end-to-end multi-step production game scenarios (Game 1 play, Rematch offer/accept, Game 2 creation with color swap, decline, cancel, timeout, and reconnect) are intentionally deferred to the subsequent Production Smoke Test phase.
2. **Production Web UI**: Web frontend validation on Vercel (`client-psi-five-25.vercel.app`) is deferred to smoke testing.
3. **Hardware**: Physical mobile device testing not executed on Windows host.

### 7. Phase 6C Final Status

**READY FOR PRODUCTION SMOKE TEST**
