import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Flag,
  Play,
  RotateCcw,
  Share2,
  Shuffle,
  Trophy,
  Wifi,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  CarModelId,
  ClientWsMessage,
  Language,
  Passage,
  RacerState,
  RoomState,
  RoomStatus,
  ServerWsMessage,
  ShareableScore,
} from './types/game';
import { PASSAGES, getRandomPassage } from './data/passages';
import { RaceTrack } from './components/RaceTrack';
import { TypingArena } from './components/TypingArena';
import { WifiLobbyPanel } from './components/WifiLobbyPanel';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { ShareScoreModal } from './components/ShareScoreModal';
import { CarIcon } from './components/CarIcon';
import { decodeScoreParam, formatDuration } from './utils/shareCard';
import { soundEngine } from './utils/sound';

type ActiveTab = 'solo' | 'wifi' | 'leaderboard' | 'guide';

const STORAGE_PROFILE_KEY = 'typerally_profile_v1';
const STORAGE_HISTORY_KEY = 'typerally_history_v1';

interface SavedProfile {
  name: string;
  carModel: CarModelId;
  carColor: string;
}

function loadProfile(): SavedProfile {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedProfile>;
      return {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Pembalap 1',
        carModel: parsed.carModel || 'formula',
        carColor: parsed.carColor || '#EA580C',
      };
    }
  } catch {
    // ignore
  }
  return { name: 'Pembalap 1', carModel: 'formula', carColor: '#EA580C' };
}

function loadHistory(): ShareableScore[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ShareableScore[];
    }
  } catch {
    // ignore
  }
  return [];
}

export default function App() {
  const initialProfile = loadProfile();
  const [activeTab, setActiveTab] = useState<ActiveTab>('solo');
  const [playerName, setPlayerName] = useState(initialProfile.name);
  const [carModel, setCarModel] = useState<CarModelId>(initialProfile.carModel);
  const [carColor, setCarColor] = useState(initialProfile.carColor);
  const [history, setHistory] = useState<ShareableScore[]>(loadHistory);
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);

  // Solo Race State
  const [soloLang, setSoloLang] = useState<Language>('id');
  const [soloPassage, setSoloPassage] = useState<Passage>(() => getRandomPassage('id'));
  const [soloStatus, setSoloStatus] = useState<RoomStatus>('LOBBY');
  const [soloCountdown, setSoloCountdown] = useState(3);
  const [soloStartTime, setSoloStartTime] = useState<number | null>(null);
  const [soloPaceBotWpm, setSoloPaceBotWpm] = useState<number>(55);
  const [soloPlayer, setSoloPlayer] = useState<RacerState>({
    id: 'solo-me',
    name: initialProfile.name,
    carModel: initialProfile.carModel,
    carColor: initialProfile.carColor,
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
  });
  const [paceBot, setPaceBot] = useState<RacerState>({
    id: 'pace-bot',
    name: 'Pace Bot',
    carModel: 'gt',
    carColor: '#334155',
    isHost: false,
    isReady: true,
    isConnected: true,
    isBot: true,
    progress: 0,
    typedChars: 0,
    wpm: 0,
    accuracy: 100,
    mistakes: 0,
    finished: false,
    finishRank: null,
    finishTimeMs: null,
  });

  // Hybrid WebSocket + HTTP Fallback Multiplayer State
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [playerId, setPlayerId] = useState<string>(() => {
    try {
      const existing = sessionStorage.getItem('typerally_player_id');
      if (existing) return existing;
      const generated = `P${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      sessionStorage.setItem('typerally_player_id', generated);
      return generated;
    } catch {
      return `P${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    }
  });
  const [room, setRoom] = useState<RoomState | null>(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');

  // Share / Challenge Modal State
  const [modalScore, setModalScore] = useState<ShareableScore | null>(null);
  const [isChallengeView, setIsChallengeView] = useState(false);

  const soloCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRecordedRoomRaceRef = useRef<string | null>(null);
  const lastRoomCountdownRef = useRef<number | null>(null);
  const lastRoomStatusRef = useRef<RoomStatus | null>(null);

  const notify = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const handleUpdateProfile = useCallback(
    (name: string, model: CarModelId, color: string) => {
      setPlayerName(name);
      setCarModel(model);
      setCarColor(color);
      setSoloPlayer((prev) => ({
        ...prev,
        name: name || 'Pembalap 1',
        carModel: model,
        carColor: color,
      }));
      try {
        localStorage.setItem(
          STORAGE_PROFILE_KEY,
          JSON.stringify({ name, carModel: model, carColor: color })
        );
      } catch {
        // ignore
      }
      if (room) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const msg: ClientWsMessage = {
            type: 'player:update_car',
            payload: { carModel: model, carColor: color },
          };
          wsRef.current.send(JSON.stringify(msg));
        } else {
          fetch(`/api/rooms/${room.code}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId,
              action: 'update_car',
              payload: { carModel: model, carColor: color },
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.room) setRoom(data.room as RoomState);
            })
            .catch(() => {});
        }
      }
    },
    [room, playerId]
  );

  const saveResultToHistoryAndServer = useCallback(async (score: ShareableScore) => {
    setHistory((prev) => {
      const next = [score, ...prev].slice(0, 30);
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(score),
      });
      if (res.ok) {
        const data = (await res.json()) as { result: ShareableScore };
        return data.result;
      }
    } catch {
      // keep local score if offline
    }
    return score;
  }, []);

  // Parse URL params (?room= or ?score=) on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const scoreParam = params.get('score');

    if (roomParam) {
      setInitialRoomCode(roomParam.trim().toUpperCase());
      setActiveTab('wifi');
    } else if (scoreParam) {
      const decoded = decodeScoreParam(scoreParam);
      if (decoded) {
        setModalScore(decoded);
        setIsChallengeView(true);
      }
    }
  }, []);

  // Check HTTP Health + WebSocket Connection with automatic HTTP fallback
  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    fetch('/api/health')
      .then((res) => {
        if (res.ok && !closedByCleanup) setServerReady(true);
      })
      .catch(() => {});

    const connect = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?playerId=${encodeURIComponent(playerId)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          setServerReady(true);
        };

        ws.onmessage = (event) => {
          let msg: ServerWsMessage;
          try {
            msg = JSON.parse(event.data as string) as ServerWsMessage;
          } catch {
            return;
          }

          if (msg.type === 'session:init') {
            setPlayerId(msg.payload.playerId);
          } else if (msg.type === 'room:state') {
            setRoom(msg.payload.room);
          } else if (msg.type === 'room:left') {
            setRoom(null);
          } else if (msg.type === 'race:countdown') {
            soundEngine.playCountdownTick(false);
          } else if (msg.type === 'race:started') {
            soundEngine.playCountdownTick(true);
          } else if (msg.type === 'error') {
            notify(msg.payload.message, 'error');
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!closedByCleanup) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [notify, playerId]);

  // HTTP Polling fallback when WebSocket is unavailable in preview/proxy environments
  useEffect(() => {
    if (!room || wsConnected) return;

    const intervalMs =
      room.status === 'RACING' || room.status === 'COUNTDOWN' ? 350 : 1200;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${room.code}/state`);
        if (res.status === 404) {
          setRoom(null);
          notify('Ruang balap telah ditutup.', 'info');
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as { room: RoomState };
          const nextRoom = data.room;

          if (
            nextRoom.status === 'COUNTDOWN' &&
            lastRoomCountdownRef.current !== nextRoom.countdownSeconds
          ) {
            soundEngine.playCountdownTick(false);
          }
          if (
            lastRoomStatusRef.current === 'COUNTDOWN' &&
            nextRoom.status === 'RACING'
          ) {
            soundEngine.playCountdownTick(true);
          }
          lastRoomCountdownRef.current = nextRoom.countdownSeconds;
          lastRoomStatusRef.current = nextRoom.status;

          setRoom(nextRoom);
        }
      } catch {
        // ignore transient polling error
      }
    }, intervalMs);

    return () => clearInterval(poll);
  }, [room, wsConnected, notify]);

  // Record finished online race to history/server once per race
  useEffect(() => {
    if (!room || !playerId || !room.startTime) return;
    const me = room.players.find((p) => p.id === playerId);
    if (!me || !me.finished) return;

    const raceKey = `${room.code}-${room.startTime}`;
    if (lastRecordedRoomRaceRef.current === raceKey) return;
    lastRecordedRoomRaceRef.current = raceKey;

    const score: ShareableScore = {
      id: `${room.code}${Math.floor(Math.random() * 90 + 10)}`,
      playerName: me.name,
      carModel: me.carModel,
      carColor: me.carColor,
      wpm: me.wpm,
      accuracy: me.accuracy,
      elapsedMs: me.finishTimeMs || Date.now() - room.startTime,
      mistakes: me.mistakes,
      rank: me.finishRank,
      totalRacers: room.players.length,
      mode: 'wifi',
      passageId: room.passage.id,
      passageTitle: room.passage.title,
      passageAuthor: room.passage.author,
      createdAt: Date.now(),
    };

    saveResultToHistoryAndServer(score).then((saved) => {
      setModalScore(saved);
      setIsChallengeView(false);
    });
  }, [room, playerId, saveResultToHistoryAndServer]);

  // Solo Pace Bot simulation loop (explicitly labeled as Pace Bot)
  useEffect(() => {
    if (soloStatus !== 'RACING' || !soloStartTime || soloPaceBotWpm <= 0) return;

    const botTimer = setInterval(() => {
      const elapsedMs = Date.now() - soloStartTime;
      const charsPerMs = (soloPaceBotWpm * 5) / 60000;
      const targetChars = Math.min(
        soloPassage.text.length,
        Math.floor(elapsedMs * charsPerMs)
      );
      const pct = Math.min(
        100,
        Math.round((targetChars / soloPassage.text.length) * 1000) / 10
      );

      setPaceBot((prev) => {
        if (prev.finished) return prev;
        const done = targetChars >= soloPassage.text.length;
        return {
          ...prev,
          typedChars: targetChars,
          progress: pct,
          wpm: soloPaceBotWpm,
          finished: done,
          finishTimeMs: done ? elapsedMs : null,
          finishRank: done ? (soloPlayer.finished ? 2 : 1) : null,
        };
      });
    }, 120);

    return () => clearInterval(botTimer);
  }, [soloStatus, soloStartTime, soloPaceBotWpm, soloPassage.text.length, soloPlayer.finished]);

  // Start Solo Race
  const startSoloRace = useCallback(
    (customPassage?: Passage) => {
      if (soloCountdownTimerRef.current) {
        clearInterval(soloCountdownTimerRef.current);
      }

      const targetPassage = customPassage || soloPassage;
      if (customPassage) {
        setSoloPassage(customPassage);
      }

      setSoloStatus('COUNTDOWN');
      setSoloCountdown(3);
      setSoloStartTime(null);
      setSoloPlayer((prev) => ({
        ...prev,
        name: playerName || 'Pembalap 1',
        carModel,
        carColor,
        progress: 0,
        typedChars: 0,
        wpm: 0,
        accuracy: 100,
        mistakes: 0,
        finished: false,
        finishRank: null,
        finishTimeMs: null,
      }));
      setPaceBot((prev) => ({
        ...prev,
        name: `Pace Bot (${soloPaceBotWpm} KPM)`,
        progress: 0,
        typedChars: 0,
        wpm: 0,
        finished: false,
        finishRank: null,
        finishTimeMs: null,
      }));

      soundEngine.playCountdownTick(false);
      let count = 3;
      soloCountdownTimerRef.current = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setSoloCountdown(count);
          soundEngine.playCountdownTick(false);
        } else {
          if (soloCountdownTimerRef.current) {
            clearInterval(soloCountdownTimerRef.current);
            soloCountdownTimerRef.current = null;
          }
          soundEngine.playCountdownTick(true);
          setSoloCountdown(0);
          setSoloStartTime(Date.now());
          setSoloStatus('RACING');
        }
      }, 1000);
    },
    [soloPassage, playerName, carModel, carColor, soloPaceBotWpm]
  );

  useEffect(() => {
    return () => {
      if (soloCountdownTimerRef.current) {
        clearInterval(soloCountdownTimerRef.current);
      }
    };
  }, []);

  const handleSoloProgress = useCallback(
    (payload: {
      typedChars: number;
      totalChars: number;
      mistakes: number;
      accuracy: number;
      finished: boolean;
    }) => {
      if (!soloStartTime) return;
      const elapsedMs = Math.max(300, Date.now() - soloStartTime);
      const wpm = Math.min(320, Math.round((payload.typedChars / 5) / (elapsedMs / 60000)));
      const progress = Math.min(
        100,
        Math.round((payload.typedChars / payload.totalChars) * 1000) / 10
      );

      const rank = payload.finished
        ? soloPaceBotWpm > 0 && paceBot.finished
          ? 2
          : 1
        : null;

      setSoloPlayer((prev) => ({
        ...prev,
        typedChars: payload.typedChars,
        progress,
        wpm,
        accuracy: payload.accuracy,
        mistakes: payload.mistakes,
        finished: payload.finished,
        finishTimeMs: payload.finished ? elapsedMs : null,
        finishRank: rank,
      }));

      if (payload.finished) {
        setSoloStatus('FINISHED');
        const rawScore: ShareableScore = {
          id: `SOLO${Math.floor(Math.random() * 900 + 100)}`,
          playerName: playerName || 'Pembalap 1',
          carModel,
          carColor,
          wpm,
          accuracy: payload.accuracy,
          elapsedMs,
          mistakes: payload.mistakes,
          rank,
          totalRacers: soloPaceBotWpm > 0 ? 2 : 1,
          mode: 'solo',
          passageId: soloPassage.id,
          passageTitle: soloPassage.title,
          passageAuthor: soloPassage.author,
          createdAt: Date.now(),
        };
        saveResultToHistoryAndServer(rawScore).then((saved) => {
          setModalScore(saved);
          setIsChallengeView(false);
        });
      }
    },
    [
      soloStartTime,
      soloPaceBotWpm,
      paceBot.finished,
      playerName,
      carModel,
      carColor,
      soloPassage,
      saveResultToHistoryAndServer,
    ]
  );

  // Hybrid WebSocket + HTTP Room Actions
  const sendRoomMessage = async (msg: ClientWsMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return;
    }

    try {
      if (msg.type === 'room:create') {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, ...msg.payload }),
        });
        const data = (await res.json()) as { room?: RoomState; playerId?: string; error?: string };
        if (!res.ok || !data.room) {
          notify(data.error || 'Gagal membuat ruang balap.', 'error');
          return;
        }
        if (data.playerId) setPlayerId(data.playerId);
        setRoom(data.room);
        return;
      }

      if (msg.type === 'room:join') {
        const code = msg.payload.code.trim().toUpperCase();
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, ...msg.payload }),
        });
        const data = (await res.json()) as { room?: RoomState; playerId?: string; error?: string };
        if (!res.ok || !data.room) {
          notify(data.error || 'Gagal bergabung ke ruang.', 'error');
          return;
        }
        if (data.playerId) setPlayerId(data.playerId);
        setRoom(data.room);
        return;
      }

      if (!room) return;

      if (msg.type === 'race:progress') {
        const res = await fetch(`/api/rooms/${room.code}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, ...msg.payload }),
        });
        if (res.ok) {
          const data = (await res.json()) as { room?: RoomState };
          if (data.room) setRoom(data.room);
        }
        return;
      }

      const actionMap: Record<string, string> = {
        'room:leave': 'leave',
        'player:ready': 'ready',
        'player:update_car': 'update_car',
        'room:update_passage': 'update_passage',
        'race:start': 'start',
        'race:rematch': 'rematch',
      };
      const action = actionMap[msg.type];
      if (!action) return;

      const res = await fetch(`/api/rooms/${room.code}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          action,
          payload: 'payload' in msg ? msg.payload : undefined,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { room?: RoomState; left?: boolean };
        if (data.left) {
          setRoom(null);
        } else if (data.room) {
          setRoom(data.room);
        }
      }
    } catch {
      notify('Gagal menghubungi server. Periksa koneksi internet Anda.', 'error');
    }
  };

  const handleCreateRoom = (opts: {
    roomName: string;
    isPublic: boolean;
    passage: Passage;
  }) => {
    void sendRoomMessage({
      type: 'room:create',
      payload: {
        playerName: playerName || 'Host',
        carModel,
        carColor,
        roomName: opts.roomName,
        isPublic: opts.isPublic,
        passage: opts.passage,
      },
    });
  };

  const handleJoinRoom = (code: string) => {
    void sendRoomMessage({
      type: 'room:join',
      payload: {
        code,
        playerName: playerName || 'Pembalap',
        carModel,
        carColor,
      },
    });
  };

  const handleLeaveRoom = () => {
    void sendRoomMessage({ type: 'room:leave' });
    setRoom(null);
  };

  const handleChallengeScore = (score: ShareableScore) => {
    setModalScore(null);
    setIsChallengeView(false);
    setActiveTab('solo');
    const found = PASSAGES.find((p) => p.id === score.passageId);
    const targetPassage = found || getRandomPassage('id');
    setSoloLang(targetPassage.language);
    startSoloRace(targetPassage);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  const soloRacers = soloPaceBotWpm > 0 ? [soloPlayer, paceBot] : [soloPlayer];
  const wifiMe = room?.players.find((p) => p.id === playerId) || null;
  const isWifiHost = Boolean(wifiMe?.isHost);

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F5F8] text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element Brand wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('solo');
            }}
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            TypeRally
          </a>

          {/* Zone 2: 4 clean single-line nav links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => setActiveTab('solo')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                activeTab === 'solo'
                  ? 'text-slate-950 border-orange-600 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Balap Solo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wifi')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                activeTab === 'wifi'
                  ? 'text-slate-950 border-orange-600 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Main Online
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                activeTab === 'leaderboard'
                  ? 'text-slate-950 border-orange-600 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Papan Skor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                activeTab === 'guide'
                  ? 'text-slate-950 border-orange-600 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Cara Main
            </button>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('wifi')}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
            >
              {room ? `Ruang ${room.code}` : 'Main Online'}
            </button>
          </div>
        </div>

        {/* Mobile compact nav row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
          {(
            [
              ['solo', 'Balap Solo'],
              ['wifi', 'Main Online'],
              ['leaderboard', 'Papan Skor'],
              ['guide', 'Cara Main'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                activeTab === id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${
            toast.kind === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          {toast.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Main Content Container */}
      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* TAB 1: BALAP SOLO */}
        {activeTab === 'solo' && (
          <>
            {/* Solo Setup & Control Header */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="max-w-2xl">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 text-balance">
                    Uji Kecepatan Mengetik di Lintasan Balap
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 mt-1.5">
                    Ketik setiap kata seakurat mungkin untuk memacu mobil ke garis finis, lalu bagikan kartu skor atau tantang teman di jaringan Wi-Fi yang sama.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {soloStatus === 'LOBBY' || soloStatus === 'FINISHED' ? (
                    <button
                      type="button"
                      onClick={() => startSoloRace()}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-4 h-4" />
                      <span>{soloStatus === 'FINISHED' ? 'Balap Lagi' : 'Mulai Balapan'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (soloCountdownTimerRef.current) {
                          clearInterval(soloCountdownTimerRef.current);
                        }
                        setSoloStatus('LOBBY');
                        setSoloStartTime(null);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Ulangi</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const nextPassage = getRandomPassage(soloLang, soloPassage.id);
                      setSoloPassage(nextPassage);
                      setSoloStatus('LOBBY');
                      setSoloStartTime(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>Acak Teks</span>
                  </button>
                </div>
              </div>

              {/* Solo Settings Row */}
              <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Language Switcher */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSoloLang('id');
                        setSoloPassage(getRandomPassage('id'));
                        setSoloStatus('LOBBY');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        soloLang === 'id'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bahasa Indonesia
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSoloLang('en');
                        setSoloPassage(getRandomPassage('en'));
                        setSoloStatus('LOBBY');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        soloLang === 'en'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      English
                    </button>
                  </div>

                  {/* Pace Bot Selector */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                      { wpm: 0, label: 'Tanpa Bot' },
                      { wpm: 45, label: 'Pace Bot 45 KPM' },
                      { wpm: 75, label: 'Pace Bot 75 KPM' },
                    ].map((opt) => (
                      <button
                        key={opt.wpm}
                        type="button"
                        onClick={() => {
                          setSoloPaceBotWpm(opt.wpm);
                          if (soloStatus !== 'RACING') {
                            setPaceBot((prev) => ({
                              ...prev,
                              name: `Pace Bot (${opt.wpm} KPM)`,
                            }));
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                          soloPaceBotWpm === opt.wpm
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <CarIcon model={carModel} color={carColor} className="w-10 h-5" />
                  <span className="font-semibold text-slate-900">{playerName}</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('wifi')}
                    className="text-orange-600 font-semibold hover:underline"
                  >
                    Ubah Mobil
                  </button>
                </div>
              </div>
            </section>

            {/* Race Track */}
            <RaceTrack
              players={soloRacers}
              currentPlayerId="solo-me"
              statusLabel={
                soloStatus === 'LOBBY'
                  ? 'Siap di garis start'
                  : soloStatus === 'COUNTDOWN'
                    ? `Hitung mundur: ${soloCountdown}`
                    : soloStatus === 'RACING'
                      ? 'Balapan berlangsung'
                      : 'Balapan selesai'
              }
            />

            {/* Typing Arena */}
            <TypingArena
              passage={soloPassage}
              status={soloStatus}
              countdownSeconds={soloCountdown}
              startTime={soloStartTime}
              onProgress={handleSoloProgress}
              onQuickRestart={() => {
                const nextPassage = getRandomPassage(soloLang, soloPassage.id);
                setSoloPassage(nextPassage);
                startSoloRace(nextPassage);
              }}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
            />

            {/* Solo Finish Summary Strip */}
            {soloStatus === 'FINISHED' && soloPlayer.finished && (
              <section className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-emerald-700">
                    Garis Finis Tercapai
                  </p>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5 font-mono tabular-nums">
                    {soloPlayer.wpm} KPM · Akurasi {soloPlayer.accuracy}% ·{' '}
                    {formatDuration(soloPlayer.finishTimeMs || 0)}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const latest = history[0];
                      if (latest) {
                        setModalScore(latest);
                        setIsChallengeView(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Bagikan Skor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextPassage = getRandomPassage(soloLang, soloPassage.id);
                      startSoloRace(nextPassage);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    <span>Teks Baru</span>
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {/* TAB 2: RUANG WI-FI MULTIPLAYER */}
        {activeTab === 'wifi' && (
          <>
            {(!room || room.status === 'LOBBY') && (
              <WifiLobbyPanel
                playerName={playerName}
                carModel={carModel}
                carColor={carColor}
                onUpdateProfile={handleUpdateProfile}
                room={room}
                currentPlayerId={playerId}
                serverReady={serverReady}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                onLeaveRoom={handleLeaveRoom}
                onToggleReady={(ready) =>
                  void sendRoomMessage({ type: 'player:ready', payload: { isReady: ready } })
                }
                onUpdateRoomPassage={(passage) =>
                  void sendRoomMessage({ type: 'room:update_passage', payload: { passage } })
                }
                onStartRace={() => void sendRoomMessage({ type: 'race:start' })}
                onNotify={notify}
                initialJoinCode={initialRoomCode}
              />
            )}

            {room && room.status !== 'LOBBY' && (
              <div className="space-y-6">
                {/* Active Race Top Info */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Wifi className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {room.name} · Kode {room.code}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {room.players.length} pembalap terhubung
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Keluar Ruang
                  </button>
                </div>

                {/* Live Multi-Lane Race Track */}
                <RaceTrack
                  players={room.players}
                  currentPlayerId={playerId}
                  statusLabel={
                    room.status === 'COUNTDOWN'
                      ? `Mulai dalam ${room.countdownSeconds}`
                      : room.status === 'RACING'
                        ? 'Balapan berlangsung'
                        : 'Balapan selesai'
                  }
                />

                {/* Typing Arena */}
                <TypingArena
                  passage={room.passage}
                  status={room.status}
                  countdownSeconds={room.countdownSeconds}
                  startTime={room.startTime}
                  onProgress={(payload) =>
                    void sendRoomMessage({ type: 'race:progress', payload })
                  }
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                />

                {/* Multiplayer Podium when finished or local player finished */}
                {(room.status === 'FINISHED' || wifiMe?.finished) && (
                  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2.5">
                        <Trophy className="w-5 h-5 text-orange-600" />
                        <h3 className="text-lg font-bold text-slate-900">
                          Podium Balap Online
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {wifiMe?.finished && (
                          <button
                            type="button"
                            onClick={() => {
                              const latest = history[0];
                              if (latest) {
                                setModalScore(latest);
                                setIsChallengeView(false);
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>Bagikan Skor Saya</span>
                          </button>
                        )}

                        {isWifiHost && (
                          <button
                            type="button"
                            onClick={() =>
                              void sendRoomMessage({
                                type: 'race:rematch',
                                payload: {
                                  passage: getRandomPassage(
                                    room.passage.language,
                                    room.passage.id
                                  ),
                                },
                              })
                            }
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 whitespace-nowrap"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>Balap Lagi (Kembali ke Lobi)</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                            <th className="py-2.5 pr-4">Peringkat</th>
                            <th className="py-2.5 px-4">Pembalap</th>
                            <th className="py-2.5 px-4 text-right">Kecepatan</th>
                            <th className="py-2.5 px-4 text-right">Akurasi</th>
                            <th className="py-2.5 pl-4 text-right">Waktu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {[...room.players]
                            .sort((a, b) => {
                              if (a.finishRank && b.finishRank) {
                                return a.finishRank - b.finishRank;
                              }
                              if (a.finishRank) return -1;
                              if (b.finishRank) return 1;
                              return b.progress - a.progress;
                            })
                            .map((p) => (
                              <tr key={p.id}>
                                <td className="py-3 pr-4 font-mono font-bold text-slate-900 tabular-nums">
                                  {p.finishRank ? `#${p.finishRank}` : 'Membalap...'}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {p.name}
                                  {p.id === playerId ? ' (Anda)' : ''}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                                  {p.wpm} KPM
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                                  {p.accuracy}%
                                </td>
                                <td className="py-3 pl-4 text-right font-mono text-slate-600 tabular-nums">
                                  {p.finishTimeMs ? formatDuration(p.finishTimeMs) : `${Math.round(p.progress)}%`}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {/* TAB 3: PAPAN SKOR */}
        {activeTab === 'leaderboard' && (
          <LeaderboardPanel
            personalHistory={history}
            onShareScore={(score) => {
              setModalScore(score);
              setIsChallengeView(false);
            }}
            onChallengeScore={handleChallengeScore}
            onClearHistory={() => {
              setHistory([]);
              try {
                localStorage.removeItem(STORAGE_HISTORY_KEY);
              } catch {
                // ignore
              }
              notify('Riwayat skor lokal telah dihapus.');
            }}
          />
        )}

        {/* TAB 4: CARA MAIN */}
        {activeTab === 'guide' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950">
                Panduan Bermain TypeRally
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Semua yang perlu Anda ketahui untuk balapan solo, mabar satu Wi-Fi, dan membagikan hasil skor.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-slate-200 p-5 space-y-2.5">
                <Flag className="w-5 h-5 text-orange-600" />
                <h2 className="text-base font-bold text-slate-900">
                  01. Mekanik Mengetik
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Ketik kata yang digarisbawahi lalu tekan Spasi untuk lanjut ke kata berikutnya. Jika muncul warna merah, tekan Backspace untuk memperbaiki kesalahan sebelum melanjutkan.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-5 space-y-2.5">
                <Wifi className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">
                  02. Mabar Online &amp; 1 Wi-Fi
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Buka tab Main Online dan buat ruang baru. Teman dari jaringan mana saja (beda Wi-Fi, kuota seluler, maupun 1 Wi-Fi lokal) cukup membuka link undangan atau memasukkan 5 huruf kode ruang.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-5 space-y-2.5">
                <Share2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">
                  03. Bagikan & Tantang Skor
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Setiap selesai balapan, Anda dapat mengunduh kartu skor PNG beresolusi tinggi, menyalin ringkasan untuk WhatsApp, atau mengirim link tantangan langsung ke teman.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>TypeRally · Balap Mengetik Real-Time &amp; Multiplayer Online</span>
          <span>
            {wsConnected
              ? 'Server sinkronisasi real-time aktif'
              : serverReady
                ? 'Server sinkronisasi aktif (mode HTTP)'
                : 'Menghubungkan ke server...'}
          </span>
        </div>
      </footer>

      {/* Share / Challenge Score Modal */}
      {modalScore && (
        <ShareScoreModal
          score={modalScore}
          isChallengeView={isChallengeView}
          onClose={() => {
            setModalScore(null);
            setIsChallengeView(false);
          }}
          onChallenge={handleChallengeScore}
          onNotify={(msg) => notify(msg)}
        />
      )}
    </div>
  );
}
