'use client';

import { AppView } from '@/lib/types';

interface HeaderProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onStartQuickPractice: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'decks', label: 'Bộ thẻ' },
  { id: 'community', label: 'Kho thẻ' },
  { id: 'practice', label: 'Luyện tập' },
  { id: 'ai', label: 'Chat AI' },
  { id: 'leaderboard', label: 'BXH & Chuỗi' },
];

export function Header({
  activeView,
  onNavigate,
  onStartQuickPractice,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex h-[52px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:h-16 md:gap-8">
        <button
          type="button"
          onClick={() => onNavigate('decks')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 transition-colors hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 dark:text-slate-100 dark:hover:text-sky-400 sm:text-xl whitespace-nowrap shrink-0 cursor-pointer"
        >
          LexiCard
        </button>

        <nav
          aria-label="Điều hướng chính"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-sky-600 dark:bg-sky-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onStartQuickPractice}
            className="min-h-[38px] md:min-h-[40px] rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 md:px-4 md:py-2 md:text-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            Luyện tập ngay
          </button>
        </div>
      </div>
    </header>
  );
}
