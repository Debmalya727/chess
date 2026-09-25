# M7 — Architecture & Contract Audit Specification

**Branch**: `mobile/phase-m6-production-hardening`
**Milestone**: M7 Phase 0 — Architecture & Contract Audit
**Date**: 2026-09-25
**Scope**: Full Stack Inspection (`packages/protocol`, `apps/server`, `apps/web`, `apps/mobile`)

---

## 1. Capability & Contract Status Matrix

The following matrix documents the exact verified state of post-game and rematch capabilities across every layer of the repository, based strictly on codebase inspection:

| Capability | Backend | Web | Mobile | Protocol | Tests | Status |
|------------|---------|-----|--------|----------|-------|--------|
| **`game:rematch` Constant** | ❌ Not imported | ❌ Not imported | ✅ Defined (`WsEvents.gameRematch`) | ✅ Defined (`WS_EVENTS.GAME_REMATCH`) | ✅ Unit tested (`m6_protocol_contract_test.dart:50`) | **PROTOCOL STUB ONLY** |
| **Rematch Event Routing** | ❌ Unhandled in `router.js` (`UNKNOWN_EVENT`) | ❌ No emission logic | ❌ No emission logic | ❌ No sub-event definitions | ❌ None | **NOT IMPLEMENTED** |
| **Rematch Offer Handler** | ❌ No handler | ❌ No handler | ❌ No handler | ❌ No event defined | ❌ None | **NOT IMPLEMENTED** |
| **Rematch Acceptance & Color Swap** | ❌ No handler | ❌ No handler | ❌ No handler | ❌ No event defined | ❌ None | **NOT IMPLEMENTED** |
| **Rematch Decline & Cancel** | ❌ No handler | ❌ No handler | ❌ No handler | ❌ No event defined | ❌ None | **NOT IMPLEMENTED** |
| **Game Completion Lifecycle** | ✅ `_endGame` sets `room.status = 'FINISHED'` | ✅ Handles `GAME_ENDED` | ✅ Handles `gameEnded` | ✅ `WS_EVENTS.GAME_ENDED` | ✅ Unit & widget tested | **PRODUCTION READY (M2/M5/M6)** |
| **Post-Game Result Display** | ✅ Broadcasts result, termination, FEN | ✅ Victory / Defeat / Draw banner | ✅ Result card with termination | ✅ Full protocol schema | ✅ Widget tested | **PRODUCTION READY (M2/M5/M6)** |
| **Post-Game PGN Inspection** | ✅ `GET /api/games/:id/pgn` | ✅ "Download PGN" button | ✅ Authoritative PGN dialog with copy | ✅ REST endpoint | ✅ Unit tested (`m6_games_repository_test.dart`) | **PRODUCTION READY (M5/M6)** |
| **Return to Lobby** | ✅ Removes presence, allows re-queue | ✅ "Back to Lobby" button | ✅ "Lobby" button resets state | ✅ REST & WS | ✅ Widget tested | **PRODUCTION READY (M2/M5/M6)** |
| **Direct Challenge System** | ✅ `challengeService.js` (create, accept, decline) | ✅ `SocialView.jsx`, `ChallengeModal.jsx` | ✅ `ChallengesNotifier`, `create_challenge_dialog.dart` | ✅ 6 challenge events | ✅ Unit & widget tested (M3/M6) | **PRODUCTION READY (M3/M6)** |
| **Fair-Play Stockfish Isolation** | ✅ Anti-cheat fair-play analysis service | ✅ Stockfish disabled in online multiplayer | ✅ Zero-tolerance engine isolation verified | ✅ Separate namespaces | ✅ Automated regression tests | **PRODUCTION READY (M1/M2/M5/M6)** |

---

## 2. Layer-by-Layer Architectural Audit

### 2.1 Protocol Layer (`packages/protocol/src/events.js`)
- **Verified Findings**:
  - `WS_EVENTS.GAME_REMATCH = 'game:rematch'` exists in `packages/protocol/src/events.js` as an isolated constant under `Client -> Server`.
  - There are NO paired events:
    - No `WS_EVENTS.REMATCH_OFFERED` or `WS_EVENTS.REMATCH_RESPOND`
    - No `WS_EVENTS.REMATCH_DECLINED` or `WS_EVENTS.REMATCH_CANCELLED`
    - No `ERROR_CODES.REMATCH_*` constants exist.
- **Contract Impact**:
  - Any interactive rematch negotiation requires a two-way handshake analogous to the draw offer flow (`draw:offer` / `draw:respond` / `draw:offered` / `draw:declined`).

### 2.2 Backend Service Layer (`apps/server`)
- **Verified Findings**:
  - `apps/server/src/websocket/router.js`:
    ```javascript
    switch (event) {
      // Handles auth:token, room:create, room:join, queue:join,
      // queue:leave, queue:status, move:submit, draw:offer,
      // draw:respond, game:resign, tournament:join, tournament:leave.
      // DOES NOT HANDLE game:rematch!
      default:
        sendError('UNKNOWN_EVENT', `Event '${event}' is not supported.`);
        break;
    }
    ```
  - `apps/server/src/games/gameService.js`:
    - `ActiveGameSession._endGame(result, termination)`:
      - Sets `this.isEnded = true`
      - Sets `this.room.status = 'FINISHED'`
      - Calculates and applies ratings asynchronously via `applyGameRatings`
      - Clears player presence via `globalPresenceService.setUserPlaying(userId, false)`
  - `apps/server/src/rooms/roomManager.js`:
    - Rooms cannot be reused after game completion:
      `if (room.status === 'FINISHED' || room.status === 'CANCELLED') return { error: 'GAME_FINISHED', message: 'Game has already ended.' };`

### 2.3 Database & Data Model Layer
- **Schema Constraint**:
  - In `apps/server/src/db/index.js` (line 104):
    `room_code VARCHAR(16) NOT NULL UNIQUE`
- **Architectural Consequence**:
  - A rematch MUST generate a completely new game entity with:
    1. A fresh `id` (e.g. `game_1790000000000_abcdef`)
    2. A fresh unique `room_code` (e.g. `ROOM_ABC123`)
    3. New entries in `games` and `game_events` tables.
  - A rematch CANNOT mutate or append to the completed game row.

### 2.4 Web Client Layer (`apps/web`)
- In `apps/web/client/src/features/mode/OnlineMode.jsx` (lines 359–377):
  - When `activeGame.status === 'FINISHED'`, the UI displays:
    - Victory / Defeat / Draw headline
    - Termination reason and result string
    - "Download PGN" button
    - "Back to Lobby" button
  - There is NO rematch button or post-game challenge shortcut.

### 2.5 Mobile Client Layer (`apps/mobile`)
- In `apps/mobile/lib/features/online/presentation/online_game_screen.dart` (lines 418–456):
  - When `gameState.isEnded == true`:
    - Displays `game_ended_banner`
    - Shows trophy icon, result, and termination text
    - Displays an `ElevatedButton` labeled "Lobby"
  - In `apps/mobile/lib/features/online/state/online_game_notifier.dart`:
    - On `gameEnded`, sets `state.isEnded = true`.
    - No rematch state property exists in `OnlineGameState`.
    - No rematch offer or response methods exist in `OnlineGameNotifier`.

---

## 3. Post-Game State Machine Transition Model

The current mobile state machine behaves as follows:

```
[ ACTIVE GAME ]
       │
       ▼ (gameEnded event)
[ GAME ENDED ]
       │
       ├─────────────────────────────────┐
       ▼ (Tap "Lobby")                   ▼ (AppBar Back)
[ RESET NOTIFIER ]                 [ RESET NOTIFIER ]
       │                                 │
       ▼                                 ▼
[ ONLINE LOBBY SCREEN ]            [ ONLINE LOBBY SCREEN ]
```

To support Rematch in M7, the state machine must expand as follows:

```
                   [ ACTIVE GAME ]
                          │
                          ▼ (gameEnded event)
                   [ GAME ENDED ]
                          │
         ┌────────────────┼────────────────┐
         ▼ (Tap "Lobby")  ▼ (Offer Rematch) ▼ (Incoming Rematch Offer)
   [ RESET & LOBBY ] [ REMATCH PENDING ]   [ REMATCH OFFERED MODAL ]
                            │                      │
             ┌──────────────┴──────────────┐       ├─────────────┐
             ▼ (Accepted)                  ▼ (Declined/Expired)  ▼ (Accept)
       [ NEW GAME_INIT ]             [ REMATCH CANCELLED ] [ NEW GAME_INIT ]
             │                                     │             │
             ▼                                     ▼             ▼
   [ NEW ACTIVE GAME ]                     [ GAME ENDED ]  [ NEW ACTIVE GAME ]
   (Swapped Colors,                        (Banner resets) (Swapped Colors,
    Fresh Clocks)                                           Fresh Clocks)
```

---

## 4. Fair-Play Stockfish Zero-Tolerance Audit

- **Baseline Rule**: Stockfish 18 C++ native engine is strictly isolated to Computer mode and Analysis mode.
- **Verification**:
  - `apps/mobile/test/unit/online_fairplay_test.dart` verifies that `chessEngineFactoryProvider` is never read or instantiated when constructing `OnlineGameNotifier` or `OnlineGameScreen`.
  - Rematch features in M7 will operate entirely through `OnlineGameNotifier` and WebSocket events.
  - **Verdict**: Rematch introduces ZERO architectural risk to the Stockfish fair-play isolation boundary.

---

## 5. Scope & Alignment Recommendations for M7

1. **Protocol Additions Required**:
   - Backend needs a dedicated rematch handler in `apps/server/src/websocket/handlers/` and routing in `router.js`.
   - Protocol package needs formalization of rematch events: `WS_EVENTS.GAME_REMATCH` (offer), `WS_EVENTS.REMATCH_OFFERED`, `WS_EVENTS.REMATCH_RESPOND`, `WS_EVENTS.REMATCH_DECLINED`.
2. **Authoritative Rules**:
   - Colors must strictly alternate: White in Game 1 becomes Black in Game 2.
   - Time control and rating mode (rated vs casual) are inherited from Game 1.
   - Rematch is strictly forbidden in tournament matches (`tournamentId != null`).
3. **Mobile Readiness**:
   - Mobile client needs:
     - `OnlineGameState` fields: `rematchOfferedByMe: bool`, `rematchOfferedToMe: bool`.
     - `OnlineGameNotifier` methods: `offerRematch()`, `respondRematch(bool accept)`.
     - `OnlineGameScreen` UI: "Rematch" button in `game_ended_banner`, incoming rematch dialog/banner.
