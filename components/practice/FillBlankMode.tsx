'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface FillBlankModeProps {
  cards: Flashcard[];
  onComplete: (results: PracticeResultItem[]) => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMaskedExample(term: string, example: string): string | null {
  if (!example.trim()) return null;
  const regex = new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, 'i');
  if (regex.test(example)) {
    return example.replace(regex, '_____');
  }
  const looseRegex = new RegExp(escapeRegExp(term.trim()), 'i');
  if (looseRegex.test(example)) {
    return example.replace(looseRegex, '_____');
  }
  return null;
}

function normalizeAnswer(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function FillBlankMode({ cards, onComplete }: FillBlankModeProps) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [checkedStatus, setCheckedStatus] = useState<
    'idle' | 'correct' | 'incorrect'
  >('idle');
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = cards[index];

  const maskedSentence = useMemo(() => {
    if (!current) return null;
    return buildMaskedExample(current.term, current.example);
  }, [current]);

  if (!current) return null;

  const letterHint = current.term
    .split(' ')
    .map((w) =>
      w.length <= 1 ? w : `${w[0]}${'_'.repeat(Math.max(1, w.length - 1))}`
    )
    .join(' ');

  function handleCheck(e: FormEvent) {
    e.preventDefault();
    if (!current) return;

    if (checkedStatus !== 'idle') {
      handleNext();
      return;
    }

    const isCorrect =
      normalizeAnswer(input) === normalizeAnswer(current.term);

    setCheckedStatus(isCorrect ? 'correct' : 'incorrect');
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

  function handleSkip() {
    if (!current || checkedStatus !== 'idle') return;
    setCheckedStatus('incorrect');
    setResults((prev) => [
      ...prev,
      {
        cardId: current.id,
        term: current.term,
        meaning: current.meaning,
        isCorrect: false,
      },
    ]);
  }

  function handleNext() {
    if (index + 1 < cards.length) {
      setIndex((i) => i + 1);
      setInput('');
      setShowHint(false);
      setCheckedStatus('idle');
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      onComplete(results);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-mono-tabular">
          Câu {index + 1} / {cards.length}
        </span>
        <span className="font-mono-tabular">
          Đúng: {results.filter((r) => r.isCorrect).length}/{results.length}
        </span>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Điền từ tiếng Anh phù hợp {current.partOfSpeech ? `(${current.partOfSpeech})` : ''}
            </span>
            <h2 className="mt-2 font-display text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              {current.meaning}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => speakEnglish(current.term)}
            title="Nghe phát âm gợi ý"
            aria-label="Nghe phát âm từ cần điền"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {maskedSentence && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            {maskedSentence.split('_____').map((part, idx, arr) => (
              <span key={idx}>
                {part}
                {idx < arr.length - 1 && (
                  <span className="mx-1 inline-block min-w-[72px] border-b-2 border-sky-600 px-1 text-center font-mono-tabular font-semibold text-sky-700 dark:border-sky-400 dark:text-sky-400">
                    {checkedStatus !== 'idle'
                      ? current.term
                      : input.trim() || '_____'}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleCheck} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fill-blank-input" className="sr-only">
              Nhập từ tiếng Anh
            </label>
            <input
              ref={inputRef}
              id="fill-blank-input"
              type="text"
              autoFocus
              disabled={checkedStatus !== 'idle'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Gõ từ tiếng Anh vào đây..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono-tabular text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-600 focus:outline-none disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:disabled:bg-slate-900"
            />
          </div>

          {showHint && checkedStatus === 'idle' && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Gợi ý chữ cái:{' '}
              <span className="font-mono-tabular font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                {letterHint}
              </span>{' '}
              ({current.term.length} ký tự)
            </div>
          )}

          {checkedStatus === 'correct' && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Chính xác! Đáp án: <strong>{current.term}</strong>{' '}
                {current.phonetic && (
                  <span className="font-mono-tabular text-xs opacity-80">
                    {current.phonetic}
                  </span>
                )}
              </span>
            </div>
          )}

          {checkedStatus === 'incorrect' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
              <XCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <div className="font-semibold">
                  Chưa đúng. Đáp án chuẩn là:{' '}
                  <span className="font-mono-tabular underline">
                    {current.term}
                  </span>
                </div>
                {current.phonetic && (
                  <div className="mt-0.5 font-mono-tabular text-xs opacity-80">
                    {current.phonetic}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {checkedStatus === 'idle' ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHint((h) => !h)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{showHint ? 'Ẩn gợi ý' : 'Gợi ý chữ cái'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Xem đáp án
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  Kiểm tra
                </button>
              </>
            ) : (
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
                >
                  <span>
                    {index + 1 < cards.length ? 'Câu tiếp theo' : 'Xem kết quả'}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
