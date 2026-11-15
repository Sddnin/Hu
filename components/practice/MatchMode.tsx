'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Volume2, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard, LeaderboardMode } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

export interface PracticeCompletionMeta {
  score?: number;
  leaderboardMode?: LeaderboardMode;
  maxStreak?: number;
}

interface MatchModeProps {
  cards: Flashcard[];
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
}

type BoardStyle = 'columns' | 'grid' | 'memory';

interface MatchTile {
  uid: string;
  cardId: string;
  side: 'en' | 'vi';
  label: string;
  subLabel?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function MatchMode({ cards, onComplete }: MatchModeProps) {
  const [boardStyle, setBoardStyle] = useState<BoardStyle>('columns');
  // columns: 5 pairs; grid (4x3): 6 pairs = 12 tiles; memory (4x4): 8 pairs = 16 tiles
  const roundSize =
    boardStyle === 'columns' ? 5 : boardStyle === 'grid' ? 6 : 8;

  const rounds = useMemo(() => {
    const chunks: Flashcard[][] = [];
    for (let i = 0; i < cards.length; i += roundSize) {
      chunks.push(cards.slice(i, i + roundSize));
    }
    return chunks;
  }, [cards, roundSize]);

  const [roundIndex, setRoundIndex] = useState(0);
  const currentRound = useMemo(
    () => rounds[roundIndex] || [],
    [rounds, roundIndex]
  );

  const leftTerms = useMemo(() => shuffle(currentRound), [currentRound]);
  const rightMeanings = useMemo(() => shuffle(currentRound), [currentRound]);

  const unifiedTiles = useMemo<MatchTile[]>(() => {
    const list: MatchTile[] = [];
    for (const c of currentRound) {
      list.push({
        uid: `en_${c.id}`,
        cardId: c.id,
        side: 'en',
        label: c.term,
        subLabel: c.phonetic,
      });
      list.push({
        uid: `vi_${c.id}`,
        cardId: c.id,
        side: 'vi',
        label: c.meaning,
      });
    }
    return shuffle(list);
  }, [currentRound]);

  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [pickedUids, setPickedUids] = useState<string[]>([]);

  const [justMatchedIds, setJustMatchedIds] = useState<Record<string, boolean>>(
    {}
  );
  const [matchedIds, setMatchedIds] = useState<Record<string, boolean>>({});
  const [mistakeCardIds, setMistakeCardIds] = useState<Record<string, boolean>>(
    {}
  );
  const [mismatchPair, setMismatchPair] = useState<{
    leftId?: string;
    rightId?: string;
    uids?: string[];
  } | null>(null);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);

  const timersRef = useRef<number[]>([]);
  const lockedRef = useRef(false);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }

  function clearRoundSelections() {
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setPickedUids([]);
    setMismatchPair(null);
    setJustMatchedIds({});
    lockedRef.current = false;
  }

  function handleSwitchBoardStyle(next: BoardStyle) {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setBoardStyle(next);
    setRoundIndex(0);
    setMatchedIds({});
    setMistakeCardIds({});
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    clearRoundSelections();
  }

  function handleMatchSuccess(matchedCardId: string) {
    lockedRef.current = true;
    const nextStreak = streak + 1;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const pointsEarned = 100 + Math.min(nextStreak - 1, 8) * 20;
    const nextScore = score + pointsEarned;

    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setScore(nextScore);
    setJustMatchedIds((prev) => ({ ...prev, [matchedCardId]: true }));
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setPickedUids([]);
    setMismatchPair(null);

    schedule(() => {
      const nextMatched = { ...matchedIds, [matchedCardId]: true };
      setMatchedIds(nextMatched);
      setJustMatchedIds((prev) => {
        const copy = { ...prev };
        delete copy[matchedCardId];
        return copy;
      });
      lockedRef.current = false;

      if (Object.keys(nextMatched).length === currentRound.length) {
        if (roundIndex + 1 < rounds.length) {
          schedule(() => {
            setRoundIndex((r) => r + 1);
            setMatchedIds({});
            clearRoundSelections();
          }, 260);
        } else {
          const allMistakes = mistakeCardIds;
          const finalResults: PracticeResultItem[] = cards.map((c) => ({
            cardId: c.id,
            term: c.term,
            meaning: c.meaning,
            isCorrect: !allMistakes[c.id],
          }));
          const leaderboardMode: LeaderboardMode =
            boardStyle === 'grid'
              ? 'match_grid'
              : boardStyle === 'memory'
                ? 'match_memory'
                : 'match_columns';
          schedule(
            () =>
              onComplete(finalResults, {
                score: nextScore,
                leaderboardMode,
                maxStreak: nextMaxStreak,
              }),
            240
          );
        }
      }
    }, 260);
  }

  function evaluateColumnPair(leftId: string, rightId: string) {
    if (leftId === rightId) {
      handleMatchSuccess(leftId);
    } else {
      lockedRef.current = true;
      setStreak(0);
      setScore((s) => Math.max(0, s - 15));
      setMistakeCardIds((prev) => ({
        ...prev,
        [leftId]: true,
        [rightId]: true,
      }));
      setMismatchPair({ leftId, rightId });
      schedule(() => {
        setSelectedLeftId(null);
        setSelectedRightId(null);
        setMismatchPair(null);
        lockedRef.current = false;
      }, 550);
    }
  }

  function handleSelectLeft(id: string) {
    if (lockedRef.current || matchedIds[id] || justMatchedIds[id]) return;
    if (selectedRightId) {
      evaluateColumnPair(id, selectedRightId);
    } else {
      setSelectedLeftId((prev) => (prev === id ? null : id));
    }
  }

  function handleSelectRight(id: string) {
    if (lockedRef.current || matchedIds[id] || justMatchedIds[id]) return;
    if (selectedLeftId) {
      evaluateColumnPair(selectedLeftId, id);
    } else {
      setSelectedRightId((prev) => (prev === id ? null : id));
    }
  }

  function handleSelectTile(tile: MatchTile) {
    if (
      lockedRef.current ||
      matchedIds[tile.cardId] ||
      justMatchedIds[tile.cardId]
    ) {
      return;
    }

    if (pickedUids.includes(tile.uid)) {
      if (boardStyle === 'grid') {
        setPickedUids((prev) => prev.filter((u) => u !== tile.uid));
      }
      return;
    }

    if (pickedUids.length === 0) {
      if (boardStyle === 'memory' && tile.side === 'en') {
        speakEnglish(tile.label);
      }
      setPickedUids([tile.uid]);
      return;
    }

    const firstUid = pickedUids[0];
    const firstTile = unifiedTiles.find((t) => t.uid === firstUid);
    if (!firstTile) {
      setPickedUids([tile.uid]);
      return;
    }

    setPickedUids([firstUid, tile.uid]);
    if (boardStyle === 'memory' && tile.side === 'en') {
      speakEnglish(tile.label);
    }

    if (firstTile.cardId === tile.cardId && firstTile.side !== tile.side) {
      handleMatchSuccess(tile.cardId);
    } else {
      lockedRef.current = true;
      setStreak(0);
      setScore((s) => Math.max(0, s - 15));
      setMistakeCardIds((prev) => ({
        ...prev,
        [firstTile.cardId]: true,
        [tile.cardId]: true,
      }));
      setMismatchPair({ uids: [firstUid, tile.uid] });
      schedule(
        () => {
          setPickedUids([]);
          setMismatchPair(null);
          lockedRef.current = false;
        },
        boardStyle === 'memory' ? 750 : 520
      );
    }
  }

  const matchedCountInRound = Object.keys(matchedIds).length;
  const totalCompletedCards = Math.min(
    cards.length,
    roundIndex * roundSize + matchedCountInRound
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Top Status & Mode Style Switcher */}
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono-tabular font-semibold">
            Vòng {roundIndex + 1}/{rounds.length} · Đã xóa{' '}
            {matchedCountInRound}/{currentRound.length} cặp
          </span>
          <span className="font-mono-tabular font-bold text-sky-600 dark:text-sky-400">
            {score} điểm
          </span>
          {streak >= 2 && (
            <span className="inline-flex items-center gap-1 font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              x{streak}
            </span>
          )}
          {mismatchPair && (
            <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Chưa khớp</span>
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Kiểu chơi nối thẻ"
          className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900"
        >
          {(
            [
              { id: 'columns', label: 'Nối 2 cột' },
              { id: 'grid', label: 'Ghép thẻ 4×3' },
              { id: 'memory', label: 'Lật thẻ 4×4' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleSwitchBoardStyle(mode.id)}
              className={`min-h-[34px] flex-1 sm:flex-initial rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                boardStyle === mode.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {boardStyle === 'columns'
          ? 'Chọn từ tiếng Anh và nghĩa tương ứng — ghép đúng 2 thẻ sẽ biến mất.'
          : boardStyle === 'grid'
            ? 'Bảng 4×3 (12 thẻ / 6 cặp): chạm 2 thẻ khớp nghĩa nhau để xóa khỏi bảng.'
            : 'Bảng 4×4 (16 thẻ / 8 cặp): lật mở 2 thẻ bất kỳ — nếu khớp Anh–Việt, cả 2 thẻ sẽ biến mất.'}
      </p>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{
            width: `${(totalCompletedCards / Math.max(1, cards.length)) * 100}%`,
          }}
        />
      </div>

      {boardStyle === 'columns' ? (
        /* Side-by-Side 2-Column Layout on BOTH Mobile and Desktop */
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <div className="space-y-2 sm:space-y-2.5" aria-label="Cột từ tiếng Anh">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">
              Tiếng Anh
            </div>
            <AnimatePresence initial={false}>
              {leftTerms
                .filter((card) => !matchedIds[card.id])
                .map((card) => {
                  const isJustMatched = Boolean(justMatchedIds[card.id]);
                  const isSelected = selectedLeftId === card.id;
                  const isError = mismatchPair?.leftId === card.id;

                  let cls =
                    'border-slate-200 bg-white text-slate-900 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500';
                  if (isJustMatched) {
                    cls =
                      'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
                  } else if (isError) {
                    cls =
                      'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300';
                  } else if (isSelected) {
                    cls =
                      'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
                  }

                  return (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.18 }}
                      className={`flex min-h-[58px] sm:min-h-[64px] items-center justify-between gap-1 rounded-xl border pr-1.5 sm:pr-2.5 transition-colors ${cls}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectLeft(card.id)}
                        className="flex-1 min-w-0 min-h-[58px] sm:min-h-[64px] px-2.5 py-2 sm:px-3.5 sm:py-3 text-left touch-manipulation select-none cursor-pointer"
                      >
                        <div className="font-display text-xs sm:text-sm font-bold leading-snug break-words">
                          {card.term}
                        </div>
                        {card.phonetic && (
                          <div className="mt-0.5 truncate font-mono-tabular text-[10px] sm:text-xs opacity-70">
                            {card.phonetic}
                          </div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakEnglish(card.term);
                        }}
                        aria-label={`Phát âm ${card.term}`}
                        className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-sky-400 cursor-pointer shrink-0"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          </div>

          <div className="space-y-2 sm:space-y-2.5" aria-label="Cột nghĩa tiếng Việt">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">
              Nghĩa tiếng Việt
            </div>
            <AnimatePresence initial={false}>
              {rightMeanings
                .filter((card) => !matchedIds[card.id])
                .map((card) => {
                  const isJustMatched = Boolean(justMatchedIds[card.id]);
                  const isSelected = selectedRightId === card.id;
                  const isError = mismatchPair?.rightId === card.id;

                  let cls =
                    'border-slate-200 bg-white text-slate-800 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500';
                  if (isJustMatched) {
                    cls =
                      'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
                  } else if (isError) {
                    cls =
                      'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300';
                  } else if (isSelected) {
                    cls =
                      'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
                  }

                  return (
                    <motion.button
                      key={card.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.18 }}
                      type="button"
                      onClick={() => handleSelectRight(card.id)}
                      className={`flex min-h-[58px] sm:min-h-[64px] w-full items-center rounded-xl border px-2.5 py-2 sm:px-3.5 sm:py-3 text-left text-xs sm:text-sm font-medium transition-colors touch-manipulation select-none cursor-pointer ${cls}`}
                    >
                      <span className="leading-snug break-words">
                        {card.meaning}
                      </span>
                    </motion.button>
                  );
                })}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        /* Strict 4x3 (grid) or 4x4 (memory) Matrix */
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
          {unifiedTiles.map((tile, idx) => {
            const isGone = Boolean(matchedIds[tile.cardId]);
            const isJustMatched = Boolean(justMatchedIds[tile.cardId]);
            const isPicked = pickedUids.includes(tile.uid);
            const isError = Boolean(mismatchPair?.uids?.includes(tile.uid));
            const isFaceUp =
              boardStyle === 'grid' || isPicked || isJustMatched || isError;

            if (isGone) {
              return (
                <div
                  key={tile.uid}
                  aria-hidden="true"
                  className="min-h-[76px] sm:min-h-[96px] rounded-xl border border-dashed border-slate-200/50 dark:border-slate-800/40"
                />
              );
            }

            let cls =
              'border-slate-200 bg-white text-slate-900 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-sky-500';
            if (!isFaceUp) {
              cls =
                'border-slate-200 bg-slate-100 text-slate-500 hover:border-sky-500 hover:bg-sky-50/50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:border-sky-500';
            } else if (isJustMatched) {
              cls =
                'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200';
            } else if (isError) {
              cls =
                'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300';
            } else if (isPicked) {
              cls =
                'border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
            }

            return (
              <motion.button
                key={tile.uid}
                type="button"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{
                  opacity: isJustMatched ? 0.25 : 1,
                  scale: isJustMatched ? 0.92 : 1,
                }}
                transition={{ duration: 0.18 }}
                onClick={() => handleSelectTile(tile)}
                className={`flex min-h-[76px] sm:min-h-[96px] flex-col items-center justify-center rounded-xl border p-1.5 sm:p-3 text-center transition-colors touch-manipulation select-none cursor-pointer ${cls}`}
              >
                {isFaceUp ? (
                  <>
                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      {tile.side === 'en' ? 'EN' : 'VI'}
                    </span>
                    <span
                      className={`mt-0.5 sm:mt-1 leading-tight break-words line-clamp-3 ${
                        tile.side === 'en'
                          ? 'font-display text-[11px] sm:text-sm font-bold'
                          : 'text-[10px] sm:text-xs font-medium'
                      }`}
                    >
                      {tile.label}
                    </span>
                  </>
                ) : (
                  <span className="font-mono-tabular text-xs sm:text-sm font-semibold">
                    #{idx + 1}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
