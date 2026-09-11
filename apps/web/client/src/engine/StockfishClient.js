/**
 * Encapsulated Stockfish WASM Web Worker Controller
 * Manages UCI initialization, analysis queuing, and event callbacks.
 */
export class StockfishClient {
  constructor(workerPath = '/engine/stockfish.js') {
    this.workerPath = workerPath;
    this.worker = null;
    this.isReady = false;
    this.isSearching = false;
    this.pendingFen = null;
    this.linesMap = new Map();
    this.currentMultiPV = 3;

    this.statusListeners = new Set();
    this.updateListeners = new Set();
    this.completeListeners = new Set();
  }

  init() {
    if (this.worker) return;

    try {
      this.worker = new Worker(this.workerPath);
      this.worker.onmessage = (event) => this._handleMessage(event);
      this.worker.onerror = (err) => this._handleError(err);

      // Send standard UCI startup sequence
      this.worker.postMessage('uci');
      this.worker.postMessage('setoption name Threads value 1');
      this.worker.postMessage('setoption name Hash value 16');
      this.worker.postMessage('isready');
    } catch (err) {
      console.warn('[StockfishClient] Failed to spawn worker:', err);
      this._emitStatus('fallback', false);
    }
  }

  _handleMessage(event) {
    const line = typeof event.data === 'string' ? event.data.trim() : '';

    if (line === 'readyok') {
      this.isReady = true;
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`setoption name MultiPV value ${Math.min(this.currentMultiPV, 5)}`);
      this._emitStatus('stockfish-18-wasm', true);

      if (this.pendingFen) {
        const fen = this.pendingFen;
        this.pendingFen = null;
        this.startAnalysis(fen);
      }
      return;
    }

    if (line.startsWith('info ') && line.includes('score ')) {
      const isBlack = this.currentFen?.split(' ')[1] === 'b';
      const parsed = this._parseInfoLine(line, isBlack);
      if (parsed) {
        this.linesMap.set(parsed.multipv, parsed);
        const sortedLines = Array.from(this.linesMap.values()).sort((a, b) => a.multipv - b.multipv);
        this.updateListeners.forEach(cb => cb(sortedLines));
      }
    }

    if (line.startsWith('bestmove ')) {
      const bestMove = line.split(' ')[1];
      this.isSearching = false;
      const finalLines = Array.from(this.linesMap.values()).sort((a, b) => a.multipv - b.multipv);
      this.completeListeners.forEach(cb => cb({ bestMove, lines: finalLines }));

      if (this.pendingFen) {
        const nextFen = this.pendingFen;
        this.pendingFen = null;
        this.startAnalysis(nextFen);
      }
    }
  }

  _handleError(err) {
    console.warn('[StockfishClient Error]:', err);
    this.isReady = false;
    this.isSearching = false;
    this._emitStatus('fallback', false);
  }

  startAnalysis(fen, options = {}) {
    const { depth = 20, multipv = 3 } = options;
    if (!fen) return;
    this.currentFen = fen;
    this.currentMultiPV = multipv;

    if (!this.worker || !this.isReady) {
      this.pendingFen = fen;
      if (!this.worker) this.init();
      return;
    }

    if (this.isSearching) {
      this.pendingFen = fen;
      this.worker.postMessage('stop');
      return;
    }

    this.linesMap.clear();
    this.isSearching = true;

    this.worker.postMessage(`setoption name MultiPV value ${Math.min(multipv, 5)}`);
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${Math.min(depth, 25)}`);
  }

  stopAnalysis() {
    if (this.worker && this.isReady && this.isSearching) {
      this.pendingFen = null;
      this.worker.postMessage('stop');
    }
  }

  terminate() {
    if (this.worker) {
      try { this.worker.postMessage('quit'); } catch {}
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this.isSearching = false;
    }
  }

  onStatusChange(cb) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }
  onUpdate(cb) { this.updateListeners.add(cb); return () => this.updateListeners.delete(cb); }
  onComplete(cb) { this.completeListeners.add(cb); return () => this.completeListeners.delete(cb); }

  _emitStatus(status, available) {
    this.statusListeners.forEach(cb => cb({ status, available }));
  }

  _parseInfoLine(line, isBlackTurn = false) {
    const tokens = line.split(' ');
    let depth = 0, multipv = 1, scoreType = 'cp', rawScoreVal = 0, nodes = 0, nps = 0, pv = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'depth') depth = parseInt(tokens[i + 1], 10);
      else if (tokens[i] === 'multipv') multipv = parseInt(tokens[i + 1], 10);
      else if (tokens[i] === 'nodes') nodes = parseInt(tokens[i + 1], 10);
      else if (tokens[i] === 'nps') nps = parseInt(tokens[i + 1], 10);
      else if (tokens[i] === 'score') { scoreType = tokens[i + 1]; rawScoreVal = parseInt(tokens[i + 2], 10); }
      else if (tokens[i] === 'pv') { pv = tokens.slice(i + 1); break; }
    }
    const normalizedVal = isBlackTurn ? -rawScoreVal : rawScoreVal;
    return {
      engineAvailable: true,
      depth,
      multipv,
      score: { type: scoreType, value: normalizedVal },
      mate: scoreType === 'mate' ? normalizedVal : null,
      nodes,
      nps,
      bestMove: pv[0] || null,
      pv
    };
  }
}
