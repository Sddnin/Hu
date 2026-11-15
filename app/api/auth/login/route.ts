import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { getUserWorkspace } from '@/db/queries';
import { users } from '@/db/schema';
import { setSessionCookie, validateUsername, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json(
      {
        error:
          'Chưa cấu hình biến môi trường DATABASE_URL (hoặc POSTGRES_URL) của Vercel Neon.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const rawUsername = typeof body.username === 'string' ? body.username : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';

    const userCheck = validateUsername(rawUsername);
    if (!userCheck.ok || !rawPassword) {
      return NextResponse.json(
        { error: 'Tên đăng nhập hoặc mật khẩu không hợp lệ.' },
        { status: 400 }
      );
    }

    await ensureNeonSchema();
    const db = getDb();

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.username, userCheck.normalized))
      .limit(1);

    if (!userRow) {
      return NextResponse.json(
        { error: 'Sai tên đăng nhập hoặc mật khẩu.' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(rawPassword, userRow.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Sai tên đăng nhập hoặc mật khẩu.' },
        { status: 401 }
      );
    }

    await setSessionCookie(userRow.id);
    const workspace = await getUserWorkspace(userRow.id);

    return NextResponse.json({
      configured: true,
      ...workspace,
    });
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return NextResponse.json(
      { error: 'Đăng nhập thất bại. Vui lòng thử lại sau.' },
      { status: 500 }
    );
  }
}
