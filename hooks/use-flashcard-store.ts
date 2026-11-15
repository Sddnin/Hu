'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '@/lib/firebase';
import { buildStarterData } from '@/lib/seed-data';
import {
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

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return Date.now();
}

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function createUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

export function useFlashcardStore() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [hydrated, setHydrated] = useState(false);

  const seededUidRef = useRef<string | null>(null);

  // Initialize theme + local data + Firestore connection test
  useEffect(() => {
    testFirestoreConnection();

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const isDark = document.documentElement.classList.contains('dark');
        setTheme(isDark ? 'dark' : 'light');

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

        if (rawSessions) {
          setSessions(JSON.parse(rawSessions));
        }
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
      } finally {
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist local guest mode state to localStorage when not signed in
  useEffect(() => {
    if (!hydrated || user) return;
    try {
      localStorage.setItem(LS_DECKS, JSON.stringify(decks));
      localStorage.setItem(LS_CARDS, JSON.stringify(cards));
      localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
      localStorage.setItem(LS_GOAL, String(dailyGoal));
    } catch {
      // Ignore storage quota errors
    }
  }, [hydrated, user, decks, cards, sessions, dailyGoal]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Bootstrap user profile and migrate local data on first cloud sign-in
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    const uid = user.uid;
    let cancelled = false;

    async function ensureUserAndSeed() {
      if (seededUidRef.current === uid) return;
      setSyncing(true);
      setSyncError(null);

      const userRef = doc(db, 'users', uid);
      try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const displayName = clampString(
            user?.displayName || user?.email?.split('@')[0] || 'Học viên',
            LIMITS.DISPLAY_NAME_MAX
          );
          await setDoc(userRef, {
            ownerId: uid,
            displayName,
            dailyGoal: Math.min(
              LIMITS.DAILY_GOAL_MAX,
              Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(dailyGoal))
            ),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const data = userSnap.data();
          if (typeof data.dailyGoal === 'number') {
            setDailyGoal(data.dailyGoal);
          }
        }

        // Check if cloud decks exist; if empty, seed starter/local decks & sessions
        const decksCol = collection(db, 'users', uid, 'decks');
        const existingDecks = await getDocs(
          query(decksCol, where('ownerId', '==', uid))
        );

        if (existingDecks.empty && !cancelled) {
          const rawDecks = localStorage.getItem(LS_DECKS);
          const rawCards = localStorage.getItem(LS_CARDS);
          const rawSessions = localStorage.getItem(LS_SESSIONS);

          const sourceDecks: Deck[] = rawDecks
            ? JSON.parse(rawDecks)
            : buildStarterData(uid).decks;
          const sourceCards: Flashcard[] = rawCards
            ? JSON.parse(rawCards)
            : buildStarterData(uid).cards;
          const sourceSessions: StudySession[] = rawSessions
            ? JSON.parse(rawSessions)
            : [];

          const batch = writeBatch(db);
          for (const d of sourceDecks.slice(0, 20)) {
            const deckId = sanitizeId(d.id);
            const deckCards = sourceCards.filter((c) => c.deckId === d.id);
            const masteredCount = deckCards.filter(
              (c) => c.mastery === 'mastered'
            ).length;
            batch.set(doc(db, 'users', uid, 'decks', deckId), {
              id: deckId,
              ownerId: uid,
              title: clampString(d.title, LIMITS.TITLE_MAX) || 'Bộ thẻ',
              description: clampString(d.description || '', LIMITS.DESC_MAX),
              category: clampString(d.category || 'Chung', LIMITS.CATEGORY_MAX),
              cardCount: deckCards.length,
              masteredCount,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            for (const c of deckCards.slice(0, 100)) {
              const cardId = sanitizeId(c.id);
              const reviewCount = Math.max(0, Math.round(c.reviewCount || 0));
              const correctCount = Math.min(
                reviewCount,
                Math.max(0, Math.round(c.correctCount || 0))
              );
              batch.set(
                doc(db, 'users', uid, 'decks', deckId, 'cards', cardId),
                {
                  id: cardId,
                  deckId,
                  ownerId: uid,
                  term: clampString(c.term, LIMITS.TERM_MAX) || 'word',
                  phonetic: clampString(c.phonetic || '', LIMITS.PHONETIC_MAX),
                  partOfSpeech: clampString(c.partOfSpeech || '', LIMITS.POS_MAX),
                  meaning: clampString(c.meaning, LIMITS.MEANING_MAX) || 'nghĩa',
                  example: clampString(c.example || '', LIMITS.EXAMPLE_MAX),
                  mastery: c.mastery || 'new',
                  reviewCount,
                  correctCount,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }
              );
            }
          }

          for (const s of sourceSessions.slice(0, 30)) {
            const sessionId = sanitizeId(s.id);
            const totalItems = Math.max(1, Math.round(s.totalItems || 1));
            const correctCount = Math.min(
              totalItems,
              Math.max(0, Math.round(s.correctCount || 0))
            );
            const accuracy = Math.min(
              100,
              Math.max(0, Math.round((correctCount / totalItems) * 100))
            );
            batch.set(doc(db, 'users', uid, 'studySessions', sessionId), {
              id: sessionId,
              ownerId: uid,
              deckId: sanitizeId(s.deckId),
              deckTitle: clampString(s.deckTitle, LIMITS.TITLE_MAX) || 'Bộ thẻ',
              mode: s.mode,
              totalItems,
              correctCount,
              accuracy,
              durationSeconds: Math.min(
                86400,
                Math.max(0, Math.round(s.durationSeconds || 0))
              ),
              dateKey: /^\d{4}-\d{2}-\d{2}$/.test(s.dateKey)
                ? s.dateKey
                : getTodayDateKey(),
              completedAt: serverTimestamp(),
            });
          }

          await batch.commit();
        }
        seededUidRef.current = uid;
      } catch (error) {
        setSyncError('Không thể đồng bộ dữ liệu đám mây.');
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    ensureUserAndSeed();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, dailyGoal]);

  // Attach real-time Firestore listeners for decks & studySessions when signed in
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const uid = user.uid;

    const decksPath = `users/${uid}/decks`;
    const decksQ = query(collection(db, decksPath), where('ownerId', '==', uid));
    const unsubDecks = onSnapshot(
      decksQ,
      (snap) => {
        const list: Deck[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId,
              title: data.title,
              description: data.description || '',
              category: data.category || 'Chung',
              cardCount: Number(data.cardCount || 0),
              masteredCount: Number(data.masteredCount || 0),
              createdAt: toMillis(data.createdAt),
              updatedAt: toMillis(data.updatedAt),
            };
          })
          .sort((a, b) => a.createdAt - b.createdAt);
        setDecks(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, decksPath)
    );

    const sessionsPath = `users/${uid}/studySessions`;
    const sessionsQ = query(
      collection(db, sessionsPath),
      where('ownerId', '==', uid)
    );
    const unsubSessions = onSnapshot(
      sessionsQ,
      (snap) => {
        const list: StudySession[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId,
              deckId: data.deckId,
              deckTitle: data.deckTitle,
              mode: data.mode as PracticeMode,
              totalItems: Number(data.totalItems || 1),
              correctCount: Number(data.correctCount || 0),
              accuracy: Number(data.accuracy || 0),
              durationSeconds: Number(data.durationSeconds || 0),
              dateKey: data.dateKey,
              completedAt: toMillis(data.completedAt),
            };
          })
          .sort((a, b) => b.completedAt - a.completedAt);
        setSessions(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, sessionsPath)
    );

    return () => {
      unsubDecks();
      unsubSessions();
    };
  }, [authReady, user]);

  // Subscribe to cards for each deck in Firestore when signed in
  const deckIdsKey = useMemo(
    () => decks.map((d) => d.id).sort().join(','),
    [decks]
  );

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !deckIdsKey) return;
    const uid = user.uid;
    const deckIds = deckIdsKey.split(',').filter(Boolean);
    const cardsMap = new Map<string, Flashcard[]>();

    const unsubs = deckIds.map((deckId) => {
      const cardsPath = `users/${uid}/decks/${deckId}/cards`;
      const q = query(collection(db, cardsPath), where('ownerId', '==', uid));
      return onSnapshot(
        q,
        (snap) => {
          const deckCards: Flashcard[] = snap.docs
            .map((c) => {
              const data = c.data();
              return {
                id: c.id,
                deckId: data.deckId,
                ownerId: data.ownerId,
                term: data.term,
                phonetic: data.phonetic || '',
                partOfSpeech: data.partOfSpeech || '',
                meaning: data.meaning,
                example: data.example || '',
                mastery: (data.mastery as MasteryLevel) || 'new',
                reviewCount: Number(data.reviewCount || 0),
                correctCount: Number(data.correctCount || 0),
                createdAt: toMillis(data.createdAt),
                updatedAt: toMillis(data.updatedAt),
              };
            })
            .sort((a, b) => a.createdAt - b.createdAt);

          cardsMap.set(deckId, deckCards);
          const merged: Flashcard[] = [];
          for (const id of deckIds) {
            const list = cardsMap.get(id);
            if (list) merged.push(...list);
          }
          setCards(merged);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, cardsPath)
      );
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, user, deckIdsKey]);

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

  const signInWithGoogle = useCallback(async () => {
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      if (!msg.includes('popup-closed-by-user')) {
        setSyncError('Không thể đăng nhập Google lúc này.');
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    seededUidRef.current = null;
    await signOut(auth);
    // Restore local snapshot for offline guest session
    try {
      const rawDecks = localStorage.getItem(LS_DECKS);
      const rawCards = localStorage.getItem(LS_CARDS);
      const rawSessions = localStorage.getItem(LS_SESSIONS);
      if (rawDecks && rawCards) {
        setDecks(JSON.parse(rawDecks));
        setCards(JSON.parse(rawCards));
        setSessions(rawSessions ? JSON.parse(rawSessions) : []);
      } else {
        const starter = buildStarterData('local');
        setDecks(starter.decks);
        setCards(starter.cards);
        setSessions([]);
      }
    } catch {
      const starter = buildStarterData('local');
      setDecks(starter.decks);
      setCards(starter.cards);
    }
  }, []);

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
      const title = clampString(input.title, LIMITS.TITLE_MAX);
      const description = clampString(input.description, LIMITS.DESC_MAX);
      const category = clampString(input.category || 'Cá nhân', LIMITS.CATEGORY_MAX);
      const now = Date.now();

      if (user && user.emailVerified) {
        const uid = user.uid;
        const deckPath = `users/${uid}/decks/${deckId}`;
        try {
          await setDoc(doc(db, deckPath), {
            id: deckId,
            ownerId: uid,
            title,
            description,
            category,
            cardCount: 0,
            masteredCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, deckPath);
        }
      } else {
        setDecks((prev) => [
          ...prev,
          {
            id: deckId,
            ownerId: 'local',
            title,
            description,
            category,
            cardCount: 0,
            masteredCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        ]);
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
      const title = clampString(input.title, LIMITS.TITLE_MAX);
      const description = clampString(input.description, LIMITS.DESC_MAX);
      const category = clampString(input.category || 'Cá nhân', LIMITS.CATEGORY_MAX);

      if (user && user.emailVerified) {
        const uid = user.uid;
        const deckPath = `users/${uid}/decks/${deckId}`;
        try {
          await updateDoc(doc(db, deckPath), {
            title,
            description,
            category,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, deckPath);
        }
      } else {
        setDecks((prev) =>
          prev.map((d) =>
            d.id === deckId
              ? { ...d, title, description, category, updatedAt: Date.now() }
              : d
          )
        );
      }
    },
    [user]
  );

  // CRUD: Delete Deck
  const deleteDeck = useCallback(
    async (deckId: string) => {
      if (user && user.emailVerified) {
        const uid = user.uid;
        const deckPath = `users/${uid}/decks/${deckId}`;
        try {
          const deckCards = cards.filter((c) => c.deckId === deckId);
          const batch = writeBatch(db);
          for (const c of deckCards) {
            batch.delete(doc(db, `${deckPath}/cards/${c.id}`));
          }
          batch.delete(doc(db, deckPath));
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, deckPath);
        }
      } else {
        setDecks((prev) => prev.filter((d) => d.id !== deckId));
        setCards((prev) => prev.filter((c) => c.deckId !== deckId));
      }
    },
    [user, cards]
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

      if (user && user.emailVerified) {
        const uid = user.uid;
        const cardPath = `users/${uid}/decks/${deckId}/cards/${cardId}`;
        const deckPath = `users/${uid}/decks/${deckId}`;
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, cardPath), {
            id: cardId,
            deckId,
            ownerId: uid,
            term,
            phonetic,
            partOfSpeech,
            meaning,
            example,
            mastery: 'new',
            reviewCount: 0,
            correctCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, deckPath), {
            cardCount: newCount,
            masteredCount,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, cardPath);
        }
      } else {
        const newCard: Flashcard = {
          id: cardId,
          deckId,
          ownerId: 'local',
          term,
          phonetic,
          partOfSpeech,
          meaning,
          example,
          mastery: 'new',
          reviewCount: 0,
          correctCount: 0,
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
      const existingDeckCards = cards.filter((c) => c.deckId === deckId);
      const newCount = existingDeckCards.length + items.length;
      const masteredCount = existingDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;
      const now = Date.now();

      if (user && user.emailVerified) {
        const uid = user.uid;
        const deckPath = `users/${uid}/decks/${deckId}`;
        try {
          const batch = writeBatch(db);
          for (const item of items.slice(0, 50)) {
            const cardId = createUniqueId('card');
            batch.set(doc(db, `${deckPath}/cards/${cardId}`), {
              id: cardId,
              deckId,
              ownerId: uid,
              term: clampString(item.term, LIMITS.TERM_MAX),
              phonetic: clampString(item.phonetic || '', LIMITS.PHONETIC_MAX),
              partOfSpeech: clampString(item.partOfSpeech || '', LIMITS.POS_MAX),
              meaning: clampString(item.meaning, LIMITS.MEANING_MAX),
              example: clampString(item.example || '', LIMITS.EXAMPLE_MAX),
              mastery: 'new',
              reviewCount: 0,
              correctCount: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          batch.update(doc(db, deckPath), {
            cardCount: newCount,
            masteredCount,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `${deckPath}/cards`);
        }
      } else {
        const created: Flashcard[] = items.map((item, idx) => ({
          id: createUniqueId(`card_${idx}`),
          deckId,
          ownerId: 'local',
          term: clampString(item.term, LIMITS.TERM_MAX),
          phonetic: clampString(item.phonetic || '', LIMITS.PHONETIC_MAX),
          partOfSpeech: clampString(item.partOfSpeech || '', LIMITS.POS_MAX),
          meaning: clampString(item.meaning, LIMITS.MEANING_MAX),
          example: clampString(item.example || '', LIMITS.EXAMPLE_MAX),
          mastery: 'new',
          reviewCount: 0,
          correctCount: 0,
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

      if (user && user.emailVerified) {
        const uid = user.uid;
        const cardPath = `users/${uid}/decks/${card.deckId}/cards/${card.id}`;
        try {
          await updateDoc(doc(db, cardPath), {
            term,
            phonetic,
            partOfSpeech,
            meaning,
            example,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, cardPath);
        }
      } else {
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
                  updatedAt: Date.now(),
                }
              : c
          )
        );
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

      if (user && user.emailVerified) {
        const uid = user.uid;
        const deckPath = `users/${uid}/decks/${card.deckId}`;
        const cardPath = `${deckPath}/cards/${card.id}`;
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, cardPath));
          batch.update(doc(db, deckPath), {
            cardCount: newCount,
            masteredCount,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, cardPath);
        }
      } else {
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        setDecks((prev) =>
          prev.map((d) =>
            d.id === card.deckId
              ? {
                  ...d,
                  cardCount: newCount,
                  masteredCount,
                  updatedAt: Date.now(),
                }
              : d
          )
        );
      }
    },
    [user, cards]
  );

  // Update card mastery & log practice session atomically
  const recordPracticeResults = useCallback(
    async (params: {
      deck: Deck;
      mode: PracticeMode;
      results: Array<{ cardId: string; isCorrect: boolean; explicitMastery?: MasteryLevel }>;
      totalItems: number;
      correctCount: number;
      durationSeconds: number;
    }) => {
      const { deck, mode, results, totalItems, correctCount, durationSeconds } =
        params;
      const sessionId = createUniqueId('sess');
      const safeTotal = Math.max(1, Math.round(totalItems));
      const safeCorrect = Math.min(safeTotal, Math.max(0, Math.round(correctCount)));
      const accuracy = Math.min(
        100,
        Math.max(0, Math.round((safeCorrect / safeTotal) * 100))
      );
      const safeDuration = Math.min(86400, Math.max(1, Math.round(durationSeconds)));
      const dateKey = getTodayDateKey();

      // Compute updated cards map
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
        } else if (delta.corrects > 0 && correct >= 2 && correct / reviewCount >= 0.7) {
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
          updatedAt: Date.now(),
        };
      });

      const newMasteredCount = updatedDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;

      if (user && user.emailVerified) {
        const uid = user.uid;
        const sessionPath = `users/${uid}/studySessions/${sessionId}`;
        const deckPath = `users/${uid}/decks/${deck.id}`;
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, sessionPath), {
            id: sessionId,
            ownerId: uid,
            deckId: deck.id,
            deckTitle: clampString(deck.title, LIMITS.TITLE_MAX),
            mode,
            totalItems: safeTotal,
            correctCount: safeCorrect,
            accuracy,
            durationSeconds: safeDuration,
            dateKey,
            completedAt: serverTimestamp(),
          });

          for (const updated of updatedDeckCards) {
            if (!resultMap.has(updated.id)) continue;
            batch.update(doc(db, `${deckPath}/cards/${updated.id}`), {
              mastery: updated.mastery,
              reviewCount: updated.reviewCount,
              correctCount: updated.correctCount,
              updatedAt: serverTimestamp(),
            });
          }

          batch.update(doc(db, deckPath), {
            cardCount: updatedDeckCards.length,
            masteredCount: newMasteredCount,
            updatedAt: serverTimestamp(),
          });

          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, sessionPath);
        }
      } else {
        const now = Date.now();
        const newSession: StudySession = {
          id: sessionId,
          ownerId: 'local',
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
      }
    },
    [user, cards]
  );

  const deleteStudySession = useCallback(
    async (sessionId: string) => {
      if (user && user.emailVerified) {
        const uid = user.uid;
        const path = `users/${uid}/studySessions/${sessionId}`;
        try {
          await deleteDoc(doc(db, path));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      } else {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
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
      if (user && user.emailVerified) {
        const uid = user.uid;
        const userPath = `users/${uid}`;
        try {
          const displayName = clampString(
            user.displayName || user.email?.split('@')[0] || 'Học viên',
            LIMITS.DISPLAY_NAME_MAX
          );
          await updateDoc(doc(db, userPath), {
            displayName,
            dailyGoal: clamped,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, userPath);
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
    syncing,
    syncError,
    signInWithGoogle,
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
    recordPracticeResults,
    deleteStudySession,
    updateDailyGoal,
  };
}
