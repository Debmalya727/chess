# M7 — Social Polish & Post-Game Lifecycle Progress Tracker

**Branch**: `mobile/phase-m6-production-hardening`
**Current Phase**: Phase 0 — Architecture & Contract Audit Only
**Status**: AUDIT COMPLETE / AWAITING USER REVIEW
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
  - [x] Step 11 — Phase 0 Documentation Commit
- [ ] **Phase 1 — Specification & Implementation Scope Alignment** (Pending User Review)
- [ ] **Phase 2 — Implementation** (Not Started)
- [ ] **Phase 3 — Testing & Verification** (Not Started)
- [ ] **Phase 4 — Packaging & Build Validation** (Not Started)

---

## Phase 0 Audit Summary

1. **Protocol Audit**:
   - `WS_EVENTS.GAME_REMATCH: 'game:rematch'` was defined as a client-to-server constant stub in `@chess/protocol` and `apps/mobile/lib/core/protocol/ws_events.dart`.
   - No server-to-client rematch events (`rematch:offered`, `rematch:declined`, `rematch:cancelled`) exist in `WS_EVENTS`.
   - No rematch-specific error codes exist in `ERROR_CODES`.

2. **Backend Audit (`apps/server`)**:
   - `apps/server/src/websocket/router.js` does NOT route `game:rematch`. Any incoming `game:rematch` hits the `default` switch branch and returns `UNKNOWN_EVENT`.
   - `ActiveGameSession` marks `room.status = 'FINISHED'` and `isEnded = true` upon termination.
   - `games` table in MySQL/TiDB schema defines `room_code VARCHAR(16) NOT NULL UNIQUE`.
   - A rematch CANNOT reuse the existing `room_code` or mutate the finished game. It must create a distinct game entity with a fresh `gameId` and fresh `roomCode`.

3. **Web Audit (`apps/web`)**:
   - Web `OnlineMode.jsx` only offers "Download PGN" and "Back to Lobby" when a game finishes.
   - There is no rematch button, hook logic, or WebSocket listener on web.

4. **Mobile Audit (`apps/mobile`)**:
   - Mobile `OnlineGameScreen` only displays a "Lobby" button when `gameState.isEnded == true`.
   - `OnlineGameNotifier` has no rematch action or event handling.
   - Fair-play isolation is 100% verified: Stockfish is strictly absent from online multiplayer providers and views.

5. **Implementation Status**:
   - ZERO source code changes performed.
   - Audit artifacts only.
