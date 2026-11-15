import { and, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { communityDecks } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { id } = await context.params;
    await ensureNeonSchema();
    const db = getDb();

    const [updated] = await db
      .update(communityDecks)
      .set({
        downloadsCount: sql`${communityDecks.downloadsCount} + 1`,
      })
      .where(eq(communityDecks.id, id))
      .returning({ downloadsCount: communityDecks.downloadsCount });

    return NextResponse.json({
      ok: true,
      downloadsCount: updated?.downloadsCount ?? 1,
    });
  } catch (error) {
    console.error('POST /api/community/[id] error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
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

    const deleted = await db
      .delete(communityDecks)
      .where(
        and(eq(communityDecks.id, id), eq(communityDecks.authorUserId, userId))
      )
      .returning({ id: communityDecks.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy hoặc bạn không có quyền gỡ bộ thẻ này.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/community/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể gỡ bộ thẻ.' },
      { status: 500 }
    );
  }
}
