import crypto from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import {
  flashcards,
  leaderboardEntries,
  studySessions,
  users,
} from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  LIMITS,
  LeaderboardEntry,
  LeaderboardMode,
  StreakLeaderboardEntry,
  getTodayDateKey,
} from '@/lib/types';

const VALID_LB_MODES = new Set<LeaderboardMode>([
  'flip',
  'learn',
  'quiz',
  'fill',
  'match',
  'match_columns',
  'match_grid',
  'match_memory',
  'spell',
  'blast',
  'meteor',
  'test',
]);

function computeStreakDaysFromDates(dateKeys: string[]): number {
  if (dateKeys.length === 0) return 0;
  const activeDates = new Set(dateKeys);
  let streak = 0;
  const cursor = new Date();
  const todayKey = getTodayDateKey(cursor);
  if (!activeDates.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const key = getTodayDateKey(cursor);
    if (activeDates.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function mapLeaderboardRow(
  row: typeof leaderboardEntries.$inferSelect
): LeaderboardEntry {
  return {
    id: row.id,
    userId: row.userId ?? null,
    playerName: row.playerName,
    deckId: row.deckId,
    deckTitle: row.deckTitle,
    mode: (VALID_LB_MODES.has(row.mode as LeaderboardMode)
      ? row.mode
      : 'quiz') as LeaderboardMode,
    score: row.score,
    accuracy: row.accuracy,
    durationSeconds: row.durationSeconds,
    streak: row.streak,
    createdAt: Number(row.createdAt),
  };
}

export async function GET(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({
      configured: false,
      entries: [],
      streakLeaders: [],
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get('deckId')?.trim() || '';
    const mode = searchParams.get('mode')?.trim() || '';
    const limit = Math.min(50, Math.max(5, Number(searchParams.get('limit')) || 30));

    await ensureNeonSchema();
    const db = getDb();

    const conditions = [];
    if (deckId && deckId !== 'all') {
      conditions.push(eq(leaderboardEntries.deckId, deckId));
    }
    if (mode && mode !== 'all' && VALID_LB_MODES.has(mode as LeaderboardMode)) {
      conditions.push(eq(leaderboardEntries.mode, mode));
    }

    const entryRows = await db
      .select()
      .from(leaderboardEntries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(leaderboardEntries.score),
        desc(leaderboardEntries.accuracy),
        asc(leaderboardEntries.durationSeconds),
        desc(leaderboardEntries.createdAt)
      )
      .limit(limit);

    // Compute Streak & Cumulative Score Leaderboard across users
    const [allUsers, allSessions, allMasteredCards, allLbRows] =
      await Promise.all([
        db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          })
          .from(users),
        db
          .select({
            userId: studySessions.userId,
            dateKey: studySessions.dateKey,
          })
          .from(studySessions),
        db
          .select({
            userId: flashcards.userId,
            mastery: flashcards.mastery,
          })
          .from(flashcards)
          .where(eq(flashcards.mastery, 'mastered')),
        db
          .select({
            userId: leaderboardEntries.userId,
            score: leaderboardEntries.score,
          })
          .from(leaderboardEntries),
      ]);

    const datesByUser = new Map<string, string[]>();
    const sessionsCountByUser = new Map<string, number>();
    for (const s of allSessions) {
      const list = datesByUser.get(s.userId) || [];
      list.push(s.dateKey);
      datesByUser.set(s.userId, list);
      sessionsCountByUser.set(
        s.userId,
        (sessionsCountByUser.get(s.userId) || 0) + 1
      );
    }

    const masteredByUser = new Map<string, number>();
    for (const c of allMasteredCards) {
      masteredByUser.set(c.userId, (masteredByUser.get(c.userId) || 0) + 1);
    }

    const scoreByUser = new Map<string, number>();
    for (const lb of allLbRows) {
      if (!lb.userId) continue;
      scoreByUser.set(lb.userId, (scoreByUser.get(lb.userId) || 0) + lb.score);
    }

    const streakLeaders: StreakLeaderboardEntry[] = allUsers
      .map((u) => ({
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        streakDays: computeStreakDaysFromDates(datesByUser.get(u.id) || []),
        totalSessions: sessionsCountByUser.get(u.id) || 0,
        totalScore: scoreByUser.get(u.id) || 0,
        masteredCount: masteredByUser.get(u.id) || 0,
      }))
      .sort(
        (a, b) =>
          b.streakDays - a.streakDays ||
          b.totalScore - a.totalScore ||
          b.masteredCount - a.masteredCount
      )
      .slice(0, 20);

    return NextResponse.json({
      configured: true,
      entries: entryRows.map(mapLeaderboardRow),
      streakLeaders,
    });
  } catch (error) {
    console.error('GET /api/leaderboard error:', error);
    return NextResponse.json(
      { error: 'Không thể tải Bảng xếp hạng.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập tài khoản để ghi danh lên Bảng xếp hạng.' },
        { status: 401 }
      );
    }
    const body = await req.json();

    const deckId =
      typeof body.deckId === 'string' && body.deckId.trim()
        ? body.deckId.trim().slice(0, 120)
        : 'unknown';
    const deckTitle =
      typeof body.deckTitle === 'string' && body.deckTitle.trim()
        ? body.deckTitle.trim().slice(0, LIMITS.TITLE_MAX)
        : 'Bộ thẻ';
    const mode: LeaderboardMode = VALID_LB_MODES.has(body.mode)
      ? body.mode
      : 'quiz';
    const score = Math.max(0, Math.min(1000000, Math.round(Number(body.score) || 0)));
    const accuracy = Math.max(
      0,
      Math.min(100, Math.round(Number(body.accuracy) || 0))
    );
    const durationSeconds = Math.max(
      1,
      Math.min(86400, Math.round(Number(body.durationSeconds) || 1))
    );
    const streak = Math.max(0, Math.min(999, Math.round(Number(body.streak) || 0)));

    await ensureNeonSchema();
    const db = getDb();

    const [u] = await db
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!u) {
      return NextResponse.json(
        { error: 'Tài khoản không hợp lệ. Vui lòng đăng nhập lại.' },
        { status: 401 }
      );
    }

    const playerName = u.displayName || u.username;

    const id =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim().slice(0, 120)
        : `lb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const [inserted] = await db
      .insert(leaderboardEntries)
      .values({
        id,
        userId: userId ?? null,
        playerName,
        deckId,
        deckTitle,
        mode,
        score,
        accuracy,
        durationSeconds,
        streak,
        createdAt: Date.now(),
      })
      .returning();

    return NextResponse.json(
      { entry: mapLeaderboardRow(inserted) },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/leaderboard error:', error);
    return NextResponse.json(
      { error: 'Không thể lưu điểm xếp hạng.' },
      { status: 500 }
    );
  }
}
