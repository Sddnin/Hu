import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapCardRow, mapDeckRow } from '@/db/queries';
import { decks, flashcards } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS } from '@/lib/types';

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const newDeckId =
      typeof body.newDeckId === 'string' && body.newDeckId.trim()
        ? body.newDeckId.trim().slice(0, 120)
        : makeId('deck');

    await ensureNeonSchema();
    const db = getDb();

    const [sourceDeck] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .limit(1);

    if (!sourceDeck) {
      return NextResponse.json(
        { error: 'Không tìm thấy bộ thẻ nguồn.' },
        { status: 404 }
      );
    }

    const sourceCards = await db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.deckId, id), eq(flashcards.userId, userId)))
      .orderBy(asc(flashcards.createdAt));

    const now = Date.now();
    const newTitle = `${sourceDeck.title} (Bản sao)`.slice(0, LIMITS.TITLE_MAX);

    const [createdDeck] = await db
      .insert(decks)
      .values({
        id: newDeckId,
        userId,
        title: newTitle,
        description: sourceDeck.description,
        category: sourceDeck.category,
        cardCount: sourceCards.length,
        masteredCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    let insertedCards: Array<typeof flashcards.$inferSelect> = [];
    if (sourceCards.length > 0) {
      insertedCards = await db
        .insert(flashcards)
        .values(
          sourceCards.map((c, idx) => ({
            id: makeId('card'),
            deckId: newDeckId,
            userId,
            term: c.term,
            phonetic: c.phonetic,
            partOfSpeech: c.partOfSpeech,
            meaning: c.meaning,
            example: c.example,
            tagsJson: c.tagsJson,
            mastery: 'new',
            reviewCount: 0,
            correctCount: 0,
            starred: c.starred,
            createdAt: now + idx,
            updatedAt: now + idx,
          }))
        )
        .returning();
    }

    return NextResponse.json(
      {
        deck: mapDeckRow(createdDeck),
        cards: insertedCards.map(mapCardRow),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/decks/[id]/duplicate error:', error);
    return NextResponse.json(
      { error: 'Không thể nhân bản bộ thẻ.' },
      { status: 500 }
    );
  }
}
