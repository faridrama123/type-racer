import React from 'react';
import { Flag } from 'lucide-react';
import { RacerState } from '../types/game';
import { CarIcon } from './CarIcon';
import { formatDuration } from '../utils/shareCard';

interface RaceTrackProps {
  players: RacerState[];
  currentPlayerId: string | null;
  statusLabel: string;
}

export const RaceTrack: React.FC<RaceTrackProps> = ({
  players,
  currentPlayerId,
  statusLabel,
}) => {
  return (
    <section
      aria-label="Lintasan Balap"
      className="bg-[#111827] text-white rounded-2xl border border-slate-800 overflow-hidden shadow-sm"
    >
      {/* Top Track Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/90 bg-[#0D1320]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
          <Flag className="w-4 h-4 text-orange-500 shrink-0" />
          <span>Lintasan Sirkuit</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-400 text-xs">{statusLabel}</span>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-xs font-mono text-slate-400 tabular-nums">
          <span>START</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span className="text-orange-400 font-semibold">FINIS</span>
        </div>
      </div>

      {/* Lanes Container */}
      <div className="relative px-4 sm:px-5 py-3 divide-y divide-slate-800/80">
        {/* Distance vertical guide lines */}
        <div className="pointer-events-none absolute inset-y-0 left-5 right-14 hidden sm:block">
          <div className="absolute left-1/4 inset-y-0 border-l border-dashed border-slate-800/70" />
          <div className="absolute left-1/2 inset-y-0 border-l border-dashed border-slate-800/70" />
          <div className="absolute left-3/4 inset-y-0 border-l border-dashed border-slate-800/70" />
          {/* Checkered Finish Line */}
          <div
            className="absolute right-0 inset-y-0 w-3 opacity-75"
            style={{
              backgroundImage:
                'repeating-conic-gradient(#FFFFFF 0% 25%, #0F172A 0% 50%)',
              backgroundSize: '8px 8px',
            }}
          />
        </div>

        {players.map((racer) => {
          const isMe = racer.id === currentPlayerId;
          const clampedProgress = Math.max(0, Math.min(100, racer.progress));

          return (
            <div
              key={racer.id}
              className={`relative py-3 first:pt-2 last:pb-2 ${
                isMe ? 'bg-slate-800/30 -mx-4 sm:-mx-5 px-4 sm:px-5' : ''
              }`}
            >
              {/* Lane metadata row */}
              <div className="flex items-center justify-between gap-4 mb-1.5 relative z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: racer.carColor }}
                  />
                  <span
                    className={`text-sm font-semibold truncate ${
                      isMe ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {racer.name}
                  </span>
                  {isMe && (
                    <span className="text-xs text-orange-400 font-medium shrink-0">
                      (Anda)
                    </span>
                  )}
                  {racer.isBot && (
                    <span className="text-xs text-slate-400 shrink-0">
                      · Pace Bot
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs font-mono tabular-nums shrink-0">
                  {racer.finished && racer.finishRank && (
                    <span className="text-emerald-400 font-semibold">
                      Juara #{racer.finishRank}
                      {racer.finishTimeMs ? ` · ${formatDuration(racer.finishTimeMs)}` : ''}
                    </span>
                  )}
                  <span className="text-slate-300 font-semibold">
                    {racer.wpm} <span className="text-slate-500 font-normal">KPM</span>
                  </span>
                  <span className="text-slate-400 w-12 text-right">
                    {Math.round(clampedProgress)}%
                  </span>
                </div>
              </div>

              {/* Asphalt lane track */}
              <div className="relative h-9 flex items-center pr-14 sm:pr-16">
                {/* Lane dashed center line */}
                <div className="absolute left-0 right-10 top-1/2 -translate-y-1/2 border-b border-dashed border-slate-700/60" />

                {/* Car track wrapper positioned from 0% to 100% */}
                <div
                  className="relative w-full h-9 transition-transform duration-150 ease-out will-change-transform"
                  style={{
                    transform: `translateX(${clampedProgress}%)`,
                  }}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1">
                    <CarIcon
                      model={racer.carModel}
                      color={racer.carColor}
                      isMoving={clampedProgress > 0 && !racer.finished}
                      className="w-14 h-7"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
