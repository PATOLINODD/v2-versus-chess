/**
 * socket.js
 * WebSocket client — the single place that owns the connection lifecycle.
 *
 * ─── Design rules ────────────────────────────────────────────────────────────
 *  1. Only THIS file imports the native WebSocket constructor.
 *  2. All other modules talk to the server through the typed helpers below
 *     (sendMove, sendSettings, sendReady …) — never through a raw socket.
 *  3. Incoming messages are dispatched to handler functions that live in the
 *     modules that own the relevant state (moveDispatcher, settings, …).
 *     This file wires them together; it does NOT contain business logic.
 *
 * ─── Message envelope (server ↔ client) ──────────────────────────────────────
 *  Every message is a JSON object with at least a `type` string field.
 *
 *  Client → Server
 *  ───────────────
 *  { type: 'join',     roomId: string }
 *  { type: 'settings', piecesSkin: string, soundPack: string,
 *                       boardColor: number, boardLight: number }
 *  { type: 'move',     from: string, to: string }          // algebraic notation
 *  { type: 'ready' }                                        // player is ready to start
 *
 *  Server → Client
 *  ───────────────
 *  { type: 'room_joined',  roomId: string, color: 'white'|'black',
 *                           opponentConnected: boolean }
 *  { type: 'opponent_settings', piecesSkin: string, soundPack: string,
 *                                boardColor: number, boardLight: number }
 *  { type: 'move',         from: string, to: string }
 *  { type: 'game_start' }
 *  { type: 'opponent_disconnected' }
 *  { type: 'error',        message: string }
 */

import { localSettings, applyOpponentSettings } from './settings.js';
import { receiveRemoteMove }                     from './moveDispatcher.js';
import { gameState }                             from './gameState.js';
import { algebraicToNumeric }                    from './utils/util.js';
import { game }                                  from '../engine.js';

// ─── Connection state ─────────────────────────────────────────────────────────

/** @type {WebSocket | null} */
let _socket = null;

/** @type {'disconnected' | 'connecting' | 'connected' | 'error'} */
let _status = 'disconnected';

/** Callbacks registered by other modules to react to connection changes. */
const _statusListeners = new Set();

// ─── Public read-only accessors ───────────────────────────────────────────────

/** Returns the current connection status. */
export function getSocketStatus() {
    return _status;
}

/**
 * Register a callback that fires whenever the connection status changes.
 * @param {(status: string) => void} fn
 * @returns {() => void} Unsubscribe function
 */
export function onSocketStatusChange(fn) {
    _statusListeners.add(fn);
    return () => _statusListeners.delete(fn);
}


// ─── Connection lifecycle ─────────────────────────────────────────────────────

/**
 * Opens a WebSocket connection to the game server.
 * Safe to call multiple times — does nothing if already connected/connecting.
 *
 * @param {string} [url] - WebSocket server URL. Defaults to the current host.
 * @returns {Promise<void>} Resolves when the connection is open.
 */
export function connect(url) {
    if (_socket && (_status === 'connected' || _status === 'connecting')) {
        return Promise.resolve();
    }

    const wsUrl = url ?? `ws://${location.host}/ws`;
    _setStatus('connecting');

    return new Promise((resolve, reject) => {
        _socket = new WebSocket(wsUrl);

        _socket.addEventListener('open', () => {
            _setStatus('connected');
            resolve();
        });

        _socket.addEventListener('message', _handleMessage);

        _socket.addEventListener('close', () => {
            _setStatus('disconnected');
            _socket = null;
        });

        _socket.addEventListener('error', (err) => {
            console.error('[socket] WebSocket error:', err);
            _setStatus('error');
            reject(err);
        });
    });
}

/** Gracefully closes the WebSocket connection. */
export function disconnect() {
    if (_socket) {
        _socket.close();
        _socket = null;
    }
}


// ─── Outgoing messages ────────────────────────────────────────────────────────

/**
 * Joins a game room. The server responds with a `room_joined` message
 * containing the player's assigned color and whether an opponent is present.
 *
 * @param {string} roomId
 */
export function sendJoin(roomId) {
    _send({ type: 'join', roomId });
}

/**
 * Broadcasts the local player's cosmetic settings to the server so the
 * opponent can see our piece skin, sound pack, and board color.
 * Call this immediately after joining a room.
 */
export function sendSettings() {
    _send({
        type:       'settings',
        piecesSkin: localSettings.piecesSkin,
        soundPack:  localSettings.soundPack,
        boardColor: localSettings.boardColor,
        boardLight: localSettings.boardLight,
    });
}

/**
 * Sends a move to the server in algebraic notation.
 * The server validates the move and broadcasts it to the opponent.
 *
 * @param {string} from - e.g. "e2"
 * @param {string} to   - e.g. "e4"
 */
export function sendMove(from, to) {
    _send({ type: 'move', from, to });
}

/** Signals to the server that the local player is ready to begin. */
export function sendReady() {
    _send({ type: 'ready' });
}


// ─── Incoming message router ─────────────────────────────────────────────────

/**
 * Central dispatcher for all incoming server messages.
 * Keeps routing logic in one place; delegates to domain-specific handlers.
 *
 * @param {MessageEvent} event
 */
function _handleMessage(event) {
    let msg;
    try {
        msg = JSON.parse(event.data);
    } catch {
        console.error('[socket] Received non-JSON message:', event.data);
        return;
    }

    switch (msg.type) {

        case 'room_joined':
            _onRoomJoined(msg);
            break;

        case 'opponent_settings':
            // Delegate to settings.js — it owns opponent preferences
            applyOpponentSettings({
                piecesSkin: msg.piecesSkin,
                soundPack:  msg.soundPack,
                boardColor: msg.boardColor,
                boardLight: msg.boardLight,
            });
            break;

        case 'move':
            _onRemoteMove(msg);
            break;

        case 'game_start':
            // TODO: hide the lobby UI, show the board
            document.dispatchEvent(new CustomEvent('game:start'));
            break;

        case 'opponent_disconnected':
            document.dispatchEvent(new CustomEvent('game:opponent-disconnected'));
            break;

        case 'error':
            console.error('[socket] Server error:', msg.message);
            break;

        default:
            console.warn('[socket] Unknown message type:', msg.type);
    }
}


// ─── Incoming message handlers ────────────────────────────────────────────────

/**
 * Handles the server's `room_joined` confirmation.
 * Sets the local player's color, records the roomId, and shares our settings.
 *
 * @param {{ roomId: string, color: 'white'|'black', opponentConnected: boolean }} msg
 */
function _onRoomJoined(msg) {
    gameState.localPlayerColor = msg.color;
    gameState.roomId           = msg.roomId;

    // Immediately share our cosmetic settings with the opponent
    sendSettings();

    document.dispatchEvent(new CustomEvent('game:room-joined', { detail: msg }));
}

/**
 * Handles an incoming move from the remote player.
 * Converts algebraic notation to board coordinates and delegates to the
 * move dispatcher, which owns all move animation and state logic.
 *
 * @param {{ from: string, to: string }} msg
 */
function _onRemoteMove(msg) {
    const fromSquare = algebraicToNumeric(msg.from);
    const toSquare   = algebraicToNumeric(msg.to);

    // Find the matching move object in the engine's legal move list
    const fromSq = ((7 - fromSquare.row) << 4) | fromSquare.col;
    const toSq   = ((7 - toSquare.row)   << 4) | toSquare.col;

    const moveObj = game.moves.find(
        m => m.from === fromSq && m.to === toSq
    );

    if (!moveObj) {
        console.error('[socket] Received illegal move from server:', msg);
        return;
    }

    receiveRemoteMove(fromSquare, toSquare, moveObj);
}


// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Updates the internal status, mirrors it into gameState, and notifies
 * all registered listeners.
 * @param {string} newStatus
 */
function _setStatus(newStatus) {
    _status = newStatus;
    // Mirror into gameState so other modules don't need to import socket.js
    import('./gameState.js').then(({ gameState }) => {
        gameState.connectionStatus = newStatus === 'connected' ? 'connected'
            : newStatus === 'connecting' ? 'connecting'
            : newStatus === 'error'      ? 'error'
            : 'offline';
    });
    _statusListeners.forEach(fn => fn(newStatus));
}

/**
 * Serializes a payload to JSON and sends it through the open socket.
 * Silently drops the message (with a warning) if the socket is not ready.
 *
 * @param {object} payload
 */
function _send(payload) {
    if (!_socket || _socket.readyState !== WebSocket.OPEN) {
        console.warn('[socket] Cannot send — socket not open:', payload);
        return;
    }
    _socket.send(JSON.stringify(payload));
}
