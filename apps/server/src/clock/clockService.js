export class ClockService {
  constructor(timeControl = '10+0') {
    const parts = timeControl.split('+');
    const mins = parseInt(parts[0], 10) || 10;
    const incSec = parseInt(parts[1], 10) || 0;

    this.initialMs = mins * 60 * 1000;
    this.incrementMs = incSec * 1000;

    this.whiteRemainingMs = this.initialMs;
    this.blackRemainingMs = this.initialMs;

    this.activeColor = 'w';
    this.turnStartedAtMs = null;
    this.isRunning = false;
  }

  startTurn(color = 'w', nowMs = Date.now()) {
    this.activeColor = color;
    this.turnStartedAtMs = nowMs;
    this.isRunning = true;
  }

  getTimes(nowMs = Date.now()) {
    if (!this.isRunning || !this.turnStartedAtMs) {
      return {
        whiteRemainingMs: this.whiteRemainingMs,
        blackRemainingMs: this.blackRemainingMs,
        activeColor: this.activeColor,
        isTimeout: false,
        timeoutColor: null
      };
    }

    const elapsed = nowMs - this.turnStartedAtMs;

    let whiteCurrent = this.whiteRemainingMs;
    let blackCurrent = this.blackRemainingMs;

    if (this.activeColor === 'w') {
      whiteCurrent = Math.max(0, this.whiteRemainingMs - elapsed);
    } else {
      blackCurrent = Math.max(0, this.blackRemainingMs - elapsed);
    }

    const isTimeout = whiteCurrent <= 0 || blackCurrent <= 0;
    const timeoutColor = whiteCurrent <= 0 ? 'w' : (blackCurrent <= 0 ? 'b' : null);

    return {
      whiteRemainingMs: whiteCurrent,
      blackRemainingMs: blackCurrent,
      activeColor: this.activeColor,
      isTimeout,
      timeoutColor
    };
  }

  recordMove(nextColor, nowMs = Date.now()) {
    if (!this.isRunning || !this.turnStartedAtMs) {
      this.startTurn(nextColor, nowMs);
      return this.getTimes(nowMs);
    }

    const elapsed = nowMs - this.turnStartedAtMs;

    if (this.activeColor === 'w') {
      this.whiteRemainingMs = Math.max(0, this.whiteRemainingMs - elapsed) + this.incrementMs;
    } else {
      this.blackRemainingMs = Math.max(0, this.blackRemainingMs - elapsed) + this.incrementMs;
    }

    this.activeColor = nextColor;
    this.turnStartedAtMs = nowMs;

    return this.getTimes(nowMs);
  }

  stop() {
    this.isRunning = false;
  }
}
