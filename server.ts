import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  CarModelId,
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
  const cleanText = (passage?.text || '').trim().replace(/\s+/g, ' ').slice(0, 1200);
  return {
    id: passage?.id || `custom-${Date.now()}`,
    title: sanitizeText(passage?.title || 'Teks Balapan', 80),
    author: sanitizeText(passage?.author || 'Pemain', 60),
    category: sanitizeText(passage?.category || 'Kustom', 40),
    language: passage?.language === 'en' ? 'en' : 'id',
    difficulty:
      passage?.difficulty === 'Menengah' || passage?.difficulty === 'Tantangan'
        ? passage.difficulty
        : 'Normal',
    text:
      cleanText.length >= 15
        ? cleanText
        : 'Kecepatan mengetik lahir dari ketelitian dan irama yang stabil.',
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

function createRoomForPlayer(params: {
  playerId: string;
  playerName: string;
  carModel: CarModelId;
  carColor: string;
  roomName: string;
  isPublic: boolean;
  passage: Passage;
  ws?: WebSocket;
}): ServerRoom {
  const code = generateRoomCode();
  const cleanPlayerName = sanitizeText(params.playerName || 'Host', 20) || 'Host';
  const cleanRoomName = sanitizeText(params.roomName || `Ruang ${cleanPlayerName}`, 32);
  const passage = sanitizePassage(params.passage);

  const hostPlayer: RacerState = {
    id: params.playerId,
    name: cleanPlayerName,
    carModel: params.carModel || 'formula',
    carColor: params.carColor || '#EA580C',
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

  const clients = new Map<string, WebSocket>();
  if (params.ws) {
    clients.set(params.playerId, params.ws);
  }

  const room: ServerRoom = {
    state: {
      code,
      name: cleanRoomName,
      status: 'LOBBY',
      isPublic: Boolean(params.isPublic),
      passage,
      countdownSeconds: 3,
      startTime: null,
      players: [hostPlayer],
    },
    clients,
    countdownInterval: null,
    cleanupTimeout: null,
  };

  rooms.set(code, room);
  broadcastRoomState(room);
  return room;
}

function joinRoomForPlayer(params: {
  code: string;
  playerId: string;
  playerName: string;
  carModel: CarModelId;
  carColor: string;
  ws?: WebSocket;
}): { room?: ServerRoom; error?: string } {
  const targetCode = params.code.trim().toUpperCase();
  const room = rooms.get(targetCode);
  if (!room) {
    return { error: `Ruang dengan kode "${targetCode}" tidak ditemukan.` };
  }
  if (room.state.players.length >= 8 && !room.state.players.some((p) => p.id === params.playerId)) {
    return { error: 'Ruang balap sudah penuh (maksimal 8 pembalap).' };
  }

  if (room.cleanupTimeout) {
    clearTimeout(room.cleanupTimeout);
    room.cleanupTimeout = null;
  }

  const existing = room.state.players.find((p) => p.id === params.playerId);
  if (!existing) {
    const cleanName = sanitizeText(params.playerName || 'Pembalap', 20) || 'Pembalap';
    const newPlayer: RacerState = {
      id: params.playerId,
      name: cleanName,
      carModel: params.carModel || 'gt',
      carColor: params.carColor || '#2563EB',
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

  if (params.ws) {
    room.clients.set(params.playerId, params.ws);
  }
  broadcastRoomState(room);
  return { room };
}

function startCountdownInRoom(room: ServerRoom): void {
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
}

function applyProgressInRoom(
  room: ServerRoom,
  player: RacerState,
  payload: {
    typedChars: number;
    mistakes: number;
    accuracy: number;
    finished: boolean;
  }
): void {
  if (room.state.status !== 'RACING' || !room.state.startTime) return;
  if (player.finished) return;

  const passageLen = room.state.passage.text.length;
  const typedChars = Math.max(0, Math.min(passageLen, Math.round(payload.typedChars)));
  const elapsedMs = Math.max(300, Date.now() - room.state.startTime);
  const wpm = Math.min(320, Math.round((typedChars / 5) / (elapsedMs / 60000)));
  const progress = Math.min(100, Math.round((typedChars / passageLen) * 1000) / 10);

  player.typedChars = typedChars;
  player.wpm = wpm;
  player.mistakes = Math.max(0, Math.round(payload.mistakes));
  player.accuracy = Math.max(0, Math.min(100, Math.round(payload.accuracy * 10) / 10));
  player.progress = progress;

  if (payload.finished && typedChars >= passageLen) {
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

  // HTTP fallback & hybrid multiplayer endpoints
  app.post('/api/rooms/create', (req, res) => {
    const body = req.body as {
      playerId?: string;
      playerName?: string;
      carModel?: CarModelId;
      carColor?: string;
      roomName?: string;
      isPublic?: boolean;
      passage?: Passage;
    };
    const playerId = sanitizeText(body.playerId || generateId(10), 24) || generateId(10);
    const room = createRoomForPlayer({
      playerId,
      playerName: body.playerName || 'Host',
      carModel: body.carModel || 'formula',
      carColor: body.carColor || '#EA580C',
      roomName: body.roomName || 'Ruang Balap',
      isPublic: body.isPublic !== false,
      passage: body.passage as Passage,
    });
    res.json({ room: room.state, playerId });
  });

  app.post('/api/rooms/:code/join', (req, res) => {
    const body = req.body as {
      playerId?: string;
      playerName?: string;
      carModel?: CarModelId;
      carColor?: string;
    };
    const playerId = sanitizeText(body.playerId || generateId(10), 24) || generateId(10);
    const result = joinRoomForPlayer({
      code: req.params.code,
      playerId,
      playerName: body.playerName || 'Pembalap',
      carModel: body.carModel || 'gt',
      carColor: body.carColor || '#2563EB',
    });
    if (result.error || !result.room) {
      res.status(404).json({ error: result.error || 'Ruang tidak ditemukan.' });
      return;
    }
    res.json({ room: result.room.state, playerId });
  });

  app.get('/api/rooms/:code/state', (req, res) => {
    const room = rooms.get(req.params.code.trim().toUpperCase());
    if (!room) {
      res.status(404).json({ error: 'Ruang tidak ditemukan atau telah ditutup.' });
      return;
    }
    res.json({ room: room.state });
  });

  app.post('/api/rooms/:code/action', (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Ruang tidak ditemukan.' });
      return;
    }
    const body = req.body as {
      playerId?: string;
      action?: string;
      payload?: Record<string, unknown>;
    };
    const playerId = body.playerId || '';
    if (body.action === 'leave') {
      removePlayerFromRoom(playerId, code);
      res.json({ left: true });
      return;
    }

    const player = room.state.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(403).json({ error: 'Pembalap tidak terdaftar di ruang ini.' });
      return;
    }

    if (body.action === 'ready' && room.state.status === 'LOBBY') {
      player.isReady = Boolean(body.payload?.isReady);
      broadcastRoomState(room);
    } else if (body.action === 'update_car' && room.state.status === 'LOBBY') {
      player.carModel = (body.payload?.carModel as CarModelId) || player.carModel;
      player.carColor = (body.payload?.carColor as string) || player.carColor;
      broadcastRoomState(room);
    } else if (body.action === 'update_passage' && player.isHost && room.state.status === 'LOBBY') {
      room.state.passage = sanitizePassage(body.payload?.passage as Passage);
      broadcastRoomState(room);
    } else if (body.action === 'start' && player.isHost && room.state.status === 'LOBBY') {
      startCountdownInRoom(room);
    } else if (body.action === 'rematch' && player.isHost) {
      if (room.countdownInterval) {
        clearInterval(room.countdownInterval);
        room.countdownInterval = null;
      }
      room.state.status = 'LOBBY';
      room.state.countdownSeconds = 3;
      room.state.startTime = null;
      room.state.passage = sanitizePassage(body.payload?.passage as Passage);
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

    res.json({ room: room.state });
  });

  app.post('/api/rooms/:code/progress', (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Ruang tidak ditemukan.' });
      return;
    }
    const body = req.body as {
      playerId?: string;
      typedChars?: number;
      mistakes?: number;
      accuracy?: number;
      finished?: boolean;
    };
    const player = room.state.players.find((p) => p.id === body.playerId);
    if (!player) {
      res.status(403).json({ error: 'Pembalap tidak ditemukan.' });
      return;
    }
    applyProgressInRoom(room, player, {
      typedChars: Number(body.typedChars || 0),
      mistakes: Number(body.mistakes || 0),
      accuracy: Number(body.accuracy ?? 100),
      finished: Boolean(body.finished),
    });
    res.json({ room: room.state });
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

  wss.on('connection', (rawWs: WebSocket, req) => {
    const ws = rawWs as ExtWebSocket;
    ws.isAlive = true;

    let requestedId = '';
    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      requestedId = sanitizeText(url.searchParams.get('playerId') || '', 24);
    } catch {
      requestedId = '';
    }

    ws.playerId = requestedId || generateId(10);
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
        const room = createRoomForPlayer({
          playerId: ws.playerId,
          playerName: msg.payload.playerName,
          carModel: msg.payload.carModel,
          carColor: msg.payload.carColor,
          roomName: msg.payload.roomName,
          isPublic: msg.payload.isPublic,
          passage: msg.payload.passage,
          ws,
        });
        ws.roomCode = room.state.code;
        return;
      }

      if (msg.type === 'room:join') {
        const targetCode = msg.payload.code.trim().toUpperCase();
        if (ws.roomCode && ws.roomCode !== targetCode) {
          removePlayerFromRoom(ws.playerId, ws.roomCode);
        }
        const result = joinRoomForPlayer({
          code: targetCode,
          playerId: ws.playerId,
          playerName: msg.payload.playerName,
          carModel: msg.payload.carModel,
          carColor: msg.payload.carColor,
          ws,
        });
        if (result.error || !result.room) {
          sendToSocket(ws, {
            type: 'error',
            payload: { message: result.error || 'Gagal bergabung ke ruang.' },
          });
          return;
        }
        ws.roomCode = result.room.state.code;
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
        startCountdownInRoom(room);
        return;
      }

      if (msg.type === 'race:progress') {
        applyProgressInRoom(room, player, msg.payload);
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
        // Only remove on WS close if they are actively using WS-only; if they leave explicitly they use room:leave
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
