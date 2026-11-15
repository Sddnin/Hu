'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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
  onComplete: (results: PracticeResultItem[]) => void;
}

export function FlipMode({ cards, onComplete }: FlipModeProps) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [ratings, setRatings] = useState<
    Record<string, { mastery: MasteryLevel; isCorrect: boolean }>
  >({});

  const current = cards[index];
  const total = cards.length;
  const ratedCount = Object.keys(ratings).length;

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
        setTimeout(() => setIndex((i) => i + 1), 140);
      } else {
        const finalResults: PracticeResultItem[] = cards.map((c) => {
          const r = nextRatings[c.id];
          return {
            cardId: c.id,
            term: c.term,
            meaning: c.meaning,
            isCorrect: r ? r.isCorrect : true,
            explicitMastery: r ? r.mastery : 'learning',
          };
        });
        onComplete(finalResults);
      }
    },
    [current, ratings, index, total, cards, onComplete]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === 'ArrowRight' && index + 1 < total) {
        setIsFlipped(false);
        setIndex((i) => i + 1);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        setIsFlipped(false);
        setIndex((i) => i - 1);
      } else if (e.key === '1') {
        handleRate('new');
      } else if (e.key === '2') {
        handleRate('learning');
      } else if (e.key === '3') {
        handleRate('mastered');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, total, handleRate]);

  if (!current) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-4 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-mono-tabular">
          Thẻ {index + 1} / {total}
        </span>
        <span className="font-mono-tabular">
          Đã đánh giá: {ratedCount}/{total}
        </span>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* 3D Flip Card */}
      <div className="card-perspective h-80 sm:h-96">
        <div
          role="button"
          tabIndex={0}
          aria-label={
            isFlipped
              ? `Mặt sau: ${current.meaning}. Nhấn để lật lại`
              : `Mặt trước: ${current.term}. Nhấn để xem nghĩa`
          }
          onClick={() => setIsFlipped((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setIsFlipped((prev) => !prev);
            }
          }}
          className={`card-inner cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 ${
            isFlipped ? 'is-flipped' : ''
          }`}
        >
          {/* Front Face */}
          <div className="card-face flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Mặt trước · Tiếng Anh
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speakEnglish(current.term);
                }}
                aria-label={`Phát âm ${current.term}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Nghe</span>
              </button>
            </div>

            <div className="my-auto text-center">
              <div className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
                {current.term}
              </div>
              {(current.phonetic || current.partOfSpeech) && (
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
              <span>Nhấn vào thẻ hoặc phím Space để lật</span>
            </div>
          </div>

          {/* Back Face */}
          <div className="card-face card-face-back flex flex-col justify-between rounded-2xl border border-sky-200 bg-slate-50 p-6 shadow-sm dark:border-sky-900/70 dark:bg-slate-900 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                Mặt sau · Nghĩa & Ví dụ
              </span>
              {current.example && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakEnglish(current.example);
                  }}
                  aria-label="Nghe câu ví dụ"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Nghe ví dụ</span>
                </button>
              )}
            </div>

            <div className="my-auto text-center">
              <div className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
                {current.meaning}
              </div>
              <div className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                {current.term}
              </div>
              {current.example && (
                <p className="mx-auto mt-5 max-w-lg border-t border-slate-200 pt-4 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-300">
                  “{current.example}”
                </p>
              )}
            </div>

            <div className="text-center text-xs text-slate-400 dark:text-slate-500">
              Chọn mức độ ghi nhớ bên dưới để tiếp tục
            </div>
          </div>
        </div>
      </div>

      {/* Self-rating Controls */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleRate('new')}
          className="flex flex-col items-center rounded-xl border border-red-200 bg-white px-3 py-3 text-center transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:hover:bg-red-950/30 cursor-pointer"
        >
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            Cần ôn lại
          </span>
          <span className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            Phím 1
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleRate('learning')}
          className="flex flex-col items-center rounded-xl border border-amber-200 bg-white px-3 py-3 text-center transition-colors hover:bg-amber-50 dark:border-amber-900/60 dark:bg-slate-900 dark:hover:bg-amber-950/30 cursor-pointer"
        >
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Tạm nhớ
          </span>
          <span className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            Phím 2
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleRate('mastered')}
          className="flex flex-col items-center rounded-xl border border-emerald-200 bg-white px-3 py-3 text-center transition-colors hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:hover:bg-emerald-950/30 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>Đã thuộc</span>
          </span>
          <span className="mt-0.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
            Phím 3
          </span>
        </button>
      </div>

      {/* Manual Prev/Next Navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => {
            setIsFlipped(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Thẻ trước</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const finalResults: PracticeResultItem[] = cards.map((c) => {
              const r = ratings[c.id];
              return {
                cardId: c.id,
                term: c.term,
                meaning: c.meaning,
                isCorrect: r ? r.isCorrect : true,
                explicitMastery: r ? r.mastery : 'learning',
              };
            });
            onComplete(finalResults);
          }}
          className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer"
        >
          Hoàn thành phiên ôn tập
        </button>

        <button
          type="button"
          disabled={index + 1 >= total}
          onClick={() => {
            setIsFlipped(false);
            setIndex((i) => Math.min(total - 1, i + 1));
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Thẻ sau</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
