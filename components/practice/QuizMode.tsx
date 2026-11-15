'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Volume2, XCircle } from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface QuizModeProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  autoSpeak?: boolean;
  onComplete: (results: PracticeResultItem[]) => void;
}

interface QuizQuestion {
  card: Flashcard;
  prompt: string;
  subPrompt: string;
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function QuizMode({
  cards,
  allPoolCards,
  autoSpeak = false,
  onComplete,
}: QuizModeProps) {
  const [direction, setDirection] = useState<'en-vi' | 'vi-en'>('en-vi');
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [streak, setStreak] = useState(0);

  const questions = useMemo<QuizQuestion[]>(() => {
    const pool = allPoolCards.length >= 4 ? allPoolCards : cards;
    return cards.map((card) => {
      const distractors = shuffleArray(
        pool.filter((c) => c.id !== card.id)
      ).slice(0, 3);
      const optionCards = shuffleArray([card, ...distractors]);

      return {
        card,
        prompt: direction === 'en-vi' ? card.term : card.meaning,
        subPrompt:
          direction === 'en-vi'
            ? [card.phonetic, card.partOfSpeech].filter(Boolean).join(' · ')
            : 'Chọn từ tiếng Anh tương ứng',
        options: optionCards.map((c) => ({
          id: c.id,
          label: direction === 'en-vi' ? c.meaning : c.term,
        })),
        correctOptionId: card.id,
      };
    });
  }, [cards, allPoolCards, direction]);

  const current = questions[index];
  const isAnswered = selectedId !== null;

  const handleSelectOption = useCallback(
    (optionId: string) => {
      if (!current || selectedId !== null) return;
      setSelectedId(optionId);
      const isCorrect = optionId === current.correctOptionId;
      setStreak((s) => (isCorrect ? s + 1 : 0));
      setResults((prev) => [
        ...prev,
        {
          cardId: current.card.id,
          term: current.card.term,
          meaning: current.card.meaning,
          isCorrect,
        },
      ]);
    },
    [current, selectedId]
  );

  const handleNext = useCallback(() => {
    if (!current) return;
    if (index + 1 < questions.length) {
      setSelectedId(null);
      setIndex((i) => i + 1);
    } else {
      onComplete(results);
    }
  }, [current, index, questions.length, results, onComplete]);

  // Reset if direction changes before answering
  function handleDirectionChange(nextDir: 'en-vi' | 'vi-en') {
    setDirection(nextDir);
    setIndex(0);
    setSelectedId(null);
    setResults([]);
    setStreak(0);
  }

  useEffect(() => {
    if (!autoSpeak || !current || direction !== 'en-vi' || isAnswered) return;
    speakEnglish(current.card.term);
  }, [autoSpeak, current, direction, isAnswered]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!current) return;
      if (!isAnswered && ['1', '2', '3', '4'].includes(e.key)) {
        const opt = current.options[Number(e.key) - 1];
        if (opt) handleSelectOption(opt.id);
      } else if (isAnswered && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleNext();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, isAnswered, handleSelectOption, handleNext]);

  if (!current) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Controls & Progress */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono-tabular">
            Câu {index + 1} / {questions.length}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            Chuỗi đúng: {streak}
          </span>
        </div>

        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => handleDirectionChange('en-vi')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              direction === 'en-vi'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Anh → Việt
          </button>
          <button
            type="button"
            onClick={() => handleDirectionChange('vi-en')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              direction === 'vi-en'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            Việt → Anh
          </button>
        </div>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chọn đáp án chính xác nhất
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {current.prompt}
            </h2>
            {current.subPrompt && (
              <p className="mt-1.5 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                {current.subPrompt}
              </p>
            )}
          </div>

          {direction === 'en-vi' && (
            <button
              type="button"
              onClick={() => speakEnglish(current.card.term)}
              aria-label={`Phát âm ${current.card.term}`}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* 4 Options */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {current.options.map((opt, optIdx) => {
            const isSelected = selectedId === opt.id;
            const isCorrectOpt = opt.id === current.correctOptionId;

            let optionStyle =
              'border-slate-200 bg-slate-50/70 text-slate-900 hover:border-sky-600 hover:bg-sky-50/60 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:hover:border-sky-500';
            if (isAnswered) {
              if (isCorrectOpt) {
                optionStyle =
                  'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200';
              } else if (isSelected) {
                optionStyle =
                  'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200';
              } else {
                optionStyle =
                  'border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-600';
              }
            }

            return (
              <button
                key={opt.id}
                type="button"
                disabled={isAnswered}
                onClick={() => handleSelectOption(opt.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors cursor-pointer disabled:cursor-default ${optionStyle}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono-tabular text-xs font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                    {optIdx + 1}.
                  </span>
                  <span className="text-sm font-medium leading-snug">
                    {opt.label}
                  </span>
                </div>

                {isAnswered && isCorrectOpt && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>Đúng</span>
                  </span>
                )}
                {isAnswered && isSelected && !isCorrectOpt && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 shrink-0">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Sai</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Instant Feedback & Next Action */}
        {isAnswered && (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {current.card.example ? (
                <span>Ví dụ: “{current.card.example}”</span>
              ) : (
                <span>
                  {current.card.term} — {current.card.meaning}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>
                {index + 1 < questions.length ? 'Câu tiếp theo' : 'Xem kết quả'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
