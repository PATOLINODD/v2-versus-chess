/**
 * index.js
 * Entry point and DOM input layer.
 *
 * Responsibilities (and ONLY these):
 *   - Bootstrap the board on first load
 *   - Translate raw DOM events (mouse clicks, right-clicks) into intent
 *   - Delegate all game logic and rendering to the appropriate modules
 *
 * Notably absent here (intentionally):
 *   - Move application logic  → moveDispatcher.js
 *   - Piece animation         → drawChessboard.js (animatePieceMove)
 *   - Sound playback          → sounds.js
 *   - Game state mutation     → gameState.js + moveDispatcher.js
 */

import { drawChessboard, renderPieces, drawArrow, clearArrows, squareSize, initPieceSprites } from './src/drawChessboard.js';
import { gameState } from './src/gameState.js';
import { localSettings } from './src/settings.js';
import { game } from './engine.js';
import { dispatchLocalMove } from './src/moveDispatcher.js';
import { preloadSounds } from './src/sounds.js';


// ─── Bootstrap ────────────────────────────────────────────────────────────────
drawChessboard();
renderPieces(gameState.board);
preloadSounds();
initPieceSprites();


// ─── DOM References ───────────────────────────────────────────────────────────
const gameContainer = document.getElementById('game-container');
const hintsLayer    = document.getElementById('hints-layer');
let drawStartSquare = null;


// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a mouse event's position to a {row, col} board square. */
function getSquareFromEvent(event) {
    const rect = gameContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {
        row: Math.floor(y / squareSize),
        col: Math.floor(x / squareSize),
    };
}


// ─── Arrow Annotation (right-click drag) ─────────────────────────────────────

gameContainer.addEventListener('contextmenu', e => e.preventDefault());

gameContainer.addEventListener('mousedown', e => {
    if (e.button === 0) {
        clearArrows();
    } else if (e.button === 2) {
        e.preventDefault();
        drawStartSquare = getSquareFromEvent(e);
    }
});

gameContainer.addEventListener('mouseup', e => {
    if (e.button === 2 && drawStartSquare) {
        const drawEndSquare = getSquareFromEvent(e);

        if (drawStartSquare.row !== drawEndSquare.row || drawStartSquare.col !== drawEndSquare.col) {
            drawArrow(
                drawStartSquare.row, drawStartSquare.col,
                drawEndSquare.row,   drawEndSquare.col
            );
        }

        drawStartSquare = null;
    }
});


// ─── Move Hints ───────────────────────────────────────────────────────────────

/**
 * Renders dot/X visual hints for the given list of legal moves.
 * @param {Array<{ row: number, col: number, isCapture: boolean }>} legalMoves
 */
export function drawHints(legalMoves) {
    hintsLayer.innerHTML = '';
    const hintColor = `hsl(${localSettings.boardColor} 100% 05% / 0.5)`;
    const redColor  = 'hsl(0 100% 40%)';

    legalMoves.forEach(move => {
        const left = move.col * squareSize;
        const top  = move.row * squareSize;

        let svgContent = '';
        if (move.isCapture) {
            // Red X for capture squares
            svgContent = `
                <line x1="${squareSize * 0.25}" y1="${squareSize * 0.25}"
                      x2="${squareSize * 0.75}" y2="${squareSize * 0.75}"
                      stroke="${redColor}" stroke-width="${squareSize * 0.075}" stroke-linecap="round" />
                <line x1="${squareSize * 0.75}" y1="${squareSize * 0.25}"
                      x2="${squareSize * 0.25}" y2="${squareSize * 0.75}"
                      stroke="${redColor}" stroke-width="${squareSize * 0.075}" stroke-linecap="round" />
            `;
        } else {
            // Dot for empty squares
            svgContent = `<circle cx="${squareSize / 2}" cy="${squareSize / 2}" r="${squareSize * 0.14}" fill="${hintColor}" />`;
        }

        hintsLayer.insertAdjacentHTML('beforeend', `
            <svg style="position: absolute; left: ${left}px; top: ${top}px;
                        width: ${squareSize}px; height: ${squareSize}px;">
                ${svgContent}
            </svg>
        `);
    });
}

export function clearHints() {
    hintsLayer.innerHTML = '';
}


// ─── Legal Move Query ─────────────────────────────────────────────────────────

/**
 * Asks the engine which squares a piece on (row, col) can legally move to.
 * Returns an array ready to be passed to drawHints().
 *
 * @param {number} row
 * @param {number} col
 * @returns {Array<{ row: number, col: number, isCapture: boolean, moveObj: object }>}
 */
export function getLegalMoves(row, col) {
    const moves = [];
    const sq = ((7 - row) << 4) | col;

    for (let i = 0; i < game.moves.length; i++) {
        const move = game.moves[i];
        if (move.from !== sq) continue;

        const targetRow = 7 - (move.to >>> 4);
        const targetCol = move.to & 7;

        moves.push({
            row:       targetRow,
            col:       targetCol,
            isCapture: (move.mask & 1) !== 0,
            moveObj:   move,
        });
    }
    return moves;
}


// ─── Input Handling (Click & Drag-and-Drop) ───────────────────────────────────

let draggedPiece = null;

function resetDraggedPieceVisuals() {
    if (!draggedPiece) return;
    const { element, origLeft, origTop } = draggedPiece;
    element.style.left = `${origLeft}px`;
    element.style.top = `${origTop}px`;
    element.style.zIndex = '';
    element.style.cursor = 'grab';
    draggedPiece = null;
}

gameContainer.addEventListener('mousedown', e => {
    // Only handle primary button; right-clicks are handled by the arrow listener above
    if (e.button !== 0 || e.altKey) return;

    const clickedSquare = getSquareFromEvent(e);
    const { row: clickedRow, col: clickedCol } = clickedSquare;

    // ── Scenario A: a piece is already selected — try to move it ──────────
    if (gameState.activeSelection) {
        const destination = gameState.activeSelection.moves.find(
            m => m.row === clickedRow && m.col === clickedCol
        );

        if (destination) {
            const selection = gameState.activeSelection;
            gameState.activeSelection = null;
            clearHints();

            // Hand off to the dispatcher — this is the WebSocket seam
            dispatchLocalMove(selection, clickedSquare, destination.moveObj);
            return;
        }
    }

    // ── Scenario B: click / initiate drag on a piece ──────────────────────
    const pieceChar = gameState.board[clickedRow][clickedCol];
    if (pieceChar) {
        const pieceElement = document.querySelector(
            `.chess-piece-wrapper[data-row="${clickedRow}"][data-col="${clickedCol}"]`
        );
        const legalMoves = getLegalMoves(clickedRow, clickedCol);
        gameState.activeSelection = { row: clickedRow, col: clickedCol, moves: legalMoves };
        drawHints(legalMoves);

        if (pieceElement) {
            const rect = gameContainer.getBoundingClientRect();
            draggedPiece = {
                element: pieceElement,
                row: clickedRow,
                col: clickedCol,
                origLeft: clickedCol * squareSize,
                origTop: clickedRow * squareSize,
                grabOffsetX: (e.clientX - rect.left) - (clickedCol * squareSize),
                grabOffsetY: (e.clientY - rect.top) - (clickedRow * squareSize),
                hasMoved: false,
                startX: e.clientX,
                startY: e.clientY,
            };
            pieceElement.style.zIndex = '50';
            pieceElement.style.cursor = 'grabbing';
        }
        return;
    }

    // ── Scenario C: click an empty square — deselect ─────────────────────
    gameState.activeSelection = null;
    clearHints();
});

window.addEventListener('mousemove', e => {
    if (!draggedPiece) return;

    const dx = e.clientX - draggedPiece.startX;
    const dy = e.clientY - draggedPiece.startY;
    if (!draggedPiece.hasMoved && Math.hypot(dx, dy) > 3) {
        draggedPiece.hasMoved = true;
    }

    if (draggedPiece.hasMoved) {
        const rect = gameContainer.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        draggedPiece.element.style.left = `${currentX - draggedPiece.grabOffsetX}px`;
        draggedPiece.element.style.top = `${currentY - draggedPiece.grabOffsetY}px`;
    }
});

window.addEventListener('mouseup', e => {
    if (e.button !== 0 || !draggedPiece) return;

    const drag = draggedPiece;
    const dropSquare = getSquareFromEvent(e);
    const { row: dropRow, col: dropCol } = dropSquare;
    const wasDragged = drag.hasMoved;

    // Reset element positioning and grab styles
    resetDraggedPieceVisuals();

    if (wasDragged) {
        // Dropped on the same square: cancel move, keep selection for click-move
        if (dropRow === drag.row && dropCol === drag.col) {
            return;
        }

        // Dropped on a destination square
        if (gameState.activeSelection && gameState.activeSelection.row === drag.row && gameState.activeSelection.col === drag.col) {
            const destination = gameState.activeSelection.moves.find(
                m => m.row === dropRow && m.col === dropCol
            );

            if (destination) {
                const selection = gameState.activeSelection;
                gameState.activeSelection = null;
                clearHints();

                dispatchLocalMove(selection, dropSquare, destination.moveObj, false);
            }
        }
    }
});

