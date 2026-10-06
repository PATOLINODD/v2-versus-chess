/**
 * sounds.js
 * Handles preloading and playback of chess sound effects.
 *
 * ─── Design ──────────────────────────────────────────────────────────────────
 * Sounds are keyed by `<packName>/<eventName>` and cached so every pack is
 * loaded at most once. This lets us preload BOTH the local player's pack AND
 * the opponent's pack as soon as the opponent's settings arrive, so there is
 * zero latency when their move triggers a sound.
 *
 * ─── WebSocket integration ────────────────────────────────────────────────────
 * `playSoundForMove(moveFlags, gameStatus, soundPack?)` accepts an optional
 * third argument so the move dispatcher can request the opponent's pack when
 * applying a remote move — no other changes needed in this file.
 *
 * Call `preloadSoundPack(packName)` whenever `applyOpponentSettings()` is
 * called in settings.js so the opponent's sounds are ready before their first
 * move arrives.
 */

import { localSettings } from './settings.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Two-level cache:  packName → { eventName → HTMLAudioElement }
 * @type {Map<string, Map<string, HTMLAudioElement>>}
 */
const _cache = new Map();

const SOUND_EVENTS = ['move', 'capture', 'check', 'checkmate'];


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Preloads all sound files for a given pack into the cache.
 * Safe to call multiple times — already-loaded packs are skipped.
 *
 * @param {string} [packName] - Defaults to `localSettings.soundPack`
 */
export function preloadSoundPack(packName = localSettings.soundPack) {
    if (_cache.has(packName)) return; // already loaded

    const packMap = new Map();

    for (const event of SOUND_EVENTS) {
        const audio = new Audio(`./assets/sounds/${packName}/${event}.mp3`);
        audio.preload = 'auto';
        packMap.set(event, audio);
    }

    _cache.set(packName, packMap);
}

/**
 * Preloads the local player's default sound pack.
 * Alias kept for backwards compatibility with the existing index.js call.
 */
export function preloadSounds() {
    preloadSoundPack(localSettings.soundPack);
}

/**
 * Plays a named chess sound from a specific pack.
 * Falls back to the local pack if the requested pack is not yet loaded.
 *
 * @param {'move'|'capture'|'check'|'checkmate'} name
 * @param {string} [packName] - Defaults to `localSettings.soundPack`
 */
export function playSound(name, packName = localSettings.soundPack) {
    const packMap = _cache.get(packName) ?? _cache.get(localSettings.soundPack);
    const audio   = packMap?.get(name);

    if (!audio) {
        console.warn(`[sounds] Unknown sound "${name}" in pack "${packName}"`);
        return;
    }

    // Rewind to allow rapid replaying (e.g. consecutive captures)
    audio.currentTime = 0;
    audio.play().catch(err => {
        // Browsers block autoplay until the user has interacted with the page.
        console.warn(`[sounds] Could not play "${name}" (${packName}):`, err.message);
    });
}

/**
 * Determines and plays the correct sound for the current game state.
 * Priority: checkmate > check > capture > move
 *
 * @param {{ isCapture: boolean }}                         moveFlags
 * @param {{ inCheckMate: boolean, inCheck: boolean }}     gameStatus
 * @param {string}                                        [soundPack] - Pack to use;
 *   defaults to local. Pass the opponent's pack when applying a remote move.
 */
export function playSoundForMove(moveFlags, gameStatus, soundPack = localSettings.soundPack) {
    if (gameStatus.inCheckMate) {
        playSound('checkmate', soundPack);
    } else if (gameStatus.inCheck) {
        playSound('check', soundPack);
    } else if (moveFlags.isCapture) {
        playSound('capture', soundPack);  // ← was 'checkmate' — bug fixed
    } else {
        playSound('move', soundPack);
    }
}
