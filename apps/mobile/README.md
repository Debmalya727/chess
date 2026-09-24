# Stockfish 18 Chess Mobile Client (Phase M0)

A dedicated, native Flutter mobile client for the **Stockfish 18 Online Chess Platform**, targeting **Android** and **iOS**.

This application is built from the ground up as a native mobile experience paired with the certified Fastify production backend. It is **NOT** a web wrapper, **NOT** a PWA shell, and **NOT** a second backend.

---

## Production System & Authority Architecture

The backend is **SERVER-AUTHORITATIVE**. The mobile client does **not** make authoritative decisions regarding game legality, clocks, results, tournament standings, or ratings.

| Layer | Technology | Endpoint / Authority |
|---|---|---|
| **Production Backend** | Render (Fastify 5 Node.js) | `https://chess-api-hszp.onrender.com/` |
| **Production WebSocket**| Fastify WebSocket Engine | `wss://chess-api-hszp.onrender.com/ws` |
| **Database** | TiDB Cloud (Serverless MySQL) | Authoritative persistence |
| **Distributed Cache** | Upstash Redis | Pub/Sub, Matchmaking queue, Locks, Presence |
| **Mobile Client** | Flutter 3.44.4 (Dart 3.12.2) | Client presentation, gestures, local pass-and-play |

---

## Phase M0 Foundation Highlights

1. **State Management:** Riverpod (`flutter_riverpod`) with explicit domain state boundaries (`AuthState`, `WsConnectionState`, `ChessBoardState`).
2. **Navigation:** Declarative routing using `go_router` with a persistent `ShellRoute` bottom navigation bar and mobile-native modals.
3. **Secure Platform Storage:** `flutter_secure_storage` storing JWT tokens in Android Keystore / iOS Keychain.
4. **WebSocket Foundation & StateVersion:** Dedicated `WsClient` with exponential backoff, ping/pong heartbeats, JWT authentication handshake, and strict `stateVersion` reconciliation to discard stale events (`incomingVersion <= currentVersion`).
5. **Fair-Play Invariant:**
   - **Online Mode:** Zero EvalBars, zero engine suggestions, zero best-move arrows during human turns.
   - **Local 2P Mode:** Zero engine assistance.
   - **Computer Mode:** Stockfish operates solely on the computer's turn; search info is hidden from the player.
   - **Analysis Mode:** Dedicated sandbox where engine evaluation, depth, and variations are intentionally permitted.
6. **Chessboard Engine & Renderer:** Responsive 1:1 aspect ratio board supporting phone portrait/landscape and tablet split layouts, tap-to-move, pawn promotion dialog, move history notation, and flip board controls.

---

## Directory Structure

```
apps/mobile/
├── android/                 # Android native project configuration
├── ios/                     # iOS native project configuration
├── lib/
│   ├── main.dart            # Application bootstrap with ProviderScope & system UI styling
│   ├── app/
│   │   ├── app.dart         # Root MaterialApp.router
│   │   ├── router.dart      # GoRouter configuration with ShellRoute BottomNavigationBar
│   │   └── theme/           # AppColors and AppTheme (Dark/glass design tokens)
│   ├── core/
│   │   ├── config/          # AppConfig (Environment, URLs, Timeouts)
│   │   ├── network/         # ApiClient (HTTP Bearer auth, structured exceptions)
│   │   ├── storage/         # SecureStorageService & InMemoryStorageService
│   │   ├── websocket/       # WsClient & WsConnectionState with backoff & versioning
│   │   └── protocol/        # WsEvents, ErrorCodes, UserModel, GameModels
│   ├── features/
│   │   ├── auth/            # AuthRepository, AuthNotifier, LoginScreen
│   │   ├── chess/           # ChessBoardWidget, ChessClockWidget, PromotionDialog, ChessBoardState
│   │   ├── home/            # HomeScreen dashboard
│   │   ├── local/           # LocalGameScreen (Offline pass-and-play)
│   │   ├── online/          # OnlineLobbyScreen (Matchmaking pools & server authority)
│   │   ├── computer/        # ComputerScreen (Stockfish levels 1-8)
│   │   ├── analysis/        # AnalysisScreen (Stockfish sandbox)
│   │   ├── tournaments/     # TournamentsScreen (Arena & Swiss)
│   │   ├── social/          # SocialScreen (Friends, Challenges, Leaderboard)
│   │   └── profile/         # ProfileScreen (User stats, environment configuration)
│   └── shared/
│       └── widgets/         # AppButton, ConnectionBadge
└── test/
    ├── unit/                # Protocol mapping, WS client, stateVersion, Auth, Chess logic
    └── widget/              # ChessBoardWidget, HomeScreen tests
```

---

## Quick Start & Verification

### Prerequisites
- Flutter SDK `^3.44.0` (Dart `^3.12.0`)
- Android Studio / Android SDK (for Android builds)
- Xcode (for iOS builds, macOS only)

### Commands

```bash
cd apps/mobile

# Install dependencies
flutter pub get

# Run static analysis
flutter analyze

# Execute test suite
flutter test

# Build Android debug APK
flutter build apk --debug
```
