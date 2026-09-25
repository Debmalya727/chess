# M7 — Social Polish & Post-Game Lifecycle Progress Tracker

**Branch**: `mobile/phase-m6-production-hardening`
**Current Phase**: Phase 1 — Rematch Implementation Contract & Design (COMPLETE)
**Status**: DESIGN COMPLETE / CONTRACT LOCKED / AWAITING USER INSTRUCTION
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
- [ ] **Phase 3 — Mobile Rematch Implementation** (Not Started)
- [ ] **Phase 4 — Web Rematch Implementation** (Not Started)
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
