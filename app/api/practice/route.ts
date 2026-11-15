import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import {
  mapCardRow,
  mapSessionRow,
  recomputeDeckStats,
} from '@/db/queries';
import { decks, flashcards, studySessions } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  LIMITS,
  MasteryLevel,
  PracticeMode,
  getTodayDateKey,
} from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const deckId = typeof body.deckId === 'string' ? body.deckId.trim() : '';
    const deckTitle =
      typeof body.deckTitle === 'string'
        ? body.deckTitle.trim().slice(0, LIMITS.TITLE_MAX)
        : 'Bộ thẻ';

    const validModes = new Set<PracticeMode>([
      'flip',
      'learn',
      'quiz',
      'fill',
      'match',
      'spell',
      'test',
    ]);
    const mode: PracticeMode = validModes.has(body.mode) ? body.mode : 'flip';

    const totalItems = Math.max(1, Math.round(Number(body.totalItems) || 1));
    const correctCount = Math.min(
      totalItems,
      Math.max(0, Math.round(Number(body.correctCount) || 0))
    );
    const accuracy = Math.min(
      100,
      Math.max(0, Math.round((correctCount / totalItems) * 100))
    );
    const durationSeconds = Math.min(
      86400,
      Math.max(1, Math.round(Number(body.durationSeconds) || 1))
    );
    const dateKey =
      typeof body.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateKey)
        ? body.dateKey
        : getTodayDateKey();

    await ensureNeonSchema();
    const db = getDb();

    const [deckRow] = await db
      .select({ id: decks.id, title: decks.title })
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
      .limit(1);

    if (!deckRow) {
      return NextResponse.json(
        { error: 'Không tìm thấy bộ thẻ.' },
        { status: 404 }
      );
    }

    const now = Date.now();
    const cardUpdates: Array<{
      id: string;
      mastery: MasteryLevel;
      reviewCount: number;
      correctCount: number;
    }> = Array.isArray(body.cardUpdates) ? body.cardUpdates : [];

    const updatedCards = [];
    for (const cu of cardUpdates) {
      if (!cu || typeof cu.id !== 'string') continue;
      const mastery: MasteryLevel =
        cu.mastery === 'mastered' || cu.mastery === 'learning'
          ? cu.mastery
          : 'new';
      const reviewCount = Math.max(0, Math.round(Number(cu.reviewCount) || 0));
      const cardCorrect = Math.min(
        reviewCount,
        Math.max(0, Math.round(Number(cu.correctCount) || 0))
      );

      const [updated] = await db
        .update(flashcards)
        .set({
          mastery,
          reviewCount,
          correctCount: cardCorrect,
          updatedAt: now,
        })
        .where(and(eq(flashcards.id, cu.id), eq(flashcards.userId, userId)))
        .returning();

      if (updated) {
        updatedCards.push(mapCardRow(updated));
      }
    }

    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim().slice(0, 120)
        : `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const [insertedSession] = await db
      .insert(studySessions)
      .values({
        id: sessionId,
        userId,
        deckId: deckRow.id,
        deckTitle: deckTitle || deckRow.title,
        mode,
        totalItems,
        correctCount,
        accuracy,
        durationSeconds,
        dateKey,
        completedAt: now,
      })
      .returning();

    const deckStats = await recomputeDeckStats(deckRow.id, userId);

    return NextResponse.json(
      {
        session: mapSessionRow(insertedSession),
        updatedCards,
        deckStats,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/practice error:', error);
    return NextResponse.json(
      { error: 'Không thể lưu lịch sử luyện tập.' },
      { status: 500 }
    );
  }
}
