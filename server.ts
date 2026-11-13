import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientWsMessage,
  Passage,
  PublicRoomSummary,
  RacerState,
  RoomState,
  ServerWsMessage,
  ShareableScore,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface ServerRoom {
  state: RoomState;
  clients: Map<string, WebSocket>;
  countdownInterval: ReturnType<typeof setInterval> | null;
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, ServerRoom>();
const sharedResults = new Map<string, ShareableScore>();
const leaderboardEntries: ShareableScore[] = [];

function generateId(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateRoomCode(): string {
  let code = generateId(5);
  while (rooms.has(code)) {
    code = generateId(5);
  }
  return code;
}

function getLocalLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('169.254.')
      ) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

function sendToSocket(ws: WebSocket, message: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastRoomState(room: ServerRoom): void {
  const payload: ServerWsMessage = {
    type: 'room:state',
    payload: { room: room.state },
  };
  const encoded = JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

function broadcastRoomEvent(room: ServerRoom, message: ServerWsMessage): void {
  const encoded = JSON.stringify(message);
  for (const client of room.clients.values()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

function sanitizeText(input: string, maxLen: number): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function sanitizePassage(passage: Passage): Passage {
  const cleanText = passage.text.trim().replace(/\s+/g, ' ').slice(0, 1200);
  return {
    id: passage.id || `custom-${Date.now()}`,
    title: sanitizeText(passage.title || 'Teks Balapan', 80),
    author: sanitizeText(passage.author || 'Pemain', 60),
    category: sanitizeText(passage.category || 'Kustom', 40),
    language: passage.language === 'en' ? 'en' : 'id',
    difficulty:
      passage.difficulty === 'Menengah' || passage.difficulty === 'Tantangan'
        ? passage.difficulty
        : 'Normal',
    text: cleanText.length >= 15 ? cleanText : 'Kecepatan mengetik lahir dari ketelitian dan irama yang stabil.',
  };
}

function removePlayerFromRoom(playerId: string, roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.clients.delete(playerId);
  const idx = room.state.players.findIndex((p) => p.id === playerId);
  if (idx !== -1) {
    const wasHost = room.state.players[idx].isHost;
    room.state.players.splice(idx, 1);

    if (wasHost && room.state.players.length > 0) {
      room.state.players[0].isHost = true;
    }
  }

  if (room.state.players.length === 0) {
    if (room.countdownInterval) {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
    }
    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
    }
    room.cleanupTimeout = setTimeout(() => {
      const current = rooms.get(roomCode);
      if (current && current.state.players.length === 0) {
        rooms.delete(roomCode);
      }
    }, 30000);
  } else {
    if (
      room.state.status === 'RACING' &&
      room.state.players.every((p) => p.finished)
    ) {
      room.state.status = 'FINISHED';
    }
    broadcastRoomState(room);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/network-info', (_req, res) => {
    res.json({
      lanUrls: getLocalLanUrls(PORT),
      port: PORT,
      hostname: os.hostname(),
    });
  });

  app.get('/api/rooms', (_req, res) => {
    const publicRooms: PublicRoomSummary[] = [];
    for (const room of rooms.values()) {
      if (room.state.isPublic && room.state.players.length > 0) {
        const host = room.state.players.find((p) => p.isHost) || room.state.players[0];
        publicRooms.push({
          code: room.state.code,
          name: room.state.name,
          hostName: host?.name || 'Host',
          playerCount: room.state.players.length,
          status: room.state.status,
          language: room.state.passage.language,
        });
      }
    }
    res.json({ rooms: publicRooms });
  });

  app.post('/api/results', (req, res) => {
    const body = req.body as Partial<ShareableScore>;
    if (
      !body ||
      typeof body.playerName !== 'string' ||
      typeof body.wpm !== 'number' ||
      typeof body.accuracy !== 'number'
    ) {
      res.status(400).json({ error: 'Data skor tidak valid.' });
      return;
    }

    const id = generateId(7);
    const entry: ShareableScore = {
      id,
      playerName: sanitizeText(body.playerName, 24) || 'Pembalap',
      carModel: body.carModel || 'formula',
      carColor: typeof body.carColor === 'string' ? body.carColor : '#EA580C',
      wpm: Math.max(0, Math.min(350, Math.round(body.wpm))),
      accuracy: Math.max(0, Math.min(100, Math.round(body.accuracy * 10) / 10)),
      elapsedMs: Math.max(500, Math.round(body.elapsedMs || 1000)),
      mistakes: Math.max(0, Math.round(body.mistakes || 0)),
      rank: typeof body.rank === 'number' ? body.rank : null,
      totalRacers: Math.max(1, Math.round(body.totalRacers || 1)),
      mode: body.mode === 'wifi' ? 'wifi' : 'solo',
      passageId: typeof body.passageId === 'string' ? body.passageId : 'custom',
      passageTitle: sanitizeText(body.passageTitle || 'Lintasan Cepat', 80),
      passageAuthor: sanitizeText(body.passageAuthor || 'TypeRally', 60),
      createdAt: Date.now(),
    };

    sharedResults.set(id, entry);
    if (sharedResults.size > 500) {
      const oldestKey = sharedResults.keys().next().value;
      if (oldestKey) sharedResults.delete(oldestKey);
    }

    leaderboardEntries.push(entry);
    leaderboardEntries.sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
    if (leaderboardEntries.length > 50) {
      leaderboardEntries.length = 50;
    }

    res.json({ result: entry });
  });

  app.get('/api/results/:id', (req, res) => {
    const result = sharedResults.get(req.params.id.toUpperCase());
    if (!result) {
      res.status(404).json({ error: 'Skor tidak ditemukan.' });
      return;
    }
    res.json({ result });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: leaderboardEntries.slice(0, 20) });
  });

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface ExtWebSocket extends WebSocket {
    isAlive: boolean;
    playerId: string;
    roomCode: string | null;
  }

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as ExtWebSocket;
    ws.isAlive = true;
    ws.playerId = generateId(10);
    ws.roomCode = null;

    sendToSocket(ws, {
      type: 'session:init',
      payload: { playerId: ws.playerId },
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (rawData) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(rawData.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'room:create') {
        if (ws.roomCode) {
          removePlayerFromRoom(ws.playerId, ws.roomCode);
          ws.roomCode = null;
        }

        const code = generateRoomCode();
        const playerName = sanitizeText(msg.payload.playerName || 'Host', 20) || 'Host';
        const roomName = sanitizeText(msg.payload.roomName || `Ruang ${playerName}`, 32);
        const passage = sanitizePassage(msg.payload.passage);

        const hostPlayer: RacerState = {
          id: ws.playerId,
          name: playerName,
          carModel: msg.payload.carModel || 'formula',
          carColor: msg.payload.carColor || '#EA580C',
          isHost: true,
          isReady: true,
          isConnected: true,
          progress: 0,
          typedChars: 0,
          wpm: 0,
          accuracy: 100,
          mistakes: 0,
          finished: false,
          finishRank: null,
          finishTimeMs: null,
        };

        const room: ServerRoom = {
          state: {
            code,
            name: roomName,
            status: 'LOBBY',
            isPublic: Boolean(msg.payload.isPublic),
            passage,
            countdownSeconds: 3,
            startTime: null,
            players: [hostPlayer],
          },
          clients: new Map([[ws.playerId, ws]]),
          countdownInterval: null,
          cleanupTimeout: null,
        };

        rooms.set(code, room);
        ws.roomCode = code;
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'room:join') {
        const targetCode = msg.payload.code.trim().toUpperCase();
        const room = rooms.get(targetCode);
        if (!room) {
          sendToSocket(ws, {
            type: 'error',
            payload: { message: `Ruang dengan kode "${targetCode}" tidak ditemukan.` },
          });
          return;
        }

        if (room.state.players.length >= 8) {
          sendToSocket(ws, {
            type: 'error',
            payload: { message: 'Ruang balap sudah penuh (maksimal 8 pembalap).' },
          });
          return;
        }

        if (ws.roomCode && ws.roomCode !== targetCode) {
          removePlayerFromRoom(ws.playerId, ws.roomCode);
        }

        if (room.cleanupTimeout) {
          clearTimeout(room.cleanupTimeout);
          room.cleanupTimeout = null;
        }

        const existing = room.state.players.find((p) => p.id === ws.playerId);
        if (!existing) {
          const playerName =
            sanitizeText(msg.payload.playerName || 'Pembalap', 20) || 'Pembalap';
          const newPlayer: RacerState = {
            id: ws.playerId,
            name: playerName,
            carModel: msg.payload.carModel || 'gt',
            carColor: msg.payload.carColor || '#2563EB',
            isHost: room.state.players.length === 0,
            isReady: false,
            isConnected: true,
            progress: 0,
            typedChars: 0,
            wpm: 0,
            accuracy: 100,
            mistakes: 0,
            finished: false,
            finishRank: null,
            finishTimeMs: null,
          };
          room.state.players.push(newPlayer);
        }

        room.clients.set(ws.playerId, ws);
        ws.roomCode = targetCode;
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'room:leave') {
        if (ws.roomCode) {
          removePlayerFromRoom(ws.playerId, ws.roomCode);
          ws.roomCode = null;
          sendToSocket(ws, { type: 'room:left' });
        }
        return;
      }

      if (!ws.roomCode) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const player = room.state.players.find((p) => p.id === ws.playerId);
      if (!player) return;

      if (msg.type === 'player:ready') {
        if (room.state.status !== 'LOBBY') return;
        player.isReady = Boolean(msg.payload.isReady);
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'player:update_car') {
        if (room.state.status !== 'LOBBY') return;
        player.carModel = msg.payload.carModel;
        player.carColor = msg.payload.carColor;
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'room:update_passage') {
        if (!player.isHost || room.state.status !== 'LOBBY') return;
        room.state.passage = sanitizePassage(msg.payload.passage);
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'race:start') {
        if (!player.isHost || room.state.status !== 'LOBBY') return;
        if (room.countdownInterval) {
          clearInterval(room.countdownInterval);
        }

        room.state.status = 'COUNTDOWN';
        room.state.countdownSeconds = 3;
        room.state.startTime = null;
        for (const p of room.state.players) {
          p.progress = 0;
          p.typedChars = 0;
          p.wpm = 0;
          p.accuracy = 100;
          p.mistakes = 0;
          p.finished = false;
          p.finishRank = null;
          p.finishTimeMs = null;
        }

        broadcastRoomState(room);
        broadcastRoomEvent(room, { type: 'race:countdown', payload: { seconds: 3 } });

        room.countdownInterval = setInterval(() => {
          const currentRoom = rooms.get(room.state.code);
          if (!currentRoom || currentRoom.state.status !== 'COUNTDOWN') {
            if (room.countdownInterval) clearInterval(room.countdownInterval);
            return;
          }

          currentRoom.state.countdownSeconds -= 1;
          if (currentRoom.state.countdownSeconds > 0) {
            broadcastRoomState(currentRoom);
            broadcastRoomEvent(currentRoom, {
              type: 'race:countdown',
              payload: { seconds: currentRoom.state.countdownSeconds },
            });
          } else {
            if (currentRoom.countdownInterval) {
              clearInterval(currentRoom.countdownInterval);
              currentRoom.countdownInterval = null;
            }
            const now = Date.now();
            currentRoom.state.status = 'RACING';
            currentRoom.state.startTime = now;
            currentRoom.state.countdownSeconds = 0;
            broadcastRoomEvent(currentRoom, {
              type: 'race:started',
              payload: { startTime: now },
            });
            broadcastRoomState(currentRoom);
          }
        }, 1000);
        return;
      }

      if (msg.type === 'race:progress') {
        if (room.state.status !== 'RACING' || !room.state.startTime) return;
        if (player.finished) return;

        const passageLen = room.state.passage.text.length;
        const typedChars = Math.max(0, Math.min(passageLen, Math.round(msg.payload.typedChars)));
        const elapsedMs = Math.max(300, Date.now() - room.state.startTime);
        const wpm = Math.min(320, Math.round((typedChars / 5) / (elapsedMs / 60000)));
        const progress = Math.min(100, Math.round((typedChars / passageLen) * 1000) / 10);

        player.typedChars = typedChars;
        player.wpm = wpm;
        player.mistakes = Math.max(0, Math.round(msg.payload.mistakes));
        player.accuracy = Math.max(0, Math.min(100, Math.round(msg.payload.accuracy * 10) / 10));
        player.progress = progress;

        if (msg.payload.finished && typedChars >= passageLen) {
          player.finished = true;
          player.progress = 100;
          player.finishTimeMs = elapsedMs;
          const finishedCount = room.state.players.filter((p) => p.finished).length;
          player.finishRank = finishedCount;

          if (room.state.players.every((p) => p.finished)) {
            room.state.status = 'FINISHED';
          }
        }

        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'race:rematch') {
        if (!player.isHost) return;
        if (room.countdownInterval) {
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;
        }
        room.state.status = 'LOBBY';
        room.state.countdownSeconds = 3;
        room.state.startTime = null;
        room.state.passage = sanitizePassage(msg.payload.passage);
        for (const p of room.state.players) {
          p.progress = 0;
          p.typedChars = 0;
          p.wpm = 0;
          p.accuracy = 100;
          p.mistakes = 0;
          p.finished = false;
          p.finishRank = null;
          p.finishTimeMs = null;
          p.isReady = p.isHost;
        }
        broadcastRoomState(room);
      }
    });

    ws.on('close', () => {
      if (ws.roomCode) {
        removePlayerFromRoom(ws.playerId, ws.roomCode);
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const rawWs of wss.clients) {
      const ws = rawWs as ExtWebSocket;
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    const lanUrls = getLocalLanUrls(PORT);
    console.log(`TypeRally server listening on http://localhost:${PORT}`);
    if (lanUrls.length > 0) {
      console.log(`LAN / Wi-Fi URLs: ${lanUrls.join(', ')}`);
    }
  });
}

startServer();
