import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapCardRow, recomputeDeckStats } from '@/db/queries';
import { decks, flashcards } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS } from '@/lib/types';

function clamp(val: unknown, max: number): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

function makeCardId(): string {
  return `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

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
    if (!deckId) {
      return NextResponse.json({ error: 'Thiếu deckId.' }, { status: 400 });
    }

    await ensureNeonSchema();
    const db = getDb();

    const [deck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
      .limit(1);

    if (!deck) {
      return NextResponse.json(
        { error: 'Không tìm thấy bộ thẻ.' },
        { status: 404 }
      );
    }

    const rawItems = Array.isArray(body.items) ? body.items : [body];
    const now = Date.now();
    type CardInsert = typeof flashcards.$inferInsert;
    const rowsToInsert: CardInsert[] = rawItems
      .slice(0, 100)
      .map((item: Record<string, unknown>, idx: number): CardInsert | null => {
        const term = clamp(item.term, LIMITS.TERM_MAX);
        const meaning = clamp(item.meaning, LIMITS.MEANING_MAX);
        if (!term || !meaning) return null;
        return {
          id:
            typeof item.id === 'string' && item.id.trim()
              ? item.id.trim().slice(0, 120)
              : makeCardId(),
          deckId,
          userId,
          term,
          phonetic: clamp(item.phonetic, LIMITS.PHONETIC_MAX),
          partOfSpeech: clamp(item.partOfSpeech, LIMITS.POS_MAX),
          meaning,
          example: clamp(item.example, LIMITS.EXAMPLE_MAX),
          mastery: 'new',
          reviewCount: 0,
          correctCount: 0,
          starred: false,
          createdAt: now + idx,
          updatedAt: now + idx,
        };
      })
      .filter((x: CardInsert | null): x is CardInsert => x !== null);

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { error: 'Cần nhập đầy đủ từ vựng và nghĩa.' },
        { status: 400 }
      );
    }

    const inserted = await db
      .insert(flashcards)
      .values(rowsToInsert)
      .returning();

    const stats = await recomputeDeckStats(deckId, userId);

    return NextResponse.json(
      {
        cards: inserted.map(mapCardRow),
        deckStats: stats,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/cards error:', error);
    return NextResponse.json(
      { error: 'Không thể lưu thẻ từ vựng.' },
      { status: 500 }
    );
  }
}
