import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapUserRow } from '@/db/queries';
import { users } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS } from '@/lib/types';

export async function PATCH(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: Date.now(),
    };

    if (body.dailyGoal !== undefined) {
      const parsed = Number(body.dailyGoal);
      if (Number.isFinite(parsed)) {
        patch.dailyGoal = Math.min(
          LIMITS.DAILY_GOAL_MAX,
          Math.max(LIMITS.DAILY_GOAL_MIN, Math.round(parsed))
        );
      }
    }

    if (typeof body.displayName === 'string') {
      const cleaned = body.displayName.trim().slice(0, LIMITS.DISPLAY_NAME_MAX);
      if (cleaned) {
        patch.displayName = cleaned;
      }
    }

    await ensureNeonSchema();
    const db = getDb();

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Không tìm thấy tài khoản.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: mapUserRow(updated) });
  } catch (error) {
    console.error('PATCH /api/profile error:', error);
    return NextResponse.json(
      { error: 'Không thể cập nhật hồ sơ.' },
      { status: 500 }
    );
  }
}
