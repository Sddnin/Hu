'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Flag,
  Grid3X3,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';
import { PracticeCompletionMeta } from './MatchMode';

interface BlockBlastGameProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  bestScore?: number;
  autoSpeak?: boolean;
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
}

type CellColor = string | null;

interface PieceShape {
  id: string;
  cells: Array<[number, number]>; // [rowOffset, colOffset]
  color: string;
}

const PIECE_COLORS = [
  'bg-sky-400 border-sky-300 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
  'bg-indigo-400 border-indigo-300 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
  'bg-rose-500 border-rose-300 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
  'bg-emerald-400 border-emerald-200 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
  'bg-amber-400 border-amber-200 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
  'bg-violet-400 border-violet-300 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
];

const PIECE_TEMPLATES: Array<Array<[number, number]>> = [
  [[0, 0]],
  [
    [0, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ],
];

const GRID_SIZE = 8;

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createEmptyBoard(): CellColor[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null)
  );
}

function generateTray(count: number, simpleOnly = false): PieceShape[] {
  const pool = simpleOnly ? PIECE_TEMPLATES.slice(0, 5) : PIECE_TEMPLATES;
  const pieces: PieceShape[] = [];
  for (let i = 0; i < count; i++) {
    const cells = pool[Math.floor(Math.random() * pool.length)];
    const color = PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
    pieces.push({
      id: `piece_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      cells,
      color,
    });
  }
  return pieces;
}

function canPlacePiece(
  board: CellColor[][],
  piece: PieceShape,
  baseRow: number,
  baseCol: number
): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = baseRow + dr;
    const c = baseCol + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (board[r][c] !== null) return false;
  }
  return true;
}

function canAnyPieceFit(board: CellColor[][], tray: PieceShape[]): boolean {
  for (const piece of tray) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (canPlacePiece(board, piece, r, c)) return true;
      }
    }
  }
  return false;
}

export function BlockBlastGame({
  cards,
  allPoolCards,
  bestScore = 0,
  autoSpeak = false,
  onComplete,
}: BlockBlastGameProps) {
  const [board, setBoard] = useState<CellColor[][]>(() => createEmptyBoard());
  const [tray, setTray] = useState<PieceShape[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<[number, number] | null>(null);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);

  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<'vocab' | 'place'>('vocab');
  const [vocabFeedback, setVocabFeedback] = useState<{
    pickedId: string;
    isCorrect: boolean;
  } | null>(null);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [clearingCells, setClearingCells] = useState<Record<string, boolean>>(
    {}
  );

  const pool = allPoolCards.length >= 4 ? allPoolCards : cards;
  const activeCard = cards[cardIndex % Math.max(1, cards.length)];

  const options = useMemo(() => {
    if (!activeCard) return [];
    const distractors = shuffleArray(
      pool.filter((c) => c.id !== activeCard.id)
    ).slice(0, 3);
    return shuffleArray([activeCard, ...distractors]);
  }, [activeCard, pool]);

  const selectedPiece = useMemo(
    () => tray.find((p) => p.id === selectedPieceId) || tray[0] || null,
    [tray, selectedPieceId]
  );

  const finishGame = useCallback(
    (finalResults: PracticeResultItem[], finalScore: number, bestStreak: number) => {
      const normalizedResults =
        finalResults.length > 0
          ? finalResults
          : cards.slice(0, 1).map((c) => ({
              cardId: c.id,
              term: c.term,
              meaning: c.meaning,
              isCorrect: false,
            }));
      onComplete(normalizedResults, {
        score: finalScore,
        leaderboardMode: 'blast',
        maxStreak: bestStreak,
      });
    },
    [cards, onComplete]
  );

  function handleAnswerVocab(pickedCard: Flashcard) {
    if (phase !== 'vocab' || vocabFeedback || !activeCard) return;
    const isCorrect = pickedCard.id === activeCard.id;
    const nextResults = [
      ...results,
      {
        cardId: activeCard.id,
        term: activeCard.term,
        meaning: activeCard.meaning,
        isCorrect,
      },
    ];

    const nextStreak = isCorrect ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const bonus = isCorrect ? 40 + Math.min(nextStreak - 1, 6) * 15 : 0;
    const nextScore = score + bonus;

    setVocabFeedback({ pickedId: pickedCard.id, isCorrect });
    setResults(nextResults);
    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setScore(nextScore);

    if (autoSpeak) {
      speakEnglish(activeCard.term);
    }

    window.setTimeout(() => {
      setVocabFeedback(null);
      const nextTray = generateTray(isCorrect ? 3 : 2, !isCorrect);
      if (!canAnyPieceFit(board, nextTray)) {
        finishGame(nextResults, nextScore, nextMaxStreak);
        return;
      }
      setTray(nextTray);
      setSelectedPieceId(nextTray[0]?.id ?? null);
      setPhase('place');
      setCardIndex((idx) => idx + 1);
    }, 480);
  }

  function handlePlaceOnCell(row: number, col: number) {
    if (phase !== 'place' || !selectedPiece) return;
    if (!canPlacePiece(board, selectedPiece, row, col)) return;

    const nextBoard = board.map((r) => [...r]);
    for (const [dr, dc] of selectedPiece.cells) {
      nextBoard[row + dr][col + dc] = selectedPiece.color;
    }

    // Check full rows and columns
    const fullRows: number[] = [];
    const fullCols: number[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      if (nextBoard[r].every((cell) => cell !== null)) fullRows.push(r);
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      let full = true;
      for (let r = 0; r < GRID_SIZE; r++) {
        if (nextBoard[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) fullCols.push(c);
    }

    const clearedCount = fullRows.length + fullCols.length;
    const flashMap: Record<string, boolean> = {};
    for (const r of fullRows) {
      for (let c = 0; c < GRID_SIZE; c++) {
        flashMap[`${r}_${c}`] = true;
        nextBoard[r][c] = null;
      }
    }
    for (const c of fullCols) {
      for (let r = 0; r < GRID_SIZE; r++) {
        flashMap[`${r}_${c}`] = true;
        nextBoard[r][c] = null;
      }
    }

    const placePoints = selectedPiece.cells.length * 10;
    const linePoints =
      clearedCount > 0 ? clearedCount * 120 * Math.max(1, streak) : 0;
    const nextScore = score + placePoints + linePoints;

    setBoard(nextBoard);
    setScore(nextScore);
    if (clearedCount > 0) {
      setLinesCleared((l) => l + clearedCount);
      setClearingCells(flashMap);
      window.setTimeout(() => setClearingCells({}), 240);
    }
    setHoverAnchor(null);

    const remainingTray = tray.filter((p) => p.id !== selectedPiece.id);
    if (remainingTray.length === 0) {
      setTray([]);
      setSelectedPieceId(null);
      if (results.length >= cards.length && cards.length >= 5) {
        // Optional full deck milestone reached — keep playing or let user continue!
      }
      setPhase('vocab');
      return;
    }

    if (!canAnyPieceFit(nextBoard, remainingTray)) {
      finishGame(results, nextScore, maxStreak);
      return;
    }

    setTray(remainingTray);
    setSelectedPieceId(remainingTray[0].id);
  }

  const previewCells = useMemo(() => {
    const map: Record<string, 'valid' | 'invalid'> = {};
    if (phase !== 'place' || !selectedPiece || !hoverAnchor) return map;
    const [br, bc] = hoverAnchor;
    const valid = canPlacePiece(board, selectedPiece, br, bc);
    for (const [dr, dc] of selectedPiece.cells) {
      const r = br + dr;
      const c = bc + dc;
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        map[`${r}_${c}`] = valid ? 'valid' : 'invalid';
      }
    }
    return map;
  }, [phase, selectedPiece, hoverAnchor, board]);

  const displayedBest = Math.max(bestScore, score);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-indigo-900/60 bg-[#0d1137] p-4 text-white shadow-xl sm:p-6">
      {/* Top Game HUD */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-sky-400">
            <Grid3X3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="font-mono-tabular text-2xl font-bold leading-none text-white">
              {score}
            </div>
            <div className="mt-0.5 text-[11px] text-indigo-300">
              {linesCleared} hàng/cột đã xóa
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1 font-mono-tabular text-xs font-bold text-amber-300">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              x{streak}
            </div>
          )}
          <div className="flex items-center gap-1 font-mono-tabular text-sm font-bold text-amber-400">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            <span>{displayedBest}</span>
          </div>
          <button
            type="button"
            onClick={() => finishGame(results, score, maxStreak)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-indigo-700/80 bg-indigo-900/60 px-2.5 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-800 cursor-pointer whitespace-nowrap"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lưu điểm</span>
          </button>
        </div>
      </div>

      {/* Vocab Charge Card */}
      <div className="mt-4 rounded-xl border border-indigo-800/70 bg-indigo-950/70 p-3 sm:p-4">
        {phase === 'vocab' && activeCard ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                Chọn nghĩa đúng để nạp 3 khối
              </span>
              <button
                type="button"
                onClick={() => speakEnglish(activeCard.term)}
                aria-label={`Phát âm ${activeCard.term}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-900 text-sky-300 hover:bg-indigo-800 cursor-pointer"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-xl font-bold text-white sm:text-2xl">
                {activeCard.term}
              </span>
              {activeCard.phonetic && (
                <span className="font-mono-tabular text-xs text-indigo-300">
                  {activeCard.phonetic}
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {options.map((opt) => {
                const isPicked = vocabFeedback?.pickedId === opt.id;
                const isRight = opt.id === activeCard.id;
                let cls =
                  'border-indigo-700/80 bg-indigo-900/70 text-indigo-50 hover:border-sky-400 hover:bg-indigo-800/80';
                if (vocabFeedback) {
                  if (isRight) {
                    cls = 'border-emerald-400 bg-emerald-600/80 text-white';
                  } else if (isPicked) {
                    cls = 'border-rose-400 bg-rose-600/80 text-white';
                  } else {
                    cls = 'border-indigo-800/50 bg-indigo-950/60 opacity-50';
                  }
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={vocabFeedback !== null}
                    onClick={() => handleAnswerVocab(opt)}
                    className={`flex min-h-[46px] items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${cls}`}
                  >
                    <span className="line-clamp-2 leading-snug">
                      {opt.meaning}
                    </span>
                    {vocabFeedback && isRight && (
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    {vocabFeedback && isPicked && !isRight && (
                      <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs text-sky-200">
            <span>
              Chạm vào ô trên bảng 8×8 bên dưới để đặt{' '}
              <strong className="text-white">{tray.length} khối</strong> còn lại
              (xếp kín hàng ngang/dọc để nổ điểm).
            </span>
          </div>
        )}
      </div>

      {/* 8x8 Block Puzzle Grid */}
      <div
        className="mt-4 mx-auto grid w-full max-w-[360px] grid-cols-8 gap-1 rounded-xl border border-indigo-800/80 bg-[#171c4d] p-2"
        onMouseLeave={() => setHoverAnchor(null)}
      >
        {board.map((rowArr, r) =>
          rowArr.map((cellColor, c) => {
            const key = `${r}_${c}`;
            const preview = previewCells[key];
            const isClearing = Boolean(clearingCells[key]);
            let cellCls =
              'bg-[#252b5e] border-[#2e3570] hover:border-indigo-500/60';
            if (isClearing) {
              cellCls = 'bg-white border-white scale-95';
            } else if (cellColor) {
              cellCls = `${cellColor} border`;
            } else if (preview === 'valid') {
              cellCls = 'bg-emerald-400/50 border-emerald-300';
            } else if (preview === 'invalid') {
              cellCls = 'bg-rose-500/50 border-rose-400';
            }

            return (
              <button
                key={key}
                type="button"
                aria-label={`Ô ${r + 1},${c + 1}`}
                disabled={phase !== 'place'}
                onMouseEnter={() => setHoverAnchor([r, c])}
                onFocus={() => setHoverAnchor([r, c])}
                onClick={() => handlePlaceOnCell(r, c)}
                className={`aspect-square w-full rounded-[5px] border transition-all duration-100 ${
                  phase === 'place' ? 'cursor-pointer' : 'cursor-default'
                } ${cellCls}`}
              />
            );
          })
        )}
      </div>

      {/* Bottom 3-Piece Tray */}
      <div className="mt-4 flex min-h-[82px] items-center justify-center gap-4 sm:gap-7">
        {tray.length === 0 ? (
          <span className="text-xs text-indigo-300">
            Trả lời từ vựng ở trên để nhận 3 khối mới
          </span>
        ) : (
          tray.map((piece) => {
            const maxR = Math.max(...piece.cells.map(([r]) => r)) + 1;
            const maxC = Math.max(...piece.cells.map(([, c]) => c)) + 1;
            const isSelected = selectedPiece?.id === piece.id;
            return (
              <button
                key={piece.id}
                type="button"
                onClick={() => setSelectedPieceId(piece.id)}
                className={`flex min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border p-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-400 bg-indigo-900/90 ring-2 ring-sky-400/40 scale-105'
                    : 'border-indigo-800/70 bg-indigo-950/60 hover:border-indigo-600'
                }`}
              >
                <div
                  className="grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${maxC}, 16px)`,
                    gridTemplateRows: `repeat(${maxR}, 16px)`,
                  }}
                >
                  {Array.from({ length: maxR * maxC }).map((_, i) => {
                    const pr = Math.floor(i / maxC);
                    const pc = i % maxC;
                    const filled = piece.cells.some(
                      ([r, c]) => r === pr && c === pc
                    );
                    return (
                      <span
                        key={i}
                        className={`h-4 w-4 rounded-[3px] ${
                          filled ? `${piece.color} border` : 'bg-transparent'
                        }`}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
