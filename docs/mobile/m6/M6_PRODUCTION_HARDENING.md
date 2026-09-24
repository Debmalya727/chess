# M6 — Production Hardening Technical Specification

**Branch**: `mobile/phase-m6-production-hardening`
**Status**: COMPLETE
**Milestone**: M6 Production Hardening
**Target Package**: `apps/mobile`

---

## 1. Executive Summary

Milestone M6 focused on hardening the Flutter mobile chess client for production readiness. Across six systematic phases (A through F), the codebase was audited, protocol contracts were mathematically verified, error-handling patterns were stabilized against state loss, critical test coverage gaps were closed, and full packaging was validated.

Key achievements:
- **Zero Analyzer Issues**: Static analysis verified clean across all feature libraries, core networking, protocol models, and test suites.
- **277 Tests (100% Passing)**: Grew automated test suite from 120 (M0–M5 baseline) to 277 tests (+157 new tests).
- **Protocol Contract Parity**: 1:1 mapping between backend WebSocket events (44 events) and error codes (33 codes) verified by automated contract tests.
- **Defect Remediation**: Identified and resolved 3 medium-severity defects (M6-F001, M6-F004, M6-F005) with zero architectural disruption.
- **Production Build Packaging**: Clean Android debug APK build packaging Stockfish 18 C++ native engine binaries across 4 Android ABIs.

---

## 2. Hardening Pillars & Implementation Details

### 2.1 WebSocket Resilience & State Version Isolation (Phase B)
The multiplayer engine relies on monotonic version increments (`stateVersion`) sent by the authoritative server on move updates.
- **Multi-Game Version Isolation**: Verified that independent games reset version counters without colliding or rejecting initial state.
- **Stale Event Rejection**: Packets received out-of-order or with `stateVersion <= current.stateVersion` are rejected to prevent replay attacks or UI desynchronization.
- **Reconnect Synchronization**: `game:init` payload replaces stale state cleanly upon reconnection.
- **Move Rejection Invariance**: Rejected moves (`move:rejected`) preserve stateVersion without causing desync loops.
- **Listener Isolation**: All `WsClient` subscriptions return cleanup disposers, preventing memory leaks and duplicate handler execution.

### 2.2 Error Handling & State Immutability (Phase C)
Prior to M6, certain state classes in `social/state/` used naive `copyWith` methods:
```dart
// Vulnerable pattern:
errorMessage: errorMessage ?? this.errorMessage
```
Under this pattern, passing `errorMessage: null` was a no-op that could never clear an error. Conversely, omission of the parameter during normal event processing could fail to clear transient notifications or accidentally preserve stale errors across state updates.

**Fix Applied (M6-F004)**: Standardized sentinel clear flags across:
- `FriendsState`: `bool clearError = false, bool clearActionMessage = false`
- `ChallengesState`: `bool clearError = false, bool clearActionMessage = false`
- `LeaderboardState`: `bool clearError = false`
- `PlayerProfileState`: `bool clearError = false, bool clearActionMessage = false`

Implemented logic:
```dart
errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
actionMessage: clearActionMessage ? null : (actionMessage ?? this.actionMessage),
```
Automated unit tests in `m6_state_copywith_test.dart` (17 tests) verify that normal updates preserve active errors, while explicit `clearError: true` / `clearActionMessage: true` cleanly reset them.

### 2.3 Protocol Contract Audit (Phase D)
Mobile and backend protocol parity was exhaustively audited and locked down with regression suites in `m6_protocol_contract_test.dart` (84 tests):
1. **WsEvents Audit (44 events)**:
   - System/Auth: `connect`, `disconnect`, `error`, `ping`, `pong`, `auth:token`
   - Queue & Matchmaking: `queue:join`, `queue:leave`, `queue:status`, `queue:matched`
   - Room: `room:create`, `room:join`, `room:leave`, `room:ready`
   - Game Lifecycle: `game:init`, `game:start`, `game:move`, `game:state`, `game:end`, `game:resign`, `game:abort`, `game:timeout`
   - Draw Flow: `draw:offer`, `draw:accept`, `draw:decline`, `draw:declined`, `draw:cancel`
   - Chat: `chat:message`, `chat:history`
   - Reconnect: `game:sync`, `game:reconnected`
   - Social: `friends:status`, `challenge:received`, `challenge:accepted`, `challenge:declined`, `challenge:cancelled`
   - Tournament: `tournament:join`, `tournament:leave`, `tournament:updated`, `tournament:started`, `tournament:round_started`, `tournament:round_completed`, `tournament:pairing_created`, `tournament:game_started`, `tournament:standings_updated`, `tournament:finished`, `tournament:cancelled`
2. **ErrorCodes Audit (33 codes)**:
   - Verified exact string matching for all 33 domain error codes (`AUTH_REQUIRED`, `INVALID_TOKEN`, `GAME_NOT_FOUND`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `FAIR_PLAY_VIOLATION`, etc.).
3. **M6-F001 Fix**: Replaced string literal `'draw:declined'` in `online_game_notifier.dart` with `WsEvents.drawDeclined`.
4. **M6-F005 Fix**: Subscribed `TournamentDetailNotifier` to `WsEvents.tournamentGameStarted` to trigger live pairing refresh when a tournament game starts.

### 2.4 Coverage Gap Remediation (Phase E)
Targeted coverage suites added 43 tests closing all identified gaps:
- **`GamesRepository` (11 tests)**:
  - Full pagination parsing, PGN extraction (JSON vs string), moves sequence loading, snake_case fallback compatibility, 404 moves fallback, and API error propagation.
- **`AuthRepository` (11 tests)**:
  - Login/register flows, token and user profile secure persistence, logout resilience (ensuring local storage is wiped even if server drops connection), duplicate registration errors, and cached profile decoding with corruption fallback.
- **`MatchmakingNotifier` (16 tests)**:
  - Strict verification of the finite state machine (`idle` -> `searching` -> `waitingInRoom` -> `matched` -> `error`).
  - Queue joining, leaving, range expansion updates, room creation, uppercase room code sanitization, and clean teardown on `dispose()`.
- **`TournamentDetailNotifier` (5 tests)**:
  - M6-F005 regression coverage for `tournament:game_started`.
  - Tournament ID filtering (unrelated tournament events safely discarded).
  - Malformed payload resilience and idempotent event handling.

---

## 3. Defect Log & Resolution Summary

| ID | Severity | File | Issue Description | Resolution | Status |
|----|----------|------|-------------------|------------|--------|
| **M6-F001** | Medium | `online_game_notifier.dart` | Hardcoded `'draw:declined'` string bypasses constant mapping | Added `WsEvents.drawDeclined` constant; updated notifier call site | ✅ FIXED |
| **M6-F002** | Low | `app_config.dart` | `AppConfig.current` is mutable | Accepted for development runtime config swapping | 🔵 ACCEPTED |
| **M6-F003** | Low | `challenges_notifier.dart` | Color preference hardcoded to `'white'` | Cosmetic only; authoritative color assigned by server on `game:init` | 🔵 ACCEPTED |
| **M6-F004** | Medium | 4 social state files | `copyWith` did not preserve error messages | Standardized `clearError: false` sentinel flag pattern | ✅ FIXED |
| **M6-F005** | Medium | `tournament_detail_notifier.dart` | `tournament:game_started` defined but not subscribed | Added WebSocket listener to trigger silent refresh of live pairings | ✅ FIXED |
| **M6-F006** | Low | `ws_events.dart`, `online_game_notifier.dart` | `WsEvents.gameRematch` stub defined but never emitted | Rematch flow deferred to M7 feature roadmap | 🔵 ACCEPTED |

---

## 4. Test Catalog

| Test File | Category | Tests | Description |
|-----------|----------|-------|-------------|
| `m6_ws_resilience_test.dart` | Unit / Resilience | 13 | Multi-game stateVersion isolation, reconnect, move rejection |
| `m6_state_copywith_test.dart` | Unit / State | 17 | copyWith error preservation across all social state models |
| `m6_protocol_contract_test.dart` | Unit / Contract | 84 | All 44 WsEvents and 33 ErrorCodes verified; listener cleanup |
| `m6_games_repository_test.dart` | Unit / Repository | 11 | Game history, PGN, moves, rating history, error handling |
| `m6_auth_repository_test.dart` | Unit / Repository | 11 | Authentication, registration, logout resilience, storage |
| `m6_matchmaking_notifier_test.dart` | Unit / State Machine | 16 | Matchmaking FSM transitions, room joining, dispose cleanup |
| `m6_tournament_detail_test.dart` | Unit / State | 5 | Tournament game started event, filtering, refresh idempotency |
| *Baseline Tests (M0–M5)* | Unit / Widget | 120 | Fair-play, Stockfish, Chess engine, UI widget suites |
| **Total** | — | **277** | **100% Passing (0 failures, 0 skipped)** |

---

## 5. Build & Deployment Artifacts

- **Android Debug APK**: `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
  - Size: 381,818,504 bytes (~364.13 MB)
  - Embedded Stockfish 18 C++ Native Engine (arm64-v8a, armeabi-v7a, x86_64, x86)
- **Analyzer Status**: Clean (0 issues)
