'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Star,
  Volume2,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard, MasteryLevel } from '@/lib/types';

export interface PracticeResultItem {
  cardId: string;
  term: string;
  meaning: string;
  isCorrect: boolean;
  explicitMastery?: MasteryLevel;
}

interface FlipModeProps {
  cards: Flashcard[];
  autoSpeak?: boolean;
  onToggleStar: (card: Flashcard) => Promise<void>;
  onComplete: (results: PracticeResultItem[]) => void;
}

export function FlipMode({
  cards,
  autoSpeak = false,
  onToggleStar,
  onComplete,
}: FlipModeProps) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [frontSide, setFrontSide] = useState<'en' | 'vi'>('en');
  const [autoplay, setAutoplay] = useState(false);
  const [ratings, setRatings] = useState<
    Record<string, { mastery: MasteryLevel; isCorrect: boolean }>
  >({});

  const touchStartX = useRef<number | null>(null);

  const current = cards[index];
  const total = cards.length;
  const ratedCount = Object.keys(ratings).length;

  const finishSession = useCallback(
    (finalMap: Record<string, { mastery: MasteryLevel; isCorrect: boolean }>) => {
      setAutoplay(false);
      const finalResults: PracticeResultItem[] = cards.map((c) => {
        const r = finalMap[c.id];
        return {
          cardId: c.id,
          term: c.term,
          meaning: c.meaning,
          isCorrect: r ? r.isCorrect : true,
          explicitMastery: r ? r.mastery : 'learning',
        };
      });
      onComplete(finalResults);
    },
    [cards, onComplete]
  );

  const handleRate = useCallback(
    (mastery: MasteryLevel) => {
      if (!current) return;
      const isCorrect = mastery !== 'new';
      const nextRatings = {
        ...ratings,
        [current.id]: { mastery, isCorrect },
      };
      setRatings(nextRatings);

      if (index + 1 < total) {
        setIsFlipped(false);
        setTimeout(() => setIndex((i) => i + 1), 130);
      } else {
        finishSession(nextRatings);
      }
    },
    [current, ratings, index, total, finishSession]
  );

  // Autoplay loop (Quizlet-style hands-free study)
  useEffect(() => {
    if (!autoplay || !current) return;

    if (!isFlipped) {
      if (frontSide === 'en') {
        speakEnglish(current.term);
      }
      const flipTimer = window.setTimeout(() => {
        setIsFlipped(true);
      }, 2200);
      return () => window.clearTimeout(flipTimer);
    }

    if (frontSide === 'vi') {
      speakEnglish(current.term);
    }
    const nextTimer = window.setTimeout(() => {
      if (index + 1 < total) {
        setIsFlipped(false);
        setIndex((i) => i + 1);
      } else {
        setAutoplay(false);
      }
    }, 2400);
    return () => window.clearTimeout(nextTimer);
  }, [autoplay, isFlipped, index, total, current, frontSide]);

  // Auto-speak when changing cards manually if autoSpeak is enabled
  useEffect(() => {
    if (!autoSpeak || autoplay || !current) return;
    if (frontSide === 'en' && !isFlipped) {
      speakEnglish(current.term);
    } else if (frontSide === 'vi' && isFlipped) {
      speakEnglish(current.term);
    }
  }, [autoSpeak, autoplay, current, frontSide, isFlipped]);

  // Desktop keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setAutoplay(false);
        setIsFlipped((prev) => !prev);
      } else if (e.key === 'ArrowRight' && index + 1 < total) {
        setAutoplay(false);
        setIsFlipped(false);
        setIndex((i) => i + 1);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        setAutoplay(false);
        setIsFlipped(false);
        setIndex((i) => i - 1);
      } else if (e.key === '1') {
        setAutoplay(false);
        handleRate('new');
      } else if (e.key === '2') {
        setAutoplay(false);
        handleRate('learning');
      } else if (e.key === '3') {
        setAutoplay(false);
        handleRate('mastered');
      } else if ((e.key === 's' || e.key === 'S') && current) {
        onToggleStar(current);
      } else if ((e.key === 'a' || e.key === 'A') && current) {
        speakEnglish(current.term);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, total, handleRate, current, onToggleStar]);

  if (!current) return null;

  const frontTitle = frontSide === 'en' ? current.term : current.meaning;
  const backTitle = frontSide === 'en' ? current.meaning : current.term;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Top Controls Row */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2 font-mono-tabular">
          <span>
            Thẻ {index + 1} / {total}
          </span>
          <span aria-hidden="true">·</span>
          <span>Đã chấm: {ratedCount}/{total}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsFlipped(false);
              setFrontSide((s) => (s === 'en' ? 'vi' : 'en'));
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{frontSide === 'en' ? 'Mặt trước: Anh' : 'Mặt trước: Việt'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoplay((a) => !a)}
            aria-pressed={autoplay}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              autoplay
                ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {autoplay ? (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{autoplay ? 'Đang tự chạy' : 'Tự chạy'}</span>
          </button>
        </div>
      </div>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* 3D Flip Card with Touch Swipe */}
      <div
        className="card-perspective h-[310px] sm:h-96 select-none"
        onTouchStart={(e) => {
          touchStartX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
          const delta = endX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 55) {
            setAutoplay(false);
            if (delta < 0 && index + 1 < total) {
              setIsFlipped(false);
              setIndex((i) => i + 1);
            } else if (delta > 0 && index > 0) {
              setIsFlipped(false);
              setIndex((i) => i - 1);
            }
          }
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={
            isFlipped
              ? `Mặt sau: ${backTitle}. Nhấn để lật lại`
              : `Mặt trước: ${frontTitle}. Nhấn để xem đáp án`
          }
          onClick={() => {
            setAutoplay(false);
            setIsFlipped((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setAutoplay(false);
              setIsFlipped((prev) => !prev);
            }
          }}
          className={`card-inner cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 ${
            isFlipped ? 'is-flipped' : ''
          }`}
        >
          {/* Front Face */}
          <div className="card-face flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {frontSide === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(current);
                  }}
                  aria-label={
                    current.starred ? 'Bỏ gắn sao thẻ này' : 'Gắn sao thẻ quan trọng'
                  }
                  className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                    current.starred
                      ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                      : 'border-slate-200 text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:hover:text-amber-400'
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${current.starred ? 'fill-current' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakEnglish(current.term);
                  }}
                  aria-label={`Phát âm ${current.term}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  <span>Nghe</span>
                </button>
              </div>
            </div>

            <div className="my-auto px-2 text-center">
              <div className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
                {frontTitle}
              </div>
              {frontSide === 'en' && (current.phonetic || current.partOfSpeech) && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  {current.phonetic && (
                    <span className="font-mono-tabular">{current.phonetic}</span>
                  )}
                  {current.phonetic && current.partOfSpeech && (
                    <span aria-hidden="true">·</span>
                  )}
                  {current.partOfSpeech && (
                    <span className="italic">{current.partOfSpeech}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">Chạm để lật · Vuốt trái/phải đổi thẻ</span>
              <span className="hidden sm:inline">Nhấn vào thẻ hoặc phím Space để lật</span>
            </div>
          </div>

          {/* Back Face */}
          <div className="card-face card-face-back flex flex-col justify-between rounded-2xl border border-sky-200 bg-slate-50 p-5 shadow-sm dark:border-sky-900/70 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {frontSide === 'en' ? 'Nghĩa & Ví dụ' : 'Từ tiếng Anh'}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(current);
                  }}
                  aria-label="Gắn sao"
                  className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                    current.starred
                      ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                      : 'border-slate-200 bg-white text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${current.starred ? 'fill-current' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {current.example && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakEnglish(current.example);
                    }}
                    aria-label="Nghe câu ví dụ"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                    <span>Ví dụ</span>
                  </button>
                )}
              </div>
            </div>

            <div className="my-auto px-2 text-center">
              <div className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
                {backTitle}
              </div>
              <div className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                {frontSide === 'en' ? current.term : current.phonetic}
              </div>
              {current.example && (
                <p className="mx-auto mt-4 max-w-lg border-t border-slate-200 pt-3.5 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
                  “{current.example}”
                </p>
              )}
            </div>

            <div className="text-center text-xs text-slate-400 dark:text-slate-500">
              Chọn mức độ ghi nhớ bên dưới
            </div>
          </div>
        </div>
      </div>

      {/* Self-rating Controls (44px+ touch targets) */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => {
            setAutoplay(false);
            handleRate('new');
          }}
          className="flex min-h-[52px] flex-col items-center justify-center rounded-xl border border-red-200 bg-white px-2 py-2.5 text-center transition-colors hover:bg-red-50 active:scale-[0.98] dark:border-red-900/60 dark:bg-slate-900 dark:hover:bg-red-950/30 cursor-pointer"
        >
          <span className="text-xs font-semibold text-red-700 dark:text-red-400 sm:text-sm">
            Cần ôn lại
          </span>
          <span className="mt-0.5 hidden font-mono-tabular text-xs text-slate-500 dark:text-slate-400 sm:inline">
            Phím 1
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAutoplay(false);
            handleRate('learning');
          }}
          className="flex min-h-[52px] flex-col items-center justify-center rounded-xl border border-amber-200 bg-white px-2 py-2.5 text-center transition-colors hover:bg-amber-50 active:scale-[0.98] dark:border-amber-900/60 dark:bg-slate-900 dark:hover:bg-amber-950/30 cursor-pointer"
        >
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 sm:text-sm">
            Tạm nhớ
          </span>
          <span className="mt-0.5 hidden font-mono-tabular text-xs text-slate-500 dark:text-slate-400 sm:inline">
            Phím 2
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAutoplay(false);
            handleRate('mastered');
          }}
          className="flex min-h-[52px] flex-col items-center justify-center rounded-xl border border-emerald-200 bg-white px-2 py-2.5 text-center transition-colors hover:bg-emerald-50 active:scale-[0.98] dark:border-emerald-900/60 dark:bg-slate-900 dark:hover:bg-emerald-950/30 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 sm:text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Đã thuộc</span>
          </span>
          <span className="mt-0.5 hidden font-mono-tabular text-xs text-slate-500 dark:text-slate-400 sm:inline">
            Phím 3
          </span>
        </button>
      </div>

      {/* Bottom Prev / Finish / Next Bar */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => {
            setAutoplay(false);
            setIsFlipped(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Trước</span>
        </button>

        <button
          type="button"
          onClick={() => finishSession(ratings)}
          className="min-h-[44px] px-3 text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer"
        >
          Hoàn thành phiên
        </button>

        <button
          type="button"
          disabled={index + 1 >= total}
          onClick={() => {
            setAutoplay(false);
            setIsFlipped(false);
            setIndex((i) => Math.min(total - 1, i + 1));
          }}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Sau</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
