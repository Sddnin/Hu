import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapDeckRow } from '@/db/queries';
import { decks } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS } from '@/lib/types';

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
    const title = clamp(body.title, LIMITS.TITLE_MAX) || 'Bộ thẻ';
    const description = clamp(body.description, LIMITS.DESC_MAX);
    const category = clamp(body.category, LIMITS.CATEGORY_MAX) || 'Cá nhân';
    const now = Date.now();

    await ensureNeonSchema();
    const db = getDb();

    const [updated] = await db
      .update(decks)
      .set({ title, description, category, updatedAt: now })
      .where(and(eq(decks.id, id), eq(decks.userId, userId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Không tìm thấy bộ thẻ.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ deck: mapDeckRow(updated) });
  } catch (error) {
    console.error('PATCH /api/decks/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể cập nhật bộ thẻ.' },
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

    await db
      .delete(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/decks/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể xóa bộ thẻ.' },
      { status: 500 }
    );
  }
}
