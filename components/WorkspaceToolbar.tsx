'use client';

import { LogIn, LogOut, Moon, Sun, UserCheck } from 'lucide-react';
import { AuthUser, Deck } from '@/lib/types';

interface WorkspaceToolbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: (next: 'light' | 'dark') => void;
  user: AuthUser | null;
  authReady: boolean;
  syncing: boolean;
  syncError: string | null;
  onOpenAuth: () => void;
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
  onOpenAuth,
  onSignOut,
  decks,
  selectedDeckId,
  onSelectDeck,
  todayReviewedCount,
  dailyGoal,
}: WorkspaceToolbarProps) {
  return (
    <div className="border-b border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2.5 text-sm min-w-0">
          <label
            htmlFor="active-deck-select"
            className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 sm:inline whitespace-nowrap"
          >
            Bộ thẻ:
          </label>
          <select
            id="active-deck-select"
            value={selectedDeckId}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="min-h-[38px] max-w-[180px] sm:max-w-[260px] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.cardCount})
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            className="hidden text-slate-300 dark:text-slate-700 md:inline"
          >
            /
          </span>
          <span className="hidden text-xs text-slate-600 dark:text-slate-400 font-mono-tabular md:inline whitespace-nowrap">
            Hôm nay: {todayReviewedCount}/{dailyGoal} lượt
          </span>
        </div>

        <div className="flex items-center gap-2">
          {syncError && (
            <span className="hidden text-xs text-red-600 dark:text-red-400 sm:inline">
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
              className={`flex min-h-[34px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Sáng</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`flex min-h-[34px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Tối</span>
            </button>
          </div>

          {/* Account Auth (Username & Password backed by Neon) */}
          {authReady && (
            <>
              {user ? (
                <div className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
                  <UserCheck
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="max-w-[120px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                    {syncing ? 'Đang lưu...' : user.displayName || user.username}
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
                  onClick={onOpenAuth}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn
                    className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400"
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Đăng nhập / Đăng ký</span>
                  <span className="sm:hidden">Tài khoản</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
