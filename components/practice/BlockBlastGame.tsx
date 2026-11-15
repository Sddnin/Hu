'use client';

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Flag,
  Grid3X3,
  Sparkles,
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

interface QuizQuestionItem {
  card: Flashcard;
  options: Flashcard[];
}

interface QuizGateState {
  linesClearedNow: number;
  questions: QuizQuestionItem[];
  step: number;
  wrongPickedIds: string[];
  hadWrongOnCurrent: boolean;
  solvedCurrent: boolean;
}

interface DragState {
  piece: PieceShape;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  pointerType: string;
  hasMoved: boolean;
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
  [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
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

function canPieceFitAnywhere(board: CellColor[][], piece: PieceShape): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlacePiece(board, piece, r, c)) return true;
    }
  }
  return false;
}

function canAnyPieceFit(board: CellColor[][], tray: PieceShape[]): boolean {
  return tray.some((piece) => canPieceFitAnywhere(board, piece));
}

function generateSmartTray(board: CellColor[][], count = 3): PieceShape[] {
  const pieces: PieceShape[] = [];
  for (let i = 0; i < count; i++) {
    const cells =
      PIECE_TEMPLATES[Math.floor(Math.random() * PIECE_TEMPLATES.length)];
    const color = PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)];
    pieces.push({
      id: `piece_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      cells,
      color,
    });
  }

  // Keep gameplay flowing if at least smaller pieces fit on board
  if (!canAnyPieceFit(board, pieces)) {
    const smallTemplates = PIECE_TEMPLATES.slice(0, 5);
    const fittable = smallTemplates.find((cells) =>
      canPieceFitAnywhere(board, {
        id: 'check',
        cells,
        color: PIECE_COLORS[0],
      })
    );
    if (fittable) {
      pieces[0] = {
        ...pieces[0],
        cells: fittable,
      };
    }
  }

  return pieces;
}

function buildQuestionBatch(
  cards: Flashcard[],
  pool: Flashcard[],
  startCursor: number,
  count: number
): { questions: QuizQuestionItem[]; nextCursor: number } {
  const questions: QuizQuestionItem[] = [];
  let cursor = startCursor;
  for (let i = 0; i < count; i++) {
    const target = cards[cursor % cards.length];
    cursor += 1;
    const distractors = shuffleArray(
      pool.filter((c) => c.id !== target.id)
    ).slice(0, 3);
    questions.push({
      card: target,
      options: shuffleArray([target, ...distractors]),
    });
  }
  return { questions, nextCursor: cursor };
}

export function BlockBlastGame({
  cards,
  allPoolCards,
  bestScore = 0,
  autoSpeak = false,
  onComplete,
}: BlockBlastGameProps) {
  const [board, setBoard] = useState<CellColor[][]>(() => createEmptyBoard());
  const [tray, setTray] = useState<PieceShape[]>(() =>
    generateSmartTray(createEmptyBoard(), 3)
  );
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<[number, number] | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [cellSizePx, setCellSizePx] = useState(38);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);

  const [cardCursor, setCardCursor] = useState(0);
  const [quizGate, setQuizGate] = useState<QuizGateState | null>(null);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [clearingCells, setClearingCells] = useState<Record<string, boolean>>(
    {}
  );

  const gridInnerRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef(board);
  const trayRef = useRef(tray);
  const scoreRef = useRef(score);
  const streakRef = useRef(streak);
  const maxStreakRef = useRef(maxStreak);
  const resultsRef = useRef(results);
  const cardCursorRef = useRef(cardCursor);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  useEffect(() => {
    trayRef.current = tray;
  }, [tray]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);
  useEffect(() => {
    maxStreakRef.current = maxStreak;
  }, [maxStreak]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    cardCursorRef.current = cardCursor;
  }, [cardCursor]);

  const pool = useMemo(
    () => (allPoolCards.length >= 4 ? allPoolCards : cards),
    [allPoolCards, cards]
  );

  const selectedPiece = useMemo(
    () => tray.find((p) => p.id === selectedPieceId) || null,
    [tray, selectedPieceId]
  );

  const activePreviewPiece = dragState?.hasMoved ? dragState.piece : selectedPiece;

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

  const computeAnchorFromPointer = useCallback(
    (piece: PieceShape, clientX: number, clientY: number, pointerType: string): [number, number] | null => {
      const gridEl = gridInnerRef.current;
      if (!gridEl) return null;
      const rect = gridEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const cellW = rect.width / GRID_SIZE;
      const cellH = rect.height / GRID_SIZE;
      const offsetY = pointerType === 'touch' ? 66 : 0;
      const visualX = clientX;
      const visualY = clientY - offsetY;

      if (
        visualX < rect.left - cellW ||
        visualX > rect.right + cellW ||
        visualY < rect.top - cellH ||
        visualY > rect.bottom + cellH
      ) {
        return null;
      }

      const maxR = Math.max(...piece.cells.map(([r]) => r)) + 1;
      const maxC = Math.max(...piece.cells.map(([, c]) => c)) + 1;
      const pieceTopLeftX = visualX - (maxC * cellW) / 2;
      const pieceTopLeftY = visualY - (maxR * cellH) / 2;

      const anchorCol = Math.round((pieceTopLeftX - rect.left) / cellW);
      const anchorRow = Math.round((pieceTopLeftY - rect.top) / cellH);
      return [anchorRow, anchorCol];
    },
    []
  );

  const placePieceOnBoard = useCallback(
    (piece: PieceShape, row: number, col: number) => {
      const currBoard = boardRef.current;
      if (!canPlacePiece(currBoard, piece, row, col)) return false;

      const nextBoard = currBoard.map((r) => [...r]);
      for (const [dr, dc] of piece.cells) {
        nextBoard[row + dr][col + dc] = piece.color;
      }

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

      const placePoints = piece.cells.length * 10;
      const linePoints =
        clearedCount > 0 ? clearedCount * 150 * Math.max(1, streakRef.current) : 0;
      const nextScore = scoreRef.current + placePoints + linePoints;

      setBoard(nextBoard);
      setScore(nextScore);
      setHoverAnchor(null);
      setSelectedPieceId(null);

      let remainingTray = trayRef.current.filter((p) => p.id !== piece.id);
      if (remainingTray.length === 0) {
        remainingTray = generateSmartTray(nextBoard, 3);
      }
      setTray(remainingTray);

      if (clearedCount > 0) {
        setLinesCleared((l) => l + clearedCount);
        setClearingCells(flashMap);

        const qCount = clearedCount >= 2 ? 3 : 2;
        const batch = buildQuestionBatch(
          cards,
          pool,
          cardCursorRef.current,
          qCount
        );
        setCardCursor(batch.nextCursor);

        window.setTimeout(() => {
          setClearingCells({});
          setQuizGate({
            linesClearedNow: clearedCount,
            questions: batch.questions,
            step: 0,
            wrongPickedIds: [],
            hadWrongOnCurrent: false,
            solvedCurrent: false,
          });
          if (autoSpeak && batch.questions[0]) {
            speakEnglish(batch.questions[0].card.term);
          }
        }, 280);
      } else if (!canAnyPieceFit(nextBoard, remainingTray)) {
        finishGame(resultsRef.current, nextScore, maxStreakRef.current);
      }

      return true;
    },
    [cards, pool, autoSpeak, finishGame]
  );

  // Window-level pointer drag listeners
  const isDragging = Boolean(dragState);
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (ev: PointerEvent) => {
      setDragState((prev) => {
        if (!prev) return null;
        const dist = Math.hypot(ev.clientX - prev.startX, ev.clientY - prev.startY);
        const hasMoved = prev.hasMoved || dist > 6;
        if (hasMoved) {
          const anchor = computeAnchorFromPointer(
            prev.piece,
            ev.clientX,
            ev.clientY,
            prev.pointerType
          );
          setHoverAnchor(anchor);
        }
        return {
          ...prev,
          clientX: ev.clientX,
          clientY: ev.clientY,
          hasMoved,
        };
      });
    };

    const handleUp = (ev: PointerEvent) => {
      setDragState((prev) => {
        if (!prev) return null;
        if (prev.hasMoved) {
          const anchor = computeAnchorFromPointer(
            prev.piece,
            ev.clientX,
            ev.clientY,
            prev.pointerType
          );
          if (anchor) {
            placePieceOnBoard(prev.piece, anchor[0], anchor[1]);
          } else {
            setHoverAnchor(null);
          }
        } else {
          // Quick tap selects/deselects piece for tap-to-place accessibility
          setSelectedPieceId((cur) => (cur === prev.piece.id ? null : prev.piece.id));
          setHoverAnchor(null);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging, computeAnchorFromPointer, placePieceOnBoard]);

  function handlePiecePointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    piece: PieceShape
  ) {
    if (quizGate) return;
    e.preventDefault();
    if (gridInnerRef.current) {
      const rect = gridInnerRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        setCellSizePx(Math.round(rect.width / GRID_SIZE));
      }
    }
    setDragState({
      piece,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
      hasMoved: false,
    });
  }

  function handleAnswerGate(pickedCard: Flashcard) {
    if (!quizGate || quizGate.solvedCurrent) return;
    const currentQ = quizGate.questions[quizGate.step];
    if (!currentQ) return;

    if (pickedCard.id !== currentQ.card.id) {
      // Wrong choice: stay on this question until correct!
      if (quizGate.wrongPickedIds.includes(pickedCard.id)) return;
      setStreak(0);
      setQuizGate((prev) =>
        prev
          ? {
              ...prev,
              wrongPickedIds: [...prev.wrongPickedIds, pickedCard.id],
              hadWrongOnCurrent: true,
            }
          : null
      );
      return;
    }

    // Correct choice!
    const firstTryCorrect = !quizGate.hadWrongOnCurrent;
    const nextStreak = firstTryCorrect ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const bonus = firstTryCorrect ? 70 + Math.min(nextStreak - 1, 6) * 15 : 25;
    const nextScore = score + bonus;

    const updatedResults: PracticeResultItem[] = [
      ...results,
      {
        cardId: currentQ.card.id,
        term: currentQ.card.term,
        meaning: currentQ.card.meaning,
        isCorrect: firstTryCorrect,
      },
    ];

    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setScore(nextScore);
    setResults(updatedResults);
    setQuizGate((prev) => (prev ? { ...prev, solvedCurrent: true } : null));

    if (autoSpeak) {
      speakEnglish(currentQ.card.term);
    }

    window.setTimeout(() => {
      setQuizGate((prev) => {
        if (!prev) return null;
        const nextStep = prev.step + 1;
        if (nextStep < prev.questions.length) {
          if (autoSpeak && prev.questions[nextStep]) {
            speakEnglish(prev.questions[nextStep].card.term);
          }
          return {
            ...prev,
            step: nextStep,
            wrongPickedIds: [],
            hadWrongOnCurrent: false,
            solvedCurrent: false,
          };
        }
        // Finished 2-3 quiz questions! Resume board gameplay
        if (!canAnyPieceFit(boardRef.current, trayRef.current)) {
          finishGame(updatedResults, nextScore, nextMaxStreak);
        }
        return null;
      });
    }, 460);
  }

  const { previewCells, potentialClearCells } = useMemo(() => {
    const pMap: Record<string, 'valid' | 'invalid'> = {};
    const cMap: Record<string, boolean> = {};
    if (quizGate || !activePreviewPiece || !hoverAnchor) {
      return { previewCells: pMap, potentialClearCells: cMap };
    }
    const [br, bc] = hoverAnchor;
    const valid = canPlacePiece(board, activePreviewPiece, br, bc);
    for (const [dr, dc] of activePreviewPiece.cells) {
      const r = br + dr;
      const c = bc + dc;
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        pMap[`${r}_${c}`] = valid ? 'valid' : 'invalid';
      }
    }

    if (valid) {
      const sim = board.map((r) => [...r]);
      for (const [dr, dc] of activePreviewPiece.cells) {
        sim[br + dr][bc + dc] = activePreviewPiece.color;
      }
      for (let r = 0; r < GRID_SIZE; r++) {
        if (sim[r].every((cell) => cell !== null)) {
          for (let c = 0; c < GRID_SIZE; c++) cMap[`${r}_${c}`] = true;
        }
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) {
          if (sim[r][c] === null) {
            full = false;
            break;
          }
        }
        if (full) {
          for (let r = 0; r < GRID_SIZE; r++) cMap[`${r}_${c}`] = true;
        }
      }
    }

    return { previewCells: pMap, potentialClearCells: cMap };
  }, [quizGate, activePreviewPiece, hoverAnchor, board]);

  const displayedBest = Math.max(bestScore, score);
  const currentGateQuestion = quizGate ? quizGate.questions[quizGate.step] : null;

  return (
    <div className="relative mx-auto max-w-xl rounded-2xl border border-indigo-900/60 bg-[#0d1137] p-4 text-white shadow-xl sm:p-6">
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
              {linesCleared} hàng/cột đã nổ
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

      {/* Status Tip Bar */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-indigo-800/60 bg-indigo-950/60 px-3.5 py-2 text-xs text-sky-200">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <span>
            Kéo & thả khối vào lưới 8×8. Khi xếp đầy hàng/cột nổ khối sẽ mở câu hỏi!
          </span>
        </span>
      </div>

      {/* 8x8 Block Puzzle Grid */}
      <div className="mt-4 mx-auto w-full max-w-[360px] rounded-xl border border-indigo-800/80 bg-[#171c4d] p-2">
        <div
          ref={gridInnerRef}
          className="grid grid-cols-8 gap-1"
          onMouseLeave={() => {
            if (!dragState) setHoverAnchor(null);
          }}
        >
          {board.map((rowArr, r) =>
            rowArr.map((cellColor, c) => {
              const key = `${r}_${c}`;
              const preview = previewCells[key];
              const isLineGlow = Boolean(potentialClearCells[key]);
              const isClearing = Boolean(clearingCells[key]);

              let cellCls = 'bg-[#252b5e] border-[#2e3570]';
              if (isClearing) {
                cellCls = 'bg-white border-white scale-95';
              } else if (preview === 'valid') {
                cellCls = `${activePreviewPiece?.color || 'bg-emerald-400'} border-white opacity-85`;
              } else if (preview === 'invalid') {
                cellCls = 'bg-rose-500/60 border-rose-300';
              } else if (isLineGlow && cellColor) {
                cellCls = `${cellColor} ring-2 ring-amber-300 brightness-125`;
              } else if (cellColor) {
                cellCls = `${cellColor} border`;
              }

              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Ô ${r + 1},${c + 1}`}
                  disabled={Boolean(quizGate)}
                  onMouseEnter={() => {
                    if (!dragState && selectedPiece) setHoverAnchor([r, c]);
                  }}
                  onClick={() => {
                    if (!quizGate && selectedPiece) {
                      placePieceOnBoard(selectedPiece, r, c);
                    }
                  }}
                  className={`aspect-square w-full rounded-[5px] border transition-all duration-100 ${
                    selectedPiece ? 'cursor-pointer' : 'cursor-default'
                  } ${cellCls}`}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Bottom 3-Piece Drag Tray */}
      <div className="mt-4 flex min-h-[88px] items-center justify-center gap-4 sm:gap-7">
        {tray.map((piece) => {
          const maxR = Math.max(...piece.cells.map(([r]) => r)) + 1;
          const maxC = Math.max(...piece.cells.map(([, c]) => c)) + 1;
          const isBeingDragged =
            dragState?.hasMoved && dragState.piece.id === piece.id;
          const isSelected = selectedPieceId === piece.id;

          return (
            <div
              key={piece.id}
              role="button"
              tabIndex={0}
              aria-label="Kéo khối đặt vào bảng"
              onPointerDown={(e) => handlePiecePointerDown(e, piece)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPieceId((cur) => (cur === piece.id ? null : piece.id));
                }
              }}
              className={`touch-none select-none flex min-h-[72px] min-w-[72px] items-center justify-center rounded-xl border p-2.5 transition-all cursor-grab active:cursor-grabbing ${
                isBeingDragged
                  ? 'opacity-25 scale-90 border-indigo-700 bg-indigo-950/40'
                  : isSelected
                    ? 'border-sky-400 bg-indigo-900/90 ring-2 ring-sky-400/40 scale-105'
                    : 'border-indigo-800/70 bg-indigo-950/60 hover:border-indigo-500'
              }`}
            >
              <div
                className="grid gap-0.5 pointer-events-none"
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
            </div>
          );
        })}
      </div>

      {/* Floating Drag Ghost Piece */}
      {dragState && dragState.hasMoved && (() => {
        const piece = dragState.piece;
        const maxR = Math.max(...piece.cells.map(([r]) => r)) + 1;
        const maxC = Math.max(...piece.cells.map(([, c]) => c)) + 1;
        const offsetY = dragState.pointerType === 'touch' ? 66 : 0;
        const blockPx = Math.max(24, Math.min(44, cellSizePx - 4));

        return (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${dragState.clientX}px`,
              top: `${dragState.clientY - offsetY}px`,
            }}
          >
            <div
              className="grid gap-1 drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
              style={{
                gridTemplateColumns: `repeat(${maxC}, ${blockPx}px)`,
                gridTemplateRows: `repeat(${maxR}, ${blockPx}px)`,
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
                    className={`rounded-[5px] ${
                      filled ? `${piece.color} border` : 'bg-transparent'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Line-Clear Quiz Gate Modal (2–3 questions, retry until right) */}
      {quizGate && currentGateQuestion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="blast-quiz-title"
          className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-[#070a24]/92 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-indigo-700/80 bg-[#121749] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Nổ {quizGate.linesClearedNow} hàng! Trả lời để đi tiếp
              </span>
              <span className="font-mono-tabular text-xs font-bold text-sky-300">
                Câu {quizGate.step + 1}/{quizGate.questions.length}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div>
                <h3
                  id="blast-quiz-title"
                  className="font-display text-2xl font-bold text-white"
                >
                  {currentGateQuestion.card.term}
                </h3>
                {currentGateQuestion.card.phonetic && (
                  <p className="mt-0.5 font-mono-tabular text-xs text-indigo-300">
                    {currentGateQuestion.card.phonetic}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => speakEnglish(currentGateQuestion.card.term)}
                aria-label={`Phát âm ${currentGateQuestion.card.term}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-900 text-sky-300 hover:bg-indigo-800 cursor-pointer shrink-0"
              >
                <Volume2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {quizGate.wrongPickedIds.length > 0 && !quizGate.solvedCurrent && (
              <p className="mt-2.5 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200">
                Chưa đúng rồi! Hãy chọn đáp án đúng để đi tiếp.
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2.5">
              {currentGateQuestion.options.map((opt) => {
                const isRight = opt.id === currentGateQuestion.card.id;
                const wasPickedWrong = quizGate.wrongPickedIds.includes(opt.id);
                let cls =
                  'border-indigo-700/80 bg-indigo-900/70 text-indigo-50 hover:border-sky-400 hover:bg-indigo-800/80 cursor-pointer';

                if (quizGate.solvedCurrent && isRight) {
                  cls = 'border-emerald-400 bg-emerald-600/85 text-white';
                } else if (wasPickedWrong) {
                  cls =
                    'border-rose-400 bg-rose-600/40 text-rose-200 cursor-not-allowed opacity-75';
                } else if (quizGate.solvedCurrent) {
                  cls = 'border-indigo-800/50 bg-indigo-950/60 opacity-45';
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={quizGate.solvedCurrent || wasPickedWrong}
                    onClick={() => handleAnswerGate(opt)}
                    className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors ${cls}`}
                  >
                    <span className="leading-snug">{opt.meaning}</span>
                    {quizGate.solvedCurrent && isRight && (
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    {wasPickedWrong && (
                      <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
