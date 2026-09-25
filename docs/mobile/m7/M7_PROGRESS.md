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
  - [x] Step 14 — Phase 1 Documentation Commit
- [ ] **Phase 2 — Rematch Implementation** (Pending User Review)
- [ ] **Phase 3 — Testing & Verification** (Not Started)
- [ ] **Phase 4 — Packaging & Build Validation** (Not Started)

---

## Phase 1 Summary — Contract Locked

1. **Protocol Specification Locked**:
   - Client -> Server: `game:rematch`, `game:rematch:respond`, `game:rematch:cancel`
   - Server -> Client: `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`
   - Error Codes: `GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`, `REMATCH_ALREADY_PENDING`, `REMATCH_ALREADY_RESOLVED`, `REMATCH_NOT_FOUND`, `REMATCH_EXPIRED`
2. **Deterministic Color Inversion**:
   - Game 2 White = Game 1 Black; Game 2 Black = Game 1 White (enforced strictly by server).
3. **Database Invariant**:
   - Every rematch creates a brand new row in `games` with fresh `id` and unique `room_code`.
4. **Concurrency Invariant**:
   - "At most one rematch game may be created for a given completed game." Simultaneous requests cleanly coalesce into single mutual acceptance.
5. **Tournament Guard**:
   - Rematch permanently disabled in tournament games (`tournamentId != null`).
6. **Implementation Status**:
   - ZERO production code changes made; design and contract locked in `M7_REMATCH_CONTRACT.md`.
