/**
 * moveDispatcher.js
 * The single point of contact between any move decision and game state mutation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE WEBSOCKET SEAM — the only file that changes when networking
 * is added. Everything else in the codebase stays the same.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Local move flow (today):
 *   index.js (click) → dispatchLocalMove() → applyMove()
 *
 * Multiplayer move flow:
 *   index.js (click) → dispatchLocalMove() → socket.sendMove() + applyMove()
 *
 * Remote move flow (multiplayer):
 *   socket.js (onmessage) → receiveRemoteMove() → applyMove()
 *
 * ─── Opponent cosmetics ───────────────────────────────────────────────────────
 *   Sounds:  playSoundForMove() receives a `soundPack` override. When a remote
 *            move arrives, we pass the opponent's sound pack so they hear their
 *            own sounds on our screen (as if they are sitting at the board).
 *
 *   Pieces:  renderPieces() already reads from `localSettings.piecesSkin` and
 *            `opponentSettings.piecesSkin` to render each side's pieces with
 *            the correct skin. No extra work needed here.
 */

import { game, syncBoardState }                            from '../engine.js';
import { renderPieces, triggerExplosion,
         animatePieceMove, svgMap }                        from './drawChessboard.js';
import { playSoundForMove }                                from './sounds.js';
import { gameState }                                       from './gameState.js';
import { localSettings, opponentSettings }                 from './settings.js';
import { numericToAlgebraic }                              from './utils/util.js';

// Lazily import the socket to avoid a circular-dependency at module load time.
// socket.js → moveDispatcher.js (receiveRemoteMove) → socket.js (sendMove)
// By using a dynamic import inside the function body, the cycle is broken.
let _socket = null;
async function getSocket() {
    if (!_socket) {
        _socket = await import('./socket.js');
    }
    return _socket;
}


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called by the DOM input handler when the LOCAL player confirms a move.
 *
 * In multiplayer mode, this sends the move to the server via the WebSocket
 * before (or concurrently with) applying it locally. The server is the source
 * of truth — if it rejects the move, a future enhancement could roll it back.
 *
 * @param {{ row: number, col: number }} fromSquare
 * @param {{ row: number, col: number }} toSquare
 * @param {object} moveObj - Move descriptor from the chess engine
 * @param {boolean} animate - Whether to animate the piece move visually
 */
export async function dispatchLocalMove(fromSquare, toSquare, moveObj, animate = true) {
    // ── Send to server when playing online ─────────────────────────────────
    const socket = await getSocket();
    if (socket.getSocketStatus() === 'connected') {
        socket.sendMove(
            numericToAlgebraic(fromSquare.row, fromSquare.col),
            numericToAlgebraic(toSquare.row,   toSquare.col),
        );
    }
    // ────────────────────────────────────────────────────────────────────────

    // Local player's move — use local sound pack
    await applyMove(fromSquare, toSquare, moveObj, localSettings.soundPack, animate);
}

/**
 * Called by socket.js when a REMOTE player's move arrives from the server.
 * Uses the opponent's sound pack so their chosen sounds play on our screen.
 *
 * @param {{ row: number, col: number }} fromSquare
 * @param {{ row: number, col: number }} toSquare
 * @param {object} moveObj - Move descriptor reconstructed from the server message
 */
export async function receiveRemoteMove(fromSquare, toSquare, moveObj) {
    // Remote player's move — use opponent's sound pack (falls back to local)
    const pack = opponentSettings?.soundPack ?? localSettings.soundPack;
    await applyMove(fromSquare, toSquare, moveObj, pack, true);
}


// ─── Private implementation ───────────────────────────────────────────────────

/**
 * Shared move application logic. Animates, updates the engine, plays a sound,
 * syncs state, and re-renders. Never called directly from outside this module.
 *
 * @param {{ row: number, col: number }} fromSquare
 * @param {{ row: number, col: number }} toSquare
 * @param {object} moveObj
 * @param {string} soundPack - Which sound pack folder to use for this move's audio
 * @param {boolean} animate - Whether to animate the move
 */
async function applyMove(fromSquare, toSquare, moveObj, soundPack, animate = true) {
    // 1. Visual: slide the piece to its destination
    if (animate) {
        await animatePieceMove(fromSquare, toSquare);
    }

    const isEnPassant = (moveObj.mask & 8) !== 0;
    const isCapture   = (moveObj.mask & 1) !== 0;

    // 2. Visual: explosion FX on the captured piece
    if (isEnPassant) {
        // En passant: the captured pawn sits on fromSquare.row / toSquare.col
        const capturedRow  = fromSquare.row;
        const capturedCol  = toSquare.col;
        const capturedChar = gameState.board[capturedRow][capturedCol];

        triggerExplosion(capturedRow, capturedCol, svgMap[capturedChar]);

        const capturedEl = document.querySelector(
            `.chess-piece-wrapper[data-row="${capturedRow}"][data-col="${capturedCol}"]`
        );
        if (capturedEl) capturedEl.style.display = 'none';

    } else if (isCapture) {
        // Standard capture: the victim is on the destination square
        const targetChar = gameState.board[toSquare.row][toSquare.col];

        triggerExplosion(toSquare.row, toSquare.col, svgMap[targetChar]);

        const capturedEl = document.querySelector(
            `.chess-piece-wrapper[data-row="${toSquare.row}"][data-col="${toSquare.col}"]`
        );
        if (capturedEl) capturedEl.style.display = 'none';
    }

    // 3. Engine: commit the move and generate the opponent's legal moves
    game.makemove(moveObj);
    game.generateMoves();

    // 4. State: derive game status from the freshly updated engine
    const isGameOver = game.moves.length === 0;
    if (isGameOver && game.inCheck) {
        gameState.status = 'checkmate';
    } else if (isGameOver) {
        gameState.status = 'stalemate';
    } else if (game.inCheck) {
        gameState.status = 'check';
    } else {
        gameState.status = 'playing';
    }

    // 5. Audio: play the sound that matches the resulting game state,
    //    using the sound pack supplied by the caller (local vs. opponent's).
    playSoundForMove(
        { isCapture: isCapture || isEnPassant },
        { inCheckMate: gameState.status === 'checkmate', inCheck: game.inCheck },
        soundPack,
    );

    // 6. State: sync the board array with the engine's internal representation
    syncBoardState(gameState.board);

    // 7. State: record the move for highlighting and future history features
    gameState.lastMove = {
        fromRow: fromSquare.row,
        fromCol: fromSquare.col,
        toRow:   toSquare.row,
        toCol:   toSquare.col,
    };

    // 8. Visual: re-render all pieces at their new positions
    renderPieces(gameState.board);
}
