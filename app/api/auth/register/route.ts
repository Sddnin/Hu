import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { getUserWorkspace } from '@/db/queries';
import { decks, flashcards, studySessions, users } from '@/db/schema';
import {
  hashPassword,
  setSessionCookie,
  validatePassword,
  validateUsername,
} from '@/lib/auth';
import { buildStarterData } from '@/lib/seed-data';
import {
  Deck,
  Flashcard,
  LIMITS,
  PracticeMode,
  StudySession,
  getTodayDateKey,
  normalizeTags,
} from '@/lib/types';

function clampString(val: unknown, max: number): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

function makeServerId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json(
      {
        error:
          'Chưa cấu hình biến môi trường DATABASE_URL (hoặc POSTGRES_URL) của Vercel Neon.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const rawUsername = typeof body.username === 'string' ? body.username : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';
    const rawDisplayName =
      typeof body.displayName === 'string' ? body.displayName : '';
    const importGuestData = Boolean(body.importGuestData);

    const userCheck = validateUsername(rawUsername);
    if (!userCheck.ok) {
      return NextResponse.json({ error: userCheck.error }, { status: 400 });
    }

    const passCheck = validatePassword(rawPassword);
    if (!passCheck.ok) {
      return NextResponse.json({ error: passCheck.error }, { status: 400 });
    }

    await ensureNeonSchema();
    const db = getDb();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, userCheck.normalized))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.' },
        { status: 409 }
      );
    }

    const now = Date.now();
    const userId = makeServerId('usr');
    const displayName =
      clampString(rawDisplayName, LIMITS.DISPLAY_NAME_MAX) ||
      userCheck.original;
    const passwordHash = await hashPassword(rawPassword);

    const guestGoal = Number(body.dailyGoal);
    const dailyGoal = Number.isFinite(guestGoal)
      ? Math.min(
          LIMITS.DAILY_GOAL_MAX,
          Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(guestGoal))
        )
      : 20;

    await db.insert(users).values({
      id: userId,
      username: userCheck.normalized,
      displayName,
      passwordHash,
      dailyGoal,
      createdAt: now,
      updatedAt: now,
    });

    // Seed decks & cards (either imported from guest session or fresh starter decks)
    const guestDecks: Deck[] =
      importGuestData && Array.isArray(body.decks) ? body.decks.slice(0, 30) : [];
    const guestCards: Flashcard[] =
      importGuestData && Array.isArray(body.cards) ? body.cards.slice(0, 500) : [];
    const guestSessions: StudySession[] =
      importGuestData && Array.isArray(body.sessions)
        ? body.sessions.slice(0, 100)
        : [];

    const starter = buildStarterData(userId);
    const sourceDecks = guestDecks.length > 0 ? guestDecks : starter.decks;
    const sourceCards = guestDecks.length > 0 ? guestCards : starter.cards;

    const deckIdMap = new Map<string, string>();
    const deckRows: Array<typeof decks.$inferInsert> = [];
    const cardRows: Array<typeof flashcards.$inferInsert> = [];

    for (let i = 0; i < sourceDecks.length; i++) {
      const src = sourceDecks[i];
      const newDeckId = makeServerId('deck');
      deckIdMap.set(src.id, newDeckId);

      const srcDeckCards = sourceCards.filter((c) => c.deckId === src.id);
      const masteredCount = srcDeckCards.filter(
        (c) => c.mastery === 'mastered'
      ).length;

      deckRows.push({
        id: newDeckId,
        userId,
        title: clampString(src.title, LIMITS.TITLE_MAX) || 'Bộ thẻ',
        description: clampString(src.description, LIMITS.DESC_MAX),
        category: clampString(src.category, LIMITS.CATEGORY_MAX) || 'Chung',
        cardCount: srcDeckCards.length,
        masteredCount,
        createdAt: Number(src.createdAt) || now + i,
        updatedAt: Number(src.updatedAt) || now + i,
      });

      for (let j = 0; j < srcDeckCards.length; j++) {
        const c = srcDeckCards[j];
        const reviewCount = Math.max(0, Math.round(Number(c.reviewCount) || 0));
        const correctCount = Math.min(
          reviewCount,
          Math.max(0, Math.round(Number(c.correctCount) || 0))
        );
        const mastery =
          c.mastery === 'mastered' || c.mastery === 'learning'
            ? c.mastery
            : 'new';

        cardRows.push({
          id: makeServerId('card'),
          deckId: newDeckId,
          userId,
          term: clampString(c.term, LIMITS.TERM_MAX) || 'word',
          phonetic: clampString(c.phonetic, LIMITS.PHONETIC_MAX),
          partOfSpeech: clampString(c.partOfSpeech, LIMITS.POS_MAX),
          meaning: clampString(c.meaning, LIMITS.MEANING_MAX) || 'nghĩa',
          example: clampString(c.example, LIMITS.EXAMPLE_MAX),
          tagsJson: JSON.stringify(
            normalizeTags((c as { tags?: unknown }).tags)
          ),
          mastery,
          reviewCount,
          correctCount,
          starred: Boolean(c.starred),
          createdAt: Number(c.createdAt) || now + j,
          updatedAt: Number(c.updatedAt) || now + j,
        });
      }
    }

    if (deckRows.length > 0) {
      await db.insert(decks).values(deckRows);
    }
    if (cardRows.length > 0) {
      await db.insert(flashcards).values(cardRows);
    }

    if (guestSessions.length > 0) {
      const validModes = new Set<PracticeMode>([
        'flip',
        'learn',
        'quiz',
        'fill',
        'match',
        'spell',
        'speak',
        'blast',
        'meteor',
        'tank',
        'test',
      ]);
      const sessionRows: Array<typeof studySessions.$inferInsert> =
        guestSessions.map((s) => {
          const totalItems = Math.max(1, Math.round(Number(s.totalItems) || 1));
          const correctCount = Math.min(
            totalItems,
            Math.max(0, Math.round(Number(s.correctCount) || 0))
          );
          const accuracy = Math.min(
            100,
            Math.max(0, Math.round((correctCount / totalItems) * 100))
          );
          const mappedDeckId = deckIdMap.get(s.deckId) || s.deckId;
          return {
            id: makeServerId('sess'),
            userId,
            deckId: mappedDeckId,
            deckTitle: clampString(s.deckTitle, LIMITS.TITLE_MAX) || 'Bộ thẻ',
            mode: validModes.has(s.mode) ? s.mode : 'flip',
            totalItems,
            correctCount,
            accuracy,
            durationSeconds: Math.min(
              86400,
              Math.max(1, Math.round(Number(s.durationSeconds) || 1))
            ),
            dateKey:
              typeof s.dateKey === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(s.dateKey)
                ? s.dateKey
                : getTodayDateKey(),
            completedAt: Number(s.completedAt) || now,
          };
        });

      await db.insert(studySessions).values(sessionRows);
    }

    await setSessionCookie(userId);
    const workspace = await getUserWorkspace(userId);

    return NextResponse.json(
      {
        configured: true,
        ...workspace,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/auth/register error:', error);
    return NextResponse.json(
      { error: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
