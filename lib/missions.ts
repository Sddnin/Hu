import { PracticeMode } from './types';

export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export type MissionTargetAction =
  | 'login'
  | 'decks'
  | 'practice_any'
  | 'practice_game'
  | 'practice_quiz'
  | 'practice_speak_or_test';

export interface DailyMissionDef {
  id: string;
  difficulty: MissionDifficulty;
  title: string;
  description: string;
  chatReward: number;
  speakReward: number;
  actionView: MissionTargetAction;
  actionLabel: string;
}

export interface MissionProgressItem extends DailyMissionDef {
  current: number;
  target: number;
  unit: string;
  completed: boolean;
  claimed: boolean;
}

export const DIFFICULTY_LABELS: Record<MissionDifficulty, string> = {
  easy: 'Dễ',
  medium: 'Vừa',
  hard: 'Khó',
};

export const DAILY_MISSIONS: DailyMissionDef[] = [
  // MỨC DỄ (4 nhiệm vụ xoay vòng) — +1 Chat, +1 Nói
  {
    id: 'daily_login',
    difficulty: 'easy',
    title: 'Điểm danh đăng nhập hằng ngày',
    description:
      'Đăng nhập tài khoản để giữ chuỗi học tập và nhận lượt AI miễn phí mỗi ngày.',
    chatReward: 1,
    speakReward: 1,
    actionView: 'login',
    actionLabel: 'Đăng nhập ngay',
  },
  {
    id: 'first_session_today',
    difficulty: 'easy',
    title: 'Khởi động 1 phiên luyện tập',
    description:
      'Hoàn thành ít nhất 1 phiên học hoặc trò chơi bất kỳ trong ngày hôm nay.',
    chatReward: 1,
    speakReward: 1,
    actionView: 'practice_any',
    actionLabel: 'Luyện tập ngay',
  },
  {
    id: 'review_10_cards',
    difficulty: 'easy',
    title: 'Ôn nhanh 10 lượt thẻ',
    description:
      'Luyện tập tổng cộng ít nhất 10 lượt từ vựng trong ngày hôm nay.',
    chatReward: 1,
    speakReward: 1,
    actionView: 'practice_any',
    actionLabel: 'Ôn thẻ ngay',
  },
  {
    id: 'star_3_cards',
    difficulty: 'easy',
    title: 'Đánh dấu 3 từ trọng tâm',
    description:
      'Gắn sao ít nhất 3 thẻ từ vựng cần ghi nhớ trong thư viện bộ thẻ của bạn.',
    chatReward: 1,
    speakReward: 1,
    actionView: 'decks',
    actionLabel: 'Mở bộ thẻ',
  },

  // MỨC VỪA (4 nhiệm vụ xoay vòng) — +1 Chat, +2 Nói
  {
    id: 'reach_daily_goal',
    difficulty: 'medium',
    title: 'Chinh phục mục tiêu ngày',
    description:
      'Hoàn thành đủ số lượt thẻ theo mục tiêu hằng ngày bạn đã đặt.',
    chatReward: 1,
    speakReward: 2,
    actionView: 'practice_any',
    actionLabel: 'Tiếp tục luyện',
  },
  {
    id: 'two_modes_today',
    difficulty: 'medium',
    title: 'Đa dạng 2 chế độ luyện tập',
    description:
      'Hoàn thành ít nhất 2 chế độ khác nhau hôm nay (ví dụ: Lật thẻ, Trắc nghiệm, Nối thẻ...).',
    chatReward: 1,
    speakReward: 2,
    actionView: 'practice_any',
    actionLabel: 'Đổi chế độ học',
  },
  {
    id: 'play_minigame_today',
    difficulty: 'medium',
    title: 'Chiến binh Mini-Game từ vựng',
    description:
      'Hoàn thành 1 lượt chơi Xếp khối Blast, Bắn thiên thạch hoặc Xe tăng 3D hôm nay.',
    chatReward: 1,
    speakReward: 2,
    actionView: 'practice_game',
    actionLabel: 'Chơi Mini-Game',
  },
  {
    id: 'review_20_cards',
    difficulty: 'medium',
    title: 'Bền bỉ ôn 20 lượt thẻ',
    description:
      'Luyện tập đạt tổng cộng từ 20 lượt thẻ trở lên trong ngày hôm nay.',
    chatReward: 1,
    speakReward: 2,
    actionView: 'practice_any',
    actionLabel: 'Ôn tiếp 20 thẻ',
  },

  // MỨC KHÓ (4 nhiệm vụ xoay vòng) — +2 Chat, +2 Nói
  {
    id: 'high_accuracy_today',
    difficulty: 'hard',
    title: 'Chuẩn xác cao độ (≥ 85%)',
    description:
      'Đạt độ chính xác từ 85% trở lên trong 1 phiên luyện tập từ 5 thẻ trở lên hôm nay.',
    chatReward: 2,
    speakReward: 2,
    actionView: 'practice_quiz',
    actionLabel: 'Thử sức Trắc nghiệm',
  },
  {
    id: 'study_marathon_today',
    difficulty: 'hard',
    title: 'Bứt phá 3 phiên & 40 lượt thẻ',
    description:
      'Hoàn thành ít nhất 3 phiên luyện tập với tổng từ 40 lượt thẻ trở lên hôm nay.',
    chatReward: 2,
    speakReward: 2,
    actionView: 'practice_any',
    actionLabel: 'Cày chuỗi học',
  },
  {
    id: 'speak_or_test_today',
    difficulty: 'hard',
    title: 'Thử thách Nói AI hoặc Kiểm tra',
    description:
      'Hoàn thành trọn vẹn 1 phiên Luyện nói AI (ghi âm) hoặc bài Kiểm tra tổng hợp hôm nay.',
    chatReward: 2,
    speakReward: 2,
    actionView: 'practice_speak_or_test',
    actionLabel: 'Vào Nói AI / Kiểm tra',
  },
  {
    id: 'perfect_round_today',
    difficulty: 'hard',
    title: 'Hoàn hảo 100% một phiên học',
    description:
      'Hoàn thành 1 phiên luyện tập từ 5 thẻ trở lên với độ chính xác tuyệt đối 100% hôm nay.',
    chatReward: 2,
    speakReward: 2,
    actionView: 'practice_quiz',
    actionLabel: 'Chinh phục 100%',
  },
];

const EASY_MISSIONS = DAILY_MISSIONS.filter((m) => m.difficulty === 'easy');
const MEDIUM_MISSIONS = DAILY_MISSIONS.filter((m) => m.difficulty === 'medium');
const HARD_MISSIONS = DAILY_MISSIONS.filter((m) => m.difficulty === 'hard');

export interface MissionEvalInput {
  dateKey?: string;
  isLoggedIn: boolean;
  dailyGoal: number;
  starredCount: number;
  todaySessions: Array<{
    mode: PracticeMode | string;
    totalItems: number;
    accuracy: number;
  }>;
  claimedIds: string[];
}

const GAME_MODES = new Set(['blast', 'meteor', 'tank']);

export function getVnTodayDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function hashDateSeed(dateKey: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mỗi ngày chỉ chọn đúng 3 nhiệm vụ gồm: 1 Dễ, 1 Vừa và 1 Khó.
 * Lựa chọn xoay vòng nhất quán theo ngày trên cả Server và Client.
 */
export function getDailyMissionsForDate(
  dateKey = getVnTodayDateKey()
): DailyMissionDef[] {
  const easy =
    EASY_MISSIONS[hashDateSeed(dateKey, 11) % EASY_MISSIONS.length];
  const medium =
    MEDIUM_MISSIONS[hashDateSeed(dateKey, 37) % MEDIUM_MISSIONS.length];
  const hard =
    HARD_MISSIONS[hashDateSeed(dateKey, 73) % HARD_MISSIONS.length];

  return [easy, medium, hard];
}

export function evaluateMissionsProgress(
  input: MissionEvalInput
): MissionProgressItem[] {
  const activeDateKey = input.dateKey || getVnTodayDateKey();
  const activeMissions = getDailyMissionsForDate(activeDateKey);

  const claimedSet = new Set(input.claimedIds);
  const sessionsCount = input.todaySessions.length;
  const totalReviewedToday = input.todaySessions.reduce(
    (sum, s) => sum + Math.max(0, Number(s.totalItems) || 0),
    0
  );
  const distinctModesCount = new Set(
    input.todaySessions.map((s) => String(s.mode))
  ).size;
  const gameSessionsCount = input.todaySessions.filter((s) =>
    GAME_MODES.has(String(s.mode))
  ).length;
  const hasHighAccuracy = input.todaySessions.some(
    (s) => (Number(s.totalItems) || 0) >= 5 && (Number(s.accuracy) || 0) >= 85
  );
  const hasPerfectRound = input.todaySessions.some(
    (s) => (Number(s.totalItems) || 0) >= 5 && (Number(s.accuracy) || 0) >= 100
  );
  const hasSpeakOrTest = input.todaySessions.some(
    (s) => s.mode === 'speak' || s.mode === 'test'
  );
  const goalTarget = Math.max(5, Number(input.dailyGoal) || 20);

  return activeMissions.map((mission) => {
    let current = 0;
    let target = 1;
    let unit = 'lần';
    let completed = false;

    switch (mission.id) {
      case 'daily_login':
        current = input.isLoggedIn ? 1 : 0;
        target = 1;
        unit = 'lần';
        completed = input.isLoggedIn;
        break;
      case 'first_session_today':
        current = Math.min(1, sessionsCount);
        target = 1;
        unit = 'phiên';
        completed = sessionsCount >= 1;
        break;
      case 'review_10_cards':
        current = Math.min(10, totalReviewedToday);
        target = 10;
        unit = 'thẻ';
        completed = totalReviewedToday >= 10;
        break;
      case 'star_3_cards':
        current = Math.min(3, input.starredCount);
        target = 3;
        unit = 'thẻ';
        completed = input.starredCount >= 3;
        break;
      case 'reach_daily_goal':
        current = Math.min(goalTarget, totalReviewedToday);
        target = goalTarget;
        unit = 'thẻ';
        completed = totalReviewedToday >= goalTarget;
        break;
      case 'two_modes_today':
        current = Math.min(2, distinctModesCount);
        target = 2;
        unit = 'chế độ';
        completed = distinctModesCount >= 2;
        break;
      case 'play_minigame_today':
        current = Math.min(1, gameSessionsCount);
        target = 1;
        unit = 'ván';
        completed = gameSessionsCount >= 1;
        break;
      case 'review_20_cards':
        current = Math.min(20, totalReviewedToday);
        target = 20;
        unit = 'thẻ';
        completed = totalReviewedToday >= 20;
        break;
      case 'high_accuracy_today':
        current = hasHighAccuracy ? 1 : 0;
        target = 1;
        unit = 'phiên ≥85%';
        completed = hasHighAccuracy;
        break;
      case 'study_marathon_today': {
        const sessionPart = sessionsCount >= 3 ? 1 : 0;
        const cardPart = totalReviewedToday >= 40 ? 1 : 0;
        current = Math.min(40, totalReviewedToday);
        target = 40;
        unit = `thẻ (${Math.min(3, sessionsCount)}/3 phiên)`;
        completed = sessionPart === 1 && cardPart === 1;
        break;
      }
      case 'speak_or_test_today':
        current = hasSpeakOrTest ? 1 : 0;
        target = 1;
        unit = 'phiên';
        completed = hasSpeakOrTest;
        break;
      case 'perfect_round_today':
        current = hasPerfectRound ? 1 : 0;
        target = 1;
        unit = 'phiên 100%';
        completed = hasPerfectRound;
        break;
    }

    return {
      ...mission,
      current,
      target,
      unit,
      completed,
      claimed: claimedSet.has(mission.id),
    };
  });
}
