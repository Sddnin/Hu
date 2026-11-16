'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Flame,
  Gift,
  LogIn,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  DIFFICULTY_LABELS,
  MissionDifficulty,
  MissionProgressItem,
  MissionTargetAction,
  evaluateMissionsProgress,
  getVnTodayDateKey,
} from '@/lib/missions';
import {
  AiQuotaSnapshot,
  AuthUser,
  Flashcard,
  StudySession,
  getTodayDateKey,
} from '@/lib/types';

interface MissionsViewProps {
  user: AuthUser | null;
  cards: Flashcard[];
  sessions: StudySession[];
  dailyGoal: number;
  aiQuota: AiQuotaSnapshot;
  claimedMissionIds: string[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onClaimMission: (missionId: string) => Promise<{
    ok: boolean;
    error?: string;
    chatReward?: number;
    speakReward?: number;
  }>;
  onExecuteAction: (action: MissionTargetAction) => void;
  onOpenChatAi: () => void;
  onOpenSpeakPractice: () => void;
  onOpenAuth: () => void;
}

function difficultyBadgeClass(diff: MissionDifficulty): string {
  if (diff === 'easy') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  }
  if (diff === 'medium') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300';
  }
  return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
}

export function MissionsView({
  user,
  cards,
  sessions,
  dailyGoal,
  aiQuota,
  claimedMissionIds,
  loading,
  onRefresh,
  onClaimMission,
  onExecuteAction,
  onOpenChatAi,
  onOpenSpeakPractice,
  onOpenAuth,
}: MissionsViewProps) {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const localDateKey = getTodayDateKey();
  const activeDateKey = aiQuota.dateKey || getVnTodayDateKey();

  const missions: MissionProgressItem[] = useMemo(() => {
    const todaySessions = sessions.filter(
      (s) => s.dateKey === localDateKey || s.dateKey === activeDateKey
    );
    const starredCount = cards.filter((c) => c.starred).length;
    return evaluateMissionsProgress({
      dateKey: activeDateKey,
      isLoggedIn: Boolean(user),
      dailyGoal,
      starredCount,
      todaySessions,
      claimedIds: claimedMissionIds,
    });
  }, [
    user,
    cards,
    sessions,
    dailyGoal,
    localDateKey,
    activeDateKey,
    claimedMissionIds,
  ]);

  const completedCount = missions.filter((m) => m.completed).length;
  const claimedCount = missions.filter((m) => m.claimed).length;
  const claimableCount = missions.filter((m) => m.completed && !m.claimed).length;

  async function handleClaim(mission: MissionProgressItem) {
    if (!user) {
      onOpenAuth();
      return;
    }
    setClaimingId(mission.id);
    setFeedback(null);
    try {
      const res = await onClaimMission(mission.id);
      if (!res.ok) {
        setFeedback({
          ok: false,
          message: res.error || 'Chưa thể nhận thưởng nhiệm vụ này.',
        });
      } else {
        setFeedback({
          ok: true,
          message: `Đã nhận thưởng “${mission.title}”: +${res.chatReward ?? mission.chatReward} lượt Chat AI và +${res.speakReward ?? mission.speakReward} lượt Luyện nói AI!`,
        });
      }
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header & Live Quotas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            <Target className="h-4 w-4" aria-hidden="true" />
            <span>Nhiệm vụ hằng ngày</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            3 nhiệm vụ mỗi ngày · Dễ, Vừa & Khó
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Mỗi ngày có 3 nhiệm vụ (1 Dễ, 1 Vừa, 1 Khó). Lượt Nói AI mặc định 5 lượt/ngày (làm đủ 3 nhiệm vụ nhận thêm tối đa +5 = 10 lượt/ngày), Chat Qusin AI mặc định 10 lượt/ngày.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void onRefresh()}
          className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 sm:self-auto cursor-pointer"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Cập nhật tiến độ</span>
        </button>
      </div>

      {/* Current AI Quota Cards */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/60 dark:bg-sky-950/25">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>Lượt Chat Qusin AI</span>
            </span>
            <button
              type="button"
              onClick={onOpenChatAi}
              className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400 cursor-pointer"
            >
              Mở Chat →
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {user ? aiQuota.chatRemaining : 0}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              / {aiQuota.chatLimit} lượt hôm nay
              {aiQuota.chatBonus > 0 ? ` (+${aiQuota.chatBonus} thưởng)` : ''}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sky-200/70 dark:bg-sky-900/50">
            <div
              className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
              style={{
                width: `${
                  user
                    ? Math.min(
                        100,
                        Math.round(
                          (aiQuota.chatRemaining /
                            Math.max(1, aiQuota.chatLimit)) *
                            100
                        )
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span>Lượt Luyện nói AI</span>
            </span>
            <button
              type="button"
              onClick={onOpenSpeakPractice}
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
            >
              Luyện nói →
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {user ? aiQuota.speakRemaining : 0}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              / {aiQuota.speakLimit} lượt hôm nay
              {aiQuota.speakBonus > 0 ? ` (+${aiQuota.speakBonus} thưởng)` : ''}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900/50">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-400"
              style={{
                width: `${
                  user
                    ? Math.min(
                        100,
                        Math.round(
                          (aiQuota.speakRemaining /
                            Math.max(1, aiQuota.speakLimit)) *
                            100
                        )
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Nhiệm vụ ngày ({activeDateKey})</span>
            </span>
            <span className="font-mono-tabular text-xs font-bold text-amber-600 dark:text-amber-400">
              {claimedCount}/{missions.length} đã nhận
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-slate-100">
              {completedCount}/{missions.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {claimableCount > 0
                ? `${claimableCount} thưởng đang chờ nhận`
                : 'nhiệm vụ đã đạt hôm nay'}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{
                width: `${Math.round(
                  (completedCount / Math.max(1, missions.length)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Guest Login Prompt */}
      {!user && (
        <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Đăng nhập để mở khóa 10 lượt Chat + 5 lượt Nói & nhận thưởng nhiệm vụ
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Mỗi ngày hệ thống giao 3 nhiệm vụ (Dễ · Vừa · Khó) để bạn nhận thêm lượt dùng AI miễn phí.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            <span>Đăng nhập ngay</span>
          </button>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 3 Daily Mission Cards (1 Dễ · 1 Vừa · 1 Khó) */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
          3 nhiệm vụ hôm nay (tự động đổi mới mỗi ngày)
        </h2>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          1 Dễ · 1 Vừa · 1 Khó
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {missions.map((mission) => {
          const pct = Math.min(
            100,
            Math.round((mission.current / Math.max(1, mission.target)) * 100)
          );
          const isClaiming = claimingId === mission.id;

          return (
            <div
              key={mission.id}
              className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors sm:p-5 ${
                mission.claimed
                  ? 'border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                  : mission.completed
                    ? 'border-sky-300 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${difficultyBadgeClass(
                      mission.difficulty
                    )}`}
                  >
                    Mức: {DIFFICULTY_LABELS[mission.difficulty]}
                  </span>

                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span className="rounded-md bg-sky-100 px-2 py-0.5 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
                      +{mission.chatReward} Chat
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                      +{mission.speakReward} Nói
                    </span>
                  </div>
                </div>

                <h3 className="mt-2.5 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {mission.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {mission.description}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Tiến độ
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                    {mission.current}/{mission.target} {mission.unit}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      mission.completed ? 'bg-emerald-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-3.5 flex justify-end">
                  {mission.claimed ? (
                    <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-100 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>Đã nhận thưởng hôm nay</span>
                    </span>
                  ) : !user ? (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                    >
                      <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Đăng nhập để làm</span>
                    </button>
                  ) : mission.completed ? (
                    <button
                      type="button"
                      disabled={isClaiming}
                      onClick={() => void handleClaim(mission)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:text-slate-950 cursor-pointer"
                    >
                      <Gift className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isClaiming
                          ? 'Đang cộng lượt...'
                          : `Nhận +${mission.chatReward} Chat, +${mission.speakReward} Nói`}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onExecuteAction(mission.actionView)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-600 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-sky-500 cursor-pointer"
                    >
                      <span>{mission.actionLabel}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
