# M7 — Social Polish & Post-Game Lifecycle Progress Tracker

**Branch**: `mobile/phase-m6-production-hardening`
**Current Phase**: Phase 4 — Web Rematch Client (COMPLETE)
**Status**: PHASE 4 COMPLETE / VERIFIED / AWAITING USER INSTRUCTION
**Last Updated**: 2026-09-25

---

## Milestone M7 Overview

Milestone M7 follows the successful completion of M6 Production Hardening. Its primary focus is addressing the post-game experience (deferred finding M6-F006: `WsEvents.gameRematch`) and related social and match lifecycle polish.

---

## Phase Execution Checklist

- [x] **Phase 0 — Architecture & Contract Audit Only**
  - [x] Step 0 — Checkpoint & Baseline Verification
  - [x] Step 1 — Candidate Feature Identification (`rematch` investigation)
  - [x] Step 2 — Backend Contract Audit (`apps/server`)
  - [x] Step 3 — Web Contract Audit (`apps/web`)
  - [x] Step 4 — Mobile Contract Audit (`apps/mobile`)
  - [x] Step 5 — Fair-Play Stockfish Isolation Audit
  - [x] Step 6 — Data / Rating / Schema Impact Analysis
  - [x] Step 7 — Failure & Edge Case Analysis
  - [x] Step 8 — Test Gap Audit
  - [x] Step 9 — M7 Audit Documentation (`M7_PROGRESS.md`, `M7_FINDINGS.md`, `M7_CONTRACT_AUDIT.md`)
  - [x] Step 10 — Zero Source Implementation Verification
  - [x] Step 11 — Phase 0 Documentation Commit (`cc783b1`)
- [x] **Phase 1 — Rematch Implementation Contract & Design**
  - [x] Step 1 — Read Existing Contracts across Backend, Protocol, Web, Mobile
  - [x] Step 2 — Rematch State Machine Specification
  - [x] Step 3 — Protocol Design & Payloads
  - [x] Step 4 — Authoritative New-Game Creation & Deterministic Color Inversion
  - [x] Step 5 — Rating & Competitive Integration Rules
  - [x] Step 6 — Authorization & Security Guards
  - [x] Step 7 — Concurrency, Idempotency & Single-Game Invariant
  - [x] Step 8 — Disconnect & Reconnect Lifecycle
  - [x] Step 9 — Mobile Client Architecture
  - [x] Step 10 — Web Client Architecture
  - [x] Step 11 — Comprehensive Test Matrix
  - [x] Step 12 — Write Design Document (`M7_REMATCH_CONTRACT.md`)
  - [x] Step 13 — Zero Source Implementation Verification
  - [x] Step 14 — Phase 1 Documentation Commit (`2c0a4a3`)
- [x] **Phase 2 — Protocol + Backend Rematch Implementation**
  - [x] Step 1 — Checkpoint & Baseline Verification
  - [x] Step 2 — Audit Existing Server Creation Flow
  - [x] Step 3 — Protocol Implementation (`packages/protocol/src/events.js`, `schemas.js`, `tests/protocol.test.js`)
  - [x] Step 4 — Backend Rematch Handler (`apps/server/src/websocket/handlers/rematch.js`)
  - [x] Step 5 — Rematch Offer State & 30s Expiry (`RematchService`)
  - [x] Step 6 — Concurrency & Idempotency Locking (Single-Game Invariant)
  - [x] Step 7 — New Game Creation with Deterministic Color Inversion
  - [x] Step 8 — Rating Integration (Zero direct rating mutation)
  - [x] Step 9 — Tournament Safety Enforcement (`TOURNAMENT_REMATCH_NOT_ALLOWED`)
  - [x] Step 10 — Active Game Safety Enforcement (`PLAYER_ALREADY_IN_GAME`)
  - [x] Step 11 — Disconnect Hook & Timeout Cleanup
  - [x] Step 12 — Backend Test Suite (`rematch.test.js`, `rematchRouter.test.js`)
  - [x] Step 13 — Targeted & Full Unit Test Execution (8 protocol tests, 26 rematch tests, 78 server unit tests passing)
  - [x] Step 14 — Static & Scope Validation (Zero mobile/web source changes)
  - [x] Step 15 — Documentation (`M7_PROGRESS.md`, `M7_FINDINGS.md`, `M7_PHASE2_BACKEND_REPORT.md`)
  - [x] Step 16 — Phase 2 Commit
- [x] **Phase 3 — Mobile Rematch Implementation**
  - [x] Step 1 — Checkpoint & Baseline Verification (`d4433d2`)
  - [x] Step 2 — Audit Existing Mobile Architecture
  - [x] Step 3 — Protocol Constants (`WsEvents`, `ErrorCodes`)
  - [x] Step 4 — Online Game State Model (`OnlineGameState`)
  - [x] Step 5 — Online Game Notifier Actions (`offerRematch`, `respondRematch`, `cancelRematch`)
  - [x] Step 6 — Server Event Listeners (`rematch:offered`, `rematch:declined`, `rematch:cancelled`, `error`)
  - [x] Step 7 — Authoritative `game:init` Transition for Game 2
  - [x] Step 8 — Game-Over UI in `OnlineGameScreen`
  - [x] Step 9 — UX State Rules & Duplicate Action Prevention
  - [x] Step 10 — Tournament Safety Enforcement (`isTournamentGame` suppression)
  - [x] Step 11 — Reconnect Safety
  - [x] Step 12 — Test Suites (`m7_rematch_mobile_test.dart`, `m7_rematch_screen_test.dart`)
  - [x] Step 13 — Test Execution & Analysis (27 targeted tests pass, 304/304 full suite tests pass, 0 flutter analyze issues)
  - [x] Step 14 — Android Debug Build Validation (PASS, 381.8MB APK)
  - [x] Step 15 — Scope Validation (Zero server/web/packages changes)
  - [x] Step 16 — Documentation (`M7_PHASE3_MOBILE_REPORT.md`, `M7_PROGRESS.md`, `M7_FINDINGS.md`)
  - [x] Step 17 — Phase 3 Commit
- [x] **Phase 4 — Web Rematch Implementation**
  - [x] Step 1 — Checkpoint & Baseline Verification (`6b5bef5`)
  - [x] Step 2 — Audit Existing Web Architecture (`OnlineMode.jsx`, `wsClient.js`)
  - [x] Step 3 — Strict Protocol Conformance (`game:rematch`, `game:rematch:respond`, `game:rematch:cancel`, `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`)
  - [x] Step 4 — WebSocket Client Extension (`ChessWebSocketClient` methods)
  - [x] Step 5 — Web State Integration (`rematchOfferedByMe`, `rematchOfferReceived`, `rematchOfferedByUsername`, `isRematchLoading`)
  - [x] Step 6 — Post-Game Rematch UI in `OnlineMode.jsx` (Offer, Waiting, Incoming, Accept, Decline, Cancel)
  - [x] Step 7 — Tournament Safety & Suppression (`!activeGame.tournamentId`)
  - [x] Step 8 — Authoritative `game:init` Transition to Game 2
  - [x] Step 9 — Event Filtering by `gameId`
  - [x] Step 10 — Backend Error Handling (`REMATCH_*`, `TOURNAMENT_REMATCH_NOT_ALLOWED`)
  - [x] Step 11 — Reconnection & Listener Hygiene
  - [x] Step 12 — Web Rematch Test Suite (`apps/web/client/tests/rematch.test.js`)
  - [x] Step 13 — Test Execution (16/16 tests pass)
  - [x] Step 14 — Production Build Validation (`vite build` PASS in 3.9s)
  - [x] Step 15 — Scope Validation (Zero server/mobile/packages modifications)
  - [x] Step 16 — Documentation (`M7_PHASE4_WEB_REPORT.md`, `M7_PROGRESS.md`, `M7_FINDINGS.md`)
  - [x] Step 17 — Phase 4 Commit
- [ ] **Phase 5 — End-to-End Verification & Build Validation** (Not Started)

---

## Phase 2 Summary — Backend & Protocol Complete

1. **Protocol Package**:
   - Added events: `REMATCH_RESPOND` (`game:rematch:respond`), `REMATCH_CANCEL` (`game:rematch:cancel`), `REMATCH_OFFERED` (`rematch:offered`), `REMATCH_DECLINED` (`rematch:declined`), `REMATCH_CANCELLED` (`rematch:cancelled`). Reused `GAME_REMATCH` and `GAME_INIT`.
   - Added error codes: `GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`, `REMATCH_ALREADY_PENDING`, `REMATCH_ALREADY_RESOLVED`, `REMATCH_NOT_FOUND`, `REMATCH_EXPIRED`.
   - Added validators: `validateRematchPayload`, `validateRematchRespondPayload`, `validateRematchCancelPayload`.
   - Added protocol test suite (`packages/protocol/tests/protocol.test.js` — 8 passing tests).
2. **Backend Engine**:
   - Implemented `RematchService` in `apps/server/src/games/rematchService.js` with concurrency locks, 30s timer lifecycle, authoritative new-game creation, deterministic color inversion, tournament restriction, active game checking, and disconnect cleanup.
   - Implemented handlers in `apps/server/src/websocket/handlers/rematch.js` and wired routes in `router.js` and `wsServer.js`.
   - Implemented database mapping for `rated` and `tournament_id` in `apps/server/src/db/gameRepository.js`.
3. **Verification**:
   - 8 protocol tests pass.
   - 26 rematch unit & router tests pass.
   - 78 full server unit tests pass.
   - Zero mobile or web code modified.

---

## Phase 3 Summary — Mobile Rematch Client Complete

1. **Protocol Integration**:
   - Added `WsEvents` constants: `rematchRespond`, `rematchCancel`, `rematchOffered`, `rematchDeclined`, `rematchCancelled` (reusing existing `gameRematch` and `gameInit`).
   - Added `ErrorCodes`: `gameNotFinished`, `tournamentRematchNotAllowed`, `rematchAlreadyPending`, `rematchAlreadyResolved`, `rematchNotFound`, `rematchExpired`.
2. **State & Notifier**:
   - Extended `OnlineGameState` with `rematchOfferedByMe`, `rematchOfferedToMe`, `rematchOfferedByUsername`, `isRematchLoading`, `tournamentId`, and getter `isTournamentGame`.
   - Added actions in `OnlineGameNotifier`: `offerRematch()`, `respondRematch(bool accept)`, `cancelRematch()`.
   - Subscribed to `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `error`.
   - Reused authoritative `game:init` flow for clean transition to Game 2 with color swap and state reset.
3. **UI & Invariants**:
   - Rendered Rematch controls on `OnlineGameScreen` after normal game conclusion (`isEnded`).
   - Suppressed all rematch controls for tournament games (`isTournamentGame == true`).
   - Handled incoming offer, waiting state with cancellation, and server error banner display.
4. **Testing & Validation**:
   - 27 targeted tests in `test/unit/m7_rematch_mobile_test.dart` and `test/widget/m7_rematch_screen_test.dart` (27/27 PASS).
   - `flutter analyze --no-pub`: 0 issues found.
   - Full Flutter test suite: 304/304 tests passed, 0 failed, 0 skipped.
   - Android debug APK build: PASS (`381,826,162` bytes).
   - Zero server/web/packages modifications.

---

## Phase 4 Summary — Web Rematch Client Complete

1. **Protocol Conformance**:
   - Reused exact centralized `WS_EVENTS` and `ERROR_CODES` from `@chess/protocol`.
   - Extended `ChessWebSocketClient` in `apps/web/client/src/services/wsClient.js` with:
     - `offerRematch(gameId)`: sends `game:rematch` with `{ gameId }`
     - `respondRematch(gameId, accept)`: sends `game:rematch:respond` with `{ gameId, accept }`
     - `cancelRematch(gameId)`: sends `game:rematch:cancel` with `{ gameId }`
2. **State & Architecture**:
   - Integrated rematch state into `OnlineMode.jsx`: `rematchOfferedByMe`, `rematchOfferReceived`, `rematchOfferedByUsername`, `isRematchLoading`.
   - Managed `activeGameRef` to avoid stale closures in event listeners while maintaining stable subscription lifecycle.
   - Filtered all incoming rematch events by `gameId === activeGame?.gameId`.
3. **UI Integration**:
   - Post-game banner in `OnlineMode.jsx` renders:
     - "Rematch" button for normal finished games.
     - "Rematch offered... Waiting for opponent" with "Cancel" button when waiting.
     - `"[Opponent] offered a rematch!"` prompt with "Accept" and "Decline" buttons upon incoming offer.
     - Suppresses all rematch controls when `activeGame.tournamentId` is present.
     - Preserves existing "Download PGN" and "Back to Lobby" functionality.
4. **Game:Init Transition**:
   - Authoritative `game:init` re-used to enter Game 2:
     - Applies server-assigned `gameId`, `roomCode`, swapped colors, FEN, and clocks.
     - Completely resets all rematch state (`rematchOfferedByMe = false`, `rematchOfferReceived = false`, etc.).
     - Transitions state back to `'ACTIVE'` so game board updates cleanly.
5. **Testing & Build Validation**:
   - 16/16 web rematch tests passed (`apps/web/client/tests/rematch.test.js`).
   - Production bundle built cleanly with Vite in 3.9s.
   - Zero modifications to backend, mobile, or protocol code.
