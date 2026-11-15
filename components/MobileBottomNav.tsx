'use client';

import { BarChart3, BookOpen, ClipboardCheck, Layers } from 'lucide-react';
import { AppView, PracticeMode } from '@/lib/types';

interface MobileBottomNavProps {
  activeView: AppView;
  activeMode: PracticeMode;
  onSelectView: (view: AppView) => void;
  onStartTest: () => void;
}

export function MobileBottomNav({
  activeView,
  activeMode,
  onSelectView,
  onStartTest,
}: MobileBottomNavProps) {
  const isTestActive = activeView === 'practice' && activeMode === 'test';
  const isPracticeActive = activeView === 'practice' && activeMode !== 'test';

  const items = [
    {
      id: 'decks',
      label: 'Bộ thẻ',
      icon: Layers,
      active: activeView === 'decks',
      onClick: () => onSelectView('decks'),
    },
    {
      id: 'practice',
      label: 'Luyện tập',
      icon: BookOpen,
      active: isPracticeActive,
      onClick: () => onSelectView('practice'),
    },
    {
      id: 'test',
      label: 'Kiểm tra',
      icon: ClipboardCheck,
      active: isTestActive,
      onClick: onStartTest,
    },
    {
      id: 'progress',
      label: 'Tiến độ',
      icon: BarChart3,
      active: activeView === 'progress',
      onClick: () => onSelectView('progress'),
    },
  ];

  return (
    <nav
      aria-label="Điều hướng di động"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
    >
      <div className="grid h-14 grid-cols-4 items-center">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-current={item.active ? 'page' : undefined}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                item.active
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
