'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCommunityStarterDecks } from '@/lib/community-seed';
import { buildStarterData } from '@/lib/seed-data';
import {
  AuthUser,
  CommunityCardItem,
  CommunityDeck,
  Deck,
  Flashcard,
  LIMITS,
  LeaderboardEntry,
  LeaderboardMode,
  MasteryLevel,
  PracticeMode,
  StreakLeaderboardEntry,
  StudySession,
  getTodayDateKey,
  sanitizeId,
} from '@/lib/types';

const LS_DECKS = 'lexicard_decks_v1';
const LS_CARDS = 'lexicard_cards_v1';
const LS_SESSIONS = 'lexicard_sessions_v1';
const LS_GOAL = 'lexicard_goal_v1';
const LS_THEME = 'lexicard_theme';
const LS_ACCOUNT_CACHE_PREFIX = 'lexicard_account_cache_v1_';
const LS_LAST_ACCOUNT_ID = 'lexicard_last_account_id_v1';
const LS_PENDING_SYNC_PREFIX = 'lexicard_pending_sync_v1_';
const LS_COMMUNITY = 'lexicard_community_v1';
const LS_LEADERBOARD = 'lexicard_leaderboard_v1';

interface PendingSyncItem {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  createdAt: number;
}

interface AccountCacheSnapshot {
  user: AuthUser;
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySession[];
  cachedAt: number;
}

function getLastAccountId(): string | null {
  try {
    const raw = localStorage.getItem(LS_LAST_ACCOUNT_ID);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function setLastAccountId(userId: string | null) {
  try {
    if (!userId) {
      localStorage.removeItem(LS_LAST_ACCOUNT_ID);
    } else {
      localStorage.setItem(LS_LAST_ACCOUNT_ID, userId);
    }
  } catch {
    // Ignore storage errors
  }
}

function readAccountCache(targetUserId?: string | null): AccountCacheSnapshot | null {
  try {
    const uid = targetUserId ?? getLastAccountId();
    if (!uid) return null;
    const raw = localStorage.getItem(`${LS_ACCOUNT_CACHE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountCacheSnapshot;
    if (!parsed || !parsed.user?.id || parsed.user.id !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAccountCache(snapshot: AccountCacheSnapshot) {
  try {
    if (!snapshot.user?.id) return;
    localStorage.setItem(
      `${LS_ACCOUNT_CACHE_PREFIX}${snapshot.user.id}`,
      JSON.stringify(snapshot)
    );
    setLastAccountId(snapshot.user.id);
  } catch {
    // Ignore quota errors
  }
}

function readPendingQueue(userId?: string | null): PendingSyncItem[] {
  try {
    const uid = userId ?? getLastAccountId();
    if (!uid) return [];
    const raw = localStorage.getItem(`${LS_PENDING_SYNC_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingQueue(userId: string | null, queue: PendingSyncItem[]) {
  try {
    const uid = userId ?? getLastAccountId();
    if (!uid) return;
    const key = `${LS_PENDING_SYNC_PREFIX}${uid}`;
    if (queue.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(queue));
    }
  } catch {
    // Ignore quota errors
  }
}

function compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.score - a.score ||
    b.accuracy - a.accuracy ||
    a.durationSeconds - b.durationSeconds ||
    b.createdAt - a.createdAt
  );
}

function dedupeLeaderboardEntries(list: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...list].sort(compareLeaderboardEntries);
  const seen = new Set<string>();
  const deduped: LeaderboardEntry[] = [];
  for (const item of sorted) {
    const playerKey = item.userId || item.playerName.trim().toLowerCase();
    const key = `${playerKey}__${item.deckId}__${item.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

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
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [communityDecks, setCommunityDecks] = useState<CommunityDeck[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [streakLeaders, setStreakLeaders] = useState<StreakLeaderboardEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Giữ id user hiện tại trong ref để các hàm đồng bộ KHÔNG phụ thuộc vào `user`.
  // Nếu phụ thuộc `user`, mỗi lần setUser(object mới) sẽ đổi identity của
  // flushPendingSync -> effect khởi tạo chạy lại -> gọi /api/auth/me -> setUser
  // object mới -> lặp vô hạn (gây đơ app sau khi đăng nhập).
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

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

  const enqueuePendingSync = useCallback(
    (item: Omit<PendingSyncItem, 'id' | 'createdAt'>) => {
      const uid = userIdRef.current ?? getLastAccountId();
      if (!uid) return;
      const next = [
        ...readPendingQueue(uid),
        {
          ...item,
          id: createUniqueId('sync'),
          createdAt: Date.now(),
        },
      ];
      writePendingQueue(uid, next);
      setPendingSyncCount(next.length);
    },
    []
  );

  const flushPendingSync = useCallback(
    async (targetUserId?: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const uid = targetUserId ?? userIdRef.current ?? getLastAccountId();
      if (!uid) {
        setPendingSyncCount(0);
        return;
      }
      const queue = readPendingQueue(uid);
      if (queue.length === 0) {
        setPendingSyncCount(0);
        return;
      }

      setSyncing(true);
      const remaining: PendingSyncItem[] = [];
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers:
              item.body !== undefined
                ? { 'Content-Type': 'application/json' }
                : undefined,
            body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
          });
          if (!res.ok && res.status >= 500) {
            remaining.push(...queue.slice(i));
            break;
          }
        } catch {
          remaining.push(...queue.slice(i));
          break;
        }
      }
      writePendingQueue(uid, remaining);
      setPendingSyncCount(remaining.length);
      setSyncing(false);
    },
    []
  );

  const syncMutation = useCallback(
    async (
      url: string,
      method: 'POST' | 'PATCH' | 'DELETE',
      body: unknown | undefined,
      errorMessage: string
    ) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueuePendingSync({ url, method, body });
        return;
      }

      setSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch(url, {
          method,
          headers:
            body !== undefined
              ? { 'Content-Type': 'application/json' }
              : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          if (res.status >= 500) {
            enqueuePendingSync({ url, method, body });
          } else {
            setSyncError(errorMessage);
          }
        }
      } catch {
        enqueuePendingSync({ url, method, body });
      } finally {
        setSyncing(false);
      }
    },
    [enqueuePendingSync]
  );

  // Initialize theme + local guest/offline data + check Neon session cookie
  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');

      const cachedAccount = readAccountCache();
      if (cachedAccount) {
        setUser(cachedAccount.user);
        setDecks(cachedAccount.decks);
        setCards(cachedAccount.cards);
        setSessions(cachedAccount.sessions);
        if (typeof cachedAccount.user.dailyGoal === 'number') {
          setDailyGoal(cachedAccount.user.dailyGoal);
        }
        setPendingSyncCount(readPendingQueue(cachedAccount.user.id).length);
      } else {
        loadLocalGuestSnapshot();
        setPendingSyncCount(0);
      }

      try {
        const rawComm = localStorage.getItem(LS_COMMUNITY);
        if (rawComm) {
          const parsed = JSON.parse(rawComm);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCommunityDecks(parsed);
          } else {
            setCommunityDecks(buildCommunityStarterDecks());
          }
        } else {
          setCommunityDecks(buildCommunityStarterDecks());
        }
      } catch {
        setCommunityDecks(buildCommunityStarterDecks());
      }

      try {
        const rawLb = localStorage.getItem(LS_LEADERBOARD);
        if (rawLb) {
          const parsed = JSON.parse(rawLb);
          if (Array.isArray(parsed)) {
            setLeaderboardEntries(dedupeLeaderboardEntries(parsed));
          }
        }
      } catch {
        // Ignore
      }

      setHydrated(true);
    });

    async function checkSession() {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (!cancelled) setAuthReady(true);
          return;
        }
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setAuthReady(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        setNeonConfigured(Boolean(data.configured));
        if (data.user) {
          const nextDecks = Array.isArray(data.decks) ? data.decks : [];
          const nextCards = Array.isArray(data.cards) ? data.cards : [];
          const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
          setUser(data.user);
          setDecks(nextDecks);
          setCards(nextCards);
          setSessions(nextSessions);
          if (typeof data.user.dailyGoal === 'number') {
            setDailyGoal(data.user.dailyGoal);
          }
          writeAccountCache({
            user: data.user,
            decks: nextDecks,
            cards: nextCards,
            sessions: nextSessions,
            cachedAt: Date.now(),
          });
          await flushPendingSync(data.user.id);
        } else {
          setLastAccountId(null);
          setPendingSyncCount(0);
          setUser(null);
          loadLocalGuestSnapshot();
        }
      } catch {
        // Offline or unreachable: preserve cached account or local guest snapshot
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    checkSession();

    const handleOnline = () => {
      void flushPendingSync(getLastAccountId() ?? undefined);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, [loadLocalGuestSnapshot, flushPendingSync]);

  // Persist local guest mode OR signed-in offline snapshot to localStorage
  useEffect(() => {
    if (!hydrated || !authReady) return;
    if (user) {
      writeAccountCache({
        user,
        decks,
        cards,
        sessions,
        cachedAt: Date.now(),
      });
      return;
    }
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

        const nextDecks = Array.isArray(data.decks) ? data.decks : [];
        const nextCards = Array.isArray(data.cards) ? data.cards : [];
        const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
        setNeonConfigured(true);
        setUser(data.user);
        setDecks(nextDecks);
        setCards(nextCards);
        setSessions(nextSessions);
        if (typeof data.user?.dailyGoal === 'number') {
          setDailyGoal(data.user.dailyGoal);
        }
        writeAccountCache({
          user: data.user,
          decks: nextDecks,
          cards: nextCards,
          sessions: nextSessions,
          cachedAt: Date.now(),
        });
        setPendingSyncCount(readPendingQueue(data.user?.id).length);
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

        const nextDecks = Array.isArray(data.decks) ? data.decks : [];
        const nextCards = Array.isArray(data.cards) ? data.cards : [];
        const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
        setNeonConfigured(true);
        setUser(data.user);
        setDecks(nextDecks);
        setCards(nextCards);
        setSessions(nextSessions);
        if (typeof data.user?.dailyGoal === 'number') {
          setDailyGoal(data.user.dailyGoal);
        }
        writeAccountCache({
          user: data.user,
          decks: nextDecks,
          cards: nextCards,
          sessions: nextSessions,
          cachedAt: Date.now(),
        });
        setPendingSyncCount(0);
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
    setLastAccountId(null);
    setPendingSyncCount(0);
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
        await syncMutation(
          '/api/decks',
          'POST',
          { id: deckId, title, description, category },
          'Không thể lưu bộ thẻ lên Neon.'
        );
      }
      return deckId;
    },
    [user, syncMutation]
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
        await syncMutation(
          `/api/decks/${encodeURIComponent(deckId)}`,
          'PATCH',
          { title, description, category },
          'Không thể cập nhật bộ thẻ trên Neon.'
        );
      }
    },
    [user, syncMutation]
  );

  // CRUD: Delete Deck
  const deleteDeck = useCallback(
    async (deckId: string) => {
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      setCards((prev) => prev.filter((c) => c.deckId !== deckId));

      if (user) {
        await syncMutation(
          `/api/decks/${encodeURIComponent(deckId)}`,
          'DELETE',
          undefined,
          'Không thể xóa bộ thẻ trên Neon.'
        );
      }
    },
    [user, syncMutation]
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
        await syncMutation(
          '/api/cards',
          'POST',
          {
            id: cardId,
            deckId,
            term,
            phonetic,
            partOfSpeech,
            meaning,
            example,
          },
          'Không thể lưu thẻ lên Neon.'
        );
      }
    },
    [user, cards, syncMutation]
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
        await syncMutation(
          '/api/cards',
          'POST',
          {
            deckId,
            items: created.map((c) => ({
              id: c.id,
              term: c.term,
              phonetic: c.phonetic,
              partOfSpeech: c.partOfSpeech,
              meaning: c.meaning,
              example: c.example,
            })),
          },
          'Không thể nhập hàng loạt lên Neon.'
        );
      }
    },
    [user, cards, syncMutation]
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
        await syncMutation(
          `/api/cards/${encodeURIComponent(card.id)}`,
          'PATCH',
          { term, phonetic, partOfSpeech, meaning, example },
          'Không thể cập nhật thẻ trên Neon.'
        );
      }
    },
    [user, syncMutation]
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
        await syncMutation(
          `/api/cards/${encodeURIComponent(card.id)}`,
          'DELETE',
          undefined,
          'Không thể xóa thẻ trên Neon.'
        );
      }
    },
    [user, cards, syncMutation]
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
        await syncMutation(
          `/api/cards/${encodeURIComponent(card.id)}`,
          'PATCH',
          { starred: nextStarred },
          'Không thể lưu trạng thái gắn sao.'
        );
      }
    },
    [user, syncMutation]
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
        const cardUpdates = updatedDeckCards
          .filter((c) => resultMap.has(c.id))
          .map((c) => ({
            id: c.id,
            mastery: c.mastery,
            reviewCount: c.reviewCount,
            correctCount: c.correctCount,
          }));

        await syncMutation(
          '/api/practice',
          'POST',
          {
            sessionId,
            deckId: deck.id,
            deckTitle: deck.title,
            mode,
            totalItems: safeTotal,
            correctCount: safeCorrect,
            durationSeconds: safeDuration,
            dateKey,
            cardUpdates,
          },
          'Không thể lưu lịch sử học lên Neon.'
        );
      }
    },
    [user, cards, syncMutation]
  );

  const deleteStudySession = useCallback(
    async (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (user) {
        await syncMutation(
          `/api/sessions/${encodeURIComponent(sessionId)}`,
          'DELETE',
          undefined,
          'Không thể xóa phiên học trên Neon.'
        );
      }
    },
    [user, syncMutation]
  );

  const updateDailyGoal = useCallback(
    async (goal: number) => {
      const clamped = Math.min(
        LIMITS.DAILY_GOAL_MAX,
        Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(goal))
      );
      setDailyGoal(clamped);

      if (user) {
        setUser((prev) => (prev ? { ...prev, dailyGoal: clamped } : null));
        await syncMutation(
          '/api/profile',
          'PATCH',
          { dailyGoal: clamped },
          'Không thể lưu mục tiêu lên Neon.'
        );
      }
    },
    [user, syncMutation]
  );

  const updateProfile = useCallback(
    async (input: {
      displayName?: string;
      dailyGoal?: number;
      currentPassword?: string;
      newPassword?: string;
    }): Promise<AuthActionResult> => {
      if (!user) {
        return { ok: false, error: 'Bạn chưa đăng nhập tài khoản.' };
      }

      setSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.error || 'Không thể cập nhật tài khoản.',
          };
        }
        if (data.user) {
          setUser(data.user);
          if (typeof data.user.dailyGoal === 'number') {
            setDailyGoal(data.user.dailyGoal);
          }
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Mất kết nối tới máy chủ.' };
      } finally {
        setSyncing(false);
      }
    },
    [user]
  );

  const resetDeckProgress = useCallback(
    async (deckId: string) => {
      const now = Date.now();
      setCards((prev) =>
        prev.map((c) =>
          c.deckId === deckId
            ? {
                ...c,
                mastery: 'new',
                reviewCount: 0,
                correctCount: 0,
                updatedAt: now,
              }
            : c
        )
      );
      setDecks((prev) =>
        prev.map((d) =>
          d.id === deckId ? { ...d, masteredCount: 0, updatedAt: now } : d
        )
      );

      if (user) {
        await syncMutation(
          `/api/decks/${encodeURIComponent(deckId)}/reset`,
          'POST',
          undefined,
          'Không thể đặt lại tiến độ trên Neon.'
        );
      }
    },
    [user, syncMutation]
  );

  const importBackupDecks = useCallback(
    async (
      imported: Array<{
        title: string;
        description?: string;
        category?: string;
        cards: Array<{
          term: string;
          meaning: string;
          phonetic?: string;
          partOfSpeech?: string;
          example?: string;
        }>;
      }>
    ): Promise<number> => {
      let importedDecksCount = 0;
      for (const item of imported.slice(0, 20)) {
        if (!item.title?.trim()) continue;
        const deckId = await createDeck({
          title: item.title,
          description: item.description || '',
          category: item.category || 'Khôi phục',
        });
        const validCards = (item.cards || []).filter(
          (c) => c.term?.trim() && c.meaning?.trim()
        );
        if (validCards.length > 0) {
          await bulkAddCards(deckId, validCards);
        }
        importedDecksCount += 1;
      }
      return importedDecksCount;
    },
    [createDeck, bulkAddCards]
  );

  // Persist community & leaderboard cache
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_COMMUNITY, JSON.stringify(communityDecks));
      localStorage.setItem(LS_LEADERBOARD, JSON.stringify(leaderboardEntries.slice(0, 80)));
    } catch {
      // Ignore quota
    }
  }, [hydrated, communityDecks, leaderboardEntries]);

  const refreshCommunityDecks = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const res = await fetch('/api/community', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.decks)) {
        setCommunityDecks((prev) => {
          const localCustom = prev.filter(
            (p) =>
              p.authorId === 'local' &&
              !data.decks.some((d: CommunityDeck) => d.id === p.id)
          );
          return [...localCustom, ...data.decks];
        });
      }
    } catch {
      // Offline
    }
  }, []);

  const publishDeckToCommunity = useCallback(
    async (input: {
      sourceDeckId?: string | null;
      title: string;
      description: string;
      category: string;
      cards: CommunityCardItem[];
    }): Promise<{ ok: boolean; error?: string; deck?: CommunityDeck }> => {
      if (!user) {
        return {
          ok: false,
          error: 'Bạn cần đăng nhập tài khoản để đăng tải bộ thẻ lên Kho thẻ.',
        };
      }

      const title = clampString(input.title, LIMITS.TITLE_MAX);
      const description = clampString(input.description, LIMITS.DESC_MAX);
      const category =
        clampString(input.category || 'Chung', LIMITS.CATEGORY_MAX) || 'Chung';
      const cleanCards = input.cards.filter(
        (c) => c.term.trim().length > 0 && c.meaning.trim().length > 0
      );
      if (!title || cleanCards.length === 0) {
        return {
          ok: false,
          error: 'Bộ thẻ cần có tiêu đề và ít nhất 1 thẻ từ vựng.',
        };
      }

      if (neonConfigured && (typeof navigator === 'undefined' || navigator.onLine)) {
        try {
          const res = await fetch('/api/community', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceDeckId: input.sourceDeckId ?? null,
              title,
              description,
              category,
              cards: cleanCards,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            return { ok: false, error: data.error || 'Không thể đăng tải bộ thẻ.' };
          }
          if (data.deck) {
            setCommunityDecks((prev) => {
              const filtered = prev.filter((d) => d.id !== data.deck.id);
              return [data.deck, ...filtered];
            });
          }
          return { ok: true, deck: data.deck };
        } catch {
          // Fallback to local publish below if logged-in user is offline
        }
      }

      const now = Date.now();
      const localDeck: CommunityDeck = {
        id: createUniqueId('comm'),
        sourceDeckId: input.sourceDeckId ?? null,
        authorId: user.id,
        authorName: user.displayName || user.username,
        title,
        description,
        category,
        cardCount: cleanCards.length,
        downloadsCount: 0,
        cards: cleanCards,
        publishedAt: now,
      };
      setCommunityDecks((prev) => [localDeck, ...prev]);
      return { ok: true, deck: localDeck };
    },
    [user, neonConfigured]
  );

  const unpublishCommunityDeck = useCallback(
    async (communityDeckId: string) => {
      setCommunityDecks((prev) => prev.filter((d) => d.id !== communityDeckId));
      if (user && neonConfigured) {
        await syncMutation(
          `/api/community/${encodeURIComponent(communityDeckId)}`,
          'DELETE',
          undefined,
          'Không thể gỡ bộ thẻ khỏi Kho thẻ.'
        );
      }
    },
    [user, neonConfigured, syncMutation]
  );

  const importCommunityDeck = useCallback(
    async (communityDeck: CommunityDeck): Promise<string> => {
      const deckId = await createDeck({
        title: communityDeck.title,
        description: communityDeck.description,
        category: communityDeck.category,
      });
      if (communityDeck.cards.length > 0) {
        await bulkAddCards(deckId, communityDeck.cards);
      }
      setCommunityDecks((prev) =>
        prev.map((d) =>
          d.id === communityDeck.id
            ? { ...d, downloadsCount: d.downloadsCount + 1 }
            : d
        )
      );
      if (typeof navigator === 'undefined' || navigator.onLine) {
        fetch(`/api/community/${encodeURIComponent(communityDeck.id)}`, {
          method: 'POST',
        }).catch(() => {});
      }
      return deckId;
    },
    [createDeck, bulkAddCards]
  );

  const refreshLeaderboard = useCallback(
    async (filters?: { deckId?: string; mode?: string }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const params = new URLSearchParams();
        if (filters?.deckId && filters.deckId !== 'all') {
          params.set('deckId', filters.deckId);
        }
        if (filters?.mode && filters.mode !== 'all') {
          params.set('mode', filters.mode);
        }
        params.set('limit', '40');
        const res = await fetch(`/api/leaderboard?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.entries)) {
          setLeaderboardEntries((prev) =>
            dedupeLeaderboardEntries([...data.entries, ...prev])
          );
        }
        if (Array.isArray(data.streakLeaders)) {
          setStreakLeaders(data.streakLeaders);
        }
      } catch {
        // Offline
      }
    },
    []
  );

  const submitLeaderboardScore = useCallback(
    async (input: {
      deckId: string;
      deckTitle: string;
      mode: LeaderboardMode;
      score: number;
      accuracy: number;
      durationSeconds: number;
      streak?: number;
      playerName?: string;
    }) => {
      if (!user) {
        return;
      }

      const id = createUniqueId('lb');
      const playerName =
        user.displayName ||
        user.username ||
        input.playerName?.trim() ||
        'Thành viên';

      const entry: LeaderboardEntry = {
        id,
        userId: user.id,
        playerName,
        deckId: input.deckId,
        deckTitle: input.deckTitle,
        mode: input.mode,
        score: Math.max(0, Math.round(input.score)),
        accuracy: Math.max(0, Math.min(100, Math.round(input.accuracy))),
        durationSeconds: Math.max(1, Math.round(input.durationSeconds)),
        streak: Math.max(0, Math.round(input.streak || 0)),
        createdAt: Date.now(),
      };

      setLeaderboardEntries((prev) =>
        dedupeLeaderboardEntries([entry, ...prev]).slice(0, 100)
      );

      if (neonConfigured) {
        await syncMutation(
          '/api/leaderboard',
          'POST',
          {
            id: entry.id,
            playerName: entry.playerName,
            deckId: entry.deckId,
            deckTitle: entry.deckTitle,
            mode: entry.mode,
            score: entry.score,
            accuracy: entry.accuracy,
            durationSeconds: entry.durationSeconds,
            streak: entry.streak,
          },
          'Không thể lưu điểm lên Bảng xếp hạng.'
        );
      }
    },
    [user, neonConfigured, syncMutation]
  );

  return {
    theme,
    toggleTheme,
    user,
    authReady,
    neonConfigured,
    syncing,
    syncError,
    pendingSyncCount,
    loginWithPassword,
    registerWithPassword,
    signOutUser,
    updateProfile,
    decks,
    cards,
    cardsByDeck,
    sessions,
    dailyGoal,
    communityDecks,
    leaderboardEntries,
    streakLeaders,
    hydrated,
    createDeck,
    updateDeck,
    deleteDeck,
    resetDeckProgress,
    importBackupDecks,
    addCard,
    bulkAddCards,
    updateCard,
    deleteCard,
    toggleCardStar,
    duplicateDeck,
    recordPracticeResults,
    deleteStudySession,
    updateDailyGoal,
    refreshCommunityDecks,
    publishDeckToCommunity,
    unpublishCommunityDeck,
    importCommunityDeck,
    refreshLeaderboard,
    submitLeaderboardScore,
  };
}
