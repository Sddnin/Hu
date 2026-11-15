import { asc, desc, eq, and } from 'drizzle-orm';
import { getDb, ensureNeonSchema } from './index';
import { decks, flashcards, studySessions, users } from './schema';
import {
  AuthUser,
  Deck,
  Flashcard,
  MasteryLevel,
  PracticeMode,
  StudySession,
} from '@/lib/types';

export function mapUserRow(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    dailyGoal: row.dailyGoal,
  };
}

export function mapDeckRow(row: typeof decks.$inferSelect): Deck {
  return {
    id: row.id,
    ownerId: row.userId,
    title: row.title,
    description: row.description,
    category: row.category,
    cardCount: row.cardCount,
    masteredCount: row.masteredCount,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function mapCardRow(row: typeof flashcards.$inferSelect): Flashcard {
  return {
    id: row.id,
    deckId: row.deckId,
    ownerId: row.userId,
    term: row.term,
    phonetic: row.phonetic,
    partOfSpeech: row.partOfSpeech,
    meaning: row.meaning,
    example: row.example,
    mastery: (row.mastery as MasteryLevel) || 'new',
    reviewCount: row.reviewCount,
    correctCount: row.correctCount,
    starred: Boolean(row.starred),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function mapSessionRow(
  row: typeof studySessions.$inferSelect
): StudySession {
  return {
    id: row.id,
    ownerId: row.userId,
    deckId: row.deckId,
    deckTitle: row.deckTitle,
    mode: row.mode as PracticeMode,
    totalItems: row.totalItems,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    durationSeconds: row.durationSeconds,
    dateKey: row.dateKey,
    completedAt: Number(row.completedAt),
  };
}

export async function getUserWorkspace(userId: string): Promise<{
  user: AuthUser;
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySession[];
} | null> {
  await ensureNeonSchema();
  const db = getDb();

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) return null;

  const [deckRows, cardRows, sessionRows] = await Promise.all([
    db
      .select()
      .from(decks)
      .where(eq(decks.userId, userId))
      .orderBy(asc(decks.createdAt)),
    db
      .select()
      .from(flashcards)
      .where(eq(flashcards.userId, userId))
      .orderBy(asc(flashcards.createdAt)),
    db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.completedAt)),
  ]);

  return {
    user: mapUserRow(userRow),
    decks: deckRows.map(mapDeckRow),
    cards: cardRows.map(mapCardRow),
    sessions: sessionRows.map(mapSessionRow),
  };
}

export async function recomputeDeckStats(
  deckId: string,
  userId: string
): Promise<{ cardCount: number; masteredCount: number; updatedAt: number }> {
  const db = getDb();
  const rows = await db
    .select({ mastery: flashcards.mastery })
    .from(flashcards)
    .where(and(eq(flashcards.deckId, deckId), eq(flashcards.userId, userId)));

  const cardCount = rows.length;
  const masteredCount = rows.filter((r) => r.mastery === 'mastered').length;
  const updatedAt = Date.now();

  await db
    .update(decks)
    .set({ cardCount, masteredCount, updatedAt })
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)));

  return { cardCount, masteredCount, updatedAt };
}
