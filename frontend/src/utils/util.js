export function getComplementaryColor(color) {
    if(color >= 360 || color <= 0) return 180;
    return color < 240 ? color + 180 : color - 180;
}

/**
 * Translates numeric UI coordinates (e.g., row: 6, col: 4) 
 * into standard algebraic notation (e.g., "e2").
 */
export function numericToAlgebraic(row, col) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    
    // Convert 0-indexed column to a letter (0 -> 'a')
    const file = files[col];
    
    // Convert 0-indexed row (where 0 is top) to a rank (where 8 is top)
    const rank = 8 - row;
    
    return `${file}${rank}`;
}

/**
 * Translates algebraic notation (e.g., "e4") 
 * back into numeric UI coordinates (e.g., {row: 4, col: 4}).
 */
export function algebraicToNumeric(algebraicStr) {
    const file = algebraicStr.charAt(0); // e.g., 'e'
    const rank = parseInt(algebraicStr.charAt(1), 10); // e.g., 4

    // Subtract the ASCII value of 'a' to get a 0-7 index
    const col = file.charCodeAt(0) - 'a'.charCodeAt(0);
    
    // Invert the rank to get the 0-7 row index
    const row = 8 - rank;

    return { row, col };
}