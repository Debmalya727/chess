# M6 Production Hardening — Findings Log

**Branch**: `mobile/phase-m6-production-hardening`  
**Status**: IN PROGRESS

---

## Phase A — Architecture Audit

**Completed**: 2026-09-24  
**Files Reviewed**: 13 core/feature files  
**Analyzer**: 0 issues found

### A1. Core Layer

| File | Assessment | Notes |
|------|------------|-------|
| `core/config/app_config.dart` | ✅ Clean | Proper env constants; `AppConfig.current` is mutable — acceptable for now |
| `core/network/api_client.dart` | ✅ Clean | Proper timeout/retry pattern, good error mapping |
| `core/network/api_exceptions.dart` | ✅ Clean | Well-structured error types |
| `core/storage/secure_storage_service.dart` | ✅ Clean | `InMemoryStorageService` available for tests |
| `core/websocket/ws_client.dart` | ✅ Clean | Exponential backoff + jitter, stale-event rejection, ping heartbeat |
| `core/protocol/ws_events.dart` | ✅ Fixed | Added `drawDeclined` constant (M6-F001) |
| `online/state/online_game_notifier.dart` | ✅ Fixed | Now uses `WsEvents.drawDeclined` (M6-F001) |

### A2. Feature State Layer

| File | Assessment | Notes |
|------|------------|-------|
| `auth/state/auth_notifier.dart` | ✅ Clean | Proper `mounted` guards, cached→live restore, WS connect-on-auth |
| `online/state/matchmaking_notifier.dart` | ✅ Clean | Good state machine, proper unsub pattern |
| `social/state/challenges_notifier.dart` | ✅ Fixed | copyWith fixed (M6-F004) |
| `social/state/friends_notifier.dart` | ✅ Fixed | copyWith fixed (M6-F004) |
| `social/state/leaderboard_notifier.dart` | ✅ Fixed | copyWith fixed (M6-F004) |
| `social/state/player_profile_notifier.dart` | ✅ Fixed | copyWith fixed (M6-F004) |
| `tournaments/state/tournament_detail_notifier.dart` | ✅ Fixed | Added `tournamentGameStarted` subscription (M6-F005) |

### A3. Router

| File | Assessment | Notes |
|------|------------|-------|
| `app/router.dart` | ✅ Clean | Proper ShellRoute + fullscreen pattern, correct `parentNavigatorKey` usage |

---

## Phase B — WebSocket Resilience Testing

**Completed**: 2026-09-24  
**New Tests**: 13 (in `m6_ws_resilience_test.dart`)

| Group | Tests | Description |
|-------|-------|-------------|
| B1 | 4 | Multi-game stateVersion isolation |
| B2 | 3 | `draw:declined` constant regression guard |
| B3 | 2 | Reconnect — `game:init` replaces stale state |
| B4 | 2 | `move:rejected` does not alter stateVersion |
| B5 | 2 | Listener cleanup on dispose |

---

## Phase C — Error Handling Hardening

**Completed**: 2026-09-24  
**New Tests**: 17 (in `m6_state_copywith_test.dart`)

| Group | Tests | Description |
|-------|-------|-------------|
| C1 | 6 | FriendsState.copyWith preservation |
| C2 | 5 | ChallengesState.copyWith preservation |
| C3 | 3 | LeaderboardState.copyWith preservation |
| C4 | 3 | PlayerProfileState.copyWith preservation |

---

## Phase D — Protocol Contract Audit

**Completed**: 2026-09-24  
**New Tests**: 84 (in `m6_protocol_contract_test.dart`)

| Group | Tests | Description |
|-------|-------|-------------|
| D1 | 44 | WsEvents exhaustive constant coverage (all 44 events) |
| D2 | 33 | ErrorCodes exhaustive constant coverage (all 33 error codes) |
| D3 | 2 | M6-F005 `tournament:game_started` regression guard |
| D4 | 3 | WsClient listener isolation verification |

---

## Findings Summary

### CRITICAL (P0)
_None found_

### HIGH (P1)
_None found_

### MEDIUM (P2)

| ID | Location | Status | Issue |
|----|----------|--------|-------|
| M6-F001 | `online_game_notifier.dart` | ✅ FIXED | `draw:declined` used hardcoded string; moved to `WsEvents.drawDeclined` |
| M6-F004 | 4 social/state files | ✅ FIXED | `copyWith` pattern did not preserve `errorMessage`/`actionMessage`; WS event handlers could silently clear user-visible errors |
| M6-F005 | `tournament_detail_notifier.dart` | ✅ FIXED | `tournament:game_started` WS event was defined but never subscribed to; game-live state not propagated to tournament view |

### LOW (P3)

| ID | Location | Status | Issue |
|----|----------|--------|-------|
| M6-F002 | `core/config/app_config.dart` | 🔵 ACCEPTED | `static AppConfig current = production` is mutable — acceptable risk |
| M6-F003 | `challenges_notifier.dart` | 🔵 ACCEPTED | Hardcoded `color: 'white'` is cosmetic only; authoritative color set on `game:init` |
| M6-F006 | `ws_events.dart`, `online_game_notifier.dart` | 🔵 ACCEPTED | `WsEvents.gameRematch` stub — defined but never sent (rematch feature deferred to M7) |

---

## Phase E — Test Coverage Gaps

**Completed**: 2026-09-24  
**New Tests**: 43 (across 4 targeted suites)

| Group | Tests | Target File | Description |
|-------|-------|-------------|-------------|
| E1 | 11 | `games_repository.dart` | History parsing, pagination, PGN string/JSON, moves, snake_case fallbacks, error propagation |
| E2 | 11 | `auth_repository.dart` | Login, register, logout local storage resilience, duplicate errors, token persistence |
| E3 | 16 | `matchmaking_notifier.dart` | Queue states (idle, searching, waitingInRoom, matched, error), room ops, dispose cleanup |
| E4 | 5 | `tournament_detail_notifier.dart` | `tournament:game_started` (M6-F005) handling, tournament ID filtering, refresh idempotency, malformed resilience |

---

## Findings Summary

### CRITICAL (P0)
_None found_

### HIGH (P1)
_None found_

### MEDIUM (P2)

| ID | Location | Status | Issue |
|----|----------|--------|-------|
| M6-F001 | `online_game_notifier.dart` | ✅ FIXED | `draw:declined` used hardcoded string; moved to `WsEvents.drawDeclined` |
| M6-F004 | 4 social/state files | ✅ FIXED | `copyWith` pattern did not preserve `errorMessage`/`actionMessage`; WS event handlers could silently clear user-visible errors |
| M6-F005 | `tournament_detail_notifier.dart` | ✅ FIXED | `tournament:game_started` WS event was defined but never subscribed to; game-live state not propagated to tournament view |

### LOW (P3)

| ID | Location | Status | Issue |
|----|----------|--------|-------|
| M6-F002 | `core/config/app_config.dart` | 🔵 ACCEPTED | `static AppConfig current = production` is mutable — acceptable risk |
| M6-F003 | `challenges_notifier.dart` | 🔵 ACCEPTED | Hardcoded `color: 'white'` is cosmetic only; authoritative color set on `game:init` |
| M6-F006 | `ws_events.dart`, `online_game_notifier.dart` | 🔵 ACCEPTED | `WsEvents.gameRematch` stub — defined but never sent (rematch feature deferred to M7) |

---

## Test Progress

| Phase | New Tests | Running Total |
|-------|-----------|---------------|
| Baseline (M0–M5) | — | 120 |
| Phase B (WS Resilience) | +13 | 133 |
| Phase C (Error Handling) | +17 | 150 |
| Phase D (Protocol Contract) | +84 | 234 |
| Phase E (Coverage Gaps) | +43 | 277 |

---

## Phases

- [x] Phase A — Architecture Audit
- [x] Phase B — WebSocket Resilience Testing
- [x] Phase C — Error Handling Hardening (copyWith fixes)
- [x] Phase D — Protocol Contract Audit
- [x] Phase E — Test Coverage Gaps
- [ ] **Phase F — Build Validation + README** ← NEXT

