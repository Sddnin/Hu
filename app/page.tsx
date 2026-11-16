'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Layers } from 'lucide-react';
import type { AccountTab } from '@/components/AccountModal';
import { Header } from '@/components/Header';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { OfflineIndicator } from '@/components/PWAControls';
import { WorkspaceToolbar } from '@/components/WorkspaceToolbar';
import type { PracticePoolFilter } from '@/components/PracticeArena';
import { useFlashcardStore } from '@/hooks/use-flashcard-store';
import type { MissionTargetAction } from '@/lib/missions';
import { AppView, PracticeMode, StudySession, getTodayDateKey } from '@/lib/types';

const ScreenLoading = () => (
  <div
    className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-4 py-12 text-sm text-slate-500 dark:text-slate-400"
    role="status"
    aria-live="polite"
  >
    Đang tải màn hình...
  </div>
);

// Modals (and their animation runtime) are loaded only after the user opens them.
const AccountModal = dynamic(
  () => import('@/components/AccountModal').then((mod) => mod.AccountModal),
  { loading: () => null }
);
const AuthModal = dynamic(
  () => import('@/components/AuthModal').then((mod) => mod.AuthModal),
  { loading: () => null }
);

// Each major screen is loaded only when the user opens that tab.
const AiTutorView = dynamic(
  () => import('@/components/AiTutorView').then((mod) => mod.AiTutorView),
  { loading: ScreenLoading }
);
const CommunityView = dynamic(
  () => import('@/components/CommunityView').then((mod) => mod.CommunityView),
  { loading: ScreenLoading }
);
const DecksView = dynamic(
  () => import('@/components/DecksView').then((mod) => mod.DecksView),
  { loading: ScreenLoading }
);
const LeaderboardStreakView = dynamic(
  () =>
    import('@/components/LeaderboardStreakView').then(
      (mod) => mod.LeaderboardStreakView
    ),
  { loading: ScreenLoading }
);
const MissionsView = dynamic(
  () => import('@/components/MissionsView').then((mod) => mod.MissionsView),
  { loading: ScreenLoading }
);
const PracticeArena = dynamic(
  () => import('@/components/PracticeArena').then((mod) => mod.PracticeArena),
  { loading: ScreenLoading }
);

function computeStreakDays(sessions: StudySession[]): number {
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

export default function HomePage() {
  const store = useFlashcardStore();
  const [activeView, setActiveView] = useState<AppView>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [activeMode, setActiveMode] = useState<PracticeMode>('flip');
  const [poolFilter, setPoolFilter] = useState<PracticePoolFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalLoaded, setAuthModalLoaded] = useState(false);
  const [accountModalLoaded, setAccountModalLoaded] = useState(false);
  const [accountModalState, setAccountModalState] = useState<{
    open: boolean;
    tab: AccountTab;
  }>({ open: false, tab: 'profile' });
  const publicRefreshAt = useRef({ community: 0, leaderboard: 0 });

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

  const streakDays = useMemo(
    () => computeStreakDays(store.sessions),
    [store.sessions]
  );

  // Public data is fetched on demand instead of blocking the initial workspace load.
  useEffect(() => {
    if (!store.hydrated) return;

    const now = Date.now();
    const refreshCooldownMs = 30_000;

    if (
      activeView === 'community' &&
      now - publicRefreshAt.current.community >= refreshCooldownMs
    ) {
      publicRefreshAt.current.community = now;
      void store.refreshCommunityDecks();
    }

    if (
      activeView === 'leaderboard' &&
      now - publicRefreshAt.current.leaderboard >= refreshCooldownMs
    ) {
      publicRefreshAt.current.leaderboard = now;
      void store.refreshLeaderboard();
    }
  }, [
    activeView,
    store.hydrated,
    store.refreshCommunityDecks,
    store.refreshLeaderboard,
  ]);

  function handleOpenAuth() {
    setAuthModalLoaded(true);
    setAuthModalOpen(true);
  }

  function handleOpenAccount(tab: AccountTab) {
    setAccountModalLoaded(true);
    setAccountModalState({ open: true, tab });
  }

  function handleStartPractice(
    deckId: string,
    mode: PracticeMode = 'flip',
    filter: PracticePoolFilter = 'all',
    tag = 'all'
  ) {
    setSelectedDeckId(deckId);
    setActiveMode(mode);
    setPoolFilter(filter);
    setTagFilter(tag || 'all');
    setActiveView('practice');
  }

  function handleStartQuickPractice() {
    if (effectiveSelectedDeckId) {
      setSelectedDeckId(effectiveSelectedDeckId);
    }
    setPoolFilter('all');
    setTagFilter('all');
    setActiveView('practice');
  }

  function handleMissionAction(action: MissionTargetAction) {
    if (action === 'login') {
      handleOpenAuth();
      return;
    }
    if (action === 'decks') {
      setActiveView('decks');
      return;
    }
    const targetDeckId = effectiveSelectedDeckId;
    if (!targetDeckId) {
      setActiveView('decks');
      return;
    }
    if (action === 'practice_game') {
      handleStartPractice(targetDeckId, 'blast');
    } else if (action === 'practice_quiz') {
      handleStartPractice(targetDeckId, 'quiz');
    } else if (action === 'practice_speak_or_test') {
      handleStartPractice(targetDeckId, store.user ? 'speak' : 'test');
    } else {
      handleStartQuickPractice();
    }
  }

  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0">
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
        onOpenAuth={handleOpenAuth}
        onOpenAccount={handleOpenAccount}
        onSignOut={store.signOutUser}
        todayReviewedCount={todayReviewedCount}
        dailyGoal={store.dailyGoal}
        streakDays={streakDays}
      />

      <main className="flex-1">
        {!store.hydrated ? (
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="h-8 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="h-72 rounded-xl bg-slate-200/70 dark:bg-slate-900 lg:col-span-4" />
              <div className="h-96 rounded-xl bg-slate-200/70 dark:bg-slate-900 lg:col-span-8" />
            </div>
          </div>
        ) : activeView === 'decks' || activeView === 'community' ? (
          <div>
            <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
              <div
                role="tablist"
                aria-label="Phân mục Bộ thẻ và Kho thẻ"
                className="inline-flex w-full max-w-md rounded-2xl border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'decks'}
                  onClick={() => setActiveView('decks')}
                  className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm cursor-pointer ${
                    activeView === 'decks'
                      ? 'bg-white text-sky-700 shadow-xs dark:bg-slate-800 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  <span>Bộ thẻ của tôi</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'community'}
                  onClick={() => setActiveView('community')}
                  className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm cursor-pointer ${
                    activeView === 'community'
                      ? 'bg-white text-sky-700 shadow-xs dark:bg-slate-800 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  <span>Kho thẻ cộng đồng</span>
                </button>
              </div>
            </div>

            {activeView === 'decks' ? (
              <DecksView
                user={store.user}
                decks={store.decks}
                cardsByDeck={store.cardsByDeck}
                selectedDeckId={effectiveSelectedDeckId}
                onSelectDeck={setSelectedDeckId}
                onStartPractice={handleStartPractice}
                onCreateDeck={store.createDeck}
                onUpdateDeck={store.updateDeck}
                onDeleteDeck={store.deleteDeck}
                onResetDeck={store.resetDeckProgress}
                onDuplicateDeck={store.duplicateDeck}
                onAddCard={store.addCard}
                onBulkAddCards={store.bulkAddCards}
                onUpdateCard={store.updateCard}
                onDeleteCard={store.deleteCard}
                onToggleStar={store.toggleCardStar}
                onPublishDeckToCommunity={store.publishDeckToCommunity}
                onGoToCommunity={() => setActiveView('community')}
                onOpenAuth={handleOpenAuth}
              />
            ) : (
              <CommunityView
                user={store.user}
                neonConfigured={store.neonConfigured}
                communityDecks={store.communityDecks}
                myDecks={store.decks}
                myCardsByDeck={store.cardsByDeck}
                leaderboardEntries={store.leaderboardEntries}
                onPublishDeck={store.publishDeckToCommunity}
                onUnpublishDeck={store.unpublishCommunityDeck}
                onImportDeck={store.importCommunityDeck}
                onStartPracticeDeck={(deckId, mode) =>
                  handleStartPractice(deckId, mode || 'flip')
                }
                onOpenAuth={handleOpenAuth}
              />
            )}
          </div>
        ) : activeView === 'practice' ? (
          <PracticeArena
            user={store.user}
            decks={store.decks}
            allCards={store.cards}
            cardsByDeck={store.cardsByDeck}
            selectedDeckId={effectiveSelectedDeckId}
            onSelectDeck={setSelectedDeckId}
            activeMode={activeMode}
            onChangeMode={setActiveMode}
            poolFilter={poolFilter}
            onChangePoolFilter={setPoolFilter}
            tagFilter={tagFilter}
            onChangeTagFilter={setTagFilter}
            leaderboardEntries={store.leaderboardEntries}
            onToggleStar={store.toggleCardStar}
            onRecordResults={store.recordPracticeResults}
            onSubmitLeaderboardScore={store.submitLeaderboardScore}
            onOpenAuth={handleOpenAuth}
            onViewLeaderboard={() => setActiveView('leaderboard')}
            onBackToDecks={() => setActiveView('decks')}
            aiQuota={store.aiQuota}
            onUpdateAiQuota={store.updateAiQuota}
            onGoToMissions={() => setActiveView('missions')}
          />
        ) : activeView === 'ai' ? (
          <AiTutorView
            user={store.user}
            decks={store.decks}
            cardsByDeck={store.cardsByDeck}
            allCards={store.cards}
            aiQuota={store.aiQuota}
            onUpdateQuota={store.updateAiQuota}
            onOpenAuth={handleOpenAuth}
            onGoToMissions={() => setActiveView('missions')}
          />
        ) : activeView === 'missions' ? (
          <MissionsView
            user={store.user}
            cards={store.cards}
            sessions={store.sessions}
            dailyGoal={store.dailyGoal}
            aiQuota={store.aiQuota}
            claimedMissionIds={store.claimedMissionIds}
            loading={store.missionsLoading}
            onRefresh={store.refreshMissionsAndQuota}
            onClaimMission={store.claimMission}
            onExecuteAction={handleMissionAction}
            onOpenChatAi={() => setActiveView('ai')}
            onOpenSpeakPractice={() =>
              handleStartPractice(effectiveSelectedDeckId, 'speak')
            }
            onOpenAuth={handleOpenAuth}
          />
        ) : (
          <LeaderboardStreakView
            decks={store.decks}
            cards={store.cards}
            sessions={store.sessions}
            dailyGoal={store.dailyGoal}
            leaderboardEntries={store.leaderboardEntries}
            streakLeaders={store.streakLeaders}
            onRefreshLeaderboard={store.refreshLeaderboard}
            onUpdateDailyGoal={store.updateDailyGoal}
            onDeleteSession={store.deleteStudySession}
            onToggleStar={store.toggleCardStar}
            onStartPractice={handleStartPractice}
          />
        )}
      </main>

      <footer className="hidden md:block border-t border-slate-200 bg-white py-5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6">
          <span>LexiCard · Luyện tập Flashcard & Mini-Games từ vựng</span>
          <span>Phím tắt: Space lật thẻ · A nghe phát âm · S gắn sao · 1 / 2 / 3 đánh giá</span>
        </div>
      </footer>

      <MobileBottomNav
        activeView={activeView}
        onSelectView={setActiveView}
      />

      {authModalLoaded && (
        <AuthModal
          open={authModalOpen}
          neonConfigured={store.neonConfigured}
          onClose={() => setAuthModalOpen(false)}
          onLogin={store.loginWithPassword}
          onRegister={store.registerWithPassword}
        />
      )}

      {store.user && accountModalLoaded && (
        <AccountModal
          key={`${store.user.id}_${accountModalState.tab}_${accountModalState.open}`}
          open={accountModalState.open}
          initialTab={accountModalState.tab}
          user={store.user}
          decks={store.decks}
          cardsByDeck={store.cardsByDeck}
          onClose={() =>
            setAccountModalState((prev) => ({ ...prev, open: false }))
          }
          onUpdateProfile={store.updateProfile}
          onImportBackup={store.importBackupDecks}
        />
      )}

      <OfflineIndicator pendingSyncCount={store.pendingSyncCount} />
    </div>
  );
}
