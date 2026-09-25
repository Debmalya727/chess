# M7 Phase 3 — Mobile Rematch Client Report

**Milestone**: M7 — Social Polish & Post-Game Lifecycle  
**Phase**: Phase 3 — Mobile Rematch Client  
**Status**: COMPLETE / VERIFIED  
**Date**: 2026-09-25  
**Platform**: Android / Flutter Mobile (Windows host)  

---

## 1. Executive Summary

M7 Phase 3 implements the Flutter mobile rematch client conforming strictly to the authoritative Phase 2 backend contract and Phase 1 architecture design.

Key achievements:
- **Zero Protocol Inventions**: Reused exact Phase 2 event names (`game:rematch`, `game:rematch:respond`, `game:rematch:cancel`, `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`).
- **Zero Server/Web Changes**: `apps/server/**`, `apps/web/**`, and `packages/**` were left completely untouched.
- **Server Authority**: Mobile client deterministically defers all game properties (`gameId`, `roomCode`, colors, FEN, clocks, ratings) to backend `game:init` payloads.
- **Tournament Rematch Exclusion**: Complete UI and state suppression for games with `tournamentId != null`.
- **Authoritative Game 2 Transition**: `OnlineGameNotifier` cleans up Game 1 and mounts Game 2 seamlessly upon receipt of authoritative `game:init`.
- **Test Suite**: 27 new tests added (23 unit, 4 widget); full Flutter test suite of 304 tests passed with 0 failures and 0 skips.
- **Static Analysis**: `flutter analyze --no-pub` reported 0 issues.
- **Android Packaging**: Debug APK built successfully (`381,826,162` bytes) containing native Stockfish 18 binaries.

---

## 2. Protocol Integration

The mobile protocol layer in `apps/mobile/lib/core/protocol/` was updated with the centralized event constants and error codes:

### 2.1 WebSocket Events (`ws_events.dart`)
```dart
// Client -> Server
static const String gameRematch = 'game:rematch';
static const String rematchRespond = 'game:rematch:respond';
static const String rematchCancel = 'game:rematch:cancel';

// Server -> Client
static const String rematchOffered = 'rematch:offered';
static const String rematchDeclined = 'rematch:declined';
static const String rematchCancelled = 'rematch:cancelled';
```

### 2.2 Error Codes (`error_codes.dart`)
```dart
static const String gameNotFinished = 'GAME_NOT_FINISHED';
static const String tournamentRematchNotAllowed = 'TOURNAMENT_REMATCH_NOT_ALLOWED';
static const String rematchAlreadyPending = 'REMATCH_ALREADY_PENDING';
static const String rematchAlreadyResolved = 'REMATCH_ALREADY_RESOLVED';
static const String rematchNotFound = 'REMATCH_NOT_FOUND';
static const String rematchExpired = 'REMATCH_EXPIRED';
```

---

## 3. State & Model Architecture

### 3.1 `OnlineGameState` (`online_game_state.dart`)
Minimal extension without storing local authoritative data:
- `rematchOfferedByMe` (`bool`): Indicates the local player offered a rematch and is waiting.
- `rematchOfferedToMe` (`bool`): Indicates an incoming rematch offer from the opponent.
- `rematchOfferedByUsername` (`String?`): Opponent's username for displaying the incoming offer card.
- `isRematchLoading` (`bool`): Loading state for rematch action buttons.
- `tournamentId` (`String?`): Preserved from authoritative payload to identify tournament games.
- `bool get isTournamentGame => tournamentId != null && tournamentId!.isNotEmpty;`: Deterministic getter to suppress rematch controls.

### 3.2 Invariants Preserved
- The client does not invent or track ratings, results, colors, or game clocks.
- In `copyWith`, `rematchOfferedByMe`, `rematchOfferedToMe`, `rematchOfferedByUsername`, `isRematchLoading`, and `tournamentId` are preserved or cleanly updated.

---

## 4. State Management (`OnlineGameNotifier`)

### 4.1 Actions & Payloads
All actions dispatch minimal envelopes containing only server-expected fields:
- **`offerRematch()`**:
  - Guard: `if (state == null || !state!.isEnded || state!.isTournamentGame || state!.rematchOfferedByMe) return;`
  - Sets: `rematchOfferedByMe = true`, `isRematchLoading = true`.
  - Dispatches: `WsEvents.gameRematch` with payload `{'gameId': state!.gameId}`.
- **`respondRematch(bool accept)`**:
  - Guard: `if (state == null || !state!.isEnded) return;`
  - If `accept`: sets `isRematchLoading = true`.
  - If `!accept`: clears `rematchOfferedToMe = false`.
  - Dispatches: `WsEvents.rematchRespond` with payload `{'gameId': state!.gameId, 'accept': accept}`.
- **`cancelRematch()`**:
  - Guard: `if (state == null || !state!.isEnded || !state!.rematchOfferedByMe) return;`
  - Sets: `rematchOfferedByMe = false`, `isRematchLoading = false`.
  - Dispatches: `WsEvents.rematchCancel` with payload `{'gameId': state!.gameId}`.

### 4.2 Server Event Subscriptions
- **`rematch:offered`**:
  - Filters by `gameId == state!.gameId`.
  - If `offeredBy != currentUserId`: sets `rematchOfferedToMe = true`, captures `offeredByUsername`, sets `isRematchLoading = false`.
  - If `offeredBy == currentUserId`: sets `rematchOfferedByMe = true`, sets `isRematchLoading = false`.
- **`rematch:declined`**:
  - Filters by `gameId == state!.gameId`.
  - Clears `rematchOfferedByMe = false`, `rematchOfferedToMe = false`, `isRematchLoading = false`.
- **`rematch:cancelled`**:
  - Filters by `gameId == state!.gameId`.
  - Clears pending states and exposes error message:
    - `timeout` → "Rematch offer expired."
    - `opponent_disconnected` → "Opponent disconnected."
    - `cancelled_by_player` → "Rematch offer was cancelled."
- **`error`**:
  - Listens for `REMATCH_*`, `GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`.
  - Clears `isRematchLoading = false`, `rematchOfferedByMe = false`, and sets `errorMessage`.

### 4.3 Clean Transition to Game 2 via `game:init`
- Subscription condition updated:
  ```dart
  if (state == null || state!.gameId == gameId || state!.isEnded) {
    initializeGame(payload);
  }
  ```
- Reuses the existing `initializeGame` method:
  - Replaces `gameId`, `roomCode`, `fen`, `turn`, `myColor`, `moves`, `clock`, and `stateVersion`.
  - Resets all rematch flags (`rematchOfferedByMe = false`, `rematchOfferedToMe = false`, etc.).
  - Re-registers stateVersion tracking via `wsClient.updateStateVersion(gameId, stateVersion)`.
  - Transitions cleanly from `isEnded = true` in Game 1 to `isEnded = false` in Game 2.

---

## 5. UI Presentation (`OnlineGameScreen`)

Located in `apps/mobile/lib/features/online/presentation/online_game_screen.dart`:
1. **Game Over Card**:
   - Displays result and termination reason.
   - For tournament games (`isTournamentGame == true`): Renders only the "Lobby" button; completely omits all rematch controls.
2. **Post-Game Rematch Controls** (non-tournament only):
   - **Initial Ended State**: Renders green "Rematch" button (`rematch_button`) alongside "Lobby" button (`lobby_button`).
   - **Waiting State** (`rematchOfferedByMe == true`): Displays spinner with text "Rematch offered... Waiting for opponent" and a red "Cancel" button (`rematch_cancel_button`).
   - **Incoming Offer** (`rematchOfferedToMe == true`): Displays prompt `"[Opponent] offered a rematch!"` with red "Decline" (`rematch_decline_button`) and green "Accept" (`rematch_accept_button`) buttons.
   - **Loading State**: Displays inline `CircularProgressIndicator` while request is in flight.

---

## 6. Verification Results

### 6.1 Targeted Test Suite
- **Unit Suite** (`apps/mobile/test/unit/m7_rematch_mobile_test.dart`): 23 tests
  - A. Protocol Constants Verification (2 tests)
  - B. Notifier Actions & Minimal Payloads (4 tests)
  - C. Incoming Server Rematch Events (7 tests)
  - D. Authoritative `game:init` Transition to Game 2 (1 test)
  - E. Duplicate Action Prevention and Guards (3 tests)
  - F. Tournament Rematch Exclusion (3 tests)
  - G. Lifecycle & Reconnect Safety (2 tests)
- **Widget Suite** (`apps/mobile/test/widget/m7_rematch_screen_test.dart`): 4 tests
  - Standard game renders Rematch and Lobby buttons (1 test)
  - Waiting state and Cancel button display (1 test)
  - Incoming offer Accept and Decline buttons (1 test)
  - Tournament games suppress rematch controls completely (1 test)
- **Targeted Result**: **27 / 27 PASS (100%)**

### 6.2 Full Flutter Test Suite
```bash
flutter test --no-pub
```
- **Passed**: 304
- **Failed**: 0
- **Skipped**: 0
- **Total**: 304 / 304 passing (100%)

### 6.3 Static Analysis
```bash
flutter analyze --no-pub
```
- **Result**: PASS (0 issues found, ran in 3.1s)

### 6.4 Android Build Validation
```bash
$env:JAVA_HOME='D:\JDK17'; flutter build apk --debug
```
- **Result**: PASS (`√ Built build\app\outputs\flutter-apk\app-debug.apk` in 79.5s)
- **Artifact Path**: `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
- **Artifact Size**: `381,826,162` bytes (~364.14 MB)
- **Native Stockfish Engine**: Packaged for arm64-v8a, armeabi-v7a, x86_64, x86

---

## 7. Scope Compliance

```bash
git status --short
```
- **Modified/Added for M7 Phase 3**:
  - `apps/mobile/lib/core/protocol/error_codes.dart`
  - `apps/mobile/lib/core/protocol/ws_events.dart`
  - `apps/mobile/lib/features/online/models/online_game_state.dart`
  - `apps/mobile/lib/features/online/presentation/online_game_screen.dart`
  - `apps/mobile/lib/features/online/state/online_game_notifier.dart`
  - `apps/mobile/test/unit/m7_rematch_mobile_test.dart`
  - `apps/mobile/test/widget/m7_rematch_screen_test.dart`
  - `docs/mobile/m7/M7_PHASE3_MOBILE_REPORT.md`
  - `docs/mobile/m7/M7_PROGRESS.md`
  - `docs/mobile/m7/M7_FINDINGS.md`
- **Zero changes** to:
  - `apps/server/**`
  - `apps/web/**`
  - `packages/**`

---

## 8. Limitations & Deferred Items

1. **Web Client Rematch**:
   - Pending implementation in Phase 4 (`apps/web/**`).
2. **Physical Device Testing**:
   - Android APK built and verified via Gradle; physical device testing not executed.
3. **iOS Testing**:
   - iOS build not executed on Windows environment.
