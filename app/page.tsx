'use client';

import { useMemo, useState } from 'react';
import { DecksView } from '@/components/DecksView';
import { Header } from '@/components/Header';
import { PracticeArena } from '@/components/PracticeArena';
import { ProgressView } from '@/components/ProgressView';
import { WorkspaceToolbar } from '@/components/WorkspaceToolbar';
import { useFlashcardStore } from '@/hooks/use-flashcard-store';
import { AppView, PracticeMode, getTodayDateKey } from '@/lib/types';

export default function HomePage() {
  const store = useFlashcardStore();
  const [activeView, setActiveView] = useState<AppView>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [activeMode, setActiveMode] = useState<PracticeMode>('flip');

  const effectiveSelectedDeckId = useMemo(() => {
    if (store.decks.length === 0) return '';
    if (selectedDeckId && store.decks.some((d) => d.id === selectedDeckId)) {
      return selectedDeckId;
    }
    return store.decks[0].id;
  }, [store.decks, selectedDeckId]);

  const todayKey = getTodayDateKey();
  const todayReviewedCount = useMemo(
    () =>
      store.sessions
        .filter((s) => s.dateKey === todayKey)
        .reduce((sum, s) => sum + s.totalItems, 0),
    [store.sessions, todayKey]
  );

  function handleStartPractice(deckId: string, mode: PracticeMode) {
    setSelectedDeckId(deckId);
    setActiveMode(mode);
    setActiveView('practice');
  }

  function handleStartQuickPractice() {
    if (effectiveSelectedDeckId) {
      setSelectedDeckId(effectiveSelectedDeckId);
    }
    setActiveView('practice');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        activeView={activeView}
        onNavigate={setActiveView}
        onStartQuickPractice={handleStartQuickPractice}
      />

      <WorkspaceToolbar
        theme={store.theme}
        onToggleTheme={store.toggleTheme}
        user={store.user}
        authReady={store.authReady}
        syncing={store.syncing}
        syncError={store.syncError}
        onSignIn={store.signInWithGoogle}
        onSignOut={store.signOutUser}
        decks={store.decks}
        selectedDeckId={effectiveSelectedDeckId}
        onSelectDeck={setSelectedDeckId}
        todayReviewedCount={todayReviewedCount}
        dailyGoal={store.dailyGoal}
      />

      <main className="flex-1">
        {!store.hydrated ? (
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div className="h-8 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="h-72 rounded-xl bg-slate-200/70 dark:bg-slate-900 lg:col-span-4" />
              <div className="h-96 rounded-xl bg-slate-200/70 dark:bg-slate-900 lg:col-span-8" />
            </div>
          </div>
        ) : activeView === 'decks' ? (
          <DecksView
            decks={store.decks}
            cardsByDeck={store.cardsByDeck}
            selectedDeckId={effectiveSelectedDeckId}
            onSelectDeck={setSelectedDeckId}
            onStartPractice={handleStartPractice}
            onCreateDeck={store.createDeck}
            onUpdateDeck={store.updateDeck}
            onDeleteDeck={store.deleteDeck}
            onAddCard={store.addCard}
            onBulkAddCards={store.bulkAddCards}
            onUpdateCard={store.updateCard}
            onDeleteCard={store.deleteCard}
          />
        ) : activeView === 'practice' ? (
          <PracticeArena
            decks={store.decks}
            allCards={store.cards}
            cardsByDeck={store.cardsByDeck}
            selectedDeckId={effectiveSelectedDeckId}
            onSelectDeck={setSelectedDeckId}
            activeMode={activeMode}
            onChangeMode={setActiveMode}
            onRecordResults={store.recordPracticeResults}
            onViewProgress={() => setActiveView('progress')}
            onBackToDecks={() => setActiveView('decks')}
          />
        ) : (
          <ProgressView
            decks={store.decks}
            cards={store.cards}
            sessions={store.sessions}
            dailyGoal={store.dailyGoal}
            onUpdateDailyGoal={store.updateDailyGoal}
            onDeleteSession={store.deleteStudySession}
            onStartPractice={handleStartPractice}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <span>LexiCard · Luyện tập Flashcard thông minh</span>
          <span>Phím tắt lật thẻ: Space lật · 1 / 2 / 3 đánh giá mức nhớ</span>
        </div>
      </footer>
    </div>
  );
}
