'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Filter,
  Play,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react';
import {
  AiQuotaSnapshot,
  AuthUser,
  Deck,
  Flashcard,
  LEADERBOARD_MODE_LABELS,
  LeaderboardEntry,
  LeaderboardMode,
  MASTERY_LABELS,
  MODE_LABELS,
  PracticeMode,
} from '@/lib/types';
import { prioritizeCards } from '@/lib/spaced-repetition';
import { speakEnglish } from '@/lib/speech';
import type { PracticeResultItem } from './practice/FlipMode';
import type { PracticeCompletionMeta } from './practice/MatchMode';

const ModeLoading = () => (
  <div
    className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 px-4 py-10 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400"
    role="status"
    aria-live="polite"
  >
    Đang tải chế độ luyện tập...
  </div>
);

// Keep each practice mode in its own chunk. In particular, Three.js is not
// downloaded until the user chooses the Tank game.
const AiSpeakMode = dynamic(
  () => import('./practice/AiSpeakMode').then((mod) => mod.AiSpeakMode),
  { loading: ModeLoading }
);
const BlockBlastGame = dynamic(
  () => import('./practice/BlockBlastGame').then((mod) => mod.BlockBlastGame),
  { loading: ModeLoading }
);
const FillBlankMode = dynamic(
  () => import('./practice/FillBlankMode').then((mod) => mod.FillBlankMode),
  { loading: ModeLoading }
);
const FlipMode = dynamic(
  () => import('./practice/FlipMode').then((mod) => mod.FlipMode),
  { loading: ModeLoading }
);
const LearnMode = dynamic(
  () => import('./practice/LearnMode').then((mod) => mod.LearnMode),
  { loading: ModeLoading }
);
const MatchMode = dynamic(
  () => import('./practice/MatchMode').then((mod) => mod.MatchMode),
  { loading: ModeLoading }
);
const MeteorShooterGame = dynamic(
  () =>
    import('./practice/MeteorShooterGame').then((mod) => mod.MeteorShooterGame),
  { loading: ModeLoading }
);
const QuizMode = dynamic(
  () => import('./practice/QuizMode').then((mod) => mod.QuizMode),
  { loading: ModeLoading }
);
const SpellMode = dynamic(
  () => import('./practice/SpellMode').then((mod) => mod.SpellMode),
  { loading: ModeLoading }
);
const TankGateGame = dynamic(
  () => import('./practice/TankGateGame').then((mod) => mod.TankGateGame),
  { loading: ModeLoading }
);
const TestMode = dynamic(
  () => import('./practice/TestMode').then((mod) => mod.TestMode),
  { loading: ModeLoading }
);

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
  tagFilter: string;
  onChangeTagFilter: (tag: string) => void;
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
  aiQuota?: AiQuotaSnapshot;
  onUpdateAiQuota?: (next: AiQuotaSnapshot | null | undefined) => void;
  onGoToMissions?: () => void;
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

function smartShuffleCards(list: Flashcard[], seed = 1): Flashcard[] {
  // Lặp lại cách quãng: ưu tiên thẻ mới/yếu/quá hạn ôn (xem lib/spaced-repetition.ts)
  return prioritizeCards(list, seed);
}

function cardMatchesQuery(card: Flashcard, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const q = normalizedQuery.startsWith('#')
    ? normalizedQuery.slice(1)
    : normalizedQuery;
  if (!q) return true;
  if (card.term.toLowerCase().includes(q)) return true;
  if (card.meaning.toLowerCase().includes(q)) return true;
  if ((card.phonetic || '').toLowerCase().includes(q)) return true;
  if ((card.example || '').toLowerCase().includes(q)) return true;
  if ((card.tags || []).some((t) => t.toLowerCase().includes(q))) return true;
  return false;
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
  tagFilter,
  onChangeTagFilter,
  leaderboardEntries,
  onToggleStar,
  onRecordResults,
  onSubmitLeaderboardScore,
  onOpenAuth,
  onViewLeaderboard,
  onBackToDecks,
  aiQuota,
  onUpdateAiQuota,
  onGoToMissions,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'deck' | 'all'>('deck');
  const [filterBySearch, setFilterBySearch] = useState(false);
  const [pinnedCardId, setPinnedCardId] = useState<string | null>(null);
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

  const deckTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of decks) {
      map.set(d.id, d.title);
    }
    return map;
  }, [decks]);

  const availableTags = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const card of deckCards) {
      for (const rawTag of card.tags || []) {
        const key = rawTag.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { tag: rawTag, count: 1 });
        }
      }
    }
    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'vi')
    );
  }, [deckCards]);

  const effectiveTagFilter = useMemo(() => {
    if (!tagFilter || tagFilter === 'all') return 'all';
    const match = availableTags.find(
      (t) => t.tag.toLowerCase() === tagFilter.toLowerCase()
    );
    return match ? match.tag : 'all';
  }, [tagFilter, availableTags]);

  const tagScopedCards = useMemo(() => {
    if (effectiveTagFilter === 'all') return deckCards;
    const target = effectiveTagFilter.toLowerCase();
    return deckCards.filter((c) =>
      (c.tags || []).some((t) => t.toLowerCase() === target)
    );
  }, [deckCards, effectiveTagFilter]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const searchResults = useMemo(() => {
    const source = searchScope === 'all' ? allCards : deckCards;
    if (!normalizedSearch) {
      return searchOpen ? source : [];
    }
    const matched = source.filter((c) => cardMatchesQuery(c, normalizedSearch));
    matched.sort((a, b) => {
      const aTerm = a.term.toLowerCase();
      const bTerm = b.term.toLowerCase();
      const aRank =
        aTerm === normalizedSearch
          ? 0
          : aTerm.startsWith(normalizedSearch)
            ? 1
            : aTerm.includes(normalizedSearch)
              ? 2
              : 3;
      const bRank =
        bTerm === normalizedSearch
          ? 0
          : bTerm.startsWith(normalizedSearch)
            ? 1
            : bTerm.includes(normalizedSearch)
              ? 2
              : 3;
      if (aRank !== bRank) return aRank - bRank;
      return aTerm.localeCompare(bTerm);
    });
    return matched;
  }, [allCards, deckCards, searchScope, normalizedSearch, searchOpen]);

  const deckMatchingCards = useMemo(() => {
    if (!normalizedSearch) return tagScopedCards;
    return tagScopedCards.filter((c) => cardMatchesQuery(c, normalizedSearch));
  }, [tagScopedCards, normalizedSearch]);

  const practicePool = useMemo(() => {
    const pinTop = (list: Flashcard[]): Flashcard[] => {
      if (!pinnedCardId || list.length <= 1) return list;
      const idx = list.findIndex((c) => c.id === pinnedCardId);
      if (idx <= 0) return list;
      const copy = [...list];
      const [pinned] = copy.splice(idx, 1);
      copy.unshift(pinned);
      return copy;
    };

    if (focusedMissedIds && focusedMissedIds.length > 0) {
      const missedSet = new Set(focusedMissedIds);
      const missed = tagScopedCards.filter((c) => missedSet.has(c.id));
      if (missed.length > 0) {
        const ordered = smartShuffle
          ? smartShuffleCards(missed, shuffleSeed || 1)
          : shuffleSeed > 0
            ? shuffleCards(missed, shuffleSeed)
            : missed;
        return pinTop(ordered);
      }
    }

    let filtered = tagScopedCards;
    if (poolFilter === 'priority') {
      const highPriority = tagScopedCards.filter(
        (c) =>
          c.mastery !== 'mastered' ||
          c.starred ||
          (c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7)
      );
      if (highPriority.length > 0) {
        filtered = highPriority;
      }
    } else if (poolFilter === 'unmastered') {
      const unm = tagScopedCards.filter((c) => c.mastery !== 'mastered');
      if (unm.length > 0) filtered = unm;
    } else if (poolFilter === 'starred') {
      const starred = tagScopedCards.filter((c) => c.starred);
      if (starred.length > 0) filtered = starred;
    } else if (poolFilter === 'weak') {
      const weak = tagScopedCards.filter(
        (c) => c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.7
      );
      if (weak.length > 0) filtered = weak;
    }

    if (filterBySearch && normalizedSearch) {
      filtered = filtered.filter((c) => cardMatchesQuery(c, normalizedSearch));
    }

    const ordered =
      poolFilter === 'priority' || smartShuffle
        ? smartShuffleCards(filtered, shuffleSeed || 1)
        : shuffleSeed > 0
          ? shuffleCards(filtered, shuffleSeed)
          : filtered;

    return pinTop(ordered);
  }, [
    tagScopedCards,
    poolFilter,
    focusedMissedIds,
    smartShuffle,
    shuffleSeed,
    filterBySearch,
    normalizedSearch,
    pinnedCardId,
  ]);

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

  const resetSessionState = (
    nextShuffle = false,
    clearMissed = true,
    clearPinned = true
  ) => {
    if (nextShuffle) setShuffleSeed((s) => s + 1);
    if (clearMissed) setFocusedMissedIds(null);
    if (clearPinned) setPinnedCardId(null);
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  };

  function handlePracticeSearchedCard(card: Flashcard) {
    if (activeDeck && card.deckId !== activeDeck.id) {
      onSelectDeck(card.deckId);
      onChangeTagFilter('all');
      onChangePoolFilter('all');
    } else {
      if (effectiveTagFilter !== 'all') {
        onChangeTagFilter('all');
      }
      if (poolFilter !== 'all') {
        onChangePoolFilter('all');
      }
    }
    setFilterBySearch(false);
    setPinnedCardId(card.id);
    setSearchOpen(false);
    setFocusedMissedIds(null);
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  }

  function handleToggleFilterBySearch() {
    if (!normalizedSearch) return;
    const next = !filterBySearch;
    setFilterBySearch(next);
    setPinnedCardId(null);
    setFocusedMissedIds(null);
    setSessionKey((k) => k + 1);
    setElapsedSeconds(0);
    setSummary(null);
  }

  function handleClearSearch() {
    const wasFiltered = filterBySearch;
    setSearchQuery('');
    setFilterBySearch(false);
    setSearchOpen(false);
    if (wasFiltered) {
      setSessionKey((k) => k + 1);
      setElapsedSeconds(0);
      setSummary(null);
    }
  }

  function handleToggleSmartShuffle() {
    const next = !smartShuffle;
    setSmartShuffle(next);
    setPinnedCardId(null);
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

  const starredTotal = tagScopedCards.filter((c) => c.starred).length;
  const weakTotal = tagScopedCards.filter(
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
              {activeDeck.title}
              {effectiveTagFilter !== 'all' ? ` · #${effectiveTagFilter}` : ''} ·{' '}
              {practicePool.length} thẻ
              {filterBySearch && normalizedSearch
                ? ` (Lọc: “${searchQuery.trim()}”)`
                : ''}
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

            {availableTags.length > 0 && (
              <select
                aria-label="Lọc theo nhãn chủ đề"
                value={effectiveTagFilter}
                onChange={(e) => {
                  onChangeTagFilter(e.target.value);
                  resetSessionState(false, true);
                }}
                className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="all">
                  Chủ đề: Tất cả ({deckCards.length})
                </option>
                {availableTags.map((t) => (
                  <option key={t.tag} value={t.tag}>
                    #{t.tag} ({t.count})
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Lọc thẻ luyện tập"
              value={poolFilter}
              onChange={(e) => {
                onChangePoolFilter(e.target.value as PracticePoolFilter);
                resetSessionState(false, true);
              }}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="all">Tất cả thẻ ({tagScopedCards.length})</option>
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
                {
                  id: 'flip',
                  label: 'Lật thẻ',
                  isActive: activeMode === 'flip',
                  targetMode: 'flip' as PracticeMode,
                },
                {
                  id: 'study_practice',
                  label: 'Học & Thực hành',
                  isActive:
                    activeMode === 'learn' ||
                    activeMode === 'quiz' ||
                    activeMode === 'fill' ||
                    activeMode === 'spell' ||
                    activeMode === 'speak',
                  targetMode: 'learn' as PracticeMode,
                },
                {
                  id: 'match',
                  label: 'Nối thẻ',
                  isActive: activeMode === 'match',
                  targetMode: 'match' as PracticeMode,
                },
                {
                  id: 'minigame',
                  label: 'Mini Game',
                  isActive:
                    activeMode === 'blast' ||
                    activeMode === 'meteor' ||
                    activeMode === 'tank',
                  targetMode: 'blast' as PracticeMode,
                },
                {
                  id: 'test',
                  label: 'Kiểm tra',
                  isActive: activeMode === 'test',
                  targetMode: 'test' as PracticeMode,
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                role="tab"
                type="button"
                aria-selected={m.isActive}
                onClick={() => {
                  if (!m.isActive) {
                    onChangeMode(m.targetMode);
                    resetSessionState(false, true);
                  }
                }}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  m.isActive
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

        {/* Thẻ tìm từ nhanh trong tab Luyện tập */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Tìm từ trong tab luyện tập"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim()) {
                    setSearchOpen(true);
                  } else if (filterBySearch) {
                    setFilterBySearch(false);
                    setSessionKey((k) => k + 1);
                  }
                }}
                placeholder="Tìm từ vựng, nghĩa Việt, phiên âm, ví dụ hoặc #nhãn để luyện ngay..."
                className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950 sm:text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Xóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <div
                role="group"
                aria-label="Phạm vi tìm từ"
                className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSearchScope('deck');
                    setSearchOpen(true);
                  }}
                  className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    searchScope === 'deck'
                      ? 'bg-white text-sky-700 shadow-xs dark:bg-slate-800 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Bộ này ({deckCards.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchScope('all');
                    setSearchOpen(true);
                  }}
                  className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    searchScope === 'all'
                      ? 'bg-white text-sky-700 shadow-xs dark:bg-slate-800 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Tất cả ({allCards.length})
                </button>
              </div>

              {normalizedSearch && (
                <button
                  type="button"
                  onClick={handleToggleFilterBySearch}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    filterBySearch
                      ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {filterBySearch
                      ? `Đang lọc (${deckMatchingCards.length})`
                      : `Lọc luyện (${deckMatchingCards.length})`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                className="min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                {searchOpen ? 'Thu gọn' : 'Danh sách từ'}
              </button>
            </div>
          </div>

          {/* Active Search Filter Notice */}
          {filterBySearch && normalizedSearch && !searchOpen && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
              <span>
                Đang luyện <strong>{practicePool.length}</strong> thẻ khớp từ khóa{' '}
                “{searchQuery.trim()}”.
              </span>
              <button
                type="button"
                onClick={handleClearSearch}
                className="font-semibold text-sky-700 underline hover:no-underline dark:text-sky-400 cursor-pointer"
              >
                Hiện lại toàn bộ thẻ
              </button>
            </div>
          )}

          {/* Expandable Word Search Results List */}
          {searchOpen && (
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {normalizedSearch
                    ? `Tìm thấy ${searchResults.length} từ khớp “${searchQuery.trim()}”`
                    : `Danh sách nhanh (${Math.min(searchResults.length, 30)}/${searchResults.length} thẻ)`}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  Đóng bảng tìm từ
                </button>
              </div>

              {searchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                  Không tìm thấy từ nào khớp “{searchQuery.trim()}”{' '}
                  {searchScope === 'deck' ? 'trong bộ thẻ hiện tại' : 'trong thư viện'}.
                  {searchScope === 'deck' && allCards.length > deckCards.length && (
                    <button
                      type="button"
                      onClick={() => setSearchScope('all')}
                      className="ml-2 font-semibold text-sky-600 underline hover:no-underline dark:text-sky-400 cursor-pointer"
                    >
                      Tìm ở tất cả bộ thẻ
                    </button>
                  )}
                </div>
              ) : (
                <div className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/40">
                  {searchResults.slice(0, 30).map((card) => {
                    const cardDeckTitle = deckTitleById.get(card.deckId);
                    const isPinned = pinnedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between hover:bg-white dark:hover:bg-slate-900/80 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                              {card.term}
                            </span>
                            {card.phonetic && (
                              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                                {card.phonetic}
                              </span>
                            )}
                            {card.partOfSpeech && (
                              <span className="text-[11px] italic text-slate-400">
                                ({card.partOfSpeech})
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                card.mastery === 'mastered'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : card.mastery === 'learning'
                                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {MASTERY_LABELS[card.mastery]}
                            </span>
                            {searchScope === 'all' && cardDeckTitle && (
                              <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {cardDeckTitle}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                            {card.meaning}
                          </p>
                          {card.example && (
                            <p className="mt-0.5 truncate text-[11px] italic text-slate-500 dark:text-slate-400">
                              “{card.example}”
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => speakEnglish(card.term)}
                            aria-label={`Phát âm ${card.term}`}
                            title="Nghe phát âm"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                          >
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onToggleStar(card)}
                            aria-label={`Gắn sao ${card.term}`}
                            title="Gắn sao"
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white dark:bg-slate-900 cursor-pointer ${
                              card.starred
                                ? 'border-amber-300 text-amber-500 dark:border-amber-700 dark:text-amber-400'
                                : 'border-slate-200 text-slate-400 hover:text-amber-500 dark:border-slate-700'
                            }`}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                card.starred ? 'fill-current' : ''
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePracticeSearchedCard(card)}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              isPinned
                                ? 'bg-emerald-600 text-white'
                                : 'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
                            }`}
                          >
                            <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                            <span>{isPinned ? 'Đang luyện' : 'Luyện từ này'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
                { id: 'speak', label: 'Luyện nói AI' },
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
        filterBySearch && normalizedSearch ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Không tìm thấy thẻ nào khớp với từ khóa “{searchQuery.trim()}” trong bộ “{activeDeck.title}”.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {allCards.length > deckCards.length && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchScope('all');
                    setSearchOpen(true);
                  }}
                  className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Tìm trên tất cả bộ thẻ
                </button>
              )}
              <button
                type="button"
                onClick={handleClearSearch}
                className="min-h-[42px] rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 cursor-pointer"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            </div>
          </div>
        ) : (
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
        )
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
        <div>
          {(activeMode === 'learn' ||
            activeMode === 'quiz' ||
            activeMode === 'fill' ||
            activeMode === 'spell' ||
            activeMode === 'speak') && (
            <div className="mx-auto mb-5 max-w-4xl rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                {(
                  [
                    {
                      id: 'learn' as const,
                      title: 'Học thông minh',
                      subtitle: 'Lặp lại thẻ đến khi thuộc',
                    },
                    {
                      id: 'quiz' as const,
                      title: 'Trắc nghiệm',
                      subtitle: 'Chọn nhanh 4 đáp án',
                    },
                    {
                      id: 'fill' as const,
                      title: 'Điền từ',
                      subtitle: 'Hoàn thành câu ví dụ',
                    },
                    {
                      id: 'spell' as const,
                      title: 'Nghe & Viết',
                      subtitle: 'Luyện nghe và chính tả',
                    },
                    {
                      id: 'speak' as const,
                      title: 'Luyện nói AI',
                      subtitle: 'Ghi âm & chấm phát âm',
                    },
                  ] as const
                ).map((sub) => {
                  const selected = activeMode === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        if (!selected) {
                          onChangeMode(sub.id);
                          resetSessionState(false, true);
                        }
                      }}
                      className={`rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        sub.id === 'speak' ? 'col-span-2 sm:col-span-1' : ''
                      } ${
                        selected
                          ? 'bg-white shadow-xs dark:bg-slate-800'
                          : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div
                        className={`text-xs font-bold sm:text-sm ${
                          selected
                            ? 'text-sky-700 dark:text-sky-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {sub.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {sub.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(activeMode === 'blast' ||
            activeMode === 'meteor' ||
            activeMode === 'tank') && (
            <div className="mx-auto mb-5 max-w-3xl rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'blast' as const,
                      title: 'Xếp khối Blast',
                      subtitle: 'Ghép khối & trả lời từ vựng',
                    },
                    {
                      id: 'meteor' as const,
                      title: 'Bắn thiên thạch',
                      subtitle: 'Bắn hạ thiên thạch đúng nghĩa',
                    },
                    {
                      id: 'tank' as const,
                      title: 'Xe tăng 3D',
                      subtitle: 'Lái xe tăng phá cổng từ vựng',
                    },
                  ] as const
                ).map((sub) => {
                  const selected = activeMode === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        if (!selected) {
                          onChangeMode(sub.id);
                          resetSessionState(false, true);
                        }
                      }}
                      className={`rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-white shadow-xs dark:bg-slate-800'
                          : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div
                        className={`text-xs font-bold sm:text-sm ${
                          selected
                            ? 'text-sky-700 dark:text-sky-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {sub.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {sub.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            key={`${activeDeck.id}_${effectiveTagFilter}_${activeMode}_${filterBySearch ? normalizedSearch : ''}_${pinnedCardId || ''}_${sessionKey}`}
          >
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
            {activeMode === 'speak' && (
              <AiSpeakMode
                user={user}
                aiQuota={aiQuota}
                cards={practicePool}
                autoSpeak={autoSpeak}
                onUpdateQuota={onUpdateAiQuota}
                onOpenAuth={onOpenAuth}
                onGoToMissions={onGoToMissions}
                onComplete={handleComplete}
              />
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
        </div>
      )}
    </div>
  );
}
