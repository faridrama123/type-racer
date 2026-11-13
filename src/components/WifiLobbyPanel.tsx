import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Play,
  QrCode,
  RefreshCw,
  Users,
  Wifi,
  Shuffle,
  Edit3,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CarModelId,
  Language,
  NetworkInfo,
  Passage,
  PublicRoomSummary,
  RoomState,
} from '../types/game';
import { CAR_COLORS, CAR_MODELS, PASSAGES, getRandomPassage } from '../data/passages';
import { CarIcon } from './CarIcon';

interface WifiLobbyPanelProps {
  playerName: string;
  carModel: CarModelId;
  carColor: string;
  onUpdateProfile: (name: string, carModel: CarModelId, carColor: string) => void;
  room: RoomState | null;
  currentPlayerId: string | null;
  serverReady: boolean;
  onCreateRoom: (opts: {
    roomName: string;
    isPublic: boolean;
    passage: Passage;
  }) => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateRoomPassage: (passage: Passage) => void;
  onStartRace: () => void;
  onNotify: (msg: string) => void;
  initialJoinCode?: string;
}

export const WifiLobbyPanel: React.FC<WifiLobbyPanelProps> = ({
  playerName,
  carModel,
  carColor,
  onUpdateProfile,
  room,
  currentPlayerId,
  serverReady,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateRoomPassage,
  onStartRace,
  onNotify,
  initialJoinCode = '',
}) => {
  const [roomName, setRoomName] = useState(`Arena ${playerName || 'Online'}`);
  const [language, setLanguage] = useState<Language>('id');
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [customTextMode, setCustomTextMode] = useState(false);
  const [customTitle, setCustomTitle] = useState('Teks Balap Kustom');
  const [customBody, setCustomBody] = useState('');

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode);
    }
  }, [initialJoinCode]);

  const fetchRoomsAndNetwork = async () => {
    setLoadingRooms(true);
    try {
      const [roomsRes, netRes] = await Promise.all([
        fetch('/api/rooms'),
        fetch('/api/network-info'),
      ]);
      if (roomsRes.ok) {
        const data = (await roomsRes.json()) as { rooms: PublicRoomSummary[] };
        setPublicRooms(data.rooms);
      }
      if (netRes.ok) {
        const net = (await netRes.json()) as NetworkInfo;
        setNetworkInfo(net);
      }
    } catch {
      // ignore transient network errors
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (!room) {
      fetchRoomsAndNetwork();
      const interval = setInterval(fetchRoomsAndNetwork, 5000);
      return () => clearInterval(interval);
    } else {
      fetch('/api/network-info')
        .then((r) => (r.ok ? r.json() : null))
        .then((net) => {
          if (net) setNetworkInfo(net as NetworkInfo);
        })
        .catch(() => {});
    }
  }, [room]);

  const me = room?.players.find((p) => p.id === currentPlayerId) || null;
  const isHost = Boolean(me?.isHost);

  const buildRoomInviteUrl = (code: string): string => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocalhost && networkInfo && networkInfo.lanUrls.length > 0) {
      return `${networkInfo.lanUrls[0]}/?room=${code}`;
    }
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', code);
    return url.toString();
  };

  const handleCopyInvite = async (code: string) => {
    const inviteUrl = buildRoomInviteUrl(code);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      onNotify('Link undangan ruang berhasil disalin.');
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      onNotify(`Bagikan kode ruang: ${code}`);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      onNotify('Masukkan nama pembalap terlebih dahulu.');
      return;
    }
    const passage = getRandomPassage(language);
    onCreateRoom({
      roomName: roomName.trim() || `Arena ${playerName.trim()}`,
      isPublic,
      passage,
    });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      onNotify('Masukkan nama pembalap terlebih dahulu.');
      return;
    }
    const clean = joinCode.trim().toUpperCase();
    if (clean.length < 3) {
      onNotify('Masukkan kode ruang yang valid.');
      return;
    }
    onJoinRoom(clean);
  };

  const handleApplyCustomPassage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customBody.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 20) {
      onNotify('Teks balapan minimal 20 karakter.');
      return;
    }
    onUpdateRoomPassage({
      id: `custom-${Date.now()}`,
      title: customTitle.trim() || 'Teks Kustom',
      author: playerName || 'Host',
      category: 'Kustom',
      language: 'id',
      difficulty: 'Menengah',
      text: cleaned,
    });
    setCustomTextMode(false);
    onNotify('Teks balapan ruang diperbarui.');
  };

  // INSIDE ACTIVE ROOM LOBBY
  if (room) {
    const inviteUrl = buildRoomInviteUrl(room.code);
    const allReady = room.players.every((p) => p.isReady || p.isHost);

    return (
      <div className="space-y-6">
        {/* Room Header Card */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span>Ruang Balap Online &amp; Wi-Fi</span>
                <span aria-hidden="true">·</span>
                <span>{room.isPublic ? 'Terbuka di Daftar Ruang' : 'Ruang Privat'}</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">{room.name}</h2>
              <p className="text-sm text-slate-600 mt-1">
                Bagikan link undangan atau kode ruang ke teman dari jaringan mana saja (beda Wi-Fi, kuota seluler, atau 1 Wi-Fi yang sama).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-center">
                <span className="block text-[11px] text-slate-500 font-medium">
                  Kode Ruang
                </span>
                <span className="font-mono text-xl font-bold tracking-widest text-slate-900">
                  {room.code}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleCopyInvite(room.code)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {copiedInvite ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copiedInvite ? 'Link Tersalin' : 'Salin Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <QrCode className="w-4 h-4 text-slate-600" />
                <span>{showQrModal ? 'Tutup QR' : 'QR Undangan'}</span>
              </button>

              <button
                type="button"
                onClick={onLeaveRoom}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </div>

          {showQrModal && (
            <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-6">
              <div className="p-3 bg-white border border-slate-200 rounded-xl shrink-0">
                <QRCodeSVG value={inviteUrl} size={148} />
              </div>
              <div className="space-y-2 text-sm text-slate-600 min-w-0">
                <p className="font-semibold text-slate-900">
                  Gabung Cepat dari HP atau Laptop Lain
                </p>
                <p>
                  Pastikan perangkat teman terhubung ke jaringan Wi-Fi yang sama, lalu pindai kode QR atau buka alamat berikut:
                </p>
                <p className="font-mono text-xs bg-slate-100 px-3 py-2 rounded-lg text-slate-800 break-all">
                  {inviteUrl}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Two-column Lobby Roster & Passage Config */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Roster */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">
                  Pembalap di Garis Start ({room.players.length}/8)
                </h3>
              </div>
              {!isHost && me && (
                <button
                  type="button"
                  onClick={() => onToggleReady(!me.isReady)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                    me.isReady
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {me.isReady ? 'Siap Membalap' : 'Tandai Siap'}
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CarIcon
                      model={p.carModel}
                      color={p.carColor}
                      className="w-12 h-6 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {p.name}
                        {p.id === currentPlayerId ? ' (Anda)' : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.isHost ? 'Host Ruang' : 'Peserta'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      p.isReady || p.isHost ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {p.isHost ? 'Host' : p.isReady ? 'Siap' : 'Menunggu'}
                  </span>
                </div>
              ))}
            </div>

            {isHost && (
              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  {room.players.length < 2
                    ? 'Anda dapat langsung memulai atau menunggu teman bergabung.'
                    : allReady
                      ? 'Semua pembalap siap di garis start.'
                      : 'Beberapa peserta belum menandai siap, namun Host tetap bisa memulai.'}
                </p>
                <button
                  type="button"
                  onClick={onStartRace}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4" />
                  <span>Mulai Balapan</span>
                </button>
              </div>
            )}
          </section>

          {/* Passage & Car Picker */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-bold text-slate-900">Teks Lintasan</h3>
                {isHost && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRoomPassage(
                          getRandomPassage(room.passage.language, room.passage.id)
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>Acak Teks</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomTextMode((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Teks Kustom</span>
                    </button>
                  </div>
                )}
              </div>

              {customTextMode && isHost ? (
                <form onSubmit={handleApplyCustomPassage} className="space-y-3 mt-3">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Judul teks"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <textarea
                    rows={4}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="Tempel paragraf Bahasa Indonesia atau Inggris untuk dilombakan..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomTextMode(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      Terapkan Teks
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {room.passage.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {room.passage.author} ·{' '}
                    {room.passage.language === 'id' ? 'Indonesia' : 'English'} ·{' '}
                    {room.passage.text.length} karakter
                  </p>
                  <p className="mt-2.5 text-xs font-mono text-slate-600 line-clamp-3 leading-relaxed">
                    {room.passage.text}
                  </p>
                </div>
              )}

              {isHost && !customTextMode && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Pilih cepat:</span>
                  <button
                    type="button"
                    onClick={() => onUpdateRoomPassage(getRandomPassage('id'))}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Teks Indonesia
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateRoomPassage(getRandomPassage('en'))}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    English Text
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Ganti Mobil Anda
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CAR_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onUpdateProfile(playerName, m.id, carColor)}
                    className={`p-2 rounded-xl border text-center transition-colors ${
                      carModel === m.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <CarIcon
                      model={m.id}
                      color={carColor}
                      className="w-10 h-5 mx-auto"
                    />
                    <span className="block text-[11px] font-medium text-slate-700 mt-1 truncate">
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {CAR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.name}
                    onClick={() => onUpdateProfile(playerName, carModel, c.hex)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      carColor === c.hex ? 'border-slate-900 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // NOT IN A ROOM YET: SETUP + CREATE + JOIN + LAN DISCOVERY
  return (
    <div className="space-y-6">
      {/* Player Profile / Garage */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1 max-w-md">
            <label
              htmlFor="player-name-input"
              className="block text-sm font-semibold text-slate-900 mb-1.5"
            >
              Nama Pembalap Anda
            </label>
            <input
              id="player-name-input"
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(e) => onUpdateProfile(e.target.value, carModel, carColor)}
              placeholder="Contoh: Bima, Raka, Sari..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {CAR_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateProfile(playerName, m.id, carColor)}
                className={`px-3 py-2 rounded-xl border transition-colors flex flex-col items-center ${
                  carModel === m.id
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CarIcon model={m.id} color={carColor} className="w-11 h-5" />
                <span className="text-[11px] font-medium text-slate-700 mt-1 whitespace-nowrap">
                  {m.label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {CAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={() => onUpdateProfile(playerName, carModel, c.hex)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  carColor === c.hex ? 'border-slate-900 scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Create & Join Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Create Room */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Buat Ruang Balap Online / Wi-Fi</h2>
            <p className="text-sm text-slate-600 mt-1">
              Buat ruang untuk balapan bersama teman secara online (beda jaringan/kuota HP) maupun dalam 1 Wi-Fi yang sama.
            </p>

            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="room-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nama Ruang
                </label>
                <input
                  id="room-name-input"
                  type="text"
                  maxLength={32}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Balapan Sore Kantor"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Bahasa Teks Awal
                </span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLanguage('id')}
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                      language === 'id'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bahasa Indonesia
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                      language === 'en'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-600"
                />
                <span>Tampilkan di daftar Ruang Aktif agar teman mudah bergabung</span>
              </label>

              <button
                type="submit"
                disabled={!serverReady}
                className="w-full py-3 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {serverReady ? 'Buat Ruang Balap' : 'Menghubungkan ke server...'}
              </button>
            </form>
          </div>
        </section>

        {/* Join via Code + Active Rooms */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Gabung ke Ruang Teman</h2>
            <p className="text-sm text-slate-600 mt-1">
              Masukkan 5 huruf kode ruang dari teman atau pilih ruang aktif di bawah ini.
            </p>

            <form onSubmit={handleJoinSubmit} className="mt-4 flex gap-2.5">
              <input
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="KODE (mis. A7K2P)"
                aria-label="Kode ruang balap"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-base font-bold uppercase tracking-widest focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={!serverReady}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Gabung
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-slate-200 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Ruang Aktif Saat Ini
              </h3>
              <button
                type="button"
                onClick={fetchRoomsAndNetwork}
                aria-label="Segarkan daftar ruang"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`}
                />
                <span>Segarkan</span>
              </button>
            </div>

            {publicRooms.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center text-xs text-slate-500 my-auto">
                Belum ada ruang terbuka saat ini. Buat ruang baru lalu bagikan link atau kodenya ke teman dari jaringan mana saja.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {publicRooms.map((r) => (
                  <div
                    key={r.code}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Host: {r.hostName} · {r.playerCount} pembalap ·{' '}
                        {r.language === 'id' ? 'ID' : 'EN'} ·{' '}
                        {r.status === 'LOBBY' ? 'Terbuka' : 'Sedang Balap'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJoinRoom(r.code)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      Gabung ({r.code})
                    </button>
                  </div>
                ))}
              </div>
            )}

            {networkInfo && networkInfo.lanUrls.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Alamat Wi-Fi Lokal:</span>
                <span className="font-mono text-slate-700 font-medium">
                  {networkInfo.lanUrls[0]}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
