'use client';

import { Gamepad2, Globe, Layers, Trophy } from 'lucide-react';
import { AppView } from '@/lib/types';

interface MobileBottomNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
}

export function MobileBottomNav({
  activeView,
  onSelectView,
}: MobileBottomNavProps) {
  const items: Array<{
    id: AppView;
    label: string;
    icon: typeof Layers;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'decks',
      label: 'Bộ thẻ',
      icon: Layers,
      active: activeView === 'decks',
      onClick: () => onSelectView('decks'),
    },
    {
      id: 'community',
      label: 'Kho thẻ',
      icon: Globe,
      active: activeView === 'community',
      onClick: () => onSelectView('community'),
    },
    {
      id: 'practice',
      label: 'Luyện tập',
      icon: Gamepad2,
      active: activeView === 'practice',
      onClick: () => onSelectView('practice'),
    },
    {
      id: 'leaderboard',
      label: 'BXH & Chuỗi',
      icon: Trophy,
      active: activeView === 'leaderboard',
      onClick: () => onSelectView('leaderboard'),
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
