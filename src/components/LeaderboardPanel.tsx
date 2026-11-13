import React, { useEffect, useState } from 'react';
import { Award, Play, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { ShareableScore } from '../types/game';
import { formatDuration } from '../utils/shareCard';
import { CarIcon } from './CarIcon';

interface LeaderboardPanelProps {
  personalHistory: ShareableScore[];
  onShareScore: (score: ShareableScore) => void;
  onChallengeScore: (score: ShareableScore) => void;
  onClearHistory: () => void;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  personalHistory,
  onShareScore,
  onChallengeScore,
  onClearHistory,
}) => {
  const [serverEntries, setServerEntries] = useState<ShareableScore[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = (await res.json()) as { entries: ShareableScore[] };
        setServerEntries(data.entries);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const bestPersonal =
    personalHistory.length > 0
      ? personalHistory.reduce((best, cur) => (cur.wpm > best.wpm ? cur : best))
      : null;

  return (
    <div className="space-y-6">
      {/* Personal Best Summary */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rekor Pribadi Anda</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Tersimpan otomatis di perangkat ini setelah setiap balapan selesai.
            </p>
          </div>
          {bestPersonal && (
            <button
              type="button"
              onClick={() => onShareScore(bestPersonal)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-4 h-4" />
              <span>Bagikan Rekor Terbaik ({bestPersonal.wpm} KPM)</span>
            </button>
          )}
        </div>

        {personalHistory.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Anda belum menyelesaikan balapan. Mulai balap solo atau balap Wi-Fi untuk mencatat skor pertama Anda.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-4">Lintasan</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4 text-right">Kecepatan</th>
                  <th className="py-2.5 px-4 text-right">Akurasi</th>
                  <th className="py-2.5 px-4 text-right">Waktu</th>
                  <th className="py-2.5 pl-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {personalHistory.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900 max-w-[220px] truncate">
                      {item.passageTitle}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {item.mode === 'wifi'
                        ? `Wi-Fi${item.rank ? ` #${item.rank}` : ''}`
                        : 'Solo'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {item.wpm} KPM
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                      {item.accuracy}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {formatDuration(item.elapsedMs)}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        type="button"
                        onClick={() => onShareScore(item)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Bagikan</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Riwayat Lokal</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Network / Server Leaderboard */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-orange-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Papan Peringkat Jaringan</h2>
              <p className="text-xs text-slate-500">
                Skor tercepat dari seluruh pembalap di server ini.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadLeaderboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>

        {serverEntries.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            Belum ada skor tercatat di papan peringkat server sesi ini. Selesaikan satu balapan untuk masuk ke peringkat!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-3">#</th>
                  <th className="py-2.5 px-3">Pembalap</th>
                  <th className="py-2.5 px-3">Lintasan</th>
                  <th className="py-2.5 px-3 text-right">Kecepatan</th>
                  <th className="py-2.5 px-3 text-right">Akurasi</th>
                  <th className="py-2.5 pl-3 text-right">Tantang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {serverEntries.map((entry, idx) => (
                  <tr key={entry.id}>
                    <td className="py-3 pr-3 font-mono font-bold text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <CarIcon
                          model={entry.carModel}
                          color={entry.carColor}
                          className="w-9 h-4.5 shrink-0"
                        />
                        <span className="font-semibold text-slate-900">
                          {entry.playerName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-xs max-w-[200px] truncate">
                      {entry.passageTitle}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {entry.wpm} KPM
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {entry.accuracy}%
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onChallengeScore(entry)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-orange-600"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Tantang</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onShareScore(entry)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Bagikan</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
