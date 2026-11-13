import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Passage, RoomStatus } from '../types/game';
import { soundEngine } from '../utils/sound';
import { formatDuration } from '../utils/shareCard';

interface TypingArenaProps {
  passage: Passage;
  status: RoomStatus;
  countdownSeconds: number;
  startTime: number | null;
  onProgress: (payload: {
    typedChars: number;
    totalChars: number;
    mistakes: number;
    accuracy: number;
    finished: boolean;
  }) => void;
  onQuickRestart?: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TypingArena: React.FC<TypingArenaProps> = ({
  passage,
  status,
  countdownSeconds,
  startTime,
  onProgress,
  onQuickRestart,
  isMuted,
  onToggleMute,
}) => {
  const words = useMemo(() => passage.text.split(' '), [passage.text]);
  const totalChars = passage.text.length;

  const [wordIndex, setWordIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [mistakes, setMistakes] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finished, setFinished] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastProgressEmitRef = useRef<number>(0);

  // Reset typing state whenever passage changes or race returns to LOBBY / COUNTDOWN
  useEffect(() => {
    if (status === 'LOBBY' || status === 'COUNTDOWN') {
      setWordIndex(0);
      setInputValue('');
      setMistakes(0);
      setTotalKeystrokes(0);
      setElapsedMs(0);
      setFinished(false);
    }
  }, [passage.id, passage.text, status]);

  // Auto-focus input when race starts
  useEffect(() => {
    if (status === 'RACING' && !finished) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [status, finished]);

  // Live timer during RACING
  useEffect(() => {
    if (status !== 'RACING' || !startTime || finished) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    return () => clearInterval(timer);
  }, [status, startTime, finished]);

  const currentTargetWord = words[wordIndex] ?? '';
  const isLastWord = wordIndex === words.length - 1;

  // Compute how many characters match cleanly from the start of currentTargetWord
  let matchingPrefixLen = 0;
  while (
    matchingPrefixLen < inputValue.length &&
    matchingPrefixLen < currentTargetWord.length &&
    inputValue[matchingPrefixLen] === currentTargetWord[matchingPrefixLen]
  ) {
    matchingPrefixLen++;
  }

  const hasTypo =
    inputValue.length > 0 && matchingPrefixLen < inputValue.length;

  const completedPrefixChars = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < wordIndex; i++) {
      sum += words[i].length + 1; // word + space
    }
    return sum;
  }, [words, wordIndex]);

  const typedChars = Math.min(
    totalChars,
    completedPrefixChars + matchingPrefixLen
  );

  const liveWpm =
    elapsedMs > 400
      ? Math.round((typedChars / 5) / (elapsedMs / 60000))
      : 0;

  const accuracy =
    totalKeystrokes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((totalKeystrokes - mistakes) / totalKeystrokes) * 1000) / 10
          )
        )
      : 100;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (status !== 'RACING' || finished) return;

    const nextVal = e.target.value;
    const prevVal = inputValue;

    // Check if user added characters
    if (nextVal.length > prevVal.length) {
      const nextKeystrokes = totalKeystrokes + 1;
      setTotalKeystrokes(nextKeystrokes);

      // Word completion check via Spacebar on non-last word
      if (!isLastWord && nextVal.endsWith(' ')) {
        const trimmed = nextVal.slice(0, -1);
        if (trimmed === currentTargetWord) {
          soundEngine.playKeyClick();
          const nextWordIdx = wordIndex + 1;
          setWordIndex(nextWordIdx);
          setInputValue('');

          let nextCompletedChars = 0;
          for (let i = 0; i < nextWordIdx; i++) {
            nextCompletedChars += words[i].length + 1;
          }

          const nextAcc = Math.max(
            0,
            Math.min(
              100,
              Math.round(((nextKeystrokes - mistakes) / nextKeystrokes) * 1000) / 10
            )
          );

          onProgress({
            typedChars: nextCompletedChars,
            totalChars,
            mistakes,
            accuracy: nextAcc,
            finished: false,
          });
          lastProgressEmitRef.current = Date.now();
          return;
        }
      }

      // Check typo on newly typed char
      const expectedSoFar = currentTargetWord.slice(0, nextVal.length);
      const isValidPrefix = nextVal === expectedSoFar && nextVal.length <= currentTargetWord.length;

      let nextMistakes = mistakes;
      if (!isValidPrefix) {
        nextMistakes = mistakes + 1;
        setMistakes(nextMistakes);
        soundEngine.playError();
      } else {
        soundEngine.playKeyClick();
      }

      setInputValue(nextVal);

      // Final word completion without needing spacebar
      if (isLastWord && nextVal === currentTargetWord) {
        setFinished(true);
        const finalElapsed = startTime ? Date.now() - startTime : elapsedMs;
        setElapsedMs(finalElapsed);
        soundEngine.playFinish();

        const nextAcc = Math.max(
          0,
          Math.min(
            100,
            Math.round(((nextKeystrokes - nextMistakes) / nextKeystrokes) * 1000) / 10
          )
        );
        onProgress({
          typedChars: totalChars,
          totalChars,
          mistakes: nextMistakes,
          accuracy: nextAcc,
          finished: true,
        });
        return;
      }

      // Throttled progress emit (~80ms) for smooth multiplayer sync
      const now = Date.now();
      if (now - lastProgressEmitRef.current >= 80 && isValidPrefix) {
        lastProgressEmitRef.current = now;
        const nextAcc = Math.max(
          0,
          Math.min(
            100,
            Math.round(((nextKeystrokes - nextMistakes) / nextKeystrokes) * 1000) / 10
          )
        );
        onProgress({
          typedChars: Math.min(totalChars, completedPrefixChars + nextVal.length),
          totalChars,
          mistakes: nextMistakes,
          accuracy: nextAcc,
          finished: false,
        });
      }
    } else {
      // Backspace / deletion
      setInputValue(nextVal);
    }
  };

  return (
    <section
      aria-label="Arena Mengetik"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      {/* Top Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {passage.title}
          </h2>
          <p className="text-xs text-slate-500 truncate">
            {passage.author} <span aria-hidden="true">·</span> {passage.category}{' '}
            <span aria-hidden="true">·</span> {passage.difficulty}
          </p>
        </div>

        <div className="flex items-center gap-5 text-sm font-mono tabular-nums shrink-0">
          <div>
            <span className="text-xs font-sans text-slate-500 mr-1.5">Kecepatan</span>
            <span className="font-bold text-slate-900">{liveWpm}</span>
            <span className="text-xs text-slate-500 ml-1">KPM</span>
          </div>
          <div>
            <span className="text-xs font-sans text-slate-500 mr-1.5">Akurasi</span>
            <span className="font-bold text-slate-900">{accuracy}%</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-xs font-sans text-slate-500 mr-1.5">Waktu</span>
            <span className="font-semibold text-slate-800">{formatDuration(elapsedMs)}</span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Aktifkan suara' : 'Bisukan suara'}
            title={isMuted ? 'Aktifkan suara' : 'Bisukan suara'}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Passage Display */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="px-6 py-6 sm:px-8 sm:py-7 cursor-text select-none"
      >
        <p className="font-mono text-lg sm:text-[21px] leading-[1.85] tracking-normal text-slate-700">
          {words.map((word, idx) => {
            if (idx < wordIndex) {
              return (
                <span key={idx} className="text-emerald-700 font-medium">
                  {word}{' '}
                </span>
              );
            }

            if (idx === wordIndex && !finished) {
              const typedCorrect = word.slice(0, matchingPrefixLen);
              const wrongTypedPart = hasTypo
                ? word.slice(matchingPrefixLen, Math.min(word.length, inputValue.length))
                : '';
              const extraWrongLen = Math.max(0, inputValue.length - word.length);
              const remaining = word.slice(
                Math.max(matchingPrefixLen, Math.min(word.length, inputValue.length))
              );

              return (
                <span
                  key={idx}
                  className={`inline-block rounded px-1 -mx-1 ${
                    hasTypo ? 'bg-red-50' : 'bg-orange-50'
                  }`}
                >
                  <span className="text-emerald-700 font-semibold">{typedCorrect}</span>
                  {wrongTypedPart && (
                    <span className="bg-red-200 text-red-900 underline decoration-red-600 decoration-2 font-semibold">
                      {wrongTypedPart}
                    </span>
                  )}
                  {extraWrongLen > 0 && (
                    <span className="bg-red-200 text-red-900 underline decoration-red-600 decoration-2 font-semibold">
                      {inputValue.slice(word.length)}
                    </span>
                  )}
                  <span className="text-slate-950 font-semibold underline decoration-orange-500 decoration-2 underline-offset-4">
                    {remaining}
                  </span>{' '}
                </span>
              );
            }

            return (
              <span key={idx} className="text-slate-500">
                {word}{' '}
              </span>
            );
          })}
        </p>
      </div>

      {/* Input & Status Control Bar */}
      <div className="px-6 pb-6 sm:px-8 sm:pb-7 pt-2">
        <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onPaste={(e) => e.preventDefault()}
              disabled={status !== 'RACING' || finished}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={
                status === 'COUNTDOWN'
                  ? `Bersiap... balapan dimulai dalam ${countdownSeconds}`
                  : status === 'LOBBY'
                    ? 'Menunggu balapan dimulai...'
                    : finished
                      ? 'Selesai! Anda mencapai garis finis.'
                      : `Ketik kata: "${currentTargetWord}"`
              }
              aria-label="Kolom ketik balapan"
              className={`w-full px-4 py-3.5 rounded-xl font-mono text-base sm:text-lg border-2 transition-colors focus:outline-none ${
                finished
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                  : status !== 'RACING'
                    ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    : hasTypo
                      ? 'bg-red-50 border-red-500 text-red-900 focus:border-red-600'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-orange-500'
              }`}
            />

            {status === 'COUNTDOWN' && (
              <div className="sm:hidden mt-2 text-center text-sm font-semibold text-orange-600">
                Mulai dalam {countdownSeconds}...
              </div>
            )}
          </div>

          {onQuickRestart && (
            <button
              type="button"
              onClick={onQuickRestart}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ganti Teks</span>
            </button>
          )}
        </div>

        {/* Helper / Error State Line (Non-hue-only signal) */}
        <div className="mt-2.5 flex items-center justify-between text-xs min-h-[20px]">
          {hasTypo ? (
            <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Ketikan salah — tekan Backspace untuk memperbaiki kata berwarna merah.</span>
            </span>
          ) : finished ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Lintasan selesai dengan {mistakes} kesalahan ketik.</span>
            </span>
          ) : status === 'COUNTDOWN' ? (
            <span className="text-orange-700 font-semibold">
              Lampu start menyala: bersiap di posisi mengetik... ({countdownSeconds})
            </span>
          ) : (
            <span className="text-slate-500">
              Ketik setiap kata lalu tekan Spasi untuk lanjut ke kata berikutnya.
            </span>
          )}

          <span className="font-mono text-slate-400 tabular-nums hidden sm:inline">
            Kata {Math.min(wordIndex + (finished ? 0 : 1), words.length)}/{words.length}
          </span>
        </div>
      </div>
    </section>
  );
};
