import { SpriteSheet } from "./SpriteSheet.js";
import { boardState, svgMap } from "./handlePieceState.js";
import { getComplementaryColor } from "./utils/util.js";

export const imagePieces = {};
export const squareSize = 100;
export const color = 40;
export const light = 70;
export const [rows, cols] = [8, 8];

const piecesLayer = document.getElementById('pieces-layer');
const html = String.raw;


export function drawChessboard() {
    const gamecontainer = document.querySelector('div#game-container');
    gamecontainer.style.width = squareSize * 8 + 'px';
    gamecontainer.style.height = squareSize * 8 + 'px';
    const c = document.querySelector('canvas#chessboard');
    c.width = squareSize * rows;
    c.height = squareSize * cols;
    const g2 = c.getContext('2d');


    g2.clearRect(0, 0, c.width, c.height);
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            const isLight = (x + y) % 2 === 0;
            g2.fillStyle = isLight ? `hsl(${color} 60% ${light}%)` : `hsl(${color} 60% ${light-30}%)`;
            g2.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
        }
    }
}


export function renderPieces(boardState) {
    // 1. Clear the layer to prevent duplicating pieces upon re-rendering
    piecesLayer.innerHTML = '';

    // 2. Iterate through rows (Y-axis) and columns (X-axis)
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pieceChar = boardState[row][col];

            // 3. If a piece exists on this square, generate its SVG
            if (pieceChar) {
                const svgId = svgMap[pieceChar];
                const leftPosition = col * squareSize;
                const topPosition = row * squareSize;

                // Replace "0 0 45 45" with the actual viewBox found in your standard.svg file
                const nativeViewBox = "0 0 40 40";

                const pieceHTML = `
                    <div class="chess-piece-wrapper" data-row="${row}" data-col="${col}"
                        style="position: absolute; left: ${leftPosition}px; top: ${topPosition}px; width: ${squareSize}px; height: ${squareSize}px; display: flex; justify-content: center; align-items: center; pointer-events: auto; cursor: grab;">
                        
                        <svg viewBox="${nativeViewBox}" style="width: 100%; height: 100%; pointer-events: none;">
                            <use href="#${svgId}"></use>
                        </svg>
                        
                    </div>
                `;

                // Inject the generated element directly into the DOM
                piecesLayer.insertAdjacentHTML('beforeend', pieceHTML);
            }
        }
    }
}

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

    const arrowColor = `hsl(${getComplementaryColor(color)} 70% 50% / 0.8)`;
    
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



function rasterizePiece(svgId) {
    const offscreen = document.createElement('canvas');
    offscreen.width = squareSize; 
    offscreen.height = squareSize;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });

    // Assuming you have the piece stored as an Image object from our previous extraction logic
    const pieceImg = imagePieces[svgId];

    if (pieceImg) {
        ctx.drawImage(pieceImg, 0, 0, squareSize, squareSize);
    }

    // Return the raw RGBA pixel matrix
    return ctx.getImageData(0, 0, squareSize, squareSize);
}



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

// export function triggerExplosion(captureRow, captureCol, capturedSvgId) {
//     const imageData = rasterizePiece(capturedSvgId);
//     const shards = createVoronoiShards(imageData);

//     // Absolute starting coordinates on the main board
//     const startX = captureCol * squareSize;
//     const startY = captureRow * squareSize;

//     let opacity = 1.0;

//     function animate() {
//         // Clear the FX canvas for the next frame
//         fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
//         opacity -= 0.05; // Fade out the explosion gradually

//         if (opacity <= 0) return; // End the animation loop

//         shards.forEach(shard => {
//             // Apply physics
//             shard.centerX += shard.velocityX;
//             shard.centerY += shard.velocityY;
//             // shard.velocityY += 0.8; // Gravity pulling pieces downward

//             // Draw the shard's pixels at its new position
//             fxCtx.fillStyle = `hsl(0 100% 40% / ${opacity})`;

//             shard.pixels.forEach(p => {
//                 fxCtx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${opacity})`;
//                 // Calculate global board position + shard translation + local pixel offset
//                 const drawX = startX + p.x + (shard.centerX - p.x) * 0.5;
//                 const drawY = startY + p.y + (shard.centerY - p.y) * 0.5;

//                 fxCtx.fillRect(drawX, drawY, 1, 1);
//             });
//         });

//         requestAnimationFrame(animate);
//     }

//     // Hide the captured DOM piece instantly and start the animation
//     animate();
// }


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
    const friction = 0.9;

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