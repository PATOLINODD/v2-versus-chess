import { SpriteSheet } from "./SpriteSheet.js";
import { localSettings, opponentSettings } from "./settings.js";
import { gameState } from "./gameState.js";
import { getComplementaryColor } from "./utils/util.js";

// ─────────────────────────────────────────────────────────────────────────────
// PIECE IMAGE CACHE
// Per-skin rasterised Image objects used by the ghost-trail and explosion FX.
// Structure:  skinName → { svgId → HTMLImageElement }
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, Record<string, HTMLImageElement>>} */
const _imagePiecesCache = new Map();

/**
 * Legacy export — always points to the LOCAL player's rasterised pieces.
 * Kept for backwards-compatibility with the trail/explosion code below.
 * @type {Record<string, HTMLImageElement>}
 */
export const imagePieces = {};

export const squareSize = 100;
export const [rows, cols] = [8, 8];

/**
 * Maps piece characters to their SVG sprite IDs.
 * Uppercase = white, lowercase = black.
 * Defined here because it is tightly coupled to the rendering logic.
 */
export const svgMap = {
    'K': 'wk', 'Q': 'wq', 'R': 'wr', 'B': 'wb', 'N': 'wn', 'P': 'wp',
    'k': 'bk', 'q': 'bq', 'r': 'br', 'b': 'bb', 'n': 'bn', 'p': 'bp',
};

/** Lowercase piece chars belong to the black side. */
const BLACK_PIECES = new Set(['k', 'q', 'r', 'b', 'n', 'p']);

const piecesLayer = document.getElementById('pieces-layer');


// ─────────────────────────────────────────────────────────────────────────────
// BOARD DRAWING
// ─────────────────────────────────────────────────────────────────────────────

export function drawChessboard() {
    const gamecontainer = document.querySelector('div#game-container');
    gamecontainer.style.width = squareSize * 8 + 'px';
    gamecontainer.style.height = squareSize * 8 + 'px';
    const c = document.querySelector('canvas#chessboard');
    c.width = squareSize * rows;
    c.height = squareSize * cols;
    const g2 = c.getContext('2d');

    const { boardColor, boardLight } = localSettings;

    g2.clearRect(0, 0, c.width, c.height);
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            const isLight = (x + y) % 2 === 0;
            g2.fillStyle = isLight
                ? `hsl(${boardColor} 60% ${boardLight}%)`
                : `hsl(${boardColor} 60% ${boardLight - 30}%)`;
            g2.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// PIECE RENDERING — dual skin support
//
// Each piece is rendered using the skin that belongs to the side that owns it:
//   - White pieces → local player's skin  (when localPlayerColor === 'white')
//                    opponent's skin       (when localPlayerColor === 'black')
//   - Black pieces → vice-versa
//
// The SVG <use> href is prefixed with the skin name so the two sprite sheets
// can coexist in the DOM without id collisions:
//   local skin   → #local-wk,  #local-wp  …
//   opponent skin → #opp-wk,   #opp-wp   …
// ─────────────────────────────────────────────────────────────────────────────

export function renderPieces(boardState) {
    // 1. Clear the layer to prevent duplicating pieces upon re-rendering
    piecesLayer.innerHTML = '';

    const localIsWhite = gameState.localPlayerColor === 'white';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pieceChar = boardState[row][col];
            if (!pieceChar) continue;

            const svgId = svgMap[pieceChar];
            const isBlackPiece = BLACK_PIECES.has(pieceChar);

            // Determine which skin to use for this piece
            const pieceIsOpponents = localIsWhite ? isBlackPiece : !isBlackPiece;
            const skinPrefix = pieceIsOpponents ? 'opp' : 'local';

            const leftPosition = col * squareSize;
            const topPosition  = row * squareSize;
            const nativeViewBox = "0 0 40 40";

            const pieceHTML = `
                <div class="chess-piece-wrapper" data-row="${row}" data-col="${col}"
                    style="position: absolute; left: ${leftPosition}px; top: ${topPosition}px; width: ${squareSize}px; height: ${squareSize}px; display: flex; justify-content: center; align-items: center; pointer-events: auto; cursor: grab;">
                    
                    <svg viewBox="${nativeViewBox}" style="width: 100%; height: 100%; pointer-events: none;">
                        <use href="#${skinPrefix}-${svgId}"></use>
                    </svg>
                    
                </div>
            `;

            piecesLayer.insertAdjacentHTML('beforeend', pieceHTML);
        }
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// ARROW DRAWING
// ─────────────────────────────────────────────────────────────────────────────

export function getSquareCenter(row, col) {
    return {
        x: (col * squareSize) + (squareSize / 2),
        y: (row * squareSize) + (squareSize / 2)
    };
}

const arrowLayer = document.getElementById('arrow-layer');

export function drawArrow(fromRow, fromCol, toRow, toCol) {
    const start = getSquareCenter(fromRow, fromCol);
    const end = getSquareCenter(toRow, toCol);

    const arrowColor = `hsl(${getComplementaryColor(localSettings.boardColor)} 70% 50% / 0.8)`;
    
    const arrowHead = document.querySelector("#arrowhead");
    arrowHead.setAttribute("refX", squareSize * 0.0125);
    arrowHead.setAttribute("refY", squareSize * 0.2);

    const head = document.querySelector('#head');
    const coordinatePoints = [{ x: 0, y: 0 }, {x: squareSize * 0.4, y: squareSize * 0.2}, {x: 0, y: squareSize * 0.4}];
    const pointsStr = coordinatePoints.map( coord => `${coord.x} ${coord.y}`).join(', ');
    head.setAttribute("points", pointsStr);
    head.style.fill = arrowColor;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);

    // Adjust this value to bring the arrowhead closer to or further from the center
    const offset = squareSize * 0.5;

    const ratio = (distance - offset) / distance;
    const newEndX = start.x + (dx * ratio);
    const newEndY = start.y + (dy * ratio);

    const lineHTML = `
        <line 
            x1="${start.x}" y1="${start.y}" 
            x2="${newEndX}" y2="${newEndY}" 
            stroke="${arrowColor}"
            stroke-width="${squareSize * 0.12}" 
            marker-end="url(#arrowhead)"
            stroke-linecap=""
            class="annotation-arrow"
        />
    `;

    arrowLayer.insertAdjacentHTML('beforeend', lineHTML);
}

export function clearArrows() {
    // Remove all lines, but preserve the <defs> tag containing the arrowhead
    arrowLayer.querySelectorAll('.annotation-arrow').forEach(arrow => arrow.remove());
}


// ─────────────────────────────────────────────────────────────────────────────
// PIECE RASTERISATION (for canvas FX)
// ─────────────────────────────────────────────────────────────────────────────

function getSkinNameForPiece(svgId) {
    const isBlackPiece = ['bk', 'bq', 'br', 'bb', 'bn', 'bp'].includes(svgId);
    const localIsWhite = gameState.localPlayerColor === 'white';
    const pieceIsOpponents = localIsWhite ? isBlackPiece : !isBlackPiece;
    return pieceIsOpponents 
        ? (opponentSettings?.piecesSkin || localSettings.piecesSkin) 
        : localSettings.piecesSkin;
}

function rasterizePiece(svgId) {
    const offscreen = document.createElement('canvas');
    offscreen.width = squareSize; 
    offscreen.height = squareSize;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });

    const skinName = getSkinNameForPiece(svgId);
    const packMap = _imagePiecesCache.get(skinName);
    const pieceImg = packMap ? packMap[svgId] : imagePieces[svgId];

    if (pieceImg) {
        ctx.drawImage(pieceImg, 0, 0, squareSize, squareSize);
    }

    // Return the raw RGBA pixel matrix
    return ctx.getImageData(0, 0, squareSize, squareSize);
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPLOSION FX
// ─────────────────────────────────────────────────────────────────────────────

function createVoronoiShards(imageData, numShards = 12) {
    const shards = Array.from({ length: numShards }, () => {
        const centerX = Math.random() * squareSize;
        const centerY = Math.random() * squareSize;
        
        // Calculate an outward angle from the center of the square (explosion effect)
        const angle = Math.atan2(centerY - squareSize / 2, centerX - squareSize / 2);
        // Generate a random outward speed
        const speed = (Math.random() * 1) + squareSize * 0.1;

        return {
            centerX,
            centerY,
            pixels: [],
            // We track the exact distance the chunk has traveled from the center
            offsetX: 0, 
            offsetY: 0,
            // Apply sine and cosine to determine the straight-line trajectory
            velocityX: Math.cos(angle) * speed,
            velocityY: Math.sin(angle) * speed,
            
            canvas: document.createElement('canvas'),
            ctx: null
        };
    });

    const data = imageData.data;

    for (let y = 0; y < squareSize; y++) {
        for (let x = 0; x < squareSize; x++) {
            const index = (y * squareSize + x) * 4;
            const alpha = data[index + 3];

            if (alpha > 0) {
                let closestShard = shards[0];
                let minDistance = Infinity;

                for (const shard of shards) {
                    const dist = Math.hypot(shard.centerX - x, shard.centerY - y);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestShard = shard;
                    }
                }

                closestShard.pixels.push({
                    x: x, y: y,
                    r: data[index], g: data[index + 1], b: data[index + 2], a: alpha
                });
            }
        }
    }

    // Cache the pixels into actual image data on the mini-canvas
    shards.forEach(shard => {
        if (shard.pixels.length > 0) {
            shard.canvas.width = squareSize;
            shard.canvas.height = squareSize;
            shard.ctx = shard.canvas.getContext('2d');
            
            const imgData = shard.ctx.createImageData(squareSize, squareSize);
            shard.pixels.forEach(p => {
                const i = (p.y * squareSize + p.x) * 4;
                imgData.data[i] = p.r;
                imgData.data[i + 1] = p.g;
                imgData.data[i + 2] = p.b;
                imgData.data[i + 3] = p.a;
            });
            shard.ctx.putImageData(imgData, 0, 0);
        }
    });
    
    return shards.filter(s => s.pixels.length > 0);
}


const fxCanvas = document.getElementById('fx-layer');
const fxCtx = fxCanvas.getContext('2d');

function resizeFxCanvas() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeFxCanvas);
resizeFxCanvas();


export function triggerExplosion(captureRow, captureCol, capturedSvgId) {
    const imageData = rasterizePiece(capturedSvgId);
    const shards = createVoronoiShards(imageData);

    // Target the main wrapper for the impact effect
    const gameContainer = document.getElementById('game-container');
    
    // Execute a rapid WAAPI keyframe sequence
    if (gameContainer) {
        gameContainer.animate([
            { transform: 'translate(1em, -1em) scale(1)' },
            { transform: 'translate(-0.25em, -0.5em) scale(1.05)' },
            { transform: 'translate(0.5em, 1em) scale(1)' },
            { transform: 'translate(-0.25em, -0.5em) scale(1.005)' },
            { transform: 'translate(0, 0) scale(1)' }
        ], {
            duration: 180, // A swift, 200-millisecond impact
            easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)', // Bouncy deceleration
            fill: 'forwards'
        });
    }
    
    const chessboard = document.getElementById('chessboard');
    const rect = chessboard.getBoundingClientRect();
    
    const startX = rect.left + captureCol * squareSize;
    const startY = rect.top + captureRow * squareSize;
    
    let opacity = 1.0;
    let time = squareSize * 0.6;

    function animate() {
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        opacity -= 0.05;
        time -= 3;
        
        if (time <= 0) return; 

        shards.forEach(shard => {

            // Move the chunk along its 360-degree vector
            shard.offsetX += shard.velocityX;
            shard.offsetY += shard.velocityY;
            
            // Set master opacity for the fade-out effect
            fxCtx.globalAlpha = Math.max(0, opacity);
            
            // Draw the cached chunk, sliding it outward from the starting square
            fxCtx.drawImage(shard.canvas, startX + shard.offsetX, startY + shard.offsetY);
        });

        if (time > 0) requestAnimationFrame(animate);
    }
    
    animate();
}


// ─────────────────────────────────────────────────────────────────────────────
// PIECE ANIMATION
// Moved here from index.js — it belongs with rendering, not input handling.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slides a piece element from one square to another using the Web Animations API,
 * with a ghost-trail effect drawn on a temporary canvas.
 *
 * @param {{ row: number, col: number }} fromSquare
 * @param {{ row: number, col: number }} toSquare
 * @returns {Promise<void>} Resolves when the animation finishes.
 */
export async function animatePieceMove(fromSquare, toSquare) {
    const pieceElement = document.querySelector(
        `.chess-piece-wrapper[data-row="${fromSquare.row}"][data-col="${fromSquare.col}"]`
    );
    if (!pieceElement) return;

    const deltaX = (toSquare.col - fromSquare.col) * squareSize;
    const deltaY = (toSquare.row - fromSquare.row) * squareSize;
    pieceElement.style.zIndex = '100';

    const href    = pieceElement.querySelector('use').getAttribute('href');
    // href is now "#local-wk" or "#opp-wk" — extract just the svgId part
    const svgId   = href.split('-').slice(1).join('-');
    
    const skinName = getSkinNameForPiece(svgId);
    const packMap  = _imagePiecesCache.get(skinName);
    const img      = packMap ? packMap[svgId] : imagePieces[svgId];
    
    const gameContainer = document.getElementById('game-container');

    // Temporary canvas for the ghost trail — lives only for the duration of this move
    const trailCanvas = document.createElement('canvas');
    trailCanvas.width  = squareSize * cols;
    trailCanvas.height = squareSize * rows;
    trailCanvas.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none;';
    gameContainer.appendChild(trailCanvas);
    const trailCtx = trailCanvas.getContext('2d');

    let isAnimating = true;
    const ghosts    = [];

    // Frame Rate Controller: 60 = dense, 24 = cinematic, 12 = sparse stop-motion
    const targetFPS      = 20;
    const frameInterval  = 1000 / targetFPS;
    let previousTimestamp = performance.now();

    function renderTrail(currentTimestamp) {
        const elapsed = currentTimestamp - previousTimestamp;

        if (elapsed < frameInterval) {
            if (isAnimating || ghosts.length > 0) {
                requestAnimationFrame(renderTrail);
            } else {
                trailCanvas.remove();
            }
            return;
        }

        // Advance the clock, clamping for drift prevention
        previousTimestamp = currentTimestamp - (elapsed % frameInterval);

        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

        if (isAnimating) {
            const rect          = pieceElement.getBoundingClientRect();
            const containerRect = gameContainer.getBoundingClientRect();
            ghosts.push({
                x:       rect.left - containerRect.left,
                y:       rect.top  - containerRect.top,
                opacity: 1,
            });
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

            // Increase this value (e.g. 0.15) if you lower targetFPS
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

    requestAnimationFrame(renderTrail);

    const animation = pieceElement.animate([
        { transform: 'translate(0px, 0px)' },
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
    ], {
        duration: 180,
        easing:   'ease-in',
        fill:     'forwards',
    });

    await animation.finished;
    isAnimating = false;
}


// ─────────────────────────────────────────────────────────────────────────────
// SPRITE SHEET INITIALISATION — dual skin support
//
// Each skin gets its own hidden <div> injected into the DOM. The SVG symbols
// inside are renamed with a prefix so they coexist without id collisions:
//   local skin  →  id="local-wk", id="local-wp" …
//   opponent skin → id="opp-wk",   id="opp-wp"  …
//
// renderPieces() uses `<use href="#local-wk">` or `<use href="#opp-wk">`
// depending on which side owns each piece.
//
// initPieceSprites() loads both skins at startup and also listens for the
// `opponent-settings-changed` event to reload the opponent skin on the fly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads a sprite sheet SVG, injects it into the DOM with prefixed IDs,
 * and pre-rasterises each symbol into the image cache for canvas FX.
 *
 * @param {string} skinName  - e.g. "standard"
 * @param {'local'|'opp'} prefix - DOM id prefix to avoid collisions
 * @returns {Promise<void>}
 */
export async function loadSpriteSheet(skinName, prefix) {
    const skinPath = `./assets/pieces/${skinName}.svg`;

    let svgText;
    try {
        const res = await fetch(skinPath);
        svgText = await res.text();
    } catch (err) {
        console.error(`[drawChessboard] Failed to load sprite sheet "${skinName}":`, err);
        return;
    }

    // Remove any previously injected container for this prefix
    const oldContainer = document.getElementById(`sprite-container-${prefix}`);
    if (oldContainer) oldContainer.remove();

    // Prefix all symbol/group IDs to prevent collisions between skins
    const prefixedSvg = svgText.replace(
        /\bid="(wk|wq|wr|wb|wn|wp|bk|bq|br|bb|bn|bp)"/g,
        `id="${prefix}-$1"`
    );

    const hiddenDiv = document.createElement('div');
    hiddenDiv.id = `sprite-container-${prefix}`;
    hiddenDiv.style.display = 'none';
    hiddenDiv.innerHTML = prefixedSvg;
    document.body.appendChild(hiddenDiv);

    // Pre-rasterise each symbol into an Image object for the trail/explosion canvas
    const parser  = new DOMParser();
    const svgDoc  = parser.parseFromString(svgText, 'image/svg+xml');
    const packMap = {};

    for (const [, svgId] of Object.entries(svgMap)) {
        const groupElement = svgDoc.getElementById(svgId);
        if (!groupElement) continue;

        // Browsers strictly parse data URIs as XML, so duplicate internal IDs (like id="Shape" in standard.svg)
        // will cause the image to silently fail to load. We strip all IDs except the root one to fix this.
        let safeOuterHTML = groupElement.outerHTML;
        safeOuterHTML = safeOuterHTML.replace(/\bid="[^"]+"/g, (match) => {
            return match === `id="${svgId}"` ? match : '';
        });

        const isolatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">${safeOuterHTML}</svg>`;
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(isolatedSvg);
        packMap[svgId] = img;
    }

    _imagePiecesCache.set(skinName, packMap);

    // Keep the legacy `imagePieces` export in sync with the local skin
    if (prefix === 'local') {
        Object.assign(imagePieces, packMap);
    }
}

/**
 * Initialises both piece sprite sheets (local + opponent).
 * Falls back to the local skin for the opponent if no opponent settings exist yet.
 * Also registers the `opponent-settings-changed` listener for live skin swaps.
 *
 * Call once at startup, after drawChessboard().
 */
export function initPieceSprites() {
    // Load local skin
    loadSpriteSheet(localSettings.piecesSkin, 'local');

    // Load opponent skin — falls back to local skin until opponent connects
    const oppSkin = opponentSettings?.piecesSkin ?? localSettings.piecesSkin;
    loadSpriteSheet(oppSkin, 'opp');

    // Live swap: when the opponent's settings arrive, reload their skin
    document.addEventListener('opponent-settings-changed', async (event) => {
        const { piecesSkin } = event.detail;
        await loadSpriteSheet(piecesSkin, 'opp');
        // Re-render so the new skin is visible immediately
        import('./gameState.js').then(({ gameState }) => {
            renderPieces(gameState.board);
        });
    });
}