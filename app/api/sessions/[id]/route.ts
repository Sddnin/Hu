import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { studySessions } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

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
      .delete(studySessions)
      .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/sessions/[id] error:', error);
    return NextResponse.json(
      { error: 'Không thể xóa phiên học.' },
      { status: 500 }
    );
  }
}
