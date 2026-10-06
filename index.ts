/**
 * index.ts — Bun HTTP + WebSocket server
 *
 * ─── Responsibilities ─────────────────────────────────────────────────────────
 *  1. Serve the static frontend (HTML, JS, CSS, assets)
 *  2. Upgrade GET /ws to a WebSocket connection
 *  3. Manage game rooms — pair two players and relay messages between them
 *
 * ─── Room lifecycle ───────────────────────────────────────────────────────────
 *  Player A connects → sends { type: 'join', roomId: 'abc' }
 *    → Server creates room 'abc', assigns color 'white', sends room_joined
 *    → Player A sends { type: 'settings', … }
 *
 *  Player B connects → sends { type: 'join', roomId: 'abc' }
 *    → Server finds room 'abc', assigns color 'black', sends room_joined to B
 *    → Server sends opponent_connected to A
 *    → Both players send their settings; server relays each to the other
 *    → Server sends game_start to both players
 *
 *  During play:
 *    Either player sends { type: 'move', from: 'e2', to: 'e4' }
 *    → Server relays the move to the opponent only (not back to sender)
 *
 *  On disconnect:
 *    → Server sends { type: 'opponent_disconnected' } to the remaining player
 *    → Room is cleaned up
 *
 * ─── Message envelope ─────────────────────────────────────────────────────────
 *  See frontend/src/socket.js for the full protocol documentation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
    roomId: string;
    color:  'white' | 'black';
}

interface Room {
    white: ServerWebSocket<PlayerData> | null;
    black: ServerWebSocket<PlayerData> | null;
}

type ServerWebSocket<T> = import('bun').ServerWebSocket<T>;

// ─── Room registry ────────────────────────────────────────────────────────────

/** Active game rooms keyed by roomId. */
const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { white: null, black: null });
    }
    return rooms.get(roomId)!;
}

function getOpponent(
    room: Room,
    color: 'white' | 'black'
): ServerWebSocket<PlayerData> | null {
    return color === 'white' ? room.black : room.white;
}

function send(ws: ServerWebSocket<PlayerData>, payload: object) {
    ws.send(JSON.stringify(payload));
}

function removePlayerFromRoom(ws: ServerWebSocket<PlayerData>) {
    const { roomId, color } = ws.data;
    const room = rooms.get(roomId);
    if (!room) return;

    // Notify the opponent
    const opponent = getOpponent(room, color);
    if (opponent) {
        send(opponent, { type: 'opponent_disconnected' });
    }

    // Clean up the slot
    room[color] = null;

    // Delete the room entirely if both seats are empty
    if (!room.white && !room.black) {
        rooms.delete(roomId);
        console.log(`[room] ${roomId} deleted (empty)`);
    }
}


// ─── Server ───────────────────────────────────────────────────────────────────

import indexHtml from './frontend/index.html';

const server = Bun.serve<PlayerData>({
    port: 3000,

    routes: {
        '/': indexHtml,
    },

    async fetch(req, server) {
        const url = new URL(req.url);

        // ── WebSocket upgrade ──────────────────────────────────────────────
        if (url.pathname === '/ws') {
            // Data is populated after the 'join' message; use placeholder until then
            const upgraded = server.upgrade<PlayerData>(req, {
                data: { roomId: '', color: 'white' },
            });
            if (upgraded) return; // Bun handles the response
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // ── Static file serving ────────────────────────────────────────────
        const file = Bun.file(`./frontend${url.pathname}`);
        if (await file.exists()) {
            return new Response(file);
        }

        return new Response('Not Found', { status: 404 });
    },

    websocket: {
        // ── Connection opened ──────────────────────────────────────────────
        open(ws) {
            console.log('[ws] Client connected');
        },

        // ── Message received ───────────────────────────────────────────────
        message(ws, raw) {
            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(raw as string);
            } catch {
                console.warn('[ws] Non-JSON message received');
                return;
            }

            switch (msg.type) {

                case 'join': {
                    const roomId = String(msg.roomId ?? '').trim();
                    if (!roomId) {
                        send(ws, { type: 'error', message: 'roomId is required' });
                        return;
                    }

                    const room = getOrCreateRoom(roomId);

                    // Assign the first available color
                    if (!room.white) {
                        room.white        = ws;
                        ws.data.roomId    = roomId;
                        ws.data.color     = 'white';

                        send(ws, {
                            type:              'room_joined',
                            roomId,
                            color:             'white',
                            opponentConnected: !!room.black,
                        });

                        console.log(`[room] ${roomId} — white joined`);

                    } else if (!room.black) {
                        room.black        = ws;
                        ws.data.roomId    = roomId;
                        ws.data.color     = 'black';

                        send(ws, {
                            type:              'room_joined',
                            roomId,
                            color:             'black',
                            opponentConnected: true,
                        });

                        // Notify white that their opponent arrived
                        send(room.white!, { type: 'opponent_connected' });

                        console.log(`[room] ${roomId} — black joined, game ready`);

                        // Both seats filled → start the game
                        send(ws,         { type: 'game_start' });
                        send(room.white!, { type: 'game_start' });

                    } else {
                        send(ws, { type: 'error', message: 'Room is full' });
                    }
                    break;
                }

                case 'settings': {
                    // Relay the sender's cosmetic settings to their opponent
                    const room     = rooms.get(ws.data.roomId);
                    const opponent = room ? getOpponent(room, ws.data.color) : null;
                    if (!opponent) break;

                    send(opponent, {
                        type:       'opponent_settings',
                        piecesSkin: msg.piecesSkin,
                        soundPack:  msg.soundPack,
                        boardColor: msg.boardColor,
                        boardLight: msg.boardLight,
                    });
                    break;
                }

                case 'move': {
                    // Validate and relay the move to the opponent
                    const room     = rooms.get(ws.data.roomId);
                    const opponent = room ? getOpponent(room, ws.data.color) : null;
                    if (!opponent) break;

                    // Basic format validation — full legal-move validation
                    // belongs on the client (engine); the server just relays.
                    const from = String(msg.from ?? '');
                    const to   = String(msg.to   ?? '');
                    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
                        send(ws, { type: 'error', message: 'Invalid move format' });
                        break;
                    }

                    send(opponent, { type: 'move', from, to });
                    console.log(`[room] ${ws.data.roomId} — ${ws.data.color} played ${from}→${to}`);
                    break;
                }

                case 'ready':
                    // Reserved for future lobby UI handshake
                    break;

                default:
                    console.warn('[ws] Unknown message type:', msg.type);
            }
        },

        // ── Connection closed ──────────────────────────────────────────────
        close(ws) {
            console.log(`[ws] ${ws.data.color ?? 'unjoined'} disconnected from room "${ws.data.roomId}"`);
            if (ws.data.roomId) {
                removePlayerFromRoom(ws);
            }
        },
    },
});

console.log(`Server running on: ${server.url}`);
