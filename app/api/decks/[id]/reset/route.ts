import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { decks, flashcards } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
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
    const now = Date.now();

    await ensureNeonSchema();
    const db = getDb();

    const [deck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .limit(1);

    if (!deck) {
      return NextResponse.json(
        { error: 'Không tìm thấy bộ thẻ.' },
        { status: 404 }
      );
    }

    await db
      .update(flashcards)
      .set({
        mastery: 'new',
        reviewCount: 0,
        correctCount: 0,
        updatedAt: now,
      })
      .where(and(eq(flashcards.deckId, id), eq(flashcards.userId, userId)));

    await db
      .update(decks)
      .set({
        masteredCount: 0,
        updatedAt: now,
      })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/decks/[id]/reset error:', error);
    return NextResponse.json(
      { error: 'Không thể đặt lại tiến độ bộ thẻ.' },
      { status: 500 }
    );
  }
}
