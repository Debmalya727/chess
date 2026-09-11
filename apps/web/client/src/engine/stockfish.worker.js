/* eslint-disable no-restricted-globals */
import { Chess } from 'chess.js';

let stockfish = null;
let isReady = false;
let currentJob = null;
let jobCounter = 0;
const linesMap = new Map();

// Helper: static position fallback evaluation
function evaluateFallback(fen, multiPv = 3) {
    try {
        const chess = new Chess(fen);
        const turn = chess.turn();
        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) return [];

        const scored = [];
        for (const m of moves) {
            chess.move(m);
            let score = 0;
            const board = chess.board();
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = board[r][c];
                    if (!p) continue;
                    const val = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }[p.type] || 0;
                    score += p.color === 'w' ? val : -val;
                }
            }
            chess.undo();
            scored.push({ move: m, score });
        }

        if (turn === 'w') scored.sort((a, b) => b.score - a.score);
        else scored.sort((a, b) => a.score - b.score);

        return scored.slice(0, multiPv).map((item, idx) => ({
            multipv: idx + 1,
            depth: 2,
            score: { type: 'cp', value: Math.round(item.score / 10) },
            mate: Math.abs(item.score) >= 20000 ? (item.score > 0 ? 1 : -1) : null,
            bestMove: item.move.from + item.move.to + (item.move.promotion || ''),
            san: item.move.san,
            pv: [item.move.from + item.move.to + (item.move.promotion || '')]
        }));
    } catch (e) {
        return [];
    }
}

function parseInfoLine(line, isBlackTurn = false) {
    const tokens = line.split(' ');
    let depth = 0;
    let multipv = 1;
    let scoreType = 'cp';
    let rawScoreVal = 0;
    let nodes = 0;
    let nps = 0;
    let pv = [];

    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === 'depth') depth = parseInt(tokens[i + 1], 10);
        else if (tokens[i] === 'multipv') multipv = parseInt(tokens[i + 1], 10);
        else if (tokens[i] === 'nodes') nodes = parseInt(tokens[i + 1], 10);
        else if (tokens[i] === 'nps') nps = parseInt(tokens[i + 1], 10);
        else if (tokens[i] === 'score') {
            scoreType = tokens[i + 1];
            rawScoreVal = parseInt(tokens[i + 2], 10);
        } else if (tokens[i] === 'pv') {
            pv = tokens.slice(i + 1);
            break;
        }
    }

    // Normalize score to White's perspective (+ = White advantage, - = Black advantage)
    const normalizedVal = isBlackTurn ? -rawScoreVal : rawScoreVal;

    return {
        engine: "stockfish-18-wasm",
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

function handleEngineMessage(line) {
    if (typeof line !== 'string') return;
    const str = line.trim();

    if (str === 'readyok') {
        isReady = true;
        self.postMessage({ type: 'engine:status', engine: 'stockfish-18-wasm', engineAvailable: true });
        return;
    }

    if (str.startsWith('info ') && str.includes('score ')) {
        if (currentJob) {
            const parsed = parseInfoLine(str, currentJob.isBlackTurn);
            if (parsed) {
                linesMap.set(parsed.multipv, parsed);
                self.postMessage({
                    type: 'analysis:update',
                    engine: 'stockfish-18-wasm',
                    engineAvailable: true,
                    jobId: currentJob.id,
                    lines: Array.from(linesMap.values()).sort((a, b) => a.multipv - b.multipv)
                });
            }
        }
    }

    if (str.startsWith('bestmove ')) {
        const parts = str.split(' ');
        const bestMove = parts[1];
        if (currentJob) {
            const completedJobId = currentJob.id;
            const finalLines = Array.from(linesMap.values()).sort((a, b) => a.multipv - b.multipv);
            self.postMessage({
                type: 'analysis:complete',
                engine: 'stockfish-18-wasm',
                engineAvailable: true,
                jobId: completedJobId,
                bestMove,
                lines: finalLines
            });
            currentJob = null;
        }
    }
}

async function initEngine() {
    try {
        importScripts('/engine/stockfish.js');
        if (typeof self.Stockfish === 'function') {
            stockfish = await self.Stockfish();
            if (stockfish && typeof stockfish.addMessageListener === 'function') {
                stockfish.addMessageListener(handleEngineMessage);
            } else if (stockfish && typeof stockfish.onmessage === 'function') {
                stockfish.onmessage = handleEngineMessage;
            }
            sendUCI('uci');
            sendUCI('setoption name Threads value 1');
            sendUCI('setoption name Hash value 16');
            sendUCI('isready');
        } else {
            throw new Error('Stockfish factory function not found');
        }
    } catch (err) {
        console.warn('[Stockfish Worker] WASM engine initialization failed. Fallback active:', err.message);
        self.postMessage({ type: 'engine:status', engine: 'fallback', engineAvailable: false });
    }
}

function sendUCI(cmd) {
    if (stockfish) {
        if (typeof stockfish.postMessage === 'function') {
            stockfish.postMessage(cmd);
        } else if (typeof stockfish === 'function') {
            stockfish(cmd);
        }
    }
}

self.onmessage = (e) => {
    const { action, fen, depth = 20, multipv = 3, movetime } = e.data || {};

    if (action === 'init') {
        initEngine();
        return;
    }

    if (action === 'stop') {
        if (stockfish) {
            sendUCI('stop');
        }
        currentJob = null;
        self.postMessage({ type: 'analysis:stopped' });
        return;
    }

    if (action === 'start') {
        if (!fen) return;
        const isBlackTurn = fen.split(' ')[1] === 'b';
        linesMap.clear();

        if (!stockfish || !isReady) {
            const fallbackLines = evaluateFallback(fen, multipv);
            self.postMessage({
                type: 'analysis:update',
                engine: 'fallback',
                engineAvailable: false,
                lines: fallbackLines
            });
            self.postMessage({
                type: 'analysis:complete',
                engine: 'fallback',
                engineAvailable: false,
                lines: fallbackLines
            });
            return;
        }

        if (currentJob) {
            sendUCI('stop');
        }

        const jobId = ++jobCounter;
        currentJob = { id: jobId, fen, isBlackTurn, depth, multipv };

        self.postMessage({ type: 'analysis:start', fen, jobId });

        sendUCI('ucinewgame');
        sendUCI(`setoption name MultiPV value ${Math.min(multipv, 5)}`);
        sendUCI(`position fen ${fen}`);

        if (movetime) {
            sendUCI(`go movetime ${Math.min(movetime, 5000)}`);
        } else {
            sendUCI(`go depth ${Math.min(depth, 25)}`);
        }
    }
};

initEngine();
