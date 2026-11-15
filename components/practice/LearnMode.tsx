'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface LearnModeProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  onComplete: (results: PracticeResultItem[]) => void;
}

interface QueueEntry {
  card: Flashcard;
  stage: 'mc' | 'write';
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function LearnMode({ cards, allPoolCards, onComplete }: LearnModeProps) {
  const [queue, setQueue] = useState<QueueEntry[]>(() =>
    cards.map((card) => ({ card, stage: 'mc' }))
  );
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [mistakeIds, setMistakeIds] = useState<Record<string, boolean>>({});
  const [selectedMcId, setSelectedMcId] = useState<string | null>(null);
  const [writtenInput, setWrittenInput] = useState('');
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'incorrect'>(
    'idle'
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = queue[0] || null;
  const totalCards = cards.length;
  const pool = allPoolCards.length >= 4 ? allPoolCards : cards;

  const mcOptions = useMemo(() => {
    if (!current || current.stage !== 'mc') return [];
    const distractors = shuffle(
      pool.filter((c) => c.id !== current.card.id)
    ).slice(0, 3);
    return shuffle([current.card, ...distractors]);
  }, [current, pool]);

  if (!current) return null;

  function advanceQueue(isCorrect: boolean, overrideMaster = false) {
    if (!current) return;
    const rest = queue.slice(1);
    let nextQueue = [...rest];
    let nextMastered = [...masteredIds];

    if (overrideMaster || (isCorrect && current.stage === 'write')) {
      if (!nextMastered.includes(current.card.id)) {
        nextMastered = [...nextMastered, current.card.id];
      }
    } else if (isCorrect && current.stage === 'mc') {
      // Promote to stage 2 (written recall) near the middle/end
      const insertIdx = Math.min(nextQueue.length, 2);
      nextQueue.splice(insertIdx, 0, { card: current.card, stage: 'write' });
    } else {
      // Re-queue to practice again
      setMistakeIds((prev) => ({ ...prev, [current.card.id]: true }));
      nextQueue.push({ card: current.card, stage: current.stage });
    }

    if (nextQueue.length === 0) {
      const results: PracticeResultItem[] = cards.map((c) => ({
        cardId: c.id,
        term: c.term,
        meaning: c.meaning,
        isCorrect: !mistakeIds[c.id],
        explicitMastery: !mistakeIds[c.id] ? 'mastered' : 'learning',
      }));
      onComplete(results);
      return;
    }

    setMasteredIds(nextMastered);
    setQueue(nextQueue);
    setSelectedMcId(null);
    setWrittenInput('');
    setFeedback('idle');
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function handleMcPick(optionId: string) {
    if (!current || feedback !== 'idle') return;
    setSelectedMcId(optionId);
    const ok = optionId === current.card.id;
    setFeedback(ok ? 'correct' : 'incorrect');
    if (!ok) {
      setMistakeIds((prev) => ({ ...prev, [current.card.id]: true }));
    }
  }

  function handleWriteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (feedback !== 'idle') {
      advanceQueue(feedback === 'correct');
      return;
    }
    const ok = normalize(writtenInput) === normalize(current.card.term);
    setFeedback(ok ? 'correct' : 'incorrect');
    if (!ok) {
      setMistakeIds((prev) => ({ ...prev, [current.card.id]: true }));
    }
  }

  const progressPct = Math.round((masteredIds.length / totalCards) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Adaptive Mastery Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium text-sky-700 dark:text-sky-400">
          {current.stage === 'mc'
            ? 'Giai đoạn 1/2 · Nhận diện trắc nghiệm'
            : 'Giai đoạn 2/2 · Nhớ và tự gõ lại'}
        </span>
        <span className="font-mono-tabular">
          Thành thạo: {masteredIds.length} / {totalCards} từ ({progressPct}%)
        </span>
      </div>

      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300 dark:bg-emerald-500"
          style={{ width: `${Math.max(4, progressPct)}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {current.stage === 'mc'
                ? 'Chọn nghĩa đúng của từ sau'
                : 'Gõ từ tiếng Anh tương ứng với nghĩa sau'}
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
              {current.stage === 'mc' ? current.card.term : current.card.meaning}
            </h2>
            {current.stage === 'mc' && current.card.phonetic && (
              <p className="mt-1 font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                {current.card.phonetic}
              </p>
            )}
            {current.stage === 'write' && current.card.partOfSpeech && (
              <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">
                ({current.card.partOfSpeech})
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => speakEnglish(current.card.term)}
            aria-label={`Phát âm ${current.card.term}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {current.stage === 'mc' ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mcOptions.map((opt, idx) => {
              const isPicked = selectedMcId === opt.id;
              const isAnswer = opt.id === current.card.id;
              let cls =
                'border-slate-200 bg-slate-50/70 text-slate-900 hover:border-sky-600 hover:bg-sky-50/60 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100';
              if (feedback !== 'idle') {
                if (isAnswer) {
                  cls =
                    'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200';
                } else if (isPicked) {
                  cls =
                    'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200';
                } else {
                  cls =
                    'border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:text-slate-600';
                }
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={feedback !== 'idle'}
                  onClick={() => handleMcPick(opt.id)}
                  className={`flex min-h-[52px] items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${cls}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono-tabular text-xs text-slate-400 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="leading-snug">{opt.meaning}</span>
                  </div>
                  {feedback !== 'idle' && isAnswer && (
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  {feedback !== 'idle' && isPicked && !isAnswer && (
                    <XCircle
                      className="h-4 w-4 text-red-600 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleWriteSubmit} className="mt-6 space-y-4">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              disabled={feedback !== 'idle'}
              value={writtenInput}
              onChange={(e) => setWrittenInput(e.target.value)}
              placeholder="Gõ từ tiếng Anh chính xác..."
              autoComplete="off"
              spellCheck={false}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono-tabular text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            {feedback === 'idle' && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFeedback('incorrect');
                    setMistakeIds((prev) => ({
                      ...prev,
                      [current.card.id]: true,
                    }));
                  }}
                  className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  Không nhớ — xem đáp án
                </button>
                <button
                  type="submit"
                  disabled={!writtenInput.trim()}
                  className="min-h-[44px] rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
                >
                  Kiểm tra
                </button>
              </div>
            )}
          </form>
        )}

        {feedback !== 'idle' && (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {feedback === 'correct' ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {current.stage === 'mc'
                      ? 'Chuẩn xác! Từ này chuyển sang vòng tự gõ.'
                      : 'Xuất sắc! Bạn đã hoàn thành từ này.'}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Đáp án đúng: <u>{current.card.term}</u> — sẽ lặp lại sau ít thẻ.
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {feedback === 'incorrect' && (
                <button
                  type="button"
                  onClick={() => advanceQueue(true, true)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Tôi đã thuộc
                </button>
              )}
              <button
                type="button"
                onClick={() => advanceQueue(feedback === 'correct')}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                <span>Tiếp tục</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
