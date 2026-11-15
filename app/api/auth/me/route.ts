import { NextResponse } from 'next/server';
import { isNeonConfigured } from '@/db';
import { getUserWorkspace } from '@/db/queries';
import { clearSessionCookie, getAuthenticatedUserId } from '@/lib/auth';

export async function GET() {
  if (!isNeonConfigured()) {
    return NextResponse.json({
      configured: false,
      user: null,
    });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({
        configured: true,
        user: null,
      });
    }

    const workspace = await getUserWorkspace(userId);
    if (!workspace) {
      await clearSessionCookie();
      return NextResponse.json({
        configured: true,
        user: null,
      });
    }

    return NextResponse.json({
      configured: true,
      ...workspace,
    });
  } catch (error) {
    console.error('GET /api/auth/me error:', error);
    return NextResponse.json(
      {
        configured: true,
        user: null,
        error: 'Không thể tải dữ liệu tài khoản từ Neon.',
      },
      { status: 500 }
    );
  }
}
