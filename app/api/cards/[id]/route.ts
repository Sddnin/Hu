import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapCardRow, recomputeDeckStats } from '@/db/queries';
import { flashcards } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS, normalizeTags } from '@/lib/types';

function clamp(val: unknown, max: number): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

export async function PATCH(
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
    const body = await req.json();
    const now = Date.now();

    await ensureNeonSchema();
    const db = getDb();

    const patch: Partial<typeof flashcards.$inferInsert> = {
      updatedAt: now,
    };

    if (typeof body.starred === 'boolean') {
      patch.starred = body.starred;
    }
    if (typeof body.term === 'string') {
      const t = clamp(body.term, LIMITS.TERM_MAX);
      if (t) patch.term = t;
    }
    if (typeof body.phonetic === 'string') {
      patch.phonetic = clamp(body.phonetic, LIMITS.PHONETIC_MAX);
    }
    if (typeof body.partOfSpeech === 'string') {
      patch.partOfSpeech = clamp(body.partOfSpeech, LIMITS.POS_MAX);
    }
    if (typeof body.meaning === 'string') {
      const m = clamp(body.meaning, LIMITS.MEANING_MAX);
      if (m) patch.meaning = m;
    }
    if (typeof body.example === 'string') {
      patch.example = clamp(body.example, LIMITS.EXAMPLE_MAX);
    }
    if (body.tags !== undefined) {
      patch.tagsJson = JSON.stringify(normalizeTags(body.tags));
    }

    const [updated] = await db
      .update(flashcards)
      .set(patch)
      .where(and(eq(flashcards.id, id), eq(flashcards.userId, userId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Không tìm thấy thẻ.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ card: mapCardRow(updated) });
  } catch (error) {
    console.error('PATCH /api/cards/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể cập nhật thẻ.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    await ensureNeonSchema();
    const db = getDb();

    const [deleted] = await db
      .delete(flashcards)
      .where(and(eq(flashcards.id, id), eq(flashcards.userId, userId)))
      .returning({ deckId: flashcards.deckId });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Không tìm thấy thẻ.' },
        { status: 404 }
      );
    }

    const deckStats = await recomputeDeckStats(deleted.deckId, userId);

    return NextResponse.json({ ok: true, deckId: deleted.deckId, deckStats });
  } catch (error) {
    console.error('DELETE /api/cards/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể xóa thẻ.' },
      { status: 500 }
    );
  }
}
