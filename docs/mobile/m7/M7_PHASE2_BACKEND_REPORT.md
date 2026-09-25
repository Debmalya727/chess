# M7 — Phase 2 Protocol & Backend Rematch Implementation Report

**Milestone**: M7 Phase 2 — Protocol + Backend Rematch Implementation  
**Date**: 2026-09-25  
**Status**: COMPLETE / VERIFIED  
**Commit Target**: `feat(m7): implement rematch protocol and backend`

---

## 1. Overview & Scope

In Phase 2 of Milestone M7, the end-to-end server and protocol foundations for match rematches were implemented according to the locked specifications in [M7_REMATCH_CONTRACT.md](file:///d:/Projects/Chess/docs/mobile/m7/M7_REMATCH_CONTRACT.md).

All work in this phase was strictly confined to:
1. `packages/protocol/**`
2. `apps/server/**`
3. `docs/mobile/m7/**`

**Crucial Scope Boundary**: Zero changes were made to `apps/mobile/**` or `apps/web/**`. Client support will be implemented in subsequent phases.

---

## 2. Protocol Package Changes (`@chess/protocol`)

### 2.1 WebSocket Events Added to `WS_EVENTS`
- `REMATCH_RESPOND`: `'game:rematch:respond'` (Client -> Server)
- `REMATCH_CANCEL`: `'game:rematch:cancel'` (Client -> Server)
- `REMATCH_OFFERED`: `'rematch:offered'` (Server -> Client)
- `REMATCH_DECLINED`: `'rematch:declined'` (Server -> Client)
- `REMATCH_CANCELLED`: `'rematch:cancelled'` (Server -> Client)
*(Existing events `GAME_REMATCH` and `GAME_INIT` were directly reused).*

### 2.2 Error Codes Added to `ERROR_CODES`
- `GAME_NOT_FINISHED`: Attempting to request rematch on an ongoing match.
- `TOURNAMENT_REMATCH_NOT_ALLOWED`: Attempting to request rematch in tournament games (`tournamentId != null`).
- `REMATCH_ALREADY_PENDING`: Caller already has an active pending offer for the game.
- `REMATCH_ALREADY_RESOLVED`: A rematch has already been accepted/created for this game.
- `REMATCH_NOT_FOUND`: Attempting to respond or cancel when no pending offer exists.
- `REMATCH_EXPIRED`: Offer expired before response.

### 2.3 Payload Validators in `schemas.js`
- `validateRematchPayload(payload)`: Ensures non-empty `gameId` string.
- `validateRematchRespondPayload(payload)`: Ensures non-empty `gameId` string and boolean `accept`.
- `validateRematchCancelPayload(payload)`: Ensures non-empty `gameId` string.

### 2.4 Protocol Unit Tests
- `packages/protocol/tests/protocol.test.js`: 8 unit tests covering all constants, uniqueness (no duplicate value collisions), and payload validation schemas.

---

## 3. Backend Engine Changes (`apps/server`)

### 3.1 `RematchService` (`apps/server/src/games/rematchService.js`)
A singleton engine managing the complete lifecycle of match rematches:
1. **Pending Offer State**:
   - Offers are tracked in memory (`pendingOffers.get(gameId)`).
   - Enforces a 30-second TTL (`expiresAt = Date.now() + 30000`).
   - If not accepted within 30 seconds, `_handleOfferTimeout` broadcasts `rematch:cancelled` with `reason: 'timeout'`.
2. **Authorization Guards**:
   - User must be authenticated.
   - Game must exist in memory or database.
   - Game status must be `FINISHED` or `COMPLETED`.
   - Requester must be `whitePlayerId` or `blackPlayerId` (spectators strictly rejected with `FORBIDDEN`).
   - Tournament games strictly rejected with `TOURNAMENT_REMATCH_NOT_ALLOWED`.
   - Neither player may be in another active match (`PLAYER_ALREADY_IN_GAME`).
3. **Mutual Request Coalescence**:
   - If Player A offers rematch, and Player B sends `game:rematch` before responding, Player B's request atomically coalesces into immediate mutual acceptance.
4. **Single-Game Invariant & Concurrency Lock**:
   - An in-memory mutex (`creationLock.add(gameId)`) guards against race conditions from concurrent acceptances.
   - Resolved rematches are registered in `resolvedRematches.set(gameId, newGameId)`.
   - Any duplicate or late requests fail with `REMATCH_ALREADY_RESOLVED`.
5. **Authoritative Game 2 Creation & Color Inversion**:
   - Server creates a brand new unique `roomCode` and new UUID `id`.
   - **Game 1 remains 100% immutable**: players, status, roomCode, moves, and result are unchanged.
   - **Deterministic Color Swap**:
     - Game 2 White = Game 1 Black player
     - Game 2 Black = Game 1 White player
   - Inherits `timeControl`, `rated`, and derived `ratingType`.
   - Sets fresh initial chess FEN and reset clocks.
   - Persists Game 2 row in `games` table and starts `ActiveGameSession`.
   - Broadcasts `game:init` with assigned colors (`'w'` and `'b'`) to both players.
6. **Disconnect Handling**:
   - `handleUserDisconnected(userId)` cancels any pending offer involving that user with `reason: 'opponent_disconnected'`.

### 3.2 WebSocket Handlers (`apps/server/src/websocket/handlers/rematch.js`)
- `handleGameRematch`: Processes `game:rematch` requests.
- `handleRematchRespond`: Processes `game:rematch:respond` (`accept: true|false`).
- `handleRematchCancel`: Processes `game:rematch:cancel`.

### 3.3 Router & Server Integration
- `apps/server/src/websocket/router.js`: Wired `WS_EVENTS.GAME_REMATCH`, `REMATCH_RESPOND`, and `REMATCH_CANCEL` cases with schema validation and `await` handling.
- `apps/server/src/websocket/wsServer.js`: Hooked `globalRematchService.handleUserDisconnected` into socket close lifecycle.
- `apps/server/src/db/gameRepository.js`: Updated `createGame` and `mapGameRow` to persist and return `rated` and `tournamentId` fields.

---

## 4. Test Verification Matrix

### 4.1 Protocol Tests (`packages/protocol/tests/protocol.test.js`)
- `WS_EVENTS` contains all rematch events: PASS
- `WS_EVENTS` no string collisions: PASS
- `ERROR_CODES` contains all rematch error codes: PASS
- `ERROR_CODES` no string collisions: PASS
- `validateRematchPayload`: PASS
- `validateRematchRespondPayload`: PASS
- `validateRematchCancelPayload`: PASS
*Total: 8/8 tests passed (126 ms).*

### 4.2 Rematch Service Tests (`apps/server/tests/unit/rematch.test.js`)
1. Offer: Valid offer creates pending offer and notifies opponent: PASS
2. Offer: Invalid payload returns error: PASS
3. Offer: Nonexistent game returns GAME_NOT_FOUND: PASS
4. Offer: Ongoing active game returns GAME_NOT_FINISHED: PASS
5. Offer: Non-player spectator is rejected with FORBIDDEN: PASS
6. Offer: Tournament match is rejected with TOURNAMENT_REMATCH_NOT_ALLOWED: PASS
7. Offer: Duplicate offer from same player is idempotent: PASS
8. Accept: Valid acceptance creates Game 2 with inverted colors and fresh room: PASS
9. Accept: Offering player cannot accept their own offer: PASS
10. Accept: Non-player cannot respond to rematch offer: PASS
11. Accept: Cannot accept expired or nonexistent offer: PASS
12. Decline: Declining offer cleans up pending offer and broadcasts rematch:declined: PASS
13. Cancel: Player who offered can cancel rematch offer: PASS
14. Cancel: Recipient cannot cancel an offer they did not make: PASS
15. Concurrency: Simultaneous mutual requests coalesce into single game creation: PASS
16. Concurrency Invariant: Exactly ONE Game 2 is created under parallel acceptance race: PASS
17. Disconnect: Disconnect cancels pending offer and notifies opponent: PASS
18. Rating: Rematch creation does NOT directly modify player ratings: PASS
19. Active Game: Reject rematch if either player is in another active game: PASS
20. Timeout: Offer expires after 30 seconds and broadcasts rematch:cancelled: PASS
*Total: 20/20 tests passed.*

### 4.3 Rematch Router Tests (`apps/server/tests/unit/rematchRouter.test.js`)
1. Router: Unauthenticated game:rematch is rejected with UNAUTHORIZED: PASS
2. Router: Missing gameId is rejected with INVALID_INPUT: PASS
3. Router: Valid game:rematch succeeds and returns confirmation: PASS
4. Router: game:rematch:cancel cancels offer: PASS
*Total: 4/4 tests passed.*

### 4.4 Full Server Unit Suite
- 16 test suites, 78 total tests executed.
- Result: **78 passed, 0 failed, 0 skipped**.

---

## 5. Known Limitations & Non-Goals

1. **Client Implementations Pending**:
   - Mobile client (`OnlineGameNotifier`, `OnlineGameScreen`) and Web client (`OnlineMode.jsx`) do not yet display or dispatch rematch events. This will be implemented in subsequent phases.
2. **In-Memory Concurrency Scope**:
   - Mutex lock and active pending offers are maintained in process memory via `RematchService`. Cross-instance Pub/Sub broadcasts user notifications (`rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`), matching existing architecture.
3. **No Direct Rating Mutation**:
   - Rematch creation does not alter player ratings; Game 1 rating calculation completes independently upon game end, and Game 2 runs its own independent rating lifecycle.
