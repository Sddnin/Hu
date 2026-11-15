'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface SpellModeProps {
  cards: Flashcard[];
  onComplete: (results: PracticeResultItem[]) => void;
}

function normalize(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function SpellMode({ cards, onComplete }: SpellModeProps) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [showMeaning, setShowMeaning] = useState(true);
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = cards[index];

  // Auto-speak when entering each word
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => {
      speakEnglish(current.term, 0.92);
    }, 150);
    return () => window.clearTimeout(t);
  }, [current]);

  if (!current) return null;

  function handleCheck(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (status !== 'idle') {
      handleNext();
      return;
    }
    const isCorrect = normalize(input) === normalize(current.term);
    setStatus(isCorrect ? 'correct' : 'incorrect');
    setResults((prev) => [
      ...prev,
      {
        cardId: current.id,
        term: current.term,
        meaning: current.meaning,
        isCorrect,
      },
    ]);
  }

  function handleNext() {
    if (index + 1 < cards.length) {
      setIndex((i) => i + 1);
      setInput('');
      setStatus('idle');
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      onComplete(results);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-mono-tabular">
          Từ {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={() => setShowMeaning((v) => !v)}
          className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
        >
          {showMeaning ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{showMeaning ? 'Ẩn gợi ý nghĩa' : 'Hiện nghĩa tiếng Việt'}</span>
        </button>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Nghe phát âm và gõ lại đúng chính tả
          </span>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => speakEnglish(current.term, 0.92)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              <span>Nghe phát âm</span>
            </button>

            <button
              type="button"
              onClick={() => speakEnglish(current.term, 0.62)}
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <span>Đọc chậm (0.6x)</span>
            </button>
          </div>

          {showMeaning && (
            <div className="mt-5 text-base font-medium text-slate-800 dark:text-slate-200">
              {current.meaning}{' '}
              {current.partOfSpeech && (
                <span className="text-xs italic text-slate-500 dark:text-slate-400">
                  ({current.partOfSpeech})
                </span>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleCheck} className="mt-6 space-y-4">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            disabled={status !== 'idle'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Gõ từ bạn vừa nghe được..."
            autoComplete="off"
            spellCheck={false}
            className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono-tabular text-lg text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          {status === 'correct' && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Chính xác: <strong>{current.term}</strong> {current.phonetic}
              </span>
            </div>
          )}

          {status === 'incorrect' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Bạn gõ: <code className="font-mono-tabular">{input || '(trống)'}</code> · Đáp án đúng:{' '}
                  <code className="font-mono-tabular underline">{current.term}</code>
                </span>
              </div>
              {current.phonetic && (
                <div className="mt-1 font-mono-tabular text-xs opacity-80">
                  {current.phonetic}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            {status === 'idle' ? (
              <button
                type="submit"
                disabled={!input.trim()}
                className="min-h-[44px] w-full sm:w-auto rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                Kiểm tra chính tả
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                <span>
                  {index + 1 < cards.length ? 'Từ tiếp theo' : 'Hoàn thành'}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
