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

---

## 8. Phase 2 Implementation Findings & Verification

1. **Protocol Implementation**:
   - `packages/protocol/src/events.js` updated with `WS_EVENTS` (`REMATCH_RESPOND`, `REMATCH_CANCEL`, `REMATCH_OFFERED`, `REMATCH_DECLINED`, `REMATCH_CANCELLED`) and `ERROR_CODES` (`GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`, `REMATCH_ALREADY_PENDING`, `REMATCH_ALREADY_RESOLVED`, `REMATCH_NOT_FOUND`, `REMATCH_EXPIRED`).
   - `packages/protocol/src/schemas.js` updated with payload validators (`validateRematchPayload`, `validateRematchRespondPayload`, `validateRematchCancelPayload`).
   - `packages/protocol/tests/protocol.test.js` verified 8 unit tests passing with zero duplicate string collisions.

2. **Backend Engine (`RematchService`)**:
   - Created in `apps/server/src/games/rematchService.js` with full state machine, concurrency locks, 30s timeout timers, and disconnect hooks.
   - Handlers created in `apps/server/src/websocket/handlers/rematch.js` and wired into `router.js` with `await` semantics.
   - Socket close listener in `wsServer.js` hooked with `globalRematchService.handleUserDisconnected` to cancel pending offers when a player drops.
   - Database schema mapping in `apps/server/src/db/gameRepository.js` updated to preserve `rated` and `tournamentId` during game creation and fetching.

3. **Concurrency & Invariant Confirmation**:
   - Simultaneous mutual requests (`requestRematch` from both players) coalesce cleanly into single game creation.
   - Parallel race between acceptances tested and proven to result in exactly ONE game creation with subsequent requests receiving `REMATCH_ALREADY_RESOLVED`.
   - Test pollution prevention: `t.beforeEach` in `rematch.test.js` isolates active rooms between tests so `getActiveGameForUser` functions deterministically.

4. **Test Verification**:
   - Protocol tests: 8 pass, 0 fail.
   - Rematch unit tests (`rematch.test.js`): 20 pass, 0 fail.
   - Rematch router tests (`rematchRouter.test.js`): 4 pass, 0 fail.
   - Full server unit test suite: 16 suites, 78 tests pass, 0 fail.

---

## 9. Phase 3 Mobile Rematch Client Findings & Verification

1. **Protocol Integration**:
   - Synchronized `apps/mobile/lib/core/protocol/ws_events.dart` with backend Phase 2 events:
     - `gameRematch = 'game:rematch'`
     - `rematchRespond = 'game:rematch:respond'`
     - `rematchCancel = 'game:rematch:cancel'`
     - `rematchOffered = 'rematch:offered'`
     - `rematchDeclined = 'rematch:declined'`
     - `rematchCancelled = 'rematch:cancelled'`
   - Added corresponding error codes to `apps/mobile/lib/core/protocol/error_codes.dart`:
     - `GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`, `REMATCH_ALREADY_PENDING`, `REMATCH_ALREADY_RESOLVED`, `REMATCH_NOT_FOUND`, `REMATCH_EXPIRED`.

2. **Game:Init Transition & Reconnection Condition**:
   - `OnlineGameNotifier` originally gated `game:init` with `if (state == null || state!.gameId == gameId)`.
   - When transitioning from Game 1 to Game 2 via Rematch, the new game arrives with a new `gameId` emitted by the authoritative backend.
   - The condition was refined to: `if (state == null || state!.gameId == gameId || state!.isEnded)`. This ensures completed games seamlessly accept the new authoritative game without requiring a manual route teardown or resetting state.
   - All server-authoritative fields (`gameId`, `roomCode`, `fen`, `turn`, `myColor`, `clocks`, `stateVersion`, `moves`) are completely reset by `initializeGame`, and local rematch flags are reset to `false`/`null`.

3. **Tournament Safety**:
   - Evaluated directly from server payload: `gameState.isTournamentGame => tournamentId != null && tournamentId!.isNotEmpty`.
   - In `OnlineGameScreen`, all rematch controls (`Rematch`, `Cancel`, `Accept`, `Decline`) are completely omitted when `isTournamentGame` is true.
   - If a client-side glitch or bypass triggers `offerRematch()`, the notifier explicitly guards: `if (state!.isTournamentGame) return;`.
   - Server-side error `TOURNAMENT_REMATCH_NOT_ALLOWED` updates `errorMessage` gracefully.

4. **Widget Testing Micro-Task Lesson**:
   - `CircularProgressIndicator` creates infinite animation loops; calling `pumpAndSettle()` while waiting indicators are active causes timeout assertions.
   - Using single micro-pumps (`await tester.pump()`) reliably advances widget testing state for indeterminate spinners.

5. **Test & Build Verification**:
   - 27 targeted tests in `test/unit/m7_rematch_mobile_test.dart` and `test/widget/m7_rematch_screen_test.dart` (27/27 PASS).
   - Full Flutter test suite: 304 tests passed, 0 failed, 0 skipped.
   - `flutter analyze --no-pub`: 0 issues found.
   - Android debug APK build: PASS (`381,826,162` bytes).

---

## 10. Phase 4 Web Rematch Client Findings & Verification

1. **Protocol Integration**:
   - Web client reuses exact event names and schemas from `@chess/protocol`:
     - Client -> Server: `game:rematch`, `game:rematch:respond`, `game:rematch:cancel`
     - Server -> Client: `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`
   - Added clean methods to `ChessWebSocketClient` (`offerRematch`, `respondRematch`, `cancelRematch`).

2. **React Closure Hygiene with WebSocket Listeners**:
   - WebSocket event listeners in `OnlineMode.jsx` are bound once on component mount.
   - To prevent stale closures over `activeGame` when socket events arrive, an `activeGameRef` (`useRef(activeGame)`) was introduced.
   - This ensures event filtering by `gameId === activeGame?.gameId` always evaluates against the latest game state without requiring unbinding and rebinding listeners on every state update.

3. **Vite Windows Junction Resolution**:
   - In environments where the project directory is a Windows directory junction (e.g. `d:\Projects\Chess` -> `D:\Projects\Done\Chess`), Vite's HTML build plugin previously computed `../../../../Done/Chess/apps/web/client/index.html` as the asset path because `process.cwd()` differed from `fs.realpathSync`.
   - Explicitly configuring `root: path.resolve(__dirname)` in `vite.config.js` aligns Rollup's root resolution with the module's realpath, enabling clean production builds.

4. **Tournament Suppression Invariant**:
   - Rematch controls are suppressed completely whenever `activeGame.tournamentId` is truthy.
   - User actions are guarded both at the UI layer (omitting buttons) and at the handler layer (`if (activeGame.tournamentId) return`).

5. **Test & Build Verification**:
   - 16/16 web rematch unit and integration tests passing (`apps/web/client/tests/rematch.test.js`).
   - Production Vite bundle builds cleanly in 3.9s.
   - Zero changes to backend or mobile implementation files.

---

## Phase 5 Findings: Full Integration & Live Rematch Validation

1. **Remote Cloud Production Server State**:
   - The production server at `https://chess-api-hszp.onrender.com` is healthy and responsive (DB: ok, Redis: ok).
   - Probing the WebSocket endpoint with `game:rematch` returned `{"code": "UNKNOWN_EVENT"}`.
   - This confirmed that the remote cloud environment is running the pre-M7 deployment (`main` branch).
   - Per Phase 5 instructions, deployment configuration was not altered and cloud validation of rematch was properly documented as `NOT EXECUTED ON REMOTE HOST`.

2. **Live End-to-End WebSocket Protocol Validation**:
   - All rematch protocol flows were executed live against an active Fastify M7 server instance on port 8088/8089 with two distinct authenticated sessions (`PlayerA` and `PlayerB`).
   - Full lifecycle verified: Game 1 creation, legal move play (1. e4 e5), resignation, rematch offer (`rematch:offered`), duplicate click idempotency (`alreadyPending: true`), rematch acceptance (`game:rematch:respond`), Game 2 creation (`game:init`), deterministic color inversion (`Game 1 White -> Game 2 Black`), Game 2 legal moves (1. d4 d5 with version increments), rematch decline, rematch cancel (`cancelled_by_player`), real 30.00s timeout expiration (`timeout`), tournament rematch rejection (`TOURNAMENT_REMATCH_NOT_ALLOWED`), concurrency race mutex (coalesced into single game), reconnect safety, fair-play Stockfish zero-tolerance isolation, and DB/state integrity.

3. **Authoritative 30-Second Timeout Verification**:
   - The pending offer timeout was verified without mocking or artificial acceleration:
   - Offer sent: `2026-09-25T11:26:07.849Z`
   - Cancellation received: `2026-09-25T11:26:38.539Z` (`reason: 'timeout'`)
   - Duration: 30.69 seconds (within normal timer tick resolution).

4. **Hardware Environment Reality**:
   - `adb devices` returned 0 devices. No physical Android device was connected to the host during execution.
   - Host is Windows 11 Enterprise; macOS/iOS build toolchain is not present.
   - These limitations are formally recorded in the final classification.
