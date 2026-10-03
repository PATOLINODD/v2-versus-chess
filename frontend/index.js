import { drawChessboard, renderPieces, drawArrow, clearArrows, squareSize, triggerExplosion, imagePieces, color, rows, cols } from "./src/drawChessboard.js";
import { boardState, svgMap } from "./src/handlePieceState.js";
import { game, syncBoardState } from "./engine.js";

drawChessboard();
renderPieces(boardState);


const gameContainer = document.getElementById('game-container');
let drawStartSquare = null;


function getSquareFromEvent(event) {
    const rect = gameContainer.getBoundingClientRect();

    // Calculate mouse position relative to the top-left of the container
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Divide by squareSize and floor the result to get the exact row/col
    return {
        row: Math.floor(y / squareSize),
        col: Math.floor(x / squareSize)
    };
}

gameContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

gameContainer.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        // Left Click alone: Clear all existing arrows on the board
        clearArrows();
    } else if (e.button === 2) {
        e.preventDefault();
        drawStartSquare = getSquareFromEvent(e);
        console.log("right click!");
    }
});

gameContainer.addEventListener('mouseup', (e) => {
    // If the left button is released AND we are currently tracking a drawing gesture
    if (e.button === 2 && drawStartSquare) {
        const drawEndSquare = getSquareFromEvent(e);

        // Validate that the mouse moved to a new square
        if (drawStartSquare.row !== drawEndSquare.row || drawStartSquare.col !== drawEndSquare.col) {
            drawArrow(
                drawStartSquare.row, drawStartSquare.col,
                drawEndSquare.row, drawEndSquare.col
            );
        }

        // Terminate the drawing state
        drawStartSquare = null;
    }
});



const hintsLayer = document.getElementById('hints-layer');

// Expected input: an array of objects, e.g., [{row: 2, col: 4, isCapture: false}, ...]
export function drawHints(legalMoves) {
    // Clear any existing hints
    hintsLayer.innerHTML = '';
    const hintColor = `hsl(${color} 100% 15% / 0.5)`;
    const redColor = "hsl(0 100% 40%)";

    legalMoves.forEach(move => {
        const left = move.col * squareSize;
        const top = move.row * squareSize;

        // Determine the visual style based on whether the move is a capture
        let svgContent = '';
        if (move.isCapture) {
            // Draw a sleek, red X symbol centered in the 80x80 square
            svgContent = `
                <line x1="${(squareSize * 0.25)}" y1="${(squareSize * 0.25)}" x2="${squareSize - (squareSize * 0.25)}" y2="${squareSize - (squareSize * 0.25)}" stroke="${redColor}" stroke-width="${squareSize * 0.075}" stroke-linecap="round" />
                <line x1="${squareSize - (squareSize * 0.25)}" y1="${(squareSize * 0.25)}" x2="${(squareSize * 0.25)}" y2="${squareSize - (squareSize * 0.25)}" stroke="${redColor}" stroke-width="${squareSize * 0.075}" stroke-linecap="round" />
            `;
        } else {
            // Draw a solid dot for empty squares (radius 12)
            svgContent = `<circle cx="${squareSize / 2}" cy="${squareSize / 2}" r="${squareSize * 0.14}" fill="${hintColor}" />`;
        }

        const hintHTML = `
            <svg style="position: absolute; left: ${left}px; top: ${top}px; width: ${squareSize}px; height: ${squareSize}px;">
                ${svgContent}
            </svg>
        `;

        hintsLayer.insertAdjacentHTML('beforeend', hintHTML);
    });
}



export function clearHints() {
    hintsLayer.innerHTML = '';
}







// This will hold an object: { row, col, moves: [] }
let activeSelection = null;
let lastMove = null; // Will store: { pieceChar, fromRow, fromCol, toRow, toCol }

export async function executeMove(fromSquare, toSquare, moveObj, boardState) {
    clearHints();

    const movingPieceChar = boardState[fromSquare.row][fromSquare.col];
    const targetPieceChar = boardState[toSquare.row][toSquare.col];
    
    // Wait for the WAAPI translation to finish visually
    await animatePiece(fromSquare, toSquare);

    const isEnPassant = (moveObj.mask & 8) !== 0;
    const isCapture = (moveObj.mask & 1) !== 0;

    if (isEnPassant) {
        // En Passant Capture
        const capturedRow = fromSquare.row; // The enemy pawn is on our starting row
        const capturedCol = toSquare.col;   // The enemy pawn is in our target column
        const capturedPieceChar = boardState[capturedRow][capturedCol];

        triggerExplosion(capturedRow, capturedCol, svgMap[capturedPieceChar]);

        const capturedElement = document.querySelector(`.chess-piece-wrapper[data-row="${capturedRow}"][data-col="${capturedCol}"]`);
        if (capturedElement) capturedElement.style.display = 'none';
    } else if (isCapture) {
        // Standard Capture
        triggerExplosion(toSquare.row, toSquare.col, svgMap[targetPieceChar]);
        const capturedElement = document.querySelector(`.chess-piece-wrapper[data-row="${toSquare.row}"][data-col="${toSquare.col}"]`);
        if (capturedElement) capturedElement.style.display = 'none';
    }

    // Apply move to engine
    game.makemove(moveObj);
    game.generateMoves();

    // Sync the board logic state with the visual state array
    syncBoardState(boardState);

    // Re-render the visual pieces
    renderPieces(boardState);
}

export async function animatePiece(fromSquare, toSquare) {
    const pieceElement = document.querySelector(`.chess-piece-wrapper[data-row="${fromSquare.row}"][data-col="${fromSquare.col}"]`);
    if (!pieceElement) return;

    const deltaX = (toSquare.col - fromSquare.col) * squareSize;
    const deltaY = (toSquare.row - fromSquare.row) * squareSize;
    pieceElement.style.zIndex = "100";

    const href = pieceElement.querySelector('use').getAttribute('href');
    const svgId = href.split('#')[1];
    const img = imagePieces[svgId];
    const gameContainer = document.getElementById('game-container');

    // Create a dedicated, temporary canvas specifically for this trail
    const trailCanvas = document.createElement('canvas');
    trailCanvas.width = squareSize * cols;
    trailCanvas.height = squareSize * rows;
    trailCanvas.style.cssText = "position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none;";
    gameContainer.appendChild(trailCanvas);
    const trailCtx = trailCanvas.getContext('2d');

    let isAnimating = true;
    const ghosts = [];

    // 1. Frame Rate Controller (Adjust this value to test different densities)
    // 60 = ultra-smooth/dense, 24 = cinematic, 12 = stylized/sparse stop-motion
    const targetFPS = 20;
    const frameInterval = 1000 / targetFPS;
    let previousTimestamp = performance.now();

    // 2. Accept the timestamp parameter
    function renderTrail(currentTimestamp) {

        // Calculate the exact milliseconds elapsed since the last drawn frame
        const elapsed = currentTimestamp - previousTimestamp;

        // If the elapsed time is less than our target interval, skip drawing entirely
        if (elapsed < frameInterval) {
            if (isAnimating || ghosts.length > 0) {
                requestAnimationFrame(renderTrail);
            } else {
                trailCanvas.remove();
            }
            return; // Terminate execution for this frame
        }

        // Update the timestamp for the next cycle, modulo the remainder to prevent time drift
        previousTimestamp = currentTimestamp - (elapsed % frameInterval);

        // --- YOUR EXISTING RENDER LOGIC BELOW ---
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

        if (isAnimating) {
            const rect = pieceElement.getBoundingClientRect();
            const containerRect = gameContainer.getBoundingClientRect();
            const x = rect.left - containerRect.left;
            const y = rect.top - containerRect.top;
            ghosts.push({ x, y, opacity: 1 });
        }

        for (let i = ghosts.length - 1; i >= 0; i--) {
            const ghost = ghosts[i];
            trailCtx.globalAlpha = ghost.opacity;

            if (img) {
                trailCtx.drawImage(img, ghost.x, ghost.y, squareSize, squareSize);
                trailCtx.globalCompositeOperation = 'source-atop';
                trailCtx.fillStyle = 'hsl(0 100% 40% / 0)';
                trailCtx.fillRect(ghost.x, ghost.y, squareSize, squareSize);
                trailCtx.globalCompositeOperation = 'source-over';
            }

            // Note: If you drastically lower the FPS (e.g., to 12), you may want to 
            // increase this decay value (e.g., to 0.10) so the ghosts still fade out quickly.
            ghost.opacity -= 0.1;

            if (ghost.opacity <= 0) ghosts.splice(i, 1);
        }

        trailCtx.globalAlpha = 1.0;

        if (isAnimating || ghosts.length > 0) {
            requestAnimationFrame(renderTrail);
        } else {
            trailCanvas.remove();
        }
    }

    requestAnimationFrame(renderTrail); // is calling without the parameter good here?

    const animation = pieceElement.animate([
        { transform: 'translate(0px, 0px)' },
        { transform: `translate(${deltaX}px, ${deltaY}px)` }
    ], {
        duration: 180,
        easing: 'ease-in',
        fill: 'forwards'
    });

    await animation.finished;
    isAnimating = false;
}

gameContainer.addEventListener('mousedown', (e) => {
    // Ignore right-clicks or Alt-clicks used for drawing arrows
    if (e.button !== 0 || e.altKey) return;

    const clickedSquare = getSquareFromEvent(e);
    const clickedRow = clickedSquare.row;
    const clickedCol = clickedSquare.col;

    // Scenario A: The user is trying to move an already selected piece
    if (activeSelection) {
        const isValidDestination = activeSelection.moves.find(
            m => m.row === clickedRow && m.col === clickedCol
        );

        if (isValidDestination) {
            // Execute the state update and UI render
            executeMove(activeSelection, clickedSquare, isValidDestination.moveObj, boardState);

            // Clear the selection so the next click starts fresh
            activeSelection = null;
            return; // Terminate execution immediately
        }
    }

    // Scenario B: The user is clicking a piece to select it
    const pieceChar = boardState[clickedRow][clickedCol];

    if (pieceChar) {
        // Assume getLegalMoves routes to the specific piece logic (like getRookMoves)
        const legalMoves = getLegalMoves(clickedRow, clickedCol, boardState);

        // Store the selection in memory
        activeSelection = { row: clickedRow, col: clickedCol, moves: legalMoves };

        // Draw the visual indicators
        drawHints(legalMoves);
    } else {
        // Scenario C: The user clicked an empty square. Cancel any active selection.
        activeSelection = null;
        clearHints();
    }
});

export function getLegalMoves(row, col, boardState) {
    const moves = [];
    const rank = 7 - row;
    const file = col;
    const sq = (rank << 4) | file;
    
    for (let i = 0; i < game.moves.length; i++) {
        const move = game.moves[i];
        if (move.from === sq) {
            const targetRank = move.to >>> 4;
            const targetFile = move.to & 7;
            const targetRow = 7 - targetRank;
            const targetCol = targetFile;
            moves.push({
                row: targetRow,
                col: targetCol,
                isCapture: (move.mask & 1) !== 0,
                moveObj: move
            });
        }
    }
    return moves;
}





fetch('./assets/pieces/standard.svg')
    .then(response => response.text())
    .then(svgText => {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");

        // Inject the SVG into the DOM to prevent flickering
        const hiddenDiv = document.createElement('div');
        hiddenDiv.style.display = 'none';
        hiddenDiv.innerHTML = svgText;
        document.body.appendChild(hiddenDiv);

        // Iterate through the svgMap to extract each piece's <g> tag
        for (const [char, svgId] of Object.entries(svgMap)) {
            const groupElement = svgDoc.getElementById(svgId);

            if (groupElement) {
                // Wrap the extracted group in a clean SVG structure
                const isolatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${groupElement.outerHTML}</svg>`;

                // Convert the string to a Data URI and assign it to a valid Canvas Image object
                const img = new Image();
                img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(isolatedSvg);

                // Store the valid Image object using the SVG ID as the key
                imagePieces[svgId] = img;
            }
        }
    });


