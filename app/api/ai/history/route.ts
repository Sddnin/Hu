import { NextRequest, NextResponse } from 'next/server';
import { isNeonConfigured } from '@/db';
import {
  clearAllAiChatSessions,
  deleteAiChatSession,
  getAiChatSession,
  listAiChatSessions,
} from '@/lib/ai-history';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({
      configured: false,
      sessions: [],
      session: null,
    });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để xem lịch sử trò chuyện.' },
        { status: 401 }
      );
    }

    const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim() || '';
    if (sessionId) {
      const session = await getAiChatSession(userId, sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Không tìm thấy cuộc trò chuyện này.' },
          { status: 404 }
        );
      }
      return NextResponse.json({ configured: true, session });
    }

    const sessions = await listAiChatSessions(userId, 30);
    const latestSession =
      sessions.length > 0
        ? await getAiChatSession(userId, sessions[0].id)
        : null;

    return NextResponse.json({
      configured: true,
      sessions,
      latestSession,
    });
  } catch (error) {
    console.error('GET /api/ai/history error:', error);
    return NextResponse.json(
      { error: 'Không thể tải lịch sử trò chuyện AI.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để xóa lịch sử trò chuyện.' },
        { status: 401 }
      );
    }

    const deleteAll = req.nextUrl.searchParams.get('all') === '1';
    const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim() || '';

    if (deleteAll) {
      await clearAllAiChatSessions(userId);
      return NextResponse.json({ ok: true });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Thiếu mã cuộc trò chuyện cần xóa.' },
        { status: 400 }
      );
    }

    await deleteAiChatSession(userId, sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/ai/history error:', error);
    return NextResponse.json(
      { error: 'Không thể xóa lịch sử trò chuyện lúc này.' },
      { status: 500 }
    );
  }
}
