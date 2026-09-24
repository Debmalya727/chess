# Mobile Foundation & Production Architecture (Phase M0)

## 1. System Topology & Architecture

The mobile application is a native client built using Flutter 3.44.4 (Dart 3.12.2) that integrates with the existing production Stockfish 18 Chess platform.

```
┌─────────────────────────────────────────────────────────┐
│              Dedicated Mobile Application               │
│                  (Flutter Android/iOS)                  │
└───────────────┬─────────────────────────┬───────────────┘
                │ HTTPS (REST)            │ WSS (Fastify WebSocket)
                ▼                         ▼
┌─────────────────────────────────────────────────────────┐
│               Render Fastify 5 Backend Server           │
│   (Game Authority, Matchmaking, Tournament Engine)       │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│        TiDB Cloud         │ │       Upstash Redis       │
│  (Persistent MySQL DB)    │ │ (Distributed Coordination)│
└───────────────────────────┘ └───────────────────────────┘
```

---

## 2. Server Authority & State Reconciliation

### The Sacred Invariant
The server is strictly authoritative. The mobile client never decides:
- Move legality for online games
- Clock times
- Results (checkmate, draw, resignation outcomes)
- Tournament points or standings
- Ratings or Elo adjustments

### stateVersion Reconciliation
The Fastify server increments an integer `stateVersion` with every authoritative game state mutation.
1. When submitting a move:
   ```dart
   final payload = MoveSubmitPayload(
     gameId: gameId,
     from: 'e2',
     to: 'e4',
     clientMoveId: 'uuid',
     expectedStateVersion: currentStateVersion,
   );
   wsClient.send(WsEvents.moveSubmit, payload.toJson());
   ```
2. When receiving `game:move:accepted` or `game:init`:
   ```dart
   final incomingVersion = message.payload['stateVersion'] as int?;
   if (incomingVersion != null) {
     if (incomingVersion <= currentStateVersion) {
       // Stale or duplicate packet — drop immediately
       return;
     }
     currentStateVersion = incomingVersion;
   }
   ```

---

## 3. Protocol Mapping Layer

The Dart models in `lib/core/protocol/` mirror `packages/protocol`:

| Protocol Definition | Mobile Dart Mapping | Description |
|---|---|---|
| `packages/protocol/src/events.js` | `WsEvents` | Canonical WebSocket event names |
| `packages/protocol/src/errors.js` | `ErrorCodes` | Standardized error strings |
| `UserModel` | `UserModel` | User profile with rating and auth status |
| `GameInitPayload` | `GameInitPayload` | Full game state initialization |
| `MoveSubmitPayload` | `MoveSubmitPayload` | Client move submission envelope |
| `MoveAcceptedPayload` | `MoveAcceptedPayload` | Authoritative move acceptance with stateVersion |
| `ClockStateModel` | `ClockStateModel` | Clock state synchronization |
| `ClockTickPayload` | `ClockTickPayload` | Low-frequency clock heartbeat |
| `GameEndedPayload` | `GameEndedPayload` | Terminal game results and termination reasons |

---

## 4. Reconnection & Offline Strategy

Mobile networks change state dynamically (Wi-Fi to cellular, tunnel drops, screen sleep).

1. **Exponential Backoff:**
   ```dart
   delay = Duration(seconds: min(30, pow(2, min(attempts - 1, 5))), milliseconds: randomJitter);
   ```
2. **Re-authentication on Reconnect:**
   Upon connection establishment, the client automatically delivers `{ event: 'auth:token', payload: { token: ... } }`.
3. **State Resynchronization:**
   Upon rejoining the active game room, the server emits `game:init` containing the authoritative `stateVersion`, current `fen`, moves history, and clock state. The client reconciles local presentation without guessing.

---

## 5. Fair-Play Enforcement

| Mode | Engine Allowed? | Invariant Enforced |
|---|---|---|
| **Online Matchmaking** | ❌ NO | Zero EvalBars, zero eval numbers, zero arrows, zero hints |
| **Local 2-Player** | ❌ NO | Pure offline human pass-and-play |
| **Computer Mode** | ⚠️ Computer turn only | Stockfish calculates only for its own move; search data is hidden |
| **Analysis Mode** | ✅ YES | Intentional analysis sandbox with depth, eval, and PV lines |

---

## 6. Secure Platform Storage

- **Android:** Android Keystore with Hardware-backed security via `flutter_secure_storage`.
- **iOS:** Keychain Services with `first_unlock` accessibility.
- In-memory mock storage `InMemoryStorageService` is provided for test suites.
- No plain passwords or JWT secrets are logged or written to unencrypted `SharedPreferences`.

---

## 7. Verification Matrix

| Verification Step | Target / Method | Result |
|---|---|---|
| Repository Audit | Inspect server, protocol, routes, events | Completed |
| Flutter Scaffold | Android & iOS platforms in `apps/mobile/` | Completed |
| Protocol Mapping | 100% mirror of events and errors | Verified by unit tests |
| Riverpod State | AuthNotifier & WsClient state machines | Verified by unit tests |
| Chess Board State | FEN parser, move executor, promotion | Verified by unit tests |
| Widget Rendering | ChessBoardWidget & HomeScreen | Verified by widget tests |
| Static Analysis | `flutter analyze` | 0 issues found |
| Test Execution | `flutter test` | 22 / 22 tests passed |
| Production Scope | Existing web and server code | 0 modifications |

---

## 8. Phase M1: Native Stockfish Engine Integration

Phase M1 integrates a REAL native Stockfish 18 C++ engine into `apps/mobile/` via Dart FFI and Android NDK compilation:

```
Flutter UI (ComputerScreen / AnalysisScreen)
              │
              ▼
    EngineService / Riverpod
              │
              ▼
   NativeStockfishService
   (Serialized UCI Queue & State Machine)
              │
              ▼
           Dart FFI
              │
              ▼
   Native Stockfish C++ Thread
   (Android NDK libstockfish.so / iOS clang)
```

- **Fair Play Separation**: Computer Mode hides all evaluation/arrows from the human; Online and Local 2P modes NEVER instantiate the engine.
- **Computer Mode**: Stockfish difficulty levels 1–8 mapped to UCI `Skill Level`, depth, and move time.
- **Analysis Mode**: Real-time evaluation stream, `EvalBarWidget`, Multi-PV (1–3 lines), and FEN navigation.
- **Documentation**: See [STOCKFISH.md](file:///D:/Projects/Chess/docs/mobile/STOCKFISH.md) and [LICENSE.md](file:///D:/Projects/Chess/docs/mobile/stockfish/LICENSE.md).
