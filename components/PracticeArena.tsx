'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  Shuffle,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Deck, Flashcard, MODE_LABELS, PracticeMode } from '@/lib/types';
import { FillBlankMode } from './practice/FillBlankMode';
import { FlipMode, PracticeResultItem } from './practice/FlipMode';
import { MatchMode } from './practice/MatchMode';
import { QuizMode } from './practice/QuizMode';

interface PracticeArenaProps {
  decks: Deck[];
  allCards: Flashcard[];
  cardsByDeck: Record<string, Flashcard[]>;
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  activeMode: PracticeMode;
  onChangeMode: (mode: PracticeMode) => void;
  onRecordResults: (params: {
    deck: Deck;
    mode: PracticeMode;
    results: PracticeResultItem[];
    totalItems: number;
    correctCount: number;
    durationSeconds: number;
  }) => Promise<void>;
  onViewProgress: () => void;
  onBackToDecks: () => void;
}

function shuffleCards(list: Flashcard[]): Flashcard[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function PracticeArena({
  decks,
  allCards,
  cardsByDeck,
  selectedDeckId,
  onSelectDeck,
  activeMode,
  onChangeMode,
  onRecordResults,
  onViewProgress,
  onBackToDecks,
}: PracticeArenaProps) {
  const activeDeck =
    decks.find((d) => d.id === selectedDeckId) || decks[0] || null;

  const deckCards = useMemo(
    () => (activeDeck ? cardsByDeck[activeDeck.id] || [] : []),
    [activeDeck, cardsByDeck]
  );

  const [onlyUnmastered, setOnlyUnmastered] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [sessionKey, setSessionKey] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [summary, setSummary] = useState<{
    results: PracticeResultItem[];
    correctCount: number;
    totalItems: number;
    accuracy: number;
    durationSeconds: number;
    saved: boolean;
  } | null>(null);

  const practicePool = useMemo(() => {
    const filtered = onlyUnmastered
      ? deckCards.filter((c) => c.mastery !== 'mastered')
      : deckCards;
    const base = filtered.length > 0 ? filtered : deckCards;
    return shuffleSeed > 0 ? shuffleCards(base) : base;
  }, [deckCards, onlyUnmastered, shuffleSeed]);

  const resetSessionState = (nextShuffle = false) => {
    if (nextShuffle) setShuffleSeed((s) => s + 1);
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  };

  // Live session timer while practicing
  useEffect(() => {
    if (summary || practicePool.length === 0) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [summary, practicePool.length]);

  async function handleComplete(results: PracticeResultItem[]) {
    if (!activeDeck) return;
    const totalItems = results.length;
    const correctCount = results.filter((r) => r.isCorrect).length;
    const accuracy =
      totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;
    const duration = Math.max(1, elapsedSeconds);

    setSummary({
      results,
      correctCount,
      totalItems,
      accuracy,
      durationSeconds: duration,
      saved: false,
    });

    await onRecordResults({
      deck: activeDeck,
      mode: activeMode,
      results,
      totalItems,
      correctCount,
      durationSeconds: duration,
    });

    setSummary((prev) => (prev ? { ...prev, saved: true } : null));
  }

  function handleRestart(shuffleNow = false) {
    resetSessionState(shuffleNow);
  }

  if (!activeDeck) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Hãy tạo một bộ thẻ trước khi bắt đầu luyện tập.
        </p>
        <button
          type="button"
          onClick={onBackToDecks}
          className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
        >
          Quay lại Thư viện Bộ thẻ
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Arena Header Controls */}
      <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Luyện tập · {activeDeck.title} · {practicePool.length} thẻ
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {MODE_LABELS[activeMode]}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 font-mono-tabular">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={() => handleRestart(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xáo trộn</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOnlyUnmastered((v) => !v);
                resetSessionState(false);
              }}
              aria-pressed={onlyUnmastered}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                onlyUnmastered
                  ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {onlyUnmastered ? 'Đang lọc: Chưa thuộc' : 'Chỉ ôn thẻ chưa thuộc'}
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs + Quick Deck Picker */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Chế độ luyện tập"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
          >
            {(
              [
                { id: 'flip', label: 'Lật thẻ' },
                { id: 'quiz', label: 'Trắc nghiệm' },
                { id: 'fill', label: 'Điền từ' },
                { id: 'match', label: 'Nối thẻ' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                role="tab"
                type="button"
                aria-selected={activeMode === m.id}
                onClick={() => {
                  onChangeMode(m.id);
                  resetSessionState(false);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === m.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="arena-deck-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Đổi bộ thẻ:
            </label>
            <select
              id="arena-deck-select"
              value={activeDeck.id}
              onChange={(e) => {
                onSelectDeck(e.target.value);
                resetSessionState(false);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.cardCount})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Empty Deck Guard */}
      {practicePool.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Bộ thẻ “{activeDeck.title}” chưa có từ vựng nào để luyện tập.
          </p>
          <button
            type="button"
            onClick={onBackToDecks}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer"
          >
            Thêm thẻ vào bộ này
          </button>
        </div>
      ) : summary ? (
        /* Session Complete Summary */
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              Hoàn thành phiên luyện tập
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {activeDeck.title} · Chế độ {MODE_LABELS[activeMode]} ·{' '}
              {summary.saved
                ? 'Đã lưu vào Lịch sử học tập'
                : 'Đang lưu kết quả...'}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-y border-slate-200 py-5 dark:border-slate-800">
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Độ chính xác
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-sky-600 dark:text-sky-400">
                {summary.accuracy}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Số câu đúng
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary.correctCount}/{summary.totalItems}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Thời gian
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatDuration(summary.durationSeconds)}
              </div>
            </div>
          </div>

          {/* Per-item breakdown */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Chi tiết từng từ trong phiên
            </h3>
            <div className="mt-3 max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {summary.results.map((item, idx) => (
                <div
                  key={`${item.cardId}_${idx}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.term}
                    </span>
                    <span className="mx-2 text-slate-300 dark:text-slate-700">
                      —
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {item.meaning}
                    </span>
                  </div>

                  {item.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Đạt</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 shrink-0">
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Cần ôn</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleRestart(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Luyện tập lại</span>
            </button>

            <button
              type="button"
              onClick={onViewProgress}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <span>Xem lịch sử & tiến độ</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Practice Mode */
        <div key={`${activeDeck.id}_${activeMode}_${sessionKey}`}>
          {activeMode === 'flip' && (
            <FlipMode cards={practicePool} onComplete={handleComplete} />
          )}
          {activeMode === 'quiz' && (
            <QuizMode
              cards={practicePool}
              allPoolCards={allCards}
              onComplete={handleComplete}
            />
          )}
          {activeMode === 'fill' && (
            <FillBlankMode cards={practicePool} onComplete={handleComplete} />
          )}
          {activeMode === 'match' && (
            <MatchMode cards={practicePool} onComplete={handleComplete} />
          )}
        </div>
      )}
    </div>
  );
}
