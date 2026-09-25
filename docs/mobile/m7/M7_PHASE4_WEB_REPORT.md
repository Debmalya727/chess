# M7 Phase 4 — Web Rematch Client Report

**Milestone**: M7 — Social Polish & Post-Game Lifecycle  
**Phase**: Phase 4 — Web Rematch Client  
**Status**: COMPLETE / VERIFIED  
**Date**: 2026-09-25  
**Platform**: Web Client (React 18 / Vite 4 / Node 22 ES Modules)  

---

## 1. Executive Summary

M7 Phase 4 implements the Web Rematch Client conforming strictly to the authoritative Phase 2 backend contract and Phase 1 architecture design.

Key achievements:
- **Zero Protocol Inventions**: Reused exact Phase 2 backend events (`game:rematch`, `game:rematch:respond`, `game:rematch:cancel`, `rematch:offered`, `rematch:declined`, `rematch:cancelled`, `game:init`).
- **Zero Server/Mobile Changes**: `apps/server/**`, `apps/mobile/**`, and `packages/**` were left completely untouched.
- **Server Authority**: Web client deterministically defers all game properties (`gameId`, `roomCode`, colors, FEN, clocks, ratings) to authoritative backend `game:init` payloads.
- **Tournament Rematch Exclusion**: Complete UI suppression and handler-level guards for games where `activeGame.tournamentId` is present.
- **Authoritative Game 2 Transition**: `OnlineMode` cleans up Game 1 and mounts Game 2 seamlessly upon receipt of `game:init`.
- **Test Suite**: 16 focused web rematch unit & integration tests passing (`apps/web/client/tests/rematch.test.js`).
- **Production Build**: Vite production build PASS in 3.9s.

---

## 2. WebSocket Client Integration (`wsClient.js`)

In `apps/web/client/src/services/wsClient.js`, the existing `ChessWebSocketClient` was extended with helper methods sending exact Phase 2 envelopes:

```javascript
offerRematch(gameId) {
  this.send(WS_EVENTS.GAME_REMATCH, { gameId });
}

respondRematch(gameId, accept) {
  this.send(WS_EVENTS.REMATCH_RESPOND, { gameId, accept });
}

cancelRematch(gameId) {
  this.send(WS_EVENTS.REMATCH_CANCEL, { gameId });
}
```

No client-invented properties (colors, FEN, clocks, room codes, ratings) are sent from the browser.

---

## 3. Web State Architecture (`OnlineMode.jsx`)

### 3.1 State Additions
Minimal UI state tracking:
- `rematchOfferedByMe` (`boolean`): Indicates the local user initiated a rematch request and is waiting for opponent response.
- `rematchOfferReceived` (`boolean`): Indicates an incoming rematch request from the opponent.
- `rematchOfferedByUsername` (`string | null`): Opponent's display name for the incoming offer banner.
- `isRematchLoading` (`boolean`): Disables buttons and shows inline progress spinner during WebSocket operations.

### 3.2 Closure Hygiene with `activeGameRef`
To prevent stale closure bugs in WebSocket event listeners while keeping listener registration stable (bound once on mount):
```javascript
const activeGameRef = useRef(activeGame);
useEffect(() => {
  activeGameRef.current = activeGame;
}, [activeGame]);
```
All event handlers inspect `activeGameRef.current` to reliably filter events by current `gameId`.

---

## 4. Event Filtering & Error Handling

1. **`rematch:offered`**:
   - Gated by: `gameId === activeGame?.gameId && activeGame.status === 'FINISHED'`.
   - If `offeredBy !== user?.id`: sets `rematchOfferReceived = true` and `rematchOfferedByUsername`.
   - If `offeredBy === user?.id`: sets `rematchOfferedByMe = true` and clears `isRematchLoading`.
2. **`rematch:declined`**:
   - Gated by: `gameId === activeGame?.gameId`.
   - Resets: `rematchOfferedByMe = false`, `rematchOfferReceived = false`, `isRematchLoading = false`.
3. **`rematch:cancelled`**:
   - Gated by: `gameId === activeGame?.gameId`.
   - Resets offer flags and exposes contextual messages:
     - `timeout` → "Rematch offer expired."
     - `opponent_disconnected` → "Opponent disconnected."
     - `cancelled_by_player` → "Rematch offer was cancelled."
4. **`error`**:
   - Gated by error codes: `REMATCH_*`, `GAME_NOT_FINISHED`, `TOURNAMENT_REMATCH_NOT_ALLOWED`, `PLAYER_ALREADY_IN_GAME`.
   - Resets `isRematchLoading = false`, `rematchOfferedByMe = false`, and displays server message for 4 seconds.

---

## 5. UI Presentation (`OnlineMode.jsx`)

Located in `apps/web/client/src/features/mode/OnlineMode.jsx`:

1. **Game Over Card**:
   - Displays result and termination reason.
   - Preserves existing "Download PGN" (`/api/games/${gameId}/pgn`) and "Back to Lobby" buttons.
2. **Tournament Suppression**:
   - When `activeGame.tournamentId` is truthy, all rematch controls are completely omitted.
3. **Post-Game Rematch Controls** (non-tournament only):
   - **Initial State**: Green "Rematch" button (`data-testid="rematch-btn"`).
   - **Waiting State**: Spinner with "Rematch offered... Waiting for opponent" and red "Cancel" button (`data-testid="rematch-cancel-btn"`).
   - **Incoming Offer**: Prompt `"[Opponent] offered a rematch!"` with green "Accept" (`data-testid="rematch-accept-btn"`) and red "Decline" (`data-testid="rematch-decline-btn"`) buttons.

---

## 6. Authoritative Game 2 Transition via `game:init`

When the backend accepts a rematch, it emits authoritative `game:init`:
1. Replaces `gameId`, `roomCode`, `whitePlayerId`, `blackPlayerId`, usernames, and ratings.
2. Computes player color from server assignment (`color`).
3. Resets FEN (`loadFen(payload.fen)`) and clock remaining milliseconds.
4. Resets all rematch state:
   - `rematchOfferedByMe = false`
   - `rematchOfferReceived = false`
   - `rematchOfferedByUsername = null`
   - `isRematchLoading = false`
5. Status becomes `'ACTIVE'`, transitioning from the post-game card back to the interactive chessboard.

---

## 7. Reconnect Safety & Hygiene

- WebSocket event listeners are bound once on component mount with `wsClient.on` and cleanly unsubscribed in the `useEffect` cleanup return.
- Reconnections do not create duplicate listeners.
- Completed games do not send extraneous join events.
- Stale events for previous games are dropped via `gameId` mismatch checks.

---

## 8. Web Test Verification

A focused test suite covering all 15 required contract items was implemented in `apps/web/client/tests/rematch.test.js`:

```bash
npm test --workspace=apps/web/client
```

Results:
- **1. Rematch button appears after normal game completion**: PASS
- **2. Rematch hidden for tournament game**: PASS
- **3. Clicking Rematch sends correct event/payload**: PASS
- **4. Duplicate clicks are prevented**: PASS
- **5. Incoming rematch offer displays opponent username**: PASS
- **6. Accept sends correct payload**: PASS
- **7. Decline sends correct payload**: PASS
- **8. Cancel sends correct payload**: PASS
- **9. rematch:declined clears UI state**: PASS
- **10. rematch:cancelled clears UI state and surfaces message**: PASS
- **11. Wrong gameId events are ignored**: PASS
- **12. game:init clears rematch state and initializes Game 2**: PASS
- **13. Backend rematch errors display correctly**: PASS
- **14. Existing PGN download remains functional**: PASS
- **15. Existing Back to Lobby remains functional**: PASS
- **16. Reconnection and listener cleanup does not duplicate listeners**: PASS

**Total**: 16 passed, 0 failed, 0 skipped.

---

## 9. Build & Static Validation

### 9.1 Production Build
```bash
npm run build --workspace=apps/web/client
```
- **Result**: PASS (`✓ built in 3.90s`)
- **Output Artifacts**:
  - `dist/index.html`: 2.37 kB
  - `dist/assets/index-df4ca154.css`: 26.98 kB
  - `dist/assets/index-55a3448f.js`: 336.66 kB

---

## 10. Scope Compliance

- **Allowed Modified Paths**:
  - `apps/web/client/package.json`
  - `apps/web/client/src/features/mode/OnlineMode.jsx`
  - `apps/web/client/src/services/wsClient.js`
  - `apps/web/client/vite.config.js`
  - `apps/web/client/tests/rematch.test.js`
  - `docs/mobile/m7/M7_FINDINGS.md`
  - `docs/mobile/m7/M7_PROGRESS.md`
  - `docs/mobile/m7/M7_PHASE4_WEB_REPORT.md`
- **Zero changes** to:
  - `apps/server/**`
  - `apps/mobile/**`
  - `packages/**`

---

## 11. Known Limitations

1. Live end-to-end multi-client validation between Web and Mobile will be executed in Phase 5.
2. Web tests run under Node 22 native test runner; browser Puppeteer integration testing will be conducted in Phase 5.
