import { Board } from './src/chess-movegen.js';

export const game = new Board();
game.loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
game.generateMoves();

export function syncBoardState(boardState) {
    const fenMap = {
        1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K',
        9: 'p', 10: 'n', 11: 'b', 12: 'r', 13: 'q', 14: 'k'
    };

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            let rank = 7 - row;
            let file = col;
            let sq = (rank << 4) | file;
            let piece = game.pieceat[sq];
            boardState[row][col] = piece ? fenMap[piece] : null;
        }
    }
}
