# M7 — Architecture & Contract Audit Findings Log

**Branch**: `mobile/phase-m6-production-hardening`
**Milestone**: M7 Phase 0 — Architecture & Contract Audit Only
**Date**: 2026-09-25
**Status**: AUDIT COMPLETE (Zero Implementation)

---

## 1. Confirmed Existing Behavior

### 1.1 Protocol Layer (`packages/protocol/src/events.js`)
- `WS_EVENTS.GAME_REMATCH = 'game:rematch'` is defined in `@chess/protocol` under `Client -> Server` comments (line 12).
- Corresponding Flutter constant `WsEvents.gameRematch = 'game:rematch'` is defined in `apps/mobile/lib/core/protocol/ws_events.dart` (line 14) and verified by unit test `test/unit/m6_protocol_contract_test.dart` (line 50).
- **Missing in protocol**:
  - No response or broadcast events exist for rematch (e.g., `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `rematch:accepted`).
  - No error codes for rematch exist in `ERROR_CODES` (e.g., `REMATCH_ALREADY_PENDING`, `REMATCH_EXPIRED`, `REMATCH_NOT_ALLOWED`).

### 1.2 Backend Layer (`apps/server`)
- `apps/server/src/websocket/router.js` handles 13 distinct event types (`ping`, `auth:token`, `room:create`, `room:join`, `queue:join`, `queue:leave`, `queue:status`, `move:submit`, `draw:offer`, `draw:respond`, `game:resign`, `tournament:join`, `tournament:leave`).
- **`game:rematch` is unhandled**: The `switch (event)` statement in `router.js` does NOT include a `case WS_EVENTS.GAME_REMATCH:`. An incoming `game:rematch` packet hits `default:` and triggers `sendError('UNKNOWN_EVENT', "Event 'game:rematch' is not supported.")`.
- **Game Completion Lifecycle**:
  - `ActiveGameSession._endGame(result, termination)` in `gameService.js` sets `this.isEnded = true`, `this.room.status = 'FINISHED'`, and stops the clock.
  - In `games` table, row is updated with `status = 'FINISHED'`, `result`, `termination`, and `ended_at`.
  - `applyGameRatings` calculates Elo updates asynchronously within a transaction with concurrency protection (`SELECT status FROM games WHERE id = ? FOR UPDATE`).
  - `globalPresenceService.setUserPlaying(userId, false)` updates presence so players are no longer marked as in-game.
- **Room Lifecycle**:
  - `globalRoomManager.joinRoom(roomCode, joinUser)` in `roomManager.js` explicitly guards:
    `if (room.status === 'FINISHED' || room.status === 'CANCELLED') { return { error: 'GAME_FINISHED', message: 'Game has already ended.' }; }`
  - A finished room CANNOT be rejoined for active play.

### 1.3 Web Client Layer (`apps/web`)
- In `apps/web/client/src/features/mode/OnlineMode.jsx`:
  - When `activeGame.status === 'FINISHED'`, the only rendered actions are:
    1. "Download PGN" (`downloadPGN`)
    2. "Back to Lobby" (`setActiveGame(null)`)
  - No rematch button, rematch modal, or rematch WebSocket listener exists.

### 1.4 Mobile Client Layer (`apps/mobile`)
- In `apps/mobile/lib/features/online/presentation/online_game_screen.dart`:
  - When `gameState.isEnded == true`, `game_ended_banner` renders game termination metadata and an `ElevatedButton` labeled "Lobby", which calls `ref.read(onlineGameProvider.notifier).reset(); context.go('/online');`.
- In `apps/mobile/lib/features/online/state/online_game_notifier.dart`:
  - Subscribes to `gameInit`, `queueMatched`, `moveAccepted`, `moveRejected`, `clockTick`, `drawOffered`, `drawDeclined`, `gameEnded`, `playerPresence`.
  - No handler or state exists for rematch.

---

## 2. Deferred Findings from M6

| ID | Location | Status | Assessment |
|----|----------|--------|------------|
| **M6-F002** | `apps/mobile/lib/core/config/app_config.dart` | 🔵 ACCEPTED | `static AppConfig current` is mutable; retained for test and staging environment overrides. |
| **M6-F003** | `apps/mobile/lib/features/social/presentation/create_challenge_dialog.dart` | 🔵 ACCEPTED | Cosmetic color preference `'white'` sent by dialog; server authoritative color assignment in `challengeService.js` overrides as necessary. |
| **M6-F006** | `apps/mobile/lib/core/protocol/ws_events.dart` | 🔵 DEFERRED TO M7 | `WsEvents.gameRematch` protocol constant stub existed without supporting implementation. |

---

## 3. Architectural Risks & Constraints

### 3.1 Database Schema Unique Constraint on `room_code`
- In `apps/server/src/db/index.js` (line 104):
  `room_code VARCHAR(16) NOT NULL UNIQUE`
- **Impact**: Two game rows in the database CANNOT share the same `room_code`.
- **Verdict**: A rematch cannot mutate or reuse an existing game record or room code. Every rematch MUST generate:
  1. A new primary key `gameId` (`game_${Date.now()}_${random}`)
  2. A new unique `room_code` (`ROOM_${random}`)
  3. A new row in `games` table with `status = 'ACTIVE'`

### 3.2 Race Condition: Simultaneous Rematch Requests
- If Player A and Player B both tap "Rematch" at the same time:
  - Without concurrency handling, each could create a pending offer or trigger two independent game creations.
  - Mutual agreement must be serialized with a mutex or Redis lock keyed by the original `gameId` (similar to `this.acceptLock` in `challengeService.js`).

### 3.3 Disconnection & Player Presence
- If one player offers a rematch and the opponent disconnects, leaves to the lobby, or starts a different game:
  - The offer must cleanly expire or be canceled.
  - The offering player must be notified rather than left in an infinite pending spinner.

### 3.4 Tournament Game Isolation
- **Critical Rule**: Rematch MUST be disabled in tournament games.
  - In tournament mode, players are matched strictly by the pairing engine (`arenaPairingEngine.js` or `swissPairingEngine.js`).
  - Permitting arbitrary rematches within a tournament would break pairing algorithms, bypass tiebreaks, and violate tournament integrity.
  - UI guard: `if (gameState.tournamentId != null) doNotShowRematchButton()`.

### 3.5 Fair-Play Stockfish Zero-Tolerance Isolation
- **Rule**: Stockfish 18 engine is strictly restricted to Computer mode and Analysis mode.
- Any post-game rematch flow added to `OnlineGameNotifier` and `OnlineGameScreen` must NEVER instantiate, read, or inject `chessEngineFactoryProvider` or engine analysis tools.

---

## 4. Protocol Gaps

To implement Rematch cleanly across Backend, Web, and Mobile, the following protocol additions would be required:

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `game:rematch:offer` (or `game:rematch`) | Client -> Server | `{ gameId }` | Player requests a rematch for the finished game |
| `game:rematch:respond` | Client -> Server | `{ gameId, accept: boolean }` | Opponent accepts or declines the rematch offer |
| `game:rematch:offered` | Server -> Client | `{ gameId, offeredBy }` | Broadcast to opponent that a rematch was requested |
| `game:rematch:declined` | Server -> Client | `{ gameId }` | Broadcast to offering player that rematch was declined |
| `game:rematch:cancelled` | Server -> Client | `{ gameId, reason }` | Offer cancelled due to disconnect, timeout, or navigation |
| `game:init` | Server -> Client | Standard game payload | Emitted on rematch acceptance with swapped colors & new room |

---

## 5. Test Gaps

| Area | Current Coverage | Required for Production Rematch |
|------|------------------|---------------------------------|
| **Backend Route Tests** | None (`game:rematch` unhandled) | Test WS routing, authorization, and error handling |
| **Backend State Tests** | None | Test offer, accept, decline, timeout, color swapping, rating inheritance |
| **Backend Concurrency Tests** | None | Test simultaneous double-offer race conditions |
| **Web Unit / Component Tests** | None | Test post-game rematch button rendering, states, and responses |
| **Mobile Unit Tests** | Constant contract test only | Test `OnlineGameNotifier` rematch offer, incoming offer, accept, decline |
| **Mobile Widget Tests** | None | Test `OnlineGameScreen` rematch UI banners, action buttons, and lobby navigation |
| **Live Integration Tests** | None | Test full 2-client game completion -> rematch -> second game cycle |

---

## 6. Unresolved Questions for Implementation Planning

1. **Protocol Architecture**: Should rematch be implemented as:
   - Option A: Dedicated WebSocket sub-protocol (`game:rematch:*` events routed through a new `websocket/handlers/rematch.js`)?
   - Option B: Reusing the existing challenge system (`challengeService.createChallenge` with direct opponent targeting)?
   *(Recommendation: Option A is much faster, localized to the existing room sockets, and provides instant transition without visiting the social challenge screen).*
2. **Color Assignment**: Should colors always swap on rematch (White becomes Black, Black becomes White)?
   *(Standard chess practice: Yes, colors strictly alternate on rematch).*
3. **Time Control & Rated Flag**: Should rematch always preserve the exact time control and rated setting of the initial match?
   *(Standard chess practice: Yes).*
4. **Scope**: Should M7 implement Rematch across Backend + Web + Mobile simultaneously, or should M7 focus on Mobile contract readiness while coordinating with backend?

---

## 7. Phase 1 Design Resolutions

During Phase 1, the architecture was locked into [M7_REMATCH_CONTRACT.md](file:///d:/Projects/Chess/docs/mobile/m7/M7_REMATCH_CONTRACT.md):

1. **Resolution on Protocol**: Adopted Option A (dedicated WebSocket handler in `apps/server/src/websocket/handlers/rematch.js`) for minimal latency, zero routing overhead, and direct reuse of the active room sockets.
2. **Resolution on Colors**: Strictly deterministic color inversion enforced by server (Game 2 White = Game 1 Black; Game 2 Black = Game 1 White).
3. **Resolution on Ratings & Time Control**: Verbatim inheritance of `timeControl`, `rated`, and `ratingType`. Ratings updated after Game 1 are used as starting Elo for Game 2.
4. **Resolution on Invariant**: Single-game invariant enforced via in-memory concurrency lock; simultaneous mutual requests coalesce into one acceptance.
5. **Resolution on Tournaments**: Hard ban on rematch in tournament games (`tournamentId != null`).
