'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  RotateCcw,
  Shuffle,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import {
  AuthUser,
  Deck,
  Flashcard,
  LEADERBOARD_MODE_LABELS,
  LeaderboardEntry,
  LeaderboardMode,
  MODE_LABELS,
  PracticeMode,
} from '@/lib/types';
import { BlockBlastGame } from './practice/BlockBlastGame';
import { FillBlankMode } from './practice/FillBlankMode';
import { FlipMode, PracticeResultItem } from './practice/FlipMode';
import { LearnMode } from './practice/LearnMode';
import { MatchMode, PracticeCompletionMeta } from './practice/MatchMode';
import { MeteorShooterGame } from './practice/MeteorShooterGame';
import { QuizMode } from './practice/QuizMode';
import { SpellMode } from './practice/SpellMode';
import { TankGateGame } from './practice/TankGateGame';
import { TestMode } from './practice/TestMode';

export type PracticePoolFilter =
  | 'all'
  | 'priority'
  | 'unmastered'
  | 'starred'
  | 'weak';

interface PracticeArenaProps {
  user: AuthUser | null;
  decks: Deck[];
  allCards: Flashcard[];
  cardsByDeck: Record<string, Flashcard[]>;
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  activeMode: PracticeMode;
  onChangeMode: (mode: PracticeMode) => void;
  poolFilter: PracticePoolFilter;
  onChangePoolFilter: (filter: PracticePoolFilter) => void;
  leaderboardEntries: LeaderboardEntry[];
  onToggleStar: (card: Flashcard) => Promise<void>;
  onRecordResults: (params: {
    deck: Deck;
    mode: PracticeMode;
    results: PracticeResultItem[];
    totalItems: number;
    correctCount: number;
    durationSeconds: number;
  }) => Promise<void>;
  onSubmitLeaderboardScore: (input: {
    deckId: string;
    deckTitle: string;
    mode: LeaderboardMode;
    score: number;
    accuracy: number;
    durationSeconds: number;
    streak?: number;
  }) => Promise<void>;
  onOpenAuth: () => void;
  onViewLeaderboard: () => void;
  onBackToDecks: () => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleCards(list: Flashcard[], seed = 1): Flashcard[] {
  const copy = [...list];
  const rand = mulberry32(seed || 1);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getSmartPriorityTier(card: Flashcard): number {
  if (card.mastery === 'new') return 0;
  if (card.mastery === 'learning') {
    const acc = card.reviewCount > 0 ? card.correctCount / card.reviewCount : 0;
    return acc < 0.7 ? 1 : 2;
  }
  return 3;
}

function smartShuffleCards(list: Flashcard[], seed = 1): Flashcard[] {
  const buckets: [Flashcard[], Flashcard[], Flashcard[], Flashcard[]] = [
    [],
    [],
    [],
    [],
  ];
  for (const card of list) {
    buckets[getSmartPriorityTier(card)].push(card);
  }
  return [
    ...shuffleCards(buckets[0], seed + 11),
    ...shuffleCards(buckets[1], seed + 37),
    ...shuffleCards(buckets[2], seed + 73),
    ...shuffleCards(buckets[3], seed + 109),
  ];
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function PracticeArena({
  user,
  decks,
  allCards,
  cardsByDeck,
  selectedDeckId,
  onSelectDeck,
  activeMode,
  onChangeMode,
  poolFilter,
  onChangePoolFilter,
  leaderboardEntries,
  onToggleStar,
  onRecordResults,
  onSubmitLeaderboardScore,
  onOpenAuth,
  onViewLeaderboard,
  onBackToDecks,
}: PracticeArenaProps) {
  const activeDeck =
    decks.find((d) => d.id === selectedDeckId) || decks[0] || null;

  const deckCards = useMemo(
    () => (activeDeck ? cardsByDeck[activeDeck.id] || [] : []),
    [activeDeck, cardsByDeck]
  );

  const [autoSpeak, setAutoSpeak] = useState(false);
  const [smartShuffle, setSmartShuffle] = useState(true);
  const [showDeckLeaderboard, setShowDeckLeaderboard] = useState(false);
  const [deckLbModeFilter, setDeckLbModeFilter] = useState<'all' | LeaderboardMode>('all');
  const [focusedMissedIds, setFocusedMissedIds] = useState<string[] | null>(
    null
  );
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [sessionKey, setSessionKey] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [summary, setSummary] = useState<{
    results: PracticeResultItem[];
    correctCount: number;
    totalItems: number;
    accuracy: number;
    durationSeconds: number;
    score: number;
    leaderboardMode: LeaderboardMode;
    leaderboardSaved: boolean;
    saved: boolean;
  } | null>(null);

  const practicePool = useMemo(() => {
    if (focusedMissedIds && focusedMissedIds.length > 0) {
      const missedSet = new Set(focusedMissedIds);
      const missed = deckCards.filter((c) => missedSet.has(c.id));
      if (missed.length > 0) {
        if (smartShuffle) return smartShuffleCards(missed, shuffleSeed || 1);
        return shuffleSeed > 0 ? shuffleCards(missed, shuffleSeed) : missed;
      }
    }

    let filtered = deckCards;
    if (poolFilter === 'priority') {
      const highPriority = deckCards.filter(
        (c) =>
          c.mastery !== 'mastered' ||
          c.starred ||
          (c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7)
      );
      if (highPriority.length > 0) {
        filtered = highPriority;
      }
      return smartShuffleCards(filtered, shuffleSeed || 1);
    } else if (poolFilter === 'unmastered') {
      const unm = deckCards.filter((c) => c.mastery !== 'mastered');
      if (unm.length > 0) filtered = unm;
    } else if (poolFilter === 'starred') {
      const starred = deckCards.filter((c) => c.starred);
      if (starred.length > 0) filtered = starred;
    } else if (poolFilter === 'weak') {
      const weak = deckCards.filter(
        (c) => c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7
      );
      if (weak.length > 0) filtered = weak;
    }

    if (smartShuffle) {
      return smartShuffleCards(filtered, shuffleSeed || 1);
    }
    return shuffleSeed > 0 ? shuffleCards(filtered, shuffleSeed) : filtered;
  }, [deckCards, poolFilter, focusedMissedIds, smartShuffle, shuffleSeed]);

  const deckLeaderboard = useMemo(() => {
    if (!activeDeck) return [];
    const sorted = leaderboardEntries
      .filter(
        (entry) =>
          entry.deckId === activeDeck.id &&
          (deckLbModeFilter === 'all' || entry.mode === deckLbModeFilter)
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.accuracy - a.accuracy ||
          a.durationSeconds - b.durationSeconds ||
          b.createdAt - a.createdAt
      );
    const seen = new Set<string>();
    const deduped: LeaderboardEntry[] = [];
    for (const entry of sorted) {
      const playerKey = entry.userId || entry.playerName.trim().toLowerCase();
      if (seen.has(playerKey)) continue;
      seen.add(playerKey);
      deduped.push(entry);
      if (deduped.length >= 12) break;
    }
    return deduped;
  }, [activeDeck, leaderboardEntries, deckLbModeFilter]);

  const blastBestScore = useMemo(() => {
    if (!activeDeck) return 0;
    return leaderboardEntries
      .filter((e) => e.deckId === activeDeck.id && e.mode === 'blast')
      .reduce((max, e) => Math.max(max, e.score), 0);
  }, [activeDeck, leaderboardEntries]);

  const meteorBestScore = useMemo(() => {
    if (!activeDeck) return 0;
    return leaderboardEntries
      .filter((e) => e.deckId === activeDeck.id && e.mode === 'meteor')
      .reduce((max, e) => Math.max(max, e.score), 0);
  }, [activeDeck, leaderboardEntries]);

  const tankBestScore = useMemo(() => {
    if (!activeDeck) return 0;
    return leaderboardEntries
      .filter((e) => e.deckId === activeDeck.id && e.mode === 'tank')
      .reduce((max, e) => Math.max(max, e.score), 0);
  }, [activeDeck, leaderboardEntries]);

  const resetSessionState = (nextShuffle = false, clearMissed = true) => {
    if (nextShuffle) setShuffleSeed((s) => s + 1);
    if (clearMissed) setFocusedMissedIds(null);
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  };

  function handleToggleSmartShuffle() {
    const next = !smartShuffle;
    setSmartShuffle(next);
    if (next) {
      setShuffleSeed((s) => (s > 0 ? s + 1 : 1));
    } else {
      setShuffleSeed(0);
    }
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  }

  // Live session timer while practicing
  useEffect(() => {
    if (summary || practicePool.length === 0) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [summary, practicePool.length]);

  async function handleComplete(
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) {
    if (!activeDeck) return;
    const totalItems = results.length;
    const correctCount = results.filter((r) => r.isCorrect).length;
    const accuracy =
      totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;
    const duration = Math.max(1, elapsedSeconds);
    const finalScore =
      meta?.score ??
      Math.max(0, correctCount * 100 + accuracy - Math.min(180, duration));
    const lbMode: LeaderboardMode = meta?.leaderboardMode ?? activeMode;

    const canSubmitLeaderboard = Boolean(user);

    setSummary({
      results,
      correctCount,
      totalItems,
      accuracy,
      durationSeconds: duration,
      score: finalScore,
      leaderboardMode: lbMode,
      leaderboardSaved: canSubmitLeaderboard,
      saved: false,
    });

    const tasks: Array<Promise<void>> = [
      onRecordResults({
        deck: activeDeck,
        mode: activeMode,
        results,
        totalItems,
        correctCount,
        durationSeconds: duration,
      }),
    ];

    if (canSubmitLeaderboard) {
      tasks.push(
        onSubmitLeaderboardScore({
          deckId: activeDeck.id,
          deckTitle: activeDeck.title,
          mode: lbMode,
          score: finalScore,
          accuracy,
          durationSeconds: duration,
          streak: meta?.maxStreak ?? 0,
        })
      );
    }

    await Promise.all(tasks);

    setSummary((prev) => (prev ? { ...prev, saved: true } : null));
  }

  async function handleQuickSaveTank(
    results: PracticeResultItem[],
    meta: PracticeCompletionMeta
  ) {
    if (!activeDeck) return;
    const totalItems = results.length;
    const correctCount = results.filter((r) => r.isCorrect).length;
    const accuracy =
      totalItems > 0 ? Math.round((correctCount / totalItems) * 100) : 0;
    const duration = Math.max(1, elapsedSeconds);
    const finalScore =
      meta.score ??
      Math.max(0, correctCount * 100 + accuracy - Math.min(180, duration));

    const tasks: Array<Promise<void>> = [
      onRecordResults({
        deck: activeDeck,
        mode: 'tank',
        results,
        totalItems,
        correctCount,
        durationSeconds: duration,
      }),
    ];

    if (user) {
      tasks.push(
        onSubmitLeaderboardScore({
          deckId: activeDeck.id,
          deckTitle: activeDeck.title,
          mode: 'tank',
          score: finalScore,
          accuracy,
          durationSeconds: duration,
          streak: meta.maxStreak ?? 0,
        })
      );
    }

    await Promise.all(tasks);
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
  const weakTotal = deckCards.filter(
    (c) => c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7
  ).length;
  const lowerMasteryCount = practicePool.filter(
    (c) => c.mastery !== 'mastered'
  ).length;
  const masteredInPoolCount = practicePool.length - lowerMasteryCount;
  const missedCountInSummary = summary
    ? summary.results.filter((r) => !r.isCorrect).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Arena Header Controls */}
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:mb-8 sm:pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBackToDecks}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Quay lại bộ thẻ</span>
            </button>
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {activeDeck.title} · {practicePool.length} thẻ
              {focusedMissedIds ? ' (Đang ôn từ sai)' : ''}
            </div>
            <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {MODE_LABELS[activeMode]}
            </h1>
            {smartShuffle && practicePool.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {masteredInPoolCount > 0 && lowerMasteryCount > 0
                    ? `Xáo trộn thông minh: ưu tiên ${lowerMasteryCount} thẻ mới/đang học trước ${masteredInPoolCount} thẻ đã thuộc`
                    : 'Xáo trộn thông minh đang bật · Ưu tiên thẻ yếu hơn lên trước'}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 font-mono-tabular">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowDeckLeaderboard((v) => !v)}
              aria-expanded={showDeckLeaderboard}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                showDeckLeaderboard
                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              <span>BXH bộ này</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoSpeak((v) => !v)}
              aria-pressed={autoSpeak}
              title="Tự động phát âm tiếng Anh khi chuyển thẻ/câu"
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                autoSpeak
                  ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {autoSpeak ? (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">Tự đọc</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSmartShuffle}
              aria-pressed={smartShuffle}
              title="Ưu tiên thẻ mới và thẻ hay sai xuất hiện trước thẻ đã thuộc"
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                smartShuffle
                  ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Thông minh</span>
            </button>

            <button
              type="button"
              onClick={() => resetSessionState(true, false)}
              title={
                smartShuffle
                  ? 'Xáo trộn lại trong từng nhóm mức độ thuộc'
                  : 'Xáo trộn ngẫu nhiên toàn bộ thẻ'
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xáo trộn</span>
            </button>

            <select
              aria-label="Lọc thẻ luyện tập"
              value={poolFilter}
              onChange={(e) => {
                onChangePoolFilter(e.target.value as PracticePoolFilter);
                resetSessionState(false, true);
              }}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="all">Tất cả thẻ ({deckCards.length})</option>
              <option value="priority">Thẻ ưu tiên cao</option>
              <option value="unmastered">Chỉ thẻ chưa thuộc</option>
              <option value="starred" disabled={starredTotal === 0}>
                Chỉ thẻ gắn sao ({starredTotal})
              </option>
              <option value="weak" disabled={weakTotal === 0}>
                Chỉ thẻ hay sai ({weakTotal})
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
                { id: 'blast', label: 'Xếp khối Blast' },
                { id: 'meteor', label: 'Bắn thiên thạch' },
                { id: 'tank', label: 'Xe tăng 3D' },
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

          <div className="flex items-center justify-between gap-2 shrink-0">
            <label
              htmlFor="arena-deck-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Bộ thẻ:
            </label>
            <select
              id="arena-deck-select"
              value={activeDeck.id}
              onChange={(e) => {
                onSelectDeck(e.target.value);
                resetSessionState(false, true);
              }}
              className="min-h-[38px] flex-1 sm:flex-initial sm:max-w-[210px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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

      {/* Inline Deck Leaderboard Panel */}
      {showDeckLeaderboard && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Bảng xếp hạng bộ “{activeDeck.title}”
              </h2>
            </div>

            <button
              type="button"
              onClick={onViewLeaderboard}
              className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer whitespace-nowrap"
            >
              Mở BXH & Chuỗi toàn bộ
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {(
              [
                { id: 'all', label: 'Tất cả chế độ' },
                { id: 'blast', label: 'Xếp khối Blast' },
                { id: 'meteor', label: 'Bắn thiên thạch' },
                { id: 'tank', label: 'Xe tăng 3D' },
                { id: 'match_grid', label: 'Ghép thẻ 4×3' },
                { id: 'match_memory', label: 'Lật thẻ 4×4' },
                { id: 'match_columns', label: 'Nối 2 cột' },
                { id: 'test', label: 'Kiểm tra' },
                { id: 'quiz', label: 'Trắc nghiệm' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setDeckLbModeFilter(filter.id)}
                className={`min-h-[32px] rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  deckLbModeFilter === filter.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {deckLeaderboard.length === 0 ? (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Chưa có điểm nào cho bộ lọc này. Hãy hoàn thành một lượt chơi để ghi danh!
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/60">
              {deckLeaderboard.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono-tabular font-bold ${
                        idx === 0
                          ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300'
                          : idx === 1
                            ? 'bg-slate-300/30 text-slate-700 dark:text-slate-200'
                            : idx === 2
                              ? 'bg-orange-400/20 text-orange-700 dark:text-orange-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {entry.playerName}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {LEADERBOARD_MODE_LABELS[entry.mode]} · {entry.accuracy}% ·{' '}
                        {formatDuration(entry.durationSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono-tabular text-sm font-bold text-amber-600 dark:text-amber-400 shrink-0">
                    {entry.score}đ
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              {activeDeck.title} · {LEADERBOARD_MODE_LABELS[summary.leaderboardMode]} ·{' '}
              {summary.saved
                ? summary.leaderboardSaved
                  ? 'Đã lưu vào Lịch sử & Bảng xếp hạng'
                  : 'Đã lưu vào Lịch sử cá nhân (Khách)'
                : 'Đang lưu kết quả...'}
            </p>
          </div>

          {!summary.leaderboardSaved && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                Chỉ tài khoản đã đăng nhập mới được ghi danh lên Bảng xếp hạng.
              </span>
              <button
                type="button"
                onClick={onOpenAuth}
                className="font-semibold text-sky-700 underline hover:no-underline dark:text-sky-400 cursor-pointer whitespace-nowrap"
              >
                Đăng nhập ngay
              </button>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 border-y border-slate-200 py-5 dark:border-slate-800 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Điểm BXH
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary.score}
              </div>
            </div>
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
              onClick={onViewLeaderboard}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Xem BXH & Chuỗi</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Practice Mode */
        <div key={`${activeDeck.id}_${activeMode}_${sessionKey}`}>
          {activeMode === 'flip' && (
            <FlipMode
              cards={practicePool}
              autoSpeak={autoSpeak}
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
              autoSpeak={autoSpeak}
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
          {activeMode === 'blast' && (
            <BlockBlastGame
              cards={practicePool}
              allPoolCards={allCards}
              bestScore={blastBestScore}
              autoSpeak={autoSpeak}
              onComplete={handleComplete}
            />
          )}
          {activeMode === 'meteor' && (
            <MeteorShooterGame
              cards={practicePool}
              allPoolCards={allCards}
              bestScore={meteorBestScore}
              autoSpeak={autoSpeak}
              onComplete={handleComplete}
            />
          )}
          {activeMode === 'tank' && (
            <TankGateGame
              cards={practicePool}
              allPoolCards={allCards}
              deckTitle={activeDeck.title}
              bestScore={tankBestScore}
              autoSpeak={autoSpeak}
              isLoggedIn={Boolean(user)}
              onQuickSave={handleQuickSaveTank}
              onComplete={handleComplete}
              onViewLeaderboard={onViewLeaderboard}
              onOpenAuth={onOpenAuth}
            />
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
