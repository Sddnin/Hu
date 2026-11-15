'use client';

import { useMemo, useState } from 'react';
import {
  Award,
  Flame,
  RefreshCw,
  Star,
  Trash2,
  Trophy,
  Volume2,
} from 'lucide-react';
import { PracticePoolFilter } from '@/components/PracticeArena';
import { speakEnglish } from '@/lib/speech';
import {
  Deck,
  Flashcard,
  LEADERBOARD_MODE_LABELS,
  LIMITS,
  LeaderboardEntry,
  LeaderboardMode,
  MODE_LABELS,
  PracticeMode,
  StreakLeaderboardEntry,
  StudySession,
  getTodayDateKey,
} from '@/lib/types';

interface LeaderboardStreakViewProps {
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySession[];
  dailyGoal: number;
  leaderboardEntries: LeaderboardEntry[];
  streakLeaders: StreakLeaderboardEntry[];
  onRefreshLeaderboard: (filters?: {
    deckId?: string;
    mode?: string;
  }) => Promise<void>;
  onUpdateDailyGoal: (goal: number) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onToggleStar: (card: Flashcard) => Promise<void>;
  onStartPractice: (
    deckId: string,
    mode: PracticeMode,
    filter?: PracticePoolFilter
  ) => void;
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}p ${String(rem).padStart(2, '0')}s`;
}

function formatTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

function computeStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0;
  const activeDates = new Set(sessions.map((s) => s.dateKey));
  let streak = 0;
  const cursor = new Date();
  const todayKey = getTodayDateKey(cursor);
  if (!activeDates.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const key = getTodayDateKey(cursor);
    if (activeDates.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

const LEADERBOARD_FILTERS: Array<{ id: 'all' | LeaderboardMode; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'blast', label: 'Xếp khối Blast' },
  { id: 'meteor', label: 'Bắn thiên thạch' },
  { id: 'match_grid', label: 'Ghép thẻ 4×3' },
  { id: 'match_memory', label: 'Lật thẻ 4×4' },
  { id: 'match_columns', label: 'Nối 2 cột' },
  { id: 'test', label: 'Kiểm tra' },
  { id: 'quiz', label: 'Trắc nghiệm' },
];

export function LeaderboardStreakView({
  decks,
  cards,
  sessions,
  dailyGoal,
  leaderboardEntries,
  streakLeaders,
  onRefreshLeaderboard,
  onUpdateDailyGoal,
  onDeleteSession,
  onToggleStar,
  onStartPractice,
}: LeaderboardStreakViewProps) {
  const [lbTab, setLbTab] = useState<'games' | 'streak'>('games');
  const [lbModeFilter, setLbModeFilter] = useState<'all' | LeaderboardMode>('all');
  const [lbDeckFilter, setLbDeckFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(dailyGoal));

  const todayKey = getTodayDateKey();
  const todayReviewed = useMemo(
    () =>
      sessions
        .filter((s) => s.dateKey === todayKey)
        .reduce((sum, s) => sum + s.totalItems, 0),
    [sessions, todayKey]
  );

  const streakDays = useMemo(() => computeStreak(sessions), [sessions]);
  const masteredCount = useMemo(
    () => cards.filter((c) => c.mastery === 'mastered').length,
    [cards]
  );

  const personalBestScore = useMemo(
    () => leaderboardEntries.reduce((max, e) => Math.max(max, e.score), 0),
    [leaderboardEntries]
  );

  const last7Days = useMemo(() => {
    const days: Array<{
      dateKey: string;
      label: string;
      items: number;
    }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = getTodayDateKey(d);
      const items = sessions
        .filter((s) => s.dateKey === key)
        .reduce((sum, s) => sum + s.totalItems, 0);
      days.push({
        dateKey: key,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(
          d.getMonth() + 1
        ).padStart(2, '0')}`,
        items,
      });
    }
    return days;
  }, [sessions]);

  const maxDailyItems = Math.max(
    dailyGoal,
    ...last7Days.map((d) => d.items),
    10
  );

  const filteredEntries = useMemo(() => {
    const sorted = leaderboardEntries
      .filter((e) => {
        if (lbModeFilter !== 'all' && e.mode !== lbModeFilter) return false;
        if (lbDeckFilter !== 'all' && e.deckId !== lbDeckFilter) return false;
        return true;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.accuracy - a.accuracy ||
          a.durationSeconds - b.durationSeconds ||
          b.createdAt - a.createdAt
      );
    const seen = new Set<string>();
    const deduped: LeaderboardEntry[] = [];
    for (const e of sorted) {
      const playerKey = e.userId || e.playerName.trim().toLowerCase();
      const key = lbDeckFilter !== 'all' ? playerKey : `${playerKey}__${e.deckId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
      if (deduped.length >= 25) break;
    }
    return deduped;
  }, [leaderboardEntries, lbModeFilter, lbDeckFilter]);

  const deckTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of decks) map.set(d.id, d.title);
    return map;
  }, [decks]);

  const weakWords = useMemo(() => {
    return cards
      .filter((c) => c.reviewCount > 0 && c.correctCount / c.reviewCount < 0.8)
      .map((c) => ({
        card: c,
        accuracy: Math.round((c.correctCount / c.reviewCount) * 100),
        deckTitle: deckTitleMap.get(c.deckId) || 'Bộ thẻ',
      }))
      .sort(
        (a, b) => a.accuracy - b.accuracy || b.card.reviewCount - a.card.reviewCount
      )
      .slice(0, 6);
  }, [cards, deckTitleMap]);

  const goalPct = Math.min(100, Math.round((todayReviewed / dailyGoal) * 100));

  async function saveGoal() {
    const num = Number(goalDraft);
    if (Number.isFinite(num)) {
      await onUpdateDailyGoal(num);
    }
    setEditingGoal(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshLeaderboard({ deckId: lbDeckFilter, mode: lbModeFilter });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header & Daily Goal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Bảng xếp hạng & Chuỗi ngày học
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Theo dõi chuỗi duy trì (Streak), điểm cao trò chơi từ vựng và thứ hạng theo từng bộ thẻ.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs">
            <div className="text-slate-500 dark:text-slate-400">
              Mục tiêu hôm nay
            </div>
            <div className="mt-0.5 font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
              {todayReviewed} / {dailyGoal} lượt ({goalPct}%)
            </div>
          </div>

          {editingGoal ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={LIMITS.DAILY_GOAL_MIN}
                max={LIMITS.DAILY_GOAL_MAX}
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                aria-label="Mục tiêu lượt ôn mỗi ngày"
                className="min-h-[36px] w-16 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono-tabular text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={saveGoal}
                className="min-h-[36px] rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold text-white cursor-pointer"
              >
                Lưu
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGoalDraft(String(dailyGoal));
                setEditingGoal(true);
              }}
              className="min-h-[36px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Đổi mục tiêu
            </button>
          )}
        </div>
      </div>

      {/* Streak & KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 sm:p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Flame className="h-4 w-4" aria-hidden="true" />
            <span>Chuỗi ngày học</span>
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
            {streakDays}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              ngày
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {todayReviewed > 0 ? 'Đã giữ chuỗi hôm nay' : 'Học 1 lượt để giữ chuỗi'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Trophy className="h-4 w-4 text-sky-500" aria-hidden="true" />
            <span>Điểm cao nhất</span>
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-sky-600 dark:text-sky-400 sm:text-3xl">
            {personalBestScore}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Kỷ lục cá nhân
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Từ đã thành thạo
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-3xl">
            {masteredCount}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              /{cards.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tổng từ ghi nhớ
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tổng phiên luyện tập
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
            {sessions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {sessions.reduce((s, x) => s + x.totalItems, 0)} câu đã làm
          </div>
        </div>
      </div>

      {/* Main Leaderboard + 7-Day Streak Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Leaderboard Section (Left 8 cols) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:col-span-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLbTab('games')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  lbTab === 'games'
                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>BXH Trò chơi & Luyện tập</span>
              </button>
              <button
                type="button"
                onClick={() => setLbTab('streak')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  lbTab === 'streak'
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400'
                }`}
              >
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                <span>BXH Chuỗi học tập</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Làm mới</span>
            </button>
          </div>

          {lbTab === 'games' ? (
            <>
              {/* Mode & Deck Filters */}
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {LEADERBOARD_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLbModeFilter(f.id)}
                      className={`min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        lbModeFilter === f.id
                          ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Lọc bảng xếp hạng theo bộ thẻ"
                  value={lbDeckFilter}
                  onChange={(e) => setLbDeckFilter(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="all">Tất cả bộ thẻ</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  Chưa có điểm xếp hạng ở chế độ này. Hãy chơi <strong>Xếp khối Blast</strong>, <strong>Bắn thiên thạch</strong> hoặc <strong>Ghép thẻ 4×3 / Lật thẻ 4×4</strong> để ghi tên lên bảng!
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEntries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono-tabular text-xs font-bold shrink-0 ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : idx === 1
                                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : idx === 2
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                                  : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {entry.playerName}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {LEADERBOARD_MODE_LABELS[entry.mode] || entry.mode} ·{' '}
                            {entry.deckTitle}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono-tabular text-sm font-bold text-sky-600 dark:text-sky-400">
                          {entry.score} điểm
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.accuracy}% · {formatDuration(entry.durationSeconds)}
                          {entry.streak > 1 ? ` · Chuỗi ${entry.streak}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : streakLeaders.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Đăng nhập tài khoản để tham gia Bảng xếp hạng Chuỗi ngày học cùng cộng đồng!
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {streakLeaders.map((u, idx) => (
                <div
                  key={u.userId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono-tabular text-xs font-bold shrink-0 ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {u.displayName}
                      </div>
                      <div className="truncate font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        @{u.username} · {u.masteredCount} từ đã thuộc ·{' '}
                        {u.totalSessions} phiên
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 font-mono-tabular text-sm font-bold text-amber-600 dark:text-amber-400">
                      <Flame className="h-4 w-4" aria-hidden="true" />
                      {u.streakDays} ngày
                    </div>
                    <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                      {u.totalScore} tổng điểm
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right 4 cols: 7-Day Streak Activity Chart */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:col-span-4">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Lịch chuỗi 7 ngày gần nhất
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Mục tiêu mỗi ngày: {dailyGoal} lượt ôn tập
          </p>

          <div className="mt-5 grid grid-cols-7 gap-2 items-end h-44 pt-3">
            {last7Days.map((day) => {
              const heightPct =
                day.items > 0
                  ? Math.max(10, Math.round((day.items / maxDailyItems) * 100))
                  : 4;
              const hitGoal = day.items >= dailyGoal;
              return (
                <div
                  key={day.dateKey}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <span className="font-mono-tabular text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {day.items}
                  </span>
                  <div className="relative flex w-full max-w-[34px] flex-1 items-end rounded-md bg-slate-100 dark:bg-slate-800/70">
                    <div
                      className={`w-full rounded-md transition-all duration-300 ${
                        day.items === 0
                          ? 'bg-slate-200 dark:bg-slate-800'
                          : hitGoal
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : 'bg-sky-600 dark:bg-sky-500'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="font-mono-tabular text-[10px] text-slate-500 dark:text-slate-400">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Weak Words Notebook */}
      {weakWords.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Sổ tay từ hay sai cần ôn tập
          </h2>
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {weakWords.map(({ card, accuracy, deckTitle }) => (
              <div
                key={card.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {card.term}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {deckTitle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {card.meaning}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-tabular text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {accuracy}%
                  </span>
                  <button
                    type="button"
                    onClick={() => speakEnglish(card.term)}
                    aria-label={`Phát âm ${card.term}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStar(card)}
                    aria-label="Gắn sao"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer ${
                      card.starred ? 'text-amber-500' : 'text-slate-400'
                    }`}
                  >
                    <Star
                      className={`h-4 w-4 ${card.starred ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartPractice(card.deckId, 'learn', 'weak')}
                    className="min-h-[34px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-sky-600 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Ôn lại
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Session History */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Lịch sử phiên học gần đây
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Chưa có phiên luyện tập nào được ghi lại.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {sessions.slice(0, 12).map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {sess.deckTitle}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {MODE_LABELS[sess.mode]} · {sess.correctCount}/{sess.totalItems}{' '}
                    · {formatDuration(sess.durationSeconds)} ·{' '}
                    {formatTimestamp(sess.completedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-tabular font-bold text-sky-600 dark:text-sky-400">
                    {sess.accuracy}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(sess.id)}
                    aria-label="Xóa phiên"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
