'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildStarterData } from '@/lib/seed-data';
import {
  AuthUser,
  Deck,
  Flashcard,
  LIMITS,
  MasteryLevel,
  PracticeMode,
  StudySession,
  getTodayDateKey,
  sanitizeId,
} from '@/lib/types';

const LS_DECKS = 'lexicard_decks_v1';
const LS_CARDS = 'lexicard_cards_v1';
const LS_SESSIONS = 'lexicard_sessions_v1';
const LS_GOAL = 'lexicard_goal_v1';
const LS_THEME = 'lexicard_theme';

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function createUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export function useFlashcardStore() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [neonConfigured, setNeonConfigured] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [hydrated, setHydrated] = useState(false);

  const loadLocalGuestSnapshot = useCallback(() => {
    try {
      const rawDecks = localStorage.getItem(LS_DECKS);
      const rawCards = localStorage.getItem(LS_CARDS);
      const rawSessions = localStorage.getItem(LS_SESSIONS);
      const rawGoal = localStorage.getItem(LS_GOAL);

      if (rawDecks && rawCards) {
        setDecks(JSON.parse(rawDecks));
        setCards(JSON.parse(rawCards));
      } else {
        const starter = buildStarterData('local');
        setDecks(starter.decks);
        setCards(starter.cards);
        localStorage.setItem(LS_DECKS, JSON.stringify(starter.decks));
        localStorage.setItem(LS_CARDS, JSON.stringify(starter.cards));
      }

      setSessions(rawSessions ? JSON.parse(rawSessions) : []);

      if (rawGoal) {
        const parsedGoal = Number(rawGoal);
        if (
          Number.isFinite(parsedGoal) &&
          parsedGoal >= LIMITS.DAILY_GOAL_MIN &&
          parsedGoal <= LIMITS.DAILY_GOAL_MAX
        ) {
          setDailyGoal(parsedGoal);
        }
      }
    } catch {
      const starter = buildStarterData('local');
      setDecks(starter.decks);
      setCards(starter.cards);
      setSessions([]);
    }
  }, []);

  // Initialize theme + local guest data + check Neon session cookie
  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
      loadLocalGuestSnapshot();
      setHydrated(true);
    });

    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setAuthReady(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        setNeonConfigured(Boolean(data.configured));
        if (data.user) {
          setUser(data.user);
          setDecks(Array.isArray(data.decks) ? data.decks : []);
          setCards(Array.isArray(data.cards) ? data.cards : []);
          setSessions(Array.isArray(data.sessions) ? data.sessions : []);
          if (typeof data.user.dailyGoal === 'number') {
            setDailyGoal(data.user.dailyGoal);
          }
        }
      } catch {
        // Keep guest mode available
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [loadLocalGuestSnapshot]);

  // Persist local guest mode state to localStorage when not signed in
  useEffect(() => {
    if (!hydrated || !authReady || user) return;
    try {
      localStorage.setItem(LS_DECKS, JSON.stringify(decks));
      localStorage.setItem(LS_CARDS, JSON.stringify(cards));
      localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
      localStorage.setItem(LS_GOAL, String(dailyGoal));
    } catch {
      // Ignore storage quota errors
    }
  }, [hydrated, authReady, user, decks, cards, sessions, dailyGoal]);

  const toggleTheme = useCallback((next?: 'light' | 'dark') => {
    setTheme((prev) => {
      const target = next ?? (prev === 'dark' ? 'light' : 'dark');
      if (target === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem(LS_THEME, target);
      } catch {
        // Ignore
      }
      return target;
    });
  }, []);

  const loginWithPassword = useCallback(
    async (input: {
      username: string;
      password: string;
    }): Promise<AuthActionResult> => {
      setSyncError(null);
      setSyncing(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.error || 'Đăng nhập thất bại.',
          };
        }

        setNeonConfigured(true);
        setUser(data.user);
        setDecks(Array.isArray(data.decks) ? data.decks : []);
        setCards(Array.isArray(data.cards) ? data.cards : []);
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        if (typeof data.user?.dailyGoal === 'number') {
          setDailyGoal(data.user.dailyGoal);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể kết nối tới máy chủ.' };
      } finally {
        setSyncing(false);
      }
    },
    []
  );

  const registerWithPassword = useCallback(
    async (input: {
      username: string;
      password: string;
      displayName?: string;
      importGuestData?: boolean;
    }): Promise<AuthActionResult> => {
      setSyncError(null);
      setSyncing(true);
      try {
        const payload = {
          username: input.username,
          password: input.password,
          displayName: input.displayName,
          importGuestData: input.importGuestData ?? true,
          dailyGoal,
          decks: input.importGuestData ? decks : [],
          cards: input.importGuestData ? cards : [],
          sessions: input.importGuestData ? sessions : [],
        };

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.error || 'Đăng ký tài khoản thất bại.',
          };
        }

        setNeonConfigured(true);
        setUser(data.user);
        setDecks(Array.isArray(data.decks) ? data.decks : []);
        setCards(Array.isArray(data.cards) ? data.cards : []);
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        if (typeof data.user?.dailyGoal === 'number') {
          setDailyGoal(data.user.dailyGoal);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể kết nối tới máy chủ.' };
      } finally {
        setSyncing(false);
      }
    },
    [dailyGoal, decks, cards, sessions]
  );

  const signOutUser = useCallback(async () => {
    setSyncError(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    loadLocalGuestSnapshot();
  }, [loadLocalGuestSnapshot]);

  const cardsByDeck = useMemo(() => {
    const map: Record<string, Flashcard[]> = {};
    for (const card of cards) {
      if (!map[card.deckId]) map[card.deckId] = [];
      map[card.deckId].push(card);
    }
    return map;
  }, [cards]);

  // CRUD: Create Deck
  const createDeck = useCallback(
    async (input: {
      title: string;
      description: string;
      category: string;
    }): Promise<string> => {
      const deckId = createUniqueId('deck');
      const title = clampString(input.title, LIMITS.TITLE_MAX) || 'Bộ thẻ mới';
      const description = clampString(input.description, LIMITS.DESC_MAX);
      const category =
        clampString(input.category || 'Cá nhân', LIMITS.CATEGORY_MAX) ||
        'Cá nhân';
      const now = Date.now();

      const optimisticDeck: Deck = {
        id: deckId,
        ownerId: user ? user.id : 'local',
        title,
        description,
        category,
        cardCount: 0,
        masteredCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      setDecks((prev) => [...prev, optimisticDeck]);

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch('/api/decks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: deckId,
              title,
              description,
              category,
            }),
          });
          if (!res.ok) {
            setSyncError('Không thể lưu bộ thẻ lên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi lưu bộ thẻ.');
        } finally {
          setSyncing(false);
        }
      }
      return deckId;
    },
    [user]
  );

  // CRUD: Update Deck
  const updateDeck = useCallback(
    async (
      deckId: string,
      input: { title: string; description: string; category: string }
    ) => {
      const title = clampString(input.title, LIMITS.TITLE_MAX) || 'Bộ thẻ';
      const description = clampString(input.description, LIMITS.DESC_MAX);
      const category =
        clampString(input.category || 'Cá nhân', LIMITS.CATEGORY_MAX) ||
        'Cá nhân';
      const now = Date.now();

      setDecks((prev) =>
        prev.map((d) =>
          d.id === deckId
            ? { ...d, title, description, category, updatedAt: now }
            : d
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, category }),
          });
          if (!res.ok) {
            setSyncError('Không thể cập nhật bộ thẻ trên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi cập nhật bộ thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user]
  );

  // CRUD: Delete Deck
  const deleteDeck = useCallback(
    async (deckId: string) => {
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      setCards((prev) => prev.filter((c) => c.deckId !== deckId));

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            setSyncError('Không thể xóa bộ thẻ trên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi xóa bộ thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user]
  );

  // CRUD: Add Card
  const addCard = useCallback(
    async (
      deckId: string,
      input: {
        term: string;
        phonetic: string;
        partOfSpeech: string;
        meaning: string;
        example: string;
      }
    ) => {
      const cardId = createUniqueId('card');
      const term = clampString(input.term, LIMITS.TERM_MAX);
      const phonetic = clampString(input.phonetic, LIMITS.PHONETIC_MAX);
      const partOfSpeech = clampString(input.partOfSpeech, LIMITS.POS_MAX);
      const meaning = clampString(input.meaning, LIMITS.MEANING_MAX);
      const example = clampString(input.example, LIMITS.EXAMPLE_MAX);
      const now = Date.now();

      const existingDeckCards = cards.filter((c) => c.deckId === deckId);
      const newCount = existingDeckCards.length + 1;
      const masteredCount = existingDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;

      const newCard: Flashcard = {
        id: cardId,
        deckId,
        ownerId: user ? user.id : 'local',
        term,
        phonetic,
        partOfSpeech,
        meaning,
        example,
        mastery: 'new',
        reviewCount: 0,
        correctCount: 0,
        starred: false,
        createdAt: now,
        updatedAt: now,
      };
      setCards((prev) => [...prev, newCard]);
      setDecks((prev) =>
        prev.map((d) =>
          d.id === deckId
            ? { ...d, cardCount: newCount, masteredCount, updatedAt: now }
            : d
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch('/api/cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: cardId,
              deckId,
              term,
              phonetic,
              partOfSpeech,
              meaning,
              example,
            }),
          });
          if (!res.ok) {
            setSyncError('Không thể lưu thẻ lên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi lưu thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user, cards]
  );

  // CRUD: Bulk Import Cards
  const bulkAddCards = useCallback(
    async (
      deckId: string,
      items: Array<{
        term: string;
        meaning: string;
        phonetic?: string;
        partOfSpeech?: string;
        example?: string;
      }>
    ) => {
      if (items.length === 0) return;
      const sliced = items.slice(0, 100);
      const existingDeckCards = cards.filter((c) => c.deckId === deckId);
      const newCount = existingDeckCards.length + sliced.length;
      const masteredCount = existingDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;
      const now = Date.now();

      const created: Flashcard[] = sliced.map((item, idx) => ({
        id: createUniqueId(`card_${idx}`),
        deckId,
        ownerId: user ? user.id : 'local',
        term: clampString(item.term, LIMITS.TERM_MAX),
        phonetic: clampString(item.phonetic || '', LIMITS.PHONETIC_MAX),
        partOfSpeech: clampString(item.partOfSpeech || '', LIMITS.POS_MAX),
        meaning: clampString(item.meaning, LIMITS.MEANING_MAX),
        example: clampString(item.example || '', LIMITS.EXAMPLE_MAX),
        mastery: 'new',
        reviewCount: 0,
        correctCount: 0,
        starred: false,
        createdAt: now + idx,
        updatedAt: now + idx,
      }));

      setCards((prev) => [...prev, ...created]);
      setDecks((prev) =>
        prev.map((d) =>
          d.id === deckId
            ? { ...d, cardCount: newCount, masteredCount, updatedAt: now }
            : d
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch('/api/cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deckId,
              items: created.map((c) => ({
                id: c.id,
                term: c.term,
                phonetic: c.phonetic,
                partOfSpeech: c.partOfSpeech,
                meaning: c.meaning,
                example: c.example,
              })),
            }),
          });
          if (!res.ok) {
            setSyncError('Không thể nhập hàng loạt lên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi nhập thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user, cards]
  );

  // CRUD: Update Card Content
  const updateCard = useCallback(
    async (
      card: Flashcard,
      input: {
        term: string;
        phonetic: string;
        partOfSpeech: string;
        meaning: string;
        example: string;
      }
    ) => {
      const term = clampString(input.term, LIMITS.TERM_MAX);
      const phonetic = clampString(input.phonetic, LIMITS.PHONETIC_MAX);
      const partOfSpeech = clampString(input.partOfSpeech, LIMITS.POS_MAX);
      const meaning = clampString(input.meaning, LIMITS.MEANING_MAX);
      const example = clampString(input.example, LIMITS.EXAMPLE_MAX);
      const now = Date.now();

      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id
            ? {
                ...c,
                term,
                phonetic,
                partOfSpeech,
                meaning,
                example,
                updatedAt: now,
              }
            : c
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              term,
              phonetic,
              partOfSpeech,
              meaning,
              example,
            }),
          });
          if (!res.ok) {
            setSyncError('Không thể cập nhật thẻ trên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi cập nhật thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user]
  );

  // CRUD: Delete Card
  const deleteCard = useCallback(
    async (card: Flashcard) => {
      const remaining = cards.filter(
        (c) => c.deckId === card.deckId && c.id !== card.id
      );
      const newCount = remaining.length;
      const masteredCount = remaining.filter(
        (c) => c.mastery === 'mastered'
      ).length;
      const now = Date.now();

      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setDecks((prev) =>
        prev.map((d) =>
          d.id === card.deckId
            ? {
                ...d,
                cardCount: newCount,
                masteredCount,
                updatedAt: now,
              }
            : d
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            setSyncError('Không thể xóa thẻ trên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi xóa thẻ.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user, cards]
  );

  // Toggle Starred on a card
  const toggleCardStar = useCallback(
    async (card: Flashcard) => {
      const nextStarred = !card.starred;
      const now = Date.now();

      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id
            ? { ...c, starred: nextStarred, updatedAt: now }
            : c
        )
      );

      if (user) {
        try {
          const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ starred: nextStarred }),
          });
          if (!res.ok) {
            setSyncError('Không thể lưu trạng thái gắn sao.');
          }
        } catch {
          setSyncError('Mất kết nối khi lưu trạng thái gắn sao.');
        }
      }
    },
    [user]
  );

  // Duplicate Deck (Quizlet-style clone)
  const duplicateDeck = useCallback(
    async (sourceDeckId: string): Promise<string | null> => {
      const sourceDeck = decks.find((d) => d.id === sourceDeckId);
      if (!sourceDeck) return null;
      const sourceCards = cards.filter((c) => c.deckId === sourceDeckId);
      const newDeckId = createUniqueId('deck');
      const newTitle = clampString(
        `${sourceDeck.title} (Bản sao)`,
        LIMITS.TITLE_MAX
      );
      const now = Date.now();

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const res = await fetch(
            `/api/decks/${encodeURIComponent(sourceDeckId)}/duplicate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newDeckId }),
            }
          );
          if (!res.ok) {
            setSyncError('Không thể nhân bản bộ thẻ trên Neon.');
            return null;
          }
          const data = await res.json();
          if (data.deck) {
            setDecks((prev) => [...prev, data.deck]);
          }
          if (Array.isArray(data.cards)) {
            setCards((prev) => [...prev, ...data.cards]);
          }
          return data.deck?.id || newDeckId;
        } catch {
          setSyncError('Mất kết nối khi nhân bản bộ thẻ.');
          return null;
        } finally {
          setSyncing(false);
        }
      }

      const clonedDeck: Deck = {
        id: newDeckId,
        ownerId: 'local',
        title: newTitle,
        description: sourceDeck.description,
        category: sourceDeck.category,
        cardCount: sourceCards.length,
        masteredCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const clonedCards: Flashcard[] = sourceCards.map((c, idx) => ({
        ...c,
        id: createUniqueId(`card_${idx}`),
        deckId: newDeckId,
        ownerId: 'local',
        mastery: 'new',
        reviewCount: 0,
        correctCount: 0,
        createdAt: now + idx,
        updatedAt: now + idx,
      }));
      setDecks((prev) => [...prev, clonedDeck]);
      setCards((prev) => [...prev, ...clonedCards]);
      return newDeckId;
    },
    [user, decks, cards]
  );

  // Update card mastery & log practice session
  const recordPracticeResults = useCallback(
    async (params: {
      deck: Deck;
      mode: PracticeMode;
      results: Array<{
        cardId: string;
        isCorrect: boolean;
        explicitMastery?: MasteryLevel;
      }>;
      totalItems: number;
      correctCount: number;
      durationSeconds: number;
    }) => {
      const { deck, mode, results, totalItems, correctCount, durationSeconds } =
        params;
      const sessionId = createUniqueId('sess');
      const safeTotal = Math.max(1, Math.round(totalItems));
      const safeCorrect = Math.min(
        safeTotal,
        Math.max(0, Math.round(correctCount))
      );
      const accuracy = Math.min(
        100,
        Math.max(0, Math.round((safeCorrect / safeTotal) * 100))
      );
      const safeDuration = Math.min(
        86400,
        Math.max(1, Math.round(durationSeconds))
      );
      const dateKey = getTodayDateKey();
      const now = Date.now();

      const deckCards = cards.filter((c) => c.deckId === deck.id);
      const resultMap = new Map<
        string,
        { reviews: number; corrects: number; explicit?: MasteryLevel }
      >();

      for (const r of results) {
        const cur = resultMap.get(r.cardId) || { reviews: 0, corrects: 0 };
        cur.reviews += 1;
        if (r.isCorrect) cur.corrects += 1;
        if (r.explicitMastery) cur.explicit = r.explicitMastery;
        resultMap.set(r.cardId, cur);
      }

      const updatedDeckCards = deckCards.map((c) => {
        const delta = resultMap.get(c.id);
        if (!delta) return c;
        const reviewCount = c.reviewCount + delta.reviews;
        const correct = c.correctCount + delta.corrects;
        let mastery: MasteryLevel = c.mastery;
        if (delta.explicit) {
          mastery = delta.explicit;
        } else if (
          delta.corrects > 0 &&
          correct >= 2 &&
          correct / reviewCount >= 0.7
        ) {
          mastery = 'mastered';
        } else if (delta.corrects > 0 || mastery === 'new') {
          mastery = 'learning';
        } else if (delta.corrects === 0 && mastery === 'mastered') {
          mastery = 'learning';
        }
        return {
          ...c,
          reviewCount,
          correctCount: correct,
          mastery,
          updatedAt: now,
        };
      });

      const newMasteredCount = updatedDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;

      const newSession: StudySession = {
        id: sessionId,
        ownerId: user ? user.id : 'local',
        deckId: deck.id,
        deckTitle: deck.title,
        mode,
        totalItems: safeTotal,
        correctCount: safeCorrect,
        accuracy,
        durationSeconds: safeDuration,
        dateKey,
        completedAt: now,
      };

      setSessions((prev) => [newSession, ...prev]);
      setCards((prev) =>
        prev.map((c) => {
          const match = updatedDeckCards.find((u) => u.id === c.id);
          return match || c;
        })
      );
      setDecks((prev) =>
        prev.map((d) =>
          d.id === deck.id
            ? {
                ...d,
                cardCount: updatedDeckCards.length,
                masteredCount: newMasteredCount,
                updatedAt: now,
              }
            : d
        )
      );

      if (user) {
        setSyncing(true);
        setSyncError(null);
        try {
          const cardUpdates = updatedDeckCards
            .filter((c) => resultMap.has(c.id))
            .map((c) => ({
              id: c.id,
              mastery: c.mastery,
              reviewCount: c.reviewCount,
              correctCount: c.correctCount,
            }));

          const res = await fetch('/api/practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              deckId: deck.id,
              deckTitle: deck.title,
              mode,
              totalItems: safeTotal,
              correctCount: safeCorrect,
              durationSeconds: safeDuration,
              dateKey,
              cardUpdates,
            }),
          });
          if (!res.ok) {
            setSyncError('Không thể lưu lịch sử học lên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi lưu lịch sử học.');
        } finally {
          setSyncing(false);
        }
      }
    },
    [user, cards]
  );

  const deleteStudySession = useCallback(
    async (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (user) {
        try {
          const res = await fetch(
            `/api/sessions/${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
          );
          if (!res.ok) {
            setSyncError('Không thể xóa phiên học trên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi xóa phiên học.');
        }
      }
    },
    [user]
  );

  const updateDailyGoal = useCallback(
    async (goal: number) => {
      const clamped = Math.min(
        LIMITS.DAILY_GOAL_MAX,
        Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(goal))
      );
      setDailyGoal(clamped);

      if (user) {
        try {
          const res = await fetch('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dailyGoal: clamped }),
          });
          if (!res.ok) {
            setSyncError('Không thể lưu mục tiêu lên Neon.');
          }
        } catch {
          setSyncError('Mất kết nối khi lưu mục tiêu.');
        }
      }
    },
    [user]
  );

  return {
    theme,
    toggleTheme,
    user,
    authReady,
    neonConfigured,
    syncing,
    syncError,
    loginWithPassword,
    registerWithPassword,
    signOutUser,
    decks,
    cards,
    cardsByDeck,
    sessions,
    dailyGoal,
    hydrated,
    createDeck,
    updateDeck,
    deleteDeck,
    addCard,
    bulkAddCards,
    updateCard,
    deleteCard,
    toggleCardStar,
    duplicateDeck,
    recordPracticeResults,
    deleteStudySession,
    updateDailyGoal,
  };
}
