# Native Stockfish Engine Integration (Phase M1)

## 1. Engine Overview
- **Engine**: Stockfish Chess Engine (Stockfish 18 C++ core with NNUE architecture).
- **License**: GNU General Public License v3.0 (GPLv3).
- **Source**: Native C++ source compiled via Android NDK / iOS Clang through `stockfish_flutter_plus: ^1.0.1`.
- **License Compliance**: See [LICENSE.md](file:///D:/Projects/Chess/docs/mobile/stockfish/LICENSE.md).

---

## 2. Native Compilation & Platform Architectures

### Android
- **Toolchain**: Android NDK (Clang C++20).
- **Target ABIs**:
  - `arm64-v8a` (Primary target for modern Android hardware).
  - `armeabi-v7a` (Legacy 32-bit ARM).
  - `x86_64` (Modern 64-bit Android Studio emulator).
- **Page Size**: Configured for Android 15+ 16 KB page-size alignment (`-Wl,-z,max-page-size=16384`).
- **Linking**: Dynamic library (`libstockfish.so`) loaded via `Dart FFI` (`DynamicLibrary.open`).

### iOS
- **Toolchain**: Apple Clang / Xcode / CocoaPods framework.
- **Target Architectures**: `arm64` (iOS devices and Apple Silicon Simulator).
- **Build Note**: Because development is conducted on a Windows host, the iOS binary (`flutter build ios --no-codesign`) must be compiled on a macOS workstation with Xcode.

---

## 3. Dart FFI Boundary & UCI Communication

### Narrow C ABI
Stockfish C++ operates as an independent engine thread communicating via standard C stream pipes:
- `stdin`: Command ingestion (serialized UCI string commands).
- `stdout`: Asynchronous broadcast stream emitting engine tokens (`uciok`, `readyok`, `info ...`, `bestmove ...`).

### UCI Command Serialization
To prevent the engine state corruption previously observed with overlapping UCI commands, all commands sent to the engine are strictly serialized through an internal FIFO command queue:
```
uci -> await uciok
isready -> await readyok
ucinewgame -> await readyok
position fen <FEN> [moves <m1> <m2> ...]
go depth <D> movetime <T> -> await bestmove
```

### Search Cancellation
When the user changes positions, navigates moves, or exits the screen during an active search:
1. `stop` is issued immediately to the engine.
2. The current search future safely awaits `bestmove` termination.
3. Stale responses are discarded so old results never overwrite newly navigated positions.

---

## 4. Engine Lifecycle & Threading Model

```
Flutter UI Thread
    │  (Remains 100% responsive, never blocked by engine search)
    ▼
EngineService / Riverpod Notifier
    │
    ▼
NativeStockfishService
    │  (FIFO command queue, state machine, UCI parser)
    ▼
Dart FFI Bridge
    │
    ▼
Native Stockfish C++ Thread (NDK / Clang)
    │  (Alpha-beta search, NNUE evaluation)
    ▼
stdout stream -> UI StreamSubscription
```

### Lifecycle States (`EngineState`)
- `uninitialized`: Engine has not loaded the native binary.
- `initializing`: Loading dynamic library and running UCI handshake.
- `ready`: Engine is idle and ready for commands or positions.
- `searching`: Engine is actively calculating moves or streaming analysis lines.
- `stopping`: Cancellation signal sent, awaiting `bestmove` cleanup.
- `error`: Native error or crash encountered.
- `disposed`: Native threads released and memory freed.

### App Lifecycle Policy
- When the mobile app transitions to `AppLifecycleState.paused` or `AppLifecycleState.inactive`, ongoing searches are automatically halted via `stopSearch()` to prevent CPU and battery drain.
- Engine instances are scoped per screen and automatically disposed when `ComputerScreen` or `AnalysisScreen` is popped.

---

## 5. Difficulty Mapping (Computer Mode)

Aligned with the existing web platform:

| Level | Name | Elo (Approx) | Skill Level (UCI) | Depth | Move Time |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Beginner | ~800 | 1 | 2 | 250 ms |
| **2** | Casual | ~1100 | 4 | 4 | 350 ms |
| **3** | Intermediate | ~1400 | 8 | 6 | 500 ms |
| **4** | Advanced | ~1700 | 11 | 8 | 650 ms |
| **5** | Expert | ~2000 | 14 | 11 | 800 ms |
| **6** | Master | ~2200 | 17 | 14 | 1000 ms |
| **7** | Grandmaster | ~2400 | 19 | 18 | 1400 ms |
| **8** | Maximum Stockfish | ~2700 | 20 | 22 | 2000 ms |

---

## 6. Strict Fair-Play Isolation

The system enforces architectural isolation across game modes:

1. **Online Games (`OnlineLobbyScreen`, `OnlineGameScreen`)**:
   - Engine is **NEVER** initialized or imported.
   - Zero engine subprocesses or FFI calls.
   - Server remains 100% authoritative over moves, clocks, and game state.

2. **Local 2-Player (`LocalGameScreen`)**:
   - Engine is **NEVER** initialized.
   - Offline, two-human play on the same physical device.

3. **Computer Mode (`ComputerScreen`)**:
   - Engine is active **ONLY** on the computer's turn.
   - **ZERO** EvalBar, centipawn score, mate score, Multi-PV lines, best-move arrows, or engine suggestions are rendered to the human player.
   - Only a generic `"Computer thinking..."` indicator is displayed.

4. **Analysis Mode (`AnalysisScreen`)**:
   - Engine provides full real-time evaluation: EvalBar, centipawn/mate score, depth indicator, and configurable Multi-PV (1, 2, 3) lines.
