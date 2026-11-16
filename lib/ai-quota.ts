import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { ensureNeonSchema, getDb } from '@/db';
import {
  flashcards,
  studySessions,
  userDailyQuotas,
  userMissionClaims,
  users,
} from '@/db/schema';
import {
  MissionProgressItem,
  evaluateMissionsProgress,
  getDailyMissionsForDate,
  getVnTodayDateKey,
} from './missions';
import { AiQuotaSnapshot, LIMITS, getTodayDateKey } from './types';

function buildQuotaSnapshot(row: {
  dateKey: string;
  chatUsed: number;
  speakUsed: number;
  chatBonus: number;
  speakBonus: number;
}): AiQuotaSnapshot {
  const chatLimit = LIMITS.BASE_CHAT_LIMIT + Math.max(0, row.chatBonus);
  const speakLimit = LIMITS.BASE_SPEAK_LIMIT + Math.max(0, row.speakBonus);
  return {
    dateKey: row.dateKey,
    chatUsed: row.chatUsed,
    chatBonus: row.chatBonus,
    chatLimit,
    chatRemaining: Math.max(0, chatLimit - row.chatUsed),
    speakUsed: row.speakUsed,
    speakBonus: row.speakBonus,
    speakLimit,
    speakRemaining: Math.max(0, speakLimit - row.speakUsed),
  };
}

export async function getOrCreateDailyQuota(
  userId: string,
  dateKey = getVnTodayDateKey()
): Promise<AiQuotaSnapshot> {
  await ensureNeonSchema();
  const db = getDb();
  const rowId = `${userId}_${dateKey}`;

  const [existing] = await db
    .select()
    .from(userDailyQuotas)
    .where(eq(userDailyQuotas.id, rowId))
    .limit(1);

  if (existing) {
    return buildQuotaSnapshot(existing);
  }

  const now = Date.now();
  await db
    .insert(userDailyQuotas)
    .values({
      id: rowId,
      userId,
      dateKey,
      chatUsed: 0,
      speakUsed: 0,
      chatBonus: 0,
      speakBonus: 0,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(userDailyQuotas)
    .where(eq(userDailyQuotas.id, rowId))
    .limit(1);

  return buildQuotaSnapshot(
    created || {
      dateKey,
      chatUsed: 0,
      speakUsed: 0,
      chatBonus: 0,
      speakBonus: 0,
    }
  );
}

export async function consumeChatTurn(
  userId: string,
  dateKey = getVnTodayDateKey()
): Promise<{ allowed: boolean; quota: AiQuotaSnapshot }> {
  await getOrCreateDailyQuota(userId, dateKey);
  const db = getDb();
  const rowId = `${userId}_${dateKey}`;
  const now = Date.now();

  const updated = await db
    .update(userDailyQuotas)
    .set({
      chatUsed: drizzleSql`${userDailyQuotas.chatUsed} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(userDailyQuotas.id, rowId),
        drizzleSql`${userDailyQuotas.chatUsed} < ${LIMITS.BASE_CHAT_LIMIT} + ${userDailyQuotas.chatBonus}`
      )
    )
    .returning();

  if (updated.length > 0) {
    return { allowed: true, quota: buildQuotaSnapshot(updated[0]) };
  }

  const current = await getOrCreateDailyQuota(userId, dateKey);
  return { allowed: false, quota: current };
}

export async function consumeSpeakTurn(
  userId: string,
  dateKey = getVnTodayDateKey()
): Promise<{ allowed: boolean; quota: AiQuotaSnapshot }> {
  await getOrCreateDailyQuota(userId, dateKey);
  const db = getDb();
  const rowId = `${userId}_${dateKey}`;
  const now = Date.now();

  const updated = await db
    .update(userDailyQuotas)
    .set({
      speakUsed: drizzleSql`${userDailyQuotas.speakUsed} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(userDailyQuotas.id, rowId),
        drizzleSql`${userDailyQuotas.speakUsed} < ${LIMITS.BASE_SPEAK_LIMIT} + ${userDailyQuotas.speakBonus}`
      )
    )
    .returning();

  if (updated.length > 0) {
    return { allowed: true, quota: buildQuotaSnapshot(updated[0]) };
  }

  const current = await getOrCreateDailyQuota(userId, dateKey);
  return { allowed: false, quota: current };
}

export async function getUserMissionsAndQuota(userId: string): Promise<{
  quota: AiQuotaSnapshot;
  missions: MissionProgressItem[];
  claimedIds: string[];
}> {
  const vnDateKey = getVnTodayDateKey();
  const localDateKey = getTodayDateKey();
  const quota = await getOrCreateDailyQuota(userId, vnDateKey);
  const db = getDb();

  const [userRows, sessionRows, starredRows, claimRows] = await Promise.all([
    db
      .select({ dailyGoal: users.dailyGoal })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        mode: studySessions.mode,
        totalItems: studySessions.totalItems,
        accuracy: studySessions.accuracy,
        dateKey: studySessions.dateKey,
      })
      .from(studySessions)
      .where(eq(studySessions.userId, userId)),
    db
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(and(eq(flashcards.userId, userId), eq(flashcards.starred, true))),
    db
      .select({ missionId: userMissionClaims.missionId })
      .from(userMissionClaims)
      .where(
        and(
          eq(userMissionClaims.userId, userId),
          eq(userMissionClaims.dateKey, vnDateKey)
        )
      ),
  ]);

  const dailyGoal = userRows[0]?.dailyGoal ?? 20;
  const todaySessions = sessionRows.filter(
    (s) => s.dateKey === vnDateKey || s.dateKey === localDateKey
  );
  const claimedIds = claimRows.map((c) => c.missionId);

  const missions = evaluateMissionsProgress({
    dateKey: vnDateKey,
    isLoggedIn: true,
    dailyGoal,
    starredCount: starredRows.length,
    todaySessions,
    claimedIds,
  });

  return { quota, missions, claimedIds };
}

export async function claimDailyMission(
  userId: string,
  missionId: string
): Promise<
  | {
      ok: true;
      quota: AiQuotaSnapshot;
      missions: MissionProgressItem[];
      claimedIds: string[];
      chatReward: number;
      speakReward: number;
    }
  | { ok: false; status: number; error: string }
> {
  const vnDateKey = getVnTodayDateKey();
  const todayMissions = getDailyMissionsForDate(vnDateKey);
  const def = todayMissions.find((m) => m.id === missionId);
  if (!def) {
    return {
      ok: false,
      status: 400,
      error: 'Nhiệm vụ không nằm trong 3 nhiệm vụ hôm nay.',
    };
  }

  const state = await getUserMissionsAndQuota(userId);
  const targetMission = state.missions.find((m) => m.id === missionId);

  if (!targetMission) {
    return { ok: false, status: 400, error: 'Không tìm thấy nhiệm vụ.' };
  }

  if (targetMission.claimed) {
    return {
      ok: false,
      status: 409,
      error: 'Bạn đã nhận thưởng nhiệm vụ này hôm nay rồi.',
    };
  }

  if (!targetMission.completed) {
    return {
      ok: false,
      status: 400,
      error: 'Bạn chưa hoàn thành điều kiện của nhiệm vụ này.',
    };
  }

  const db = getDb();
  const claimRowId = `${userId}_${vnDateKey}_${missionId}`;
  const now = Date.now();

  const inserted = await db
    .insert(userMissionClaims)
    .values({
      id: claimRowId,
      userId,
      dateKey: vnDateKey,
      missionId,
      chatReward: def.chatReward,
      speakReward: def.speakReward,
      claimedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'Bạn đã nhận thưởng nhiệm vụ này hôm nay rồi.',
    };
  }

  const quotaRowId = `${userId}_${vnDateKey}`;
  await getOrCreateDailyQuota(userId, vnDateKey);
  await db
    .update(userDailyQuotas)
    .set({
      chatBonus: drizzleSql`${userDailyQuotas.chatBonus} + ${def.chatReward}`,
      speakBonus: drizzleSql`${userDailyQuotas.speakBonus} + ${def.speakReward}`,
      updatedAt: now,
    })
    .where(eq(userDailyQuotas.id, quotaRowId));

  const updated = await getUserMissionsAndQuota(userId);
  return {
    ok: true,
    ...updated,
    chatReward: def.chatReward,
    speakReward: def.speakReward,
  };
}
