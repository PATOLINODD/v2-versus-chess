/**
 * settings.js
 * Centralized player preferences — the only values that differ between players
 * in a multiplayer game (piece skin, sound pack, board theme, animations).
 *
 * ─── WebSocket integration ────────────────────────────────────────────────────
 * On room join:
 *   socket.js calls `sendSettings()` which serialises `localSettings`.
 *
 * On opponent settings received:
 *   socket.js calls `applyOpponentSettings(msg)` which:
 *     1. Stores the opponent's prefs in `opponentSettings`
 *     2. Preloads the opponent's sound pack so it's ready before their first move
 *     3. Dispatches `opponent-settings-changed` so the renderer can refresh
 *        (e.g. show the opponent's board color in a preview panel)
 *
 * ─── Rendering contract ───────────────────────────────────────────────────────
 * `drawChessboard.js` reads:
 *   - `localSettings.piecesSkin`    to render the local player's pieces
 *   - `opponentSettings.piecesSkin` to render the opponent's pieces
 *   - `localSettings.boardColor/boardLight` for the board squares
 *
 * Which side is "local" and which is "opponent" is determined by
 * `gameState.localPlayerColor` ('white' | 'black').
 */

// ─── Local player settings ────────────────────────────────────────────────────

export const localSettings = {
    /** SVG sprite sheet name — maps to assets/pieces/<name>.svg */
    piecesSkin: 'standard',

    /** Sound pack folder name — maps to assets/sounds/<name>/ */
    soundPack: 'standard',

    /** HSL hue (0–360) for the board color theme */
    boardColor: 40,

    /** HSL lightness (0–100) for the light squares */
    boardLight: 70,
};


// ─── Opponent settings ────────────────────────────────────────────────────────

/**
 * The opponent's cosmetic preferences, populated once they connect.
 * Null until the server sends an `opponent_settings` message.
 * @type {typeof localSettings | null}
 */
export let opponentSettings = null;

/**
 * Called by socket.js when the server broadcasts the opponent's preferences.
 * Falls back to localSettings for any key the opponent didn't send.
 *
 * Side-effects:
 *   - Preloads the opponent's sound pack via sounds.js
 *   - Fires a DOM event so UI components can react (e.g. piece re-render)
 *
 * @param {Partial<typeof localSettings>} settings
 */
export function applyOpponentSettings(settings) {
    opponentSettings = { ...localSettings, ...settings };

    // Preload the opponent's sound pack so it's ready before their first move.
    // Import is dynamic to avoid a circular dependency at load time:
    //   settings.js → sounds.js → settings.js (localSettings)
    import('./sounds.js').then(({ preloadSoundPack }) => {
        preloadSoundPack(opponentSettings.soundPack);
    });

    // Notify the renderer so it can swap the opponent's piece skin.
    document.dispatchEvent(
        new CustomEvent('opponent-settings-changed', { detail: opponentSettings })
    );
}
