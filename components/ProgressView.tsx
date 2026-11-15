'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Deck,
  Flashcard,
  LIMITS,
  MODE_LABELS,
  PracticeMode,
  StudySession,
  getTodayDateKey,
} from '@/lib/types';

interface ProgressViewProps {
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySession[];
  dailyGoal: number;
  onUpdateDailyGoal: (goal: number) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onStartPractice: (deckId: string, mode: PracticeMode) => void;
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
      year: 'numeric',
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

export function ProgressView({
  decks,
  cards,
  sessions,
  dailyGoal,
  onUpdateDailyGoal,
  onDeleteSession,
  onStartPractice,
}: ProgressViewProps) {
  const [modeFilter, setModeFilter] = useState<'all' | PracticeMode>('all');
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

  const avgAccuracy = useMemo(() => {
    if (sessions.length === 0) return 0;
    const sum = sessions.reduce((acc, s) => acc + s.accuracy, 0);
    return Math.round(sum / sessions.length);
  }, [sessions]);

  const masteredCount = useMemo(
    () => cards.filter((c) => c.mastery === 'mastered').length,
    [cards]
  );

  const learningCount = useMemo(
    () => cards.filter((c) => c.mastery === 'learning').length,
    [cards]
  );

  const streakDays = useMemo(() => computeStreak(sessions), [sessions]);

  const last7Days = useMemo(() => {
    const days: Array<{
      dateKey: string;
      label: string;
      items: number;
      sessionsCount: number;
    }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = getTodayDateKey(d);
      const daySessions = sessions.filter((s) => s.dateKey === key);
      const items = daySessions.reduce((sum, s) => sum + s.totalItems, 0);
      days.push({
        dateKey: key,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(
          d.getMonth() + 1
        ).padStart(2, '0')}`,
        items,
        sessionsCount: daySessions.length,
      });
    }
    return days;
  }, [sessions]);

  const maxDailyItems = Math.max(
    dailyGoal,
    ...last7Days.map((d) => d.items),
    10
  );

  const filteredSessions = useMemo(() => {
    if (modeFilter === 'all') return sessions;
    return sessions.filter((s) => s.mode === modeFilter);
  }, [sessions, modeFilter]);

  const goalPct = Math.min(100, Math.round((todayReviewed / dailyGoal) * 100));

  async function saveGoal() {
    const num = Number(goalDraft);
    if (Number.isFinite(num)) {
      await onUpdateDailyGoal(num);
    }
    setEditingGoal(false);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl text-balance">
            Tiến độ & Lịch sử Học tập
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Theo dõi mức độ thành thạo từ vựng, chuỗi ngày duy trì và nhật ký luyện tập.
          </p>
        </div>

        {/* Daily Goal Widget */}
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

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tổng phiên học
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
            {sessions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {sessions.reduce((s, x) => s + x.totalItems, 0)} lượt trả lời
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Độ chính xác TB
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-sky-600 dark:text-sky-400 sm:text-3xl">
            {avgAccuracy}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Trên mọi chế độ
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Từ đã thành thạo
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-3xl">
            {masteredCount}
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500 sm:text-base">
              /{cards.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {learningCount} từ đang ôn
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Chuỗi ngày học
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
            {streakDays}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 sm:text-base">
              ngày
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {todayReviewed > 0 ? 'Đã học hôm nay' : 'Chưa học hôm nay'}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:col-span-7">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Hoạt động 7 ngày gần nhất
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Số lượt từ vựng đã ôn tập mỗi ngày (mục tiêu: {dailyGoal} lượt/ngày)
            </p>
          </div>

          <div className="mt-5">
            <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44 pt-4">
              {last7Days.map((day) => {
                const heightPct =
                  day.items > 0
                    ? Math.max(8, Math.round((day.items / maxDailyItems) * 100))
                    : 4;
                const hitGoal = day.items >= dailyGoal;
                return (
                  <div
                    key={day.dateKey}
                    className="flex h-full flex-col items-center justify-end gap-2"
                  >
                    <span className="font-mono-tabular text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-300">
                      {day.items}
                    </span>
                    <div className="relative flex w-full max-w-[38px] flex-1 items-end rounded-md bg-slate-100 dark:bg-slate-800/70">
                      <div
                        title={`${day.label}: ${day.items} lượt (${day.sessionsCount} phiên)`}
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
                    <span className="font-mono-tabular text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:col-span-5">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            Tiến độ từng bộ thẻ
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tỉ lệ từ vựng đạt mức Đã thuộc
          </p>

          <div className="mt-5 space-y-4">
            {decks.map((deck) => {
              const pct =
                deck.cardCount > 0
                  ? Math.round((deck.masteredCount / deck.cardCount) * 100)
                  : 0;
              return (
                <div key={deck.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onStartPractice(deck.id, 'flip')}
                      className="truncate font-medium text-slate-800 hover:text-sky-600 dark:text-slate-200 dark:hover:text-sky-400 cursor-pointer text-left"
                    >
                      {deck.title}
                    </button>
                    <span className="font-mono-tabular text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                      {deck.masteredCount}/{deck.cardCount} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all duration-300 dark:bg-sky-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Study Session History Log */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Nhật ký Lịch sử Luyện tập
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tự động lưu sau mỗi phiên học tập hoặc bài kiểm tra.
            </p>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'flip', label: 'Lật thẻ' },
                { id: 'learn', label: 'Học thông minh' },
                { id: 'quiz', label: 'Trắc nghiệm' },
                { id: 'fill', label: 'Điền từ' },
                { id: 'match', label: 'Nối thẻ' },
                { id: 'spell', label: 'Nghe & Viết' },
                { id: 'test', label: 'Kiểm tra' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setModeFilter(f.id)}
                className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  modeFilter === f.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredSessions.length > 0 ? (
          <>
            {/* Mobile Compact Session Cards (< sm) */}
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800 sm:hidden">
              {filteredSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="flex items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {sess.deckTitle}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {MODE_LABELS[sess.mode]} ·{' '}
                      <span className="font-mono-tabular">
                        {sess.correctCount}/{sess.totalItems}
                      </span>{' '}
                      ·{' '}
                      <span className="font-mono-tabular">
                        {formatDuration(sess.durationSeconds)}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-[11px] text-slate-400">
                      {formatTimestamp(sess.completedAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`font-mono-tabular text-sm font-bold ${
                        sess.accuracy >= 80
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : sess.accuracy >= 50
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {sess.accuracy}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(sess.id)}
                      aria-label="Xóa phiên học này"
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Full Table (sm+) */}
            <div className="mt-5 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="pb-3 pr-4">Thời gian</th>
                    <th className="pb-3 pr-4">Bộ thẻ</th>
                    <th className="pb-3 pr-4">Chế độ</th>
                    <th className="pb-3 pr-4 text-right">Kết quả</th>
                    <th className="pb-3 pr-4 text-right">Chính xác</th>
                    <th className="pb-3 pr-4 text-right">Thời lượng</th>
                    <th className="pb-3 text-right">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredSessions.map((sess) => (
                    <tr
                      key={sess.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatTimestamp(sess.completedAt)}
                      </td>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        {sess.deckTitle}
                      </td>
                      <td className="py-3 pr-4 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {MODE_LABELS[sess.mode]}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-slate-800 dark:text-slate-200">
                        {sess.correctCount}/{sess.totalItems}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-mono-tabular font-semibold ${
                          sess.accuracy >= 80
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : sess.accuracy >= 50
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {sess.accuracy}%
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                        {formatDuration(sess.durationSeconds)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteSession(sess.id)}
                          aria-label="Xóa phiên học này"
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Chưa có phiên luyện tập nào được ghi lại. Hãy chọn một bộ thẻ và hoàn thành bài tập đầu tiên!
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
