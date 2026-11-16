import { NextRequest, NextResponse } from 'next/server';
import { isNeonConfigured } from '@/db';
import { claimDailyMission, getUserMissionsAndQuota } from '@/lib/ai-quota';
import { getAuthenticatedUserId } from '@/lib/auth';
import { evaluateMissionsProgress, getVnTodayDateKey } from '@/lib/missions';
import { AiQuotaSnapshot, LIMITS } from '@/lib/types';

function emptyGuestQuota(): AiQuotaSnapshot {
  return {
    dateKey: getVnTodayDateKey(),
    chatUsed: 0,
    chatBonus: 0,
    chatLimit: LIMITS.BASE_CHAT_LIMIT,
    chatRemaining: LIMITS.BASE_CHAT_LIMIT,
    speakUsed: 0,
    speakBonus: 0,
    speakLimit: LIMITS.BASE_SPEAK_LIMIT,
    speakRemaining: LIMITS.BASE_SPEAK_LIMIT,
  };
}

export async function GET() {
  if (!isNeonConfigured()) {
    const vnDateKey = getVnTodayDateKey();
    return NextResponse.json({
      configured: false,
      authenticated: false,
      quota: emptyGuestQuota(),
      missions: evaluateMissionsProgress({
        dateKey: vnDateKey,
        isLoggedIn: false,
        dailyGoal: 20,
        starredCount: 0,
        todaySessions: [],
        claimedIds: [],
      }),
      claimedIds: [],
    });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      const vnDateKey = getVnTodayDateKey();
      return NextResponse.json({
        configured: true,
        authenticated: false,
        quota: emptyGuestQuota(),
        missions: evaluateMissionsProgress({
          dateKey: vnDateKey,
          isLoggedIn: false,
          dailyGoal: 20,
          starredCount: 0,
          todaySessions: [],
          claimedIds: [],
        }),
        claimedIds: [],
      });
    }

    const data = await getUserMissionsAndQuota(userId);
    return NextResponse.json({
      configured: true,
      authenticated: true,
      ...data,
    });
  } catch (error) {
    console.error('GET /api/missions error:', error);
    return NextResponse.json(
      { error: 'Không thể tải danh sách nhiệm vụ và lượt dùng AI.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json(
      { error: 'Hệ thống tài khoản chưa được cấu hình cơ sở dữ liệu.' },
      { status: 503 }
    );
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để nhận thưởng nhiệm vụ hằng ngày.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const missionId =
      typeof body.missionId === 'string' ? body.missionId.trim() : '';

    if (!missionId) {
      return NextResponse.json(
        { error: 'Thiếu mã nhiệm vụ cần nhận thưởng.' },
        { status: 400 }
      );
    }

    const result = await claimDailyMission(userId, missionId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/missions error:', error);
    return NextResponse.json(
      { error: 'Không thể nhận thưởng nhiệm vụ lúc này.' },
      { status: 500 }
    );
  }
}
