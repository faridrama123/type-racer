import { ShareableScore } from '../types/game';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${secs}.${tenths} dtk`;
}

export function encodeScoreParam(score: ShareableScore): string {
  const compact = {
    id: score.id,
    n: score.playerName,
    cm: score.carModel,
    cc: score.carColor,
    w: score.wpm,
    a: score.accuracy,
    e: score.elapsedMs,
    m: score.mistakes,
    r: score.rank,
    tr: score.totalRacers,
    md: score.mode,
    pi: score.passageId,
    pt: score.passageTitle,
    pa: score.passageAuthor,
    t: score.createdAt,
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeScoreParam(token: string): ShareableScore | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const c = JSON.parse(json) as Record<string, unknown>;
    if (typeof c.n !== 'string' || typeof c.w !== 'number') return null;
    return {
      id: typeof c.id === 'string' ? c.id : 'SHARED',
      playerName: c.n,
      carModel: (c.cm as ShareableScore['carModel']) || 'formula',
      carColor: typeof c.cc === 'string' ? c.cc : '#EA580C',
      wpm: c.w,
      accuracy: typeof c.a === 'number' ? c.a : 100,
      elapsedMs: typeof c.e === 'number' ? c.e : 10000,
      mistakes: typeof c.m === 'number' ? c.m : 0,
      rank: typeof c.r === 'number' ? c.r : null,
      totalRacers: typeof c.tr === 'number' ? c.tr : 1,
      mode: c.md === 'wifi' ? 'wifi' : 'solo',
      passageId: typeof c.pi === 'string' ? c.pi : 'id-nusantara-1',
      passageTitle: typeof c.pt === 'string' ? c.pt : 'Lintasan TypeRally',
      passageAuthor: typeof c.pa === 'string' ? c.pa : 'TypeRally',
      createdAt: typeof c.t === 'number' ? c.t : Date.now(),
    };
  } catch {
    return null;
  }
}

export function buildShareUrl(score: ShareableScore): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('score', encodeScoreParam(score));
  return url.toString();
}

export function buildShareSummaryText(score: ShareableScore, shareUrl: string): string {
  const rankText =
    score.mode === 'wifi' && score.rank
      ? `Peringkat #${score.rank}/${score.totalRacers} (Balap Wi-Fi)`
      : 'Mode Solo';
  return [
    `Hasil Balapan TypeRally — ${score.playerName}`,
    `Kecepatan: ${score.wpm} KPM | Akurasi: ${score.accuracy}% | Waktu: ${formatDuration(score.elapsedMs)}`,
    `${rankText} · Teks: "${score.passageTitle}"`,
    `Tantang skor saya di sini: ${shareUrl}`,
  ].join('\n');
}

export async function renderScoreCardBlob(score: ShareableScore): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle asphalt track lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let y = 110; y <= 520; y += 82) {
    ctx.setLineDash([18, 18]);
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(1136, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Checkered vertical accent on right edge
  const sq = 24;
  for (let row = 0; row < Math.ceil(630 / sq); row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(1152 + col * sq, row * sq, sq, sq);
    }
  }

  // Top brand & date
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(64, 56, 12, 36);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 32px Outfit, sans-serif';
  ctx.fillText('TypeRally', 90, 85);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
  const modeLabel =
    score.mode === 'wifi' && score.rank
      ? `Balap Wi-Fi · Peringkat #${score.rank} dari ${score.totalRacers}`
      : 'Balap Solo · Sertifikat Kecepatan';
  ctx.fillText(modeLabel, 90, 122);

  // Player name
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 54px Outfit, sans-serif';
  ctx.fillText(score.playerName, 64, 212);

  // Car color swatch line
  ctx.fillStyle = score.carColor || '#EA580C';
  ctx.fillRect(64, 232, 140, 6);

  // Metrics grid
  const metrics = [
    { label: 'KECEPATAN', value: `${score.wpm} KPM`, highlight: true },
    { label: 'AKURASI', value: `${score.accuracy}%`, highlight: false },
    { label: 'WAKTU TEMPUH', value: formatDuration(score.elapsedMs), highlight: false },
    { label: 'KESALAHAN', value: `${score.mistakes} huruf`, highlight: false },
  ];

  metrics.forEach((m, idx) => {
    const x = 64 + idx * 270;
    const y = 300;
    ctx.fillStyle = m.highlight ? 'rgba(234, 88, 12, 0.14)' : 'rgba(30, 41, 59, 0.9)';
    ctx.strokeStyle = m.highlight ? '#EA580C' : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;

    roundRect(ctx, x, y, 246, 152, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = m.highlight ? '#FDBA74' : '#94A3B8';
    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(m.label, x + 24, y + 42);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.fillText(m.value, x + 24, y + 106);
  });

  // Passage footer
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Lintasan: "${score.passageTitle}"`, 64, 535);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  const dateStr = new Date(score.createdAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  ctx.fillText(`ID Skor: ${score.id} · ${dateStr}`, 64, 572);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
