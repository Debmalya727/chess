# M7 — Rematch Implementation Contract & Design Specification

**Branch**: `mobile/phase-m6-production-hardening`
**Milestone**: M7 Phase 1 — Rematch Design & Contract
**Date**: 2026-09-25
**Status**: DESIGN COMPLETE / CONTRACT LOCKED

---

## 1. Scope & Objectives

Milestone M7 resolves deferred finding **M6-F006** (`WsEvents.gameRematch` protocol stub) by establishing an end-to-end, production-ready rematch system. This document defines the authoritative architecture, state machine, protocol specification, new-game creation mechanics, data isolation rules, error model, and test matrix across Backend, Web, and Mobile.

---

## 2. Existing Architecture & Baseline Constraints

From the M7 Phase 0 audit, the existing system imposes strict invariants that dictate the design:

1. **Database Schema Invariant (`games.room_code` UNIQUE)**:
   - `apps/server/src/db/index.js` defines `room_code VARCHAR(16) NOT NULL UNIQUE`.
   - **Rule**: Rematch CANNOT reuse an existing room code or mutate an existing game row. Every rematch MUST insert a distinct row into the `games` table with a new primary key `id` and a new unique `room_code`.
2. **Finished Room Invariant**:
   - `globalRoomManager.joinRoom` in `apps/server/src/rooms/roomManager.js` rejects attempts to join games marked `FINISHED` or `CANCELLED`.
   - **Rule**: Completed games and their memory rooms are permanently retired. Rematch must instantiate a fresh `ActiveGameSession` with a new `room.id`.
3. **Authoritative Server Rule**:
   - Mobile and Web clients NEVER decide game IDs, player colors, starting clocks, legal moves, or rating changes.
   - The server creates the rematch game and dispatches `WS_EVENTS.GAME_INIT`.
4. **Fair-Play Zero-Tolerance Rule**:
   - Stockfish 18 C++ native engine is strictly isolated to Computer mode and Analysis mode.
   - Rematch operates strictly via WebSocket messaging in `OnlineGameNotifier` and NEVER accesses `chessEngineFactoryProvider`.
5. **Tournament Integrity Rule**:
   - Rematch is strictly forbidden in tournament matches (`tournamentId != null`).

---

## 3. Protocol Contract

### 3.1 Event Naming & Direction

To maintain consistency with existing draw negotiation (`draw:offer`, `draw:respond`, `draw:offered`, `draw:declined`) and challenge negotiation (`challenge:received`, `challenge:accepted`, `challenge:declined`), the rematch protocol defines:

| Event Identifier | Direction | Purpose |
|------------------|-----------|---------|
| `game:rematch` | Client -> Server | Request a rematch for a completed game |
| `game:rematch:respond` | Client -> Server | Accept (`accept: true`) or decline (`accept: false`) an offer |
| `game:rematch:cancel` | Client -> Server | Cancel a pending rematch offer previously made by the client |
| `rematch:offered` | Server -> Client | Notify opponent that a rematch has been requested |
| `rematch:declined` | Server -> Client | Notify offering player that rematch was declined |
| `rematch:cancelled` | Server -> Client | Notify both players that offer was cancelled (timeout / disconnect) |
| `game:init` | Server -> Client | Dispatched to both players upon rematch acceptance to start Game 2 |

### 3.2 Event Payloads & Schema

#### 1. `game:rematch` (Client -> Server)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6"
  }
  ```
- **Validation**:
  - `gameId` must be a non-empty string.
- **Authorization**:
  - Client must be authenticated (`clientState.isAuthenticated == true`).
  - Client must be a participant in `gameId` (`whitePlayerId === user.id || blackPlayerId === user.id`).
- **Server Action**:
  - If opponent already has a pending rematch offer for `gameId`: Triggers **Mutual Acceptance** -> creates new game.
  - Otherwise: Records pending offer from `user.id` and broadcasts `rematch:offered` to opponent.

#### 2. `game:rematch:respond` (Client -> Server)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6",
    "accept": true
  }
  ```
- **Validation**:
  - `gameId` is required string; `accept` is boolean.
- **Authorization**:
  - Client must be the opponent of the offering player.
- **Server Action**:
  - If `accept === true`: Triggers **New Game Creation** -> emits `game:init`.
  - If `accept === false`: Emits `rematch:declined` to offering player and deletes pending offer.

#### 3. `game:rematch:cancel` (Client -> Server)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6"
  }
  ```
- **Authorization**:
  - Only the player who initiated the pending offer can cancel it.
- **Server Action**:
  - Deletes pending offer and emits `rematch:cancelled` `{ gameId, reason: "cancelled_by_player" }`.

#### 4. `rematch:offered` (Server -> Client)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6",
    "offeredBy": "u_player_1",
    "offeredByUsername": "Magnus",
    "expiresInSeconds": 30
  }
  ```

#### 5. `rematch:declined` (Server -> Client)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6"
  }
  ```

#### 6. `rematch:cancelled` (Server -> Client)
- **Payload**:
  ```json
  {
    "gameId": "game_1790265768460_d75753a6",
    "reason": "timeout" | "cancelled_by_player" | "player_disconnected"
  }
  ```

---

## 4. Rematch State Machine

### 4.1 Server Session State Machine

```
                        [ GAME ACTIVE ]
                               │
                               ▼ (game:ended)
                     [ GAME FINISHED ]
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼ (Player A rematch)  ▼ (Both simultaneously)▼ (Opponent left)
   [ OFFER PENDING ]      [ MUTUAL ACCEPTANCE ]      [ REJECT: OPPONENT_LEFT ]
   (by Player A)               │
         │                     ▼
         ├──────────────── [ NEW GAME CREATED ]
         │                 - New gameId, new roomCode
         │                 - Colors strictly swapped
         │                 - Clocks reset, FEN initial
         │                 - game:init dispatched
         │
         ├───────────────────────┬────────────────────────┐
         ▼ (Player B accepts)    ▼ (Player B declines)   ▼ (Timer 30s expires)
   [ NEW GAME CREATED ]     [ OFFER DECLINED ]       [ OFFER CANCELLED ]
   - game:init emitted      - rematch:declined       - rematch:cancelled
```

### 4.2 State Invariants
- A rematch offer may ONLY be placed when the game is in `FINISHED` status.
- Only ONE active pending rematch offer may exist per completed game.
- If both players send `game:rematch`, the second request is automatically treated as an acceptance of the first offer.
- A pending offer automatically expires after **30 seconds** if unhandled.

---

## 5. Authorization & Validation Rules

The server enforces the following authorization checks prior to accepting any rematch message:

1. **Authentication Guard**:
   - `clientState.isAuthenticated` must be `true`. If unauthenticated: reject with `UNAUTHORIZED`.
2. **Game Existence Guard**:
   - `gameId` must reference an existing game in memory or DB. If not found: reject with `GAME_NOT_FOUND`.
3. **Game Completion Guard**:
   - Game status MUST be `FINISHED`. If the game is `ACTIVE` or `WAITING`: reject with `GAME_NOT_FINISHED`.
4. **Participant Membership Guard**:
   - `user.id` must equal either `whitePlayerId` or `blackPlayerId`. Spectators and third-party users: reject with `FORBIDDEN`.
5. **Tournament Guard**:
   - If `game.tournamentId != null`: reject with `TOURNAMENT_REMATCH_NOT_ALLOWED`.
6. **Active Game Guard**:
   - Neither player may currently be participating in another active room (`getActiveGameForUser`). If busy: reject with `PLAYER_ALREADY_IN_GAME`.
7. **Single Rematch Invariant Guard**:
   - Once a rematch game has been spawned for a given game, subsequent rematch requests for the original game are rejected with `REMATCH_ALREADY_RESOLVED`.

---

## 6. Authoritative New-Game Creation

When a rematch offer is accepted (or mutually requested), the server executes the new game creation workflow:

```javascript
async function executeRematchCreation(originalGame, playerA, playerB) {
  // 1. Strict color inversion
  const newWhitePlayer = originalGame.whitePlayerId === playerA.id ? playerB : playerA;
  const newBlackPlayer = originalGame.whitePlayerId === playerA.id ? playerA : playerB;

  // 2. Room generation
  const room = globalRoomManager.createRoom({
    hostUser: newWhitePlayer,
    timeControl: originalGame.timeControl,
    colorPreference: 'w'
  });
  room.whiteUsername = newWhitePlayer.username;
  room.blackUsername = newBlackPlayer.username;
  globalRoomManager.joinRoom(room.roomCode, newBlackPlayer);

  // 3. Connect existing sockets
  if (newWhitePlayer.socket) room.connectedSockets.set(newWhitePlayer.id, newWhitePlayer.socket);
  if (newBlackPlayer.socket) room.connectedSockets.set(newBlackPlayer.id, newBlackPlayer.socket);

  // 4. Instantiate ActiveGameSession
  const session = globalGameManager.getOrCreateSession(room);
  session.start();

  // 5. Query latest Elo ratings for both players
  const ratingType = getRatingCategory(room.timeControl);
  const whiteRatingRecord = await getUserRating(newWhitePlayer.id, ratingType);
  const blackRatingRecord = await getUserRating(newBlackPlayer.id, ratingType);

  // 6. Persist distinct game row in database
  await createGame({
    id: room.id,
    roomCode: room.roomCode,
    whitePlayerId: newWhitePlayer.id,
    blackPlayerId: newBlackPlayer.id,
    mode: 'ONLINE',
    status: 'ACTIVE',
    timeControl: room.timeControl,
    initialFen: session.game.getFen(),
    rated: originalGame.rated !== false
  });

  // 7. Dispatch game:init with color-specific indicators
  const initPayload = {
    gameId: room.id,
    roomCode: room.roomCode,
    fen: session.game.getFen(),
    timeControl: room.timeControl,
    status: 'ACTIVE',
    turn: 'w',
    clocks: session.clock.getTimes(),
    stateVersion: session.stateVersion,
    whitePlayer: { id: newWhitePlayer.id, username: newWhitePlayer.username, rating: whiteRatingRecord.rating },
    blackPlayer: { id: newBlackPlayer.id, username: newBlackPlayer.username, rating: blackRatingRecord.rating }
  };

  sendToUser(newWhitePlayer.id, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'w' });
  sendToUser(newBlackPlayer.id, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'b' });
}
```

---

## 7. Color Assignment Rules

Color assignment on rematch is **strictly deterministic**:
- **Game 1**:
  - White: Player A
  - Black: Player B
- **Game 2 (Rematch)**:
  - White: Player B
  - Black: Player A

The server guarantees this inversion regardless of which player initiated the rematch offer.

---

## 8. Rating & Competitive Integration

1. **Inherited Properties**:
   - `timeControl` (e.g. `'3+0'`, `'5+3'`, `'10+0'`) is inherited verbatim.
   - `rated` (boolean) is inherited verbatim.
   - `ratingType` (`bullet`, `blitz`, `rapid`, `classical`) is inherited verbatim.
2. **Fresh Rating Resolution**:
   - Because Game 1 already updated ratings via `applyGameRatings`, the starting ratings for Game 2 reflect the completed Game 1 outcome.
3. **Statistical Integrity**:
   - Game 1 and Game 2 each represent separate entries in game history, separate PGN records, and separate rating change history records.

---

## 9. Tournament Restrictions

- **Strict Exclusion**: Rematch is permanently disabled in tournament games (`tournamentId != null`).
- **Enforcement**:
  - Server rejects with `TOURNAMENT_REMATCH_NOT_ALLOWED`.
  - Client UI explicitly hides the "Rematch" button when `gameState.tournamentId != null` and displays only "Back to Tournament" or "Lobby".

---

## 10. Concurrency & Idempotency Design

### 10.1 The Single Rematch Invariant
> **Invariant**: "At most one rematch game may be created for a given completed game."

### 10.2 Concurrency Scenarios & Resolutions

| Scenario | Race Condition | Resolution Mechanism |
|----------|----------------|----------------------|
| **Player A sends twice** | Double tap / duplicate packet | Server checks pending offer. If `offeredBy === user.id`, returns cached pending confirmation as idempotent no-op. |
| **Simultaneous A & B requests** | Both tap Rematch within <10ms | In-memory atomic map lock: `rematchLocks.set(gameId)`. The first thread claims the lock, marks state as `ACCEPTED`, and generates the single new game. The second thread detects `ACCEPTED` and exits cleanly. |
| **Late request after acceptance** | Slow client packet arrives after game created | Server checks `rematchOffers.get(gameId).status`. If `ACCEPTED`, rejects with `REMATCH_ALREADY_RESOLVED`. |
| **Request during active game** | Packet sent prematurely | Server verifies `game.status === 'FINISHED'`. Rejects with `GAME_NOT_FINISHED`. |

---

## 11. Disconnect & Reconnect Handling

1. **Disconnect while offer is pending**:
   - If the offering player disconnects, a 30-second timer continues running. If the player reconnects before expiration, the offer remains valid. If disconnected permanently, the timer cancels the offer and emits `rematch:cancelled` `{ reason: 'timeout' }`.
   - If the recipient disconnects, `player:presence` broadcasts `status: 'disconnected'`. The offering player's UI reflects opponent offline status.
2. **Disconnect after new game creation**:
   - Standard reconnect handling applies: upon reconnect, client sends `room:join` with `roomCode: newRoomCode` and receives `game:init`.

---

## 12. Mobile Client Design

### 12.1 State Model (`OnlineGameState`)
Add properties to `OnlineGameState`:
```dart
final bool rematchOfferedByMe;
final bool rematchOfferedToMe;
final String? rematchOfferedByUsername;
final String? tournamentId;
```
Include `clearRematch: true` sentinel flag in `copyWith`.

### 12.2 Notifier (`OnlineGameNotifier`)
- **Event Listeners**:
  - `WsEvents.rematchOffered`: sets `rematchOfferedToMe: true`, `rematchOfferedByUsername: payload['offeredByUsername']`.
  - `WsEvents.rematchDeclined`: sets `rematchOfferedByMe: false`, sets `errorMessage: 'Opponent declined rematch.'`.
  - `WsEvents.rematchCancelled`: resets `rematchOfferedByMe: false`, `rematchOfferedToMe: false`.
  - `WsEvents.gameInit`: already handles transitioning to new game! Resets rematch flags cleanly.
- **Methods**:
  - `void offerRematch()`: sends `WsEvents.gameRematch`, sets `rematchOfferedByMe: true`.
  - `void respondRematch(bool accept)`: sends `WsEvents.rematchRespond` with `{ accept }`.
  - `void cancelRematch()`: sends `WsEvents.rematchCancel`, sets `rematchOfferedByMe: false`.

### 12.3 UI (`OnlineGameScreen`)
- In `game_ended_banner`:
  - When `isEnded == true` and `tournamentId == null`:
    - If `rematchOfferedToMe`: Show interactive banner:
      *"[Opponent] wants a rematch! [Accept] [Decline]"*
    - If `rematchOfferedByMe`: Show waiting button:
      *"Rematch Requested... [Cancel]"*
    - Default state: Show `"Rematch"` button alongside `"Lobby"` button.
  - When `tournamentId != null`:
    - Show ONLY `"Back to Tournament"` / `"Lobby"`.

---

## 13. Web Client Design

### 13.1 `OnlineMode.jsx`
- Add local state: `rematchOfferedByMe`, `rematchOfferedToMe`, `rematchOfferedByUsername`.
- Add WebSocket listeners for `WS_EVENTS.REMATCH_OFFERED`, `REMATCH_DECLINED`, `REMATCH_CANCELLED`.
- In `game-over-banner`:
  - If `rematchOfferedToMe`: Render Accept / Decline button group.
  - If `rematchOfferedByMe`: Render "Rematch Offered (Waiting...)" with Cancel button.
  - Else: Render "Rematch" button alongside "Download PGN" and "Back to Lobby".

---

## 14. Error Model & Protocol Constants

### 14.1 New `WS_EVENTS` Constants
```javascript
GAME_REMATCH: 'game:rematch',
REMATCH_RESPOND: 'game:rematch:respond',
REMATCH_CANCEL: 'game:rematch:cancel',
REMATCH_OFFERED: 'rematch:offered',
REMATCH_DECLINED: 'rematch:declined',
REMATCH_CANCELLED: 'rematch:cancelled'
```

### 14.2 New `ERROR_CODES` Constants
```javascript
GAME_NOT_FINISHED: 'GAME_NOT_FINISHED',
TOURNAMENT_REMATCH_NOT_ALLOWED: 'TOURNAMENT_REMATCH_NOT_ALLOWED',
REMATCH_ALREADY_PENDING: 'REMATCH_ALREADY_PENDING',
REMATCH_ALREADY_RESOLVED: 'REMATCH_ALREADY_RESOLVED',
REMATCH_NOT_FOUND: 'REMATCH_NOT_FOUND',
REMATCH_EXPIRED: 'REMATCH_EXPIRED'
```

---

## 15. Comprehensive Test Plan

| Test Category | Suite / Target | Description |
|---------------|----------------|-------------|
| **Backend Route Tests** | `apps/server/test/` | Route `game:rematch`, `game:rematch:respond`, `game:rematch:cancel` in `router.js` |
| **Backend Lifecycle Tests** | `apps/server/test/` | Offer rematch -> accept -> verify new `gameId`, new `roomCode`, and swapped colors |
| **Backend Decline Tests** | `apps/server/test/` | Offer rematch -> decline -> verify `rematch:declined` broadcast and offer cleanup |
| **Backend Timeout Tests** | `apps/server/test/` | Offer rematch -> wait 30s -> verify `rematch:cancelled` with `reason: timeout` |
| **Backend Authorization Tests** | `apps/server/test/` | Reject spectator, unauthenticated user, active game, and tournament game |
| **Backend Concurrency Tests** | `apps/server/test/` | Simultaneous mutual requests verify exactly 1 new game created |
| **Protocol Contract Tests** | `packages/protocol/` & Mobile | Exhaustive constant checks for all new `WS_EVENTS` and `ERROR_CODES` |
| **Mobile Unit Tests** | `apps/mobile/test/unit/` | `OnlineGameNotifier` rematch state machine, offer, respond, cancel, and `gameInit` reset |
| **Mobile Widget Tests** | `apps/mobile/test/widget/` | `OnlineGameScreen` rematch button, waiting state, incoming offer banner, tournament suppression |
| **Web Component Tests** | `apps/web/test/` | `OnlineMode.jsx` post-game rematch UI, accept, decline, cancel buttons |
| **Multi-Client Integration** | `tests/integration/` | Full 2-client game completion -> rematch offer -> accept -> live game 2 moves |

---

## 16. Implementation Order (Phase 2+)

1. **Protocol Package (`packages/protocol`)**:
   - Add new `WS_EVENTS` and `ERROR_CODES` constants and export them.
2. **Backend Server (`apps/server`)**:
   - Create `websocket/handlers/rematch.js`.
   - Wire handler into `websocket/router.js`.
   - Implement concurrency lock and color inversion logic.
3. **Mobile Client (`apps/mobile`)**:
   - Update `WsEvents.dart` with new constants.
   - Update `OnlineGameState` and `OnlineGameNotifier`.
   - Update `OnlineGameScreen` UI with rematch banners and buttons.
4. **Web Client (`apps/web`)**:
   - Update `wsClient.js` and `OnlineMode.jsx`.
5. **Verification**:
   - Execute targeted test suites -> full test suite -> static analysis -> Android build validation.

---

## 17. Explicit Non-Goals

- NO modifications to the rating algorithm (Elo $K=32$ remains unchanged).
- NO changes to the Stockfish fair-play zero-tolerance architecture.
- NO arbitrary rematches permitted inside Tournaments (Arena/Swiss).
- NO mutation of historical game database records.
