'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { AccountTab } from '@/components/AccountModal';
import { PWAInstallButton } from '@/components/PWAControls';
import { AuthUser } from '@/lib/types';

interface WorkspaceToolbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: (next: 'light' | 'dark') => void;
  user: AuthUser | null;
  authReady: boolean;
  syncing: boolean;
  syncError: string | null;
  onOpenAuth: () => void;
  onOpenAccount: (tab: AccountTab) => void;
  onSignOut: () => void;
  todayReviewedCount: number;
  dailyGoal: number;
  streakDays: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function WorkspaceToolbar({
  theme,
  onToggleTheme,
  user,
  authReady,
  syncing,
  syncError,
  onOpenAuth,
  onOpenAccount,
  onSignOut,
  todayReviewedCount,
  dailyGoal,
  streakDays,
}: WorkspaceToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const goalPct = Math.min(
    100,
    Math.round((todayReviewedCount / Math.max(1, dailyGoal)) * 100)
  );

  return (
    <div className="border-b border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        {/* Left: Workspace Daily Progress & Streak */}
        <div className="flex min-w-0 items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
              Hôm nay: {todayReviewedCount}/{dailyGoal}
            </span>
            <div
              aria-hidden="true"
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 sm:block"
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  goalPct >= 100
                    ? 'bg-emerald-600 dark:bg-emerald-500'
                    : 'bg-sky-600 dark:bg-sky-500'
                }`}
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>

          {streakDays > 0 && (
            <>
              <span
                aria-hidden="true"
                className="hidden text-slate-300 dark:text-slate-700 sm:inline"
              >
                ·
              </span>
              <span className="hidden font-mono-tabular whitespace-nowrap sm:inline">
                Chuỗi {streakDays} ngày
              </span>
            </>
          )}

          {syncError && (
            <>
              <span
                aria-hidden="true"
                className="hidden text-slate-300 dark:text-slate-700 md:inline"
              >
                ·
              </span>
              <span className="hidden truncate text-red-600 dark:text-red-400 md:inline">
                {syncError}
              </span>
            </>
          )}
        </div>

        {/* Right: Theme Switcher & Account Menu */}
        <div className="flex items-center gap-2 shrink-0">
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

          <PWAInstallButton />

          {authReady && (
            <>
              {user ? (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    className="flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 cursor-pointer"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-600 text-[11px] font-bold text-white dark:bg-sky-500 dark:text-slate-950 shrink-0">
                      {getInitials(user.displayName || user.username)}
                    </span>
                    <span className="max-w-[100px] sm:max-w-[150px] truncate">
                      {syncing
                        ? 'Đang lưu...'
                        : user.displayName || user.username}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                        menuOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                        <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {user.displayName}
                        </div>
                        <div className="truncate font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                          @{user.username}
                        </div>
                      </div>

                      <div className="py-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onOpenAccount('profile');
                          }}
                          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Settings className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span>Hồ sơ & Mục tiêu</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onOpenAccount('password');
                          }}
                          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span>Đổi mật khẩu</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onOpenAccount('backup');
                          }}
                          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span>Sao lưu / Khôi phục JSON</span>
                        </button>
                      </div>

                      <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onSignOut();
                          }}
                          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    </div>
                  )}
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
