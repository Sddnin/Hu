'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  Shuffle,
  Star,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Deck, Flashcard, MODE_LABELS, PracticeMode } from '@/lib/types';
import { FillBlankMode } from './practice/FillBlankMode';
import { FlipMode, PracticeResultItem } from './practice/FlipMode';
import { LearnMode } from './practice/LearnMode';
import { MatchMode } from './practice/MatchMode';
import { QuizMode } from './practice/QuizMode';
import { SpellMode } from './practice/SpellMode';
import { TestMode } from './practice/TestMode';

interface PracticeArenaProps {
  decks: Deck[];
  allCards: Flashcard[];
  cardsByDeck: Record<string, Flashcard[]>;
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  activeMode: PracticeMode;
  onChangeMode: (mode: PracticeMode) => void;
  onToggleStar: (card: Flashcard) => Promise<void>;
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
  onToggleStar,
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

  const [poolFilter, setPoolFilter] = useState<'all' | 'unmastered' | 'starred'>(
    'all'
  );
  const [focusedMissedIds, setFocusedMissedIds] = useState<string[] | null>(
    null
  );
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
    if (focusedMissedIds && focusedMissedIds.length > 0) {
      const missedSet = new Set(focusedMissedIds);
      const missed = deckCards.filter((c) => missedSet.has(c.id));
      if (missed.length > 0) {
        return shuffleSeed > 0 ? shuffleCards(missed) : missed;
      }
    }

    let filtered = deckCards;
    if (poolFilter === 'unmastered') {
      const unm = deckCards.filter((c) => c.mastery !== 'mastered');
      if (unm.length > 0) filtered = unm;
    } else if (poolFilter === 'starred') {
      const starred = deckCards.filter((c) => c.starred);
      if (starred.length > 0) filtered = starred;
    }
    return shuffleSeed > 0 ? shuffleCards(filtered) : filtered;
  }, [deckCards, poolFilter, focusedMissedIds, shuffleSeed]);

  const resetSessionState = (nextShuffle = false, clearMissed = true) => {
    if (nextShuffle) setShuffleSeed((s) => s + 1);
    if (clearMissed) setFocusedMissedIds(null);
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

  function handleRetryMissed() {
    if (!summary) return;
    const missedIds = Array.from(
      new Set(summary.results.filter((r) => !r.isCorrect).map((r) => r.cardId))
    );
    if (missedIds.length === 0) return;
    setFocusedMissedIds(missedIds);
    onChangeMode('flip');
    resetSessionState(false, false);
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
          className="mt-4 min-h-[44px] rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
        >
          Quay lại Thư viện Bộ thẻ
        </button>
      </div>
    );
  }

  const starredTotal = deckCards.filter((c) => c.starred).length;
  const missedCountInSummary = summary
    ? summary.results.filter((r) => !r.isCorrect).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Arena Header Controls */}
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:mb-8 sm:pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeDeck.title} · {practicePool.length} thẻ
              {focusedMissedIds ? ' (Đang ôn từ sai)' : ''}
            </div>
            <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {MODE_LABELS[activeMode]}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 font-mono-tabular">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={() => resetSessionState(true, false)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xáo trộn</span>
            </button>

            <select
              aria-label="Lọc thẻ luyện tập"
              value={poolFilter}
              onChange={(e) => {
                setPoolFilter(
                  e.target.value as 'all' | 'unmastered' | 'starred'
                );
                resetSessionState(false, true);
              }}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="all">Tất cả thẻ ({deckCards.length})</option>
              <option value="unmastered">Chỉ thẻ chưa thuộc</option>
              <option value="starred" disabled={starredTotal === 0}>
                Chỉ thẻ gắn sao ({starredTotal})
              </option>
            </select>
          </div>
        </div>

        {/* Mode Switcher Tabs (Horizontal scroll on mobile) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Chế độ luyện tập"
            className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
          >
            {(
              [
                { id: 'flip', label: 'Lật thẻ' },
                { id: 'learn', label: 'Học thông minh' },
                { id: 'quiz', label: 'Trắc nghiệm' },
                { id: 'fill', label: 'Điền từ' },
                { id: 'match', label: 'Nối thẻ' },
                { id: 'spell', label: 'Nghe & Viết' },
                { id: 'test', label: 'Kiểm tra' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                role="tab"
                type="button"
                aria-selected={activeMode === m.id}
                onClick={() => {
                  onChangeMode(m.id);
                  resetSessionState(false, true);
                }}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === m.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
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
                resetSessionState(false, true);
              }}
              className="min-h-[38px] max-w-[200px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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
            className="mt-4 min-h-[44px] rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer"
          >
            Thêm thẻ vào bộ này
          </button>
        </div>
      ) : summary ? (
        /* Session Complete Summary */
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              Hoàn thành phiên luyện tập
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {activeDeck.title} · {MODE_LABELS[activeMode]} ·{' '}
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

          {/* Per-item breakdown with quick Star button */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Chi tiết từng từ trong phiên
            </h3>
            <div className="mt-3 max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {summary.results.map((item, idx) => {
                const fullCard = deckCards.find((c) => c.id === item.cardId);
                return (
                  <div
                    key={`${item.cardId}_${idx}`}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.term}
                      </span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-700">
                        —
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {item.meaning}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {fullCard && (
                        <button
                          type="button"
                          onClick={() => onToggleStar(fullCard)}
                          aria-label={`Gắn sao ${fullCard.term}`}
                          className={`inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md cursor-pointer ${
                            fullCard.starred
                              ? 'text-amber-500 dark:text-amber-400'
                              : 'text-slate-400 hover:text-amber-500'
                          }`}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              fullCard.starred ? 'fill-current' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      )}

                      {item.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Đạt</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Cần ôn</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center">
            {missedCountInSummary > 0 && (
              <button
                type="button"
                onClick={handleRetryMissed}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Ôn lại {missedCountInSummary} từ chưa thuộc</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => resetSessionState(false, true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Luyện tập lại</span>
            </button>

            <button
              type="button"
              onClick={onViewProgress}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <span>Xem lịch sử</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Practice Mode */
        <div key={`${activeDeck.id}_${activeMode}_${sessionKey}`}>
          {activeMode === 'flip' && (
            <FlipMode
              cards={practicePool}
              onToggleStar={onToggleStar}
              onComplete={handleComplete}
            />
          )}
          {activeMode === 'learn' && (
            <LearnMode
              cards={practicePool}
              allPoolCards={allCards}
              onComplete={handleComplete}
            />
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
          {activeMode === 'spell' && (
            <SpellMode cards={practicePool} onComplete={handleComplete} />
          )}
          {activeMode === 'test' && (
            <TestMode
              cards={practicePool}
              allPoolCards={allCards}
              onComplete={handleComplete}
            />
          )}
        </div>
      )}
    </div>
  );
}
