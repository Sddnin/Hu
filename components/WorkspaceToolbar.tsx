'use client';

import { User } from 'firebase/auth';
import { Cloud, CloudOff, LogOut, Moon, Sun } from 'lucide-react';
import { Deck } from '@/lib/types';

interface WorkspaceToolbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: (next: 'light' | 'dark') => void;
  user: User | null;
  authReady: boolean;
  syncing: boolean;
  syncError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  decks: Deck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  todayReviewedCount: number;
  dailyGoal: number;
}

export function WorkspaceToolbar({
  theme,
  onToggleTheme,
  user,
  authReady,
  syncing,
  syncError,
  onSignIn,
  onSignOut,
  decks,
  selectedDeckId,
  onSelectDeck,
  todayReviewedCount,
  dailyGoal,
}: WorkspaceToolbarProps) {
  return (
    <div className="border-b border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label
            htmlFor="active-deck-select"
            className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
          >
            Bộ thẻ đang chọn:
          </label>
          <select
            id="active-deck-select"
            value={selectedDeckId}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="max-w-[240px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.cardCount} thẻ)
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            className="hidden text-slate-300 dark:text-slate-700 sm:inline"
          >
            /
          </span>
          <span className="hidden text-xs text-slate-600 dark:text-slate-400 font-mono-tabular sm:inline whitespace-nowrap">
            Hôm nay: {todayReviewedCount}/{dailyGoal} lượt
          </span>
        </div>

        <div className="flex items-center gap-3">
          {syncError && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {syncError}
            </span>
          )}

          {/* Theme Switcher */}
          <div
            role="group"
            aria-label="Chế độ giao diện"
            className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => onToggleTheme('light')}
              aria-pressed={theme === 'light'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sáng</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tối</span>
            </button>
          </div>

          {/* Cloud Sync / Google Auth */}
          {authReady && (
            <>
              {user ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
                  <Cloud
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="max-w-[130px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {syncing
                      ? 'Đang đồng bộ...'
                      : user.displayName || user.email}
                  </span>
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Đăng xuất"
                    aria-label="Đăng xuất"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CloudOff
                    className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400"
                    aria-hidden="true"
                  />
                  <span>Lưu đám mây (Google)</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
