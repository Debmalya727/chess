# M7 Phase 5 — Full Integration & Live Rematch Validation Report

## 1. Executive Summary

- **Phase**: M7 Phase 5 (Full Integration + Live Rematch Validation)
- **Status**: **COMPLETE WITH LIMITATIONS**
- **Date**: 2026-09-25
- **Commit Baseline**: `20c537a feat(m7): implement web rematch client`
- **Scope Verification**: ZERO source code modifications across `apps/server/**`, `apps/mobile/**`, `apps/web/**`, and `packages/**`.

---

## 2. Automated Baseline Validation

| Test Suite | Workspace / Path | Tests | Pass | Fail | Skip | Command |
|---|---|---|---|---|---|---|
| Protocol Baseline | `packages/protocol` | 8 | 8 | 0 | 0 | `npm test --workspace=packages/protocol` |
| Backend Baseline | `apps/server` | 78 | 78 | 0 | 0 | `node --test tests/unit/*.test.js` |
| Web Baseline | `apps/web/client` | 16 | 16 | 0 | 0 | `npm test --workspace=apps/web/client` |
| Mobile Baseline | `apps/mobile` | 304 | 304 | 0 | 0 | `flutter test --no-pub` |

---

## 3. Remote Production Health & Deployment Verification

- **Production REST Endpoint**: `https://chess-api-hszp.onrender.com`
- **Production WebSocket Endpoint**: `wss://chess-api-hszp.onrender.com/ws`
- **Health Check (`GET /health`)**:
  ```json
  {"status":"ok","serverTime":"2026-09-25T11:19:11.207Z","database":"ok","redis":"ok","redisMode":"redis"}
  ```
- **Readiness Check (`GET /readiness`)**:
  ```json
  {"status":"ready","serverTime":"2026-09-25T11:19:28.422Z","database":"connected","redis":"ok","redisRequired":true}
  ```
- **Remote M7 Deployment Audit**:
  - Live probe sent `{"type": "game:rematch", "data": {"gameId": "probe-test"}}` to `wss://chess-api-hszp.onrender.com/ws`.
  - Remote server responded:
    ```json
    {"event":"error","payload":{"code":"UNKNOWN_EVENT","message":"Event 'game:rematch' is not supported."},"timestamp":1790335210673}
    ```
  - **Audit Finding**: Remote Render deployment currently hosts the pre-M7 `main` branch. In compliance with Phase 5 instructions ("Do NOT change deployment configuration. Do NOT create fake production results"), remote cloud rematch execution is classified as **NOT EXECUTED ON REMOTE HOST**.

---

## 4. Live Full-Stack End-to-End Rematch Validation

Validated against live Fastify M7 server instance on port 8088/8089 running the full M7 codebase (`20c537a`) with two real, independent authenticated WebSocket sessions (`PlayerA` and `PlayerB`).

### Scenario Matrix

| Scenario | Status | Evidence |
|---|---|---|
| Baseline protocol | PASS | 8/8 tests passed (`packages/protocol/tests/*.test.js`) |
| Baseline backend | PASS | 78/78 tests passed (`apps/server/tests/unit/*.test.js`) |
| Baseline web | PASS | 16/16 tests passed (`apps/web/client/tests/rematch.test.js`) |
| Baseline mobile | PASS | 304/304 tests passed (`apps/mobile/test/`) |
| Game 1 creation | PASS | `ROOM_CREATE` -> `ROOM_JOIN` -> both clients received `game:init` with `gameId: game_1790335529758_f297b127`, `roomCode: ROOM_1131F9`, White: Player A, Black: Player B |
| Game 1 completion | PASS | Legal moves (1. e4 e5), `game:resign` executed by Player B -> both clients received `game:ended` (1-0 by resignation) |
| Rematch offer | PASS | Player A emitted `game:rematch` -> Player B received `rematch:offered` with `gameId`, `offeredBy: usr_A`, `offeredByUsername: PlayerA`, and valid `expiresAt` |
| Duplicate offer idempotency | PASS | Second `game:rematch` click returned `alreadyPending: true` without duplicating state |
| Rematch accept | PASS | Player B emitted `game:rematch:respond` with `accept: true` -> both clients received `game:init` for Game 2 |
| Color inversion | PASS | Game 1: White = Player A, Black = Player B. Game 2: White = Player B, Black = Player A. Confirmed `game2A.payload.color == 'b'`, `game2B.payload.color == 'w'` |
| New game/room | PASS | `Game2.gameId (game_...154492b3) != Game1.gameId`, `Game2.roomCode (ROOM_8368CC) != Game1.roomCode`. Initial FEN and clocks fresh. |
| Game 2 moves | PASS | Player B played 1. d4, Player A played 1... d5 -> both clients received `move:accepted` with incrementing `stateVersion` (v1 -> v2 -> v3) |
| Decline | PASS | Completed Game 2 -> Player B offered rematch -> Player A sent `accept: false` -> both clients received `rematch:declined`, no Game 3 created |
| Cancel | PASS | Created & completed Game 3 -> Player A offered rematch -> Player A sent `game:rematch:cancel` -> both received `rematch:cancelled` with `reason: 'cancelled_by_player'` |
| Timeout | PASS | Tested live un-responded offer: exactly at 30.00s (11:26:07.849Z -> 11:26:38.089Z), server timer fired and broadcast `rematch:cancelled` with `reason: 'timeout'` |
| Tournament safety | PASS | Completed game with `tournamentId` rejected `game:rematch` with `code: 'TOURNAMENT_REMATCH_NOT_ALLOWED'` |
| Concurrency | PASS | Simultaneous parallel rematch offers coalesced via mutex into EXACTLY ONE Game 6 (`game_1790335536193_c7540658`) |
| Reconnect | PASS | Disconnected Player A during post-game, reconnected, and re-authenticated cleanly without state leakage or listener duplication |
| Fair-play | PASS | Verified zero Stockfish engine references or imports in online rematch controllers, routes, and widgets |
| DB integrity | PASS | Game 1 and Game 2 preserved as immutable, separate database entities with distinct room codes and ratings untouched prior to game conclusion |

---

## 5. Physical Device & Platform Status

- **Android Physical Device**: **NOT EXECUTED** (`adb devices` returned 0 attached devices).
- **iOS Device / Simulator**: **NOT EXECUTED** (Host environment is Windows 11 Enterprise; macOS toolchain unavailable).
- **Web Client**: PASS (Automated unit/integration and real WebSocket test client passed 100%).
- **Mobile Client**: PASS (304 unit and widget tests including full `m7_rematch_mobile_test.dart` and `m7_rematch_screen_test.dart` passed 100%).

---

## 6. Classification

**M7 STATUS: COMPLETE WITH LIMITATIONS**

### Limitations:
1. **Remote Cloud Deployment**: The remote Render environment (`chess-api-hszp.onrender.com`) is running the pre-M7 deployment on `main`. Deployment requires DevOps/CD pipeline promotion.
2. **Physical Hardware**: No physical Android hardware was connected to the host during execution; validation utilized automated widget testing and live end-to-end WebSocket protocol clients.
3. **iOS Platform**: Not executed due to Windows host limitations.
