'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Volume2, XCircle } from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface MatchModeProps {
  cards: Flashcard[];
  onComplete: (results: PracticeResultItem[]) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const ROUND_SIZE = 5;

export function MatchMode({ cards, onComplete }: MatchModeProps) {
  const rounds = useMemo(() => {
    const chunks: Flashcard[][] = [];
    for (let i = 0; i < cards.length; i += ROUND_SIZE) {
      chunks.push(cards.slice(i, i + ROUND_SIZE));
    }
    return chunks;
  }, [cards]);

  const [roundIndex, setRoundIndex] = useState(0);
  const currentRound = useMemo(
    () => rounds[roundIndex] || [],
    [rounds, roundIndex]
  );

  const leftTerms = useMemo(
    () => shuffle(currentRound),
    [currentRound]
  );
  const rightMeanings = useMemo(
    () => shuffle(currentRound),
    [currentRound]
  );

  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Record<string, boolean>>({});
  const [mistakeCardIds, setMistakeCardIds] = useState<Record<string, boolean>>(
    {}
  );
  const [mismatchPair, setMismatchPair] = useState<{
    leftId: string;
    rightId: string;
  } | null>(null);

  function evaluatePair(leftId: string, rightId: string) {
    if (leftId === rightId) {
      const nextMatched = { ...matchedIds, [leftId]: true };
      setMatchedIds(nextMatched);
      setSelectedLeftId(null);
      setSelectedRightId(null);
      setMismatchPair(null);

      // Check if round finished
      if (Object.keys(nextMatched).length === currentRound.length) {
        if (roundIndex + 1 < rounds.length) {
          setTimeout(() => {
            setRoundIndex((r) => r + 1);
            setMatchedIds({});
            setSelectedLeftId(null);
            setSelectedRightId(null);
          }, 350);
        } else {
          const allMistakes = mistakeCardIds;
          const finalResults: PracticeResultItem[] = cards.map((c) => ({
            cardId: c.id,
            term: c.term,
            meaning: c.meaning,
            isCorrect: !allMistakes[c.id],
          }));
          setTimeout(() => onComplete(finalResults), 320);
        }
      }
    } else {
      setMistakeCardIds((prev) => ({
        ...prev,
        [leftId]: true,
        [rightId]: true,
      }));
      setMismatchPair({ leftId, rightId });
      setTimeout(() => {
        setSelectedLeftId(null);
        setSelectedRightId(null);
        setMismatchPair(null);
      }, 550);
    }
  }

  function handleSelectLeft(id: string) {
    if (matchedIds[id] || mismatchPair) return;
    if (selectedRightId) {
      evaluatePair(id, selectedRightId);
    } else {
      setSelectedLeftId((prev) => (prev === id ? null : id));
    }
  }

  function handleSelectRight(id: string) {
    if (matchedIds[id] || mismatchPair) return;
    if (selectedLeftId) {
      evaluatePair(selectedLeftId, id);
    } else {
      setSelectedRightId((prev) => (prev === id ? null : id));
    }
  }

  const matchedCountInRound = Object.keys(matchedIds).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-mono-tabular">
          Vòng {roundIndex + 1} / {rounds.length} · Đã ghép {matchedCountInRound}/
          {currentRound.length} cặp
        </span>
        {mismatchPair ? (
          <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chưa khớp — hãy thử cặp khác</span>
          </span>
        ) : (
          <span>Chọn một từ tiếng Anh và nghĩa tiếng Việt tương ứng</span>
        )}
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{
            width: `${
              ((roundIndex * ROUND_SIZE + matchedCountInRound) / cards.length) *
              100
            }%`,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Left Column: English Terms */}
        <div className="space-y-2.5" aria-label="Cột từ tiếng Anh">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Từ tiếng Anh
          </div>
          {leftTerms.map((card) => {
            const isMatched = Boolean(matchedIds[card.id]);
            const isSelected = selectedLeftId === card.id;
            const isError = mismatchPair?.leftId === card.id;

            let cls =
              'border-slate-200 bg-white text-slate-900 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500';
            if (isMatched) {
              cls =
                'border-emerald-200 bg-emerald-50/70 text-emerald-800 opacity-65 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
            } else if (isError) {
              cls =
                'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300';
            } else if (isSelected) {
              cls =
                'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
            }

            return (
              <div
                key={card.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 transition-colors ${cls}`}
              >
                <button
                  type="button"
                  disabled={isMatched}
                  onClick={() => handleSelectLeft(card.id)}
                  className="flex-1 text-left cursor-pointer disabled:cursor-default"
                >
                  <div className="font-display text-sm font-bold">
                    {card.term}
                  </div>
                  {card.phonetic && (
                    <div className="mt-0.5 font-mono-tabular text-xs opacity-75">
                      {card.phonetic}
                    </div>
                  )}
                </button>

                {isMatched ? (
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => speakEnglish(card.term)}
                    aria-label={`Phát âm ${card.term}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-sky-400 cursor-pointer shrink-0"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Vietnamese Meanings */}
        <div className="space-y-2.5" aria-label="Cột nghĩa tiếng Việt">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Nghĩa tiếng Việt
          </div>
          {rightMeanings.map((card) => {
            const isMatched = Boolean(matchedIds[card.id]);
            const isSelected = selectedRightId === card.id;
            const isError = mismatchPair?.rightId === card.id;

            let cls =
              'border-slate-200 bg-white text-slate-800 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500';
            if (isMatched) {
              cls =
                'border-emerald-200 bg-emerald-50/70 text-emerald-800 opacity-65 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
            } else if (isError) {
              cls =
                'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300';
            } else if (isSelected) {
              cls =
                'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
            }

            return (
              <button
                key={card.id}
                type="button"
                disabled={isMatched}
                onClick={() => handleSelectRight(card.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${cls}`}
              >
                <span className="leading-snug">{card.meaning}</span>
                {isMatched && (
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
