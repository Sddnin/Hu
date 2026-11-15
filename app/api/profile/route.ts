import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapUserRow } from '@/db/queries';
import { users } from '@/db/schema';
import {
  getAuthenticatedUserId,
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth';
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
    await ensureNeonSchema();
    const db = getDb();

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: 'Không tìm thấy tài khoản.' },
        { status: 404 }
      );
    }

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
      if (!cleaned) {
        return NextResponse.json(
          { error: 'Tên hiển thị không được để trống.' },
          { status: 400 }
        );
      }
      patch.displayName = cleaned;
    }

    if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Vui lòng nhập mật khẩu hiện tại.' },
          { status: 400 }
        );
      }
      const validCurrent = await verifyPassword(
        currentPassword,
        existing.passwordHash
      );
      if (!validCurrent) {
        return NextResponse.json(
          { error: 'Mật khẩu hiện tại không chính xác.' },
          { status: 401 }
        );
      }
      const passCheck = validatePassword(body.newPassword);
      if (!passCheck.ok) {
        return NextResponse.json({ error: passCheck.error }, { status: 400 });
      }
      patch.passwordHash = await hashPassword(body.newPassword);
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();

    return NextResponse.json({ user: mapUserRow(updated) });
  } catch (error) {
    console.error('PATCH /api/profile error:', error);
    return NextResponse.json(
      { error: 'Không thể cập nhật tài khoản.' },
      { status: 500 }
    );
  }
}
