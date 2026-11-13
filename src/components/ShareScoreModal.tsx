import React, { useState } from 'react';
import { Check, Copy, Download, Share2, Trophy, X, Play } from 'lucide-react';
import { ShareableScore } from '../types/game';
import {
  buildShareSummaryText,
  buildShareUrl,
  formatDuration,
  renderScoreCardBlob,
} from '../utils/shareCard';
import { CarIcon } from './CarIcon';

interface ShareScoreModalProps {
  score: ShareableScore;
  isChallengeView?: boolean;
  onClose: () => void;
  onChallenge?: (score: ShareableScore) => void;
  onNotify: (message: string) => void;
}

export const ShareScoreModal: React.FC<ShareScoreModalProps> = ({
  score,
  isChallengeView = false,
  onClose,
  onChallenge,
  onNotify,
}) => {
  const [copiedType, setCopiedType] = useState<'link' | 'text' | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const shareUrl = buildShareUrl(score);
  const summaryText = buildShareSummaryText(score, shareUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedType('link');
      onNotify('Link skor berhasil disalin ke clipboard.');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      onNotify('Gagal menyalin link. Silakan salin manual dari address bar.');
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedType('text');
      onNotify('Ringkasan skor siap ditempel ke WhatsApp atau Discord.');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      onNotify('Gagal menyalin ringkasan teks.');
    }
  };

  const handleDownloadPng = async () => {
    setIsExporting(true);
    try {
      const blob = await renderScoreCardBlob(score);
      if (!blob) {
        onNotify('Gagal membuat gambar kartu skor.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `typerally-${score.playerName.toLowerCase().replace(/\s+/g, '-')}-${score.wpm}kpm.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify('Kartu skor PNG berhasil diunduh.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      await handleCopyText();
      return;
    }
    setIsExporting(true);
    try {
      const blob = await renderScoreCardBlob(score);
      if (blob && navigator.canShare) {
        const file = new File([blob], `typerally-${score.wpm}kpm.png`, {
          type: 'image/png',
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Skor TypeRally ${score.playerName}: ${score.wpm} KPM`,
            text: summaryText,
            files: [file],
          });
          return;
        }
      }
      await navigator.share({
        title: `Skor TypeRally ${score.playerName}: ${score.wpm} KPM`,
        text: summaryText,
        url: shareUrl,
      });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        await handleCopyText();
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-score-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-orange-600" />
            <h2 id="share-score-title" className="text-lg font-bold text-slate-900">
              {isChallengeView ? 'Kartu Skor Pembalap' : 'Bagikan Hasil Balapan'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela skor"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Score Card Preview */}
        <div className="p-6">
          <div className="bg-[#0F172A] text-white rounded-xl p-6 border border-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-400">
                  {score.mode === 'wifi' && score.rank
                    ? `Balap Wi-Fi · Juara #${score.rank} dari ${score.totalRacers}`
                    : 'Balap Solo · Sertifikat Kecepatan'}
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-white mt-1">
                  {score.playerName}
                </h3>
              </div>
              <CarIcon
                model={score.carModel}
                color={score.carColor}
                className="w-16 h-8 shrink-0"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <div className="rounded-lg bg-orange-500/15 border border-orange-500/50 p-3">
                <p className="text-[11px] font-medium text-orange-200">Kecepatan</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                  {score.wpm} <span className="text-xs font-normal text-orange-200">KPM</span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/80 border border-slate-700 p-3">
                <p className="text-[11px] font-medium text-slate-400">Akurasi</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                  {score.accuracy}%
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/80 border border-slate-700 p-3">
                <p className="text-[11px] font-medium text-slate-400">Waktu</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                  {formatDuration(score.elapsedMs)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/80 border border-slate-700 p-3">
                <p className="text-[11px] font-medium text-slate-400">Kesalahan</p>
                <p className="text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                  {score.mistakes}
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-400">
              <span className="truncate">Lintasan: {score.passageTitle}</span>
              <span className="font-mono shrink-0">ID {score.id}</span>
            </div>
          </div>

          {/* Action Buttons */}
          {isChallengeView && onChallenge ? (
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onChallenge(score)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>Tantang Skor Ini ({score.wpm} KPM)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Tutup
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <Share2 className="w-4 h-4" />
                <span>Bagikan Skor</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Kartu PNG</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {copiedType === 'link' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copiedType === 'link' ? 'Link Tersalin' : 'Salin Link Skor'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {copiedType === 'text' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copiedType === 'text' ? 'Teks Tersalin' : 'Salin Teks WhatsApp'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
