/**
 * gameState.js
 * Single, canonical source of truth for all runtime game state.
 *
 * Replaces:
 *   - The raw `boardState` array exported from handlePieceState.js
 *   - The `activeSelection` and `lastMove` local variables in index.js
 *
 * WebSocket integration point:
 *   - `gameState.board` can be reconstructed from a FEN string sent by the
 *     server, making state sync trivial.
 *   - `gameState.localPlayerColor` is assigned by the server on room join,
 *     telling the client which side it controls.
 */

/** Standard chess starting position */
const INITIAL_BOARD = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

export const gameState = {
    /**
     * 8×8 matrix of piece characters.
     * Uppercase = white, lowercase = black, null = empty square.
     * @type {(string | null)[][]}
     */
    board: INITIAL_BOARD.map(row => [...row]),

    /**
     * Which color the local player controls.
     * Assigned by the server when the player joins a room.
     * Defaults to 'white' for local single-player.
     * @type {'white' | 'black'}
     */
    localPlayerColor: 'white',

    /**
     * The currently selected piece and its legal destinations, or null.
     * @type {{ row: number, col: number, moves: Array } | null}
     */
    activeSelection: null,

    /**
     * The last move applied, used for square highlighting.
     * @type {{ fromRow: number, fromCol: number, toRow: number, toCol: number } | null}
     */
    lastMove: null,

    /**
     * Current game status, updated by the move dispatcher after each move.
     * @type {'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'}
     */
    status: 'playing',

    /**
     * The active room ID, set when the player joins a room via WebSocket.
     * Null in single-player / local mode.
     * @type {string | null}
     */
    roomId: null,

    /**
     * WebSocket connection status — mirrors socket.js internal state.
     * Updated by socket.js via onSocketStatusChange().
     * @type {'offline' | 'connecting' | 'connected' | 'error'}
     */
    connectionStatus: 'offline',
};
