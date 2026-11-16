export type MasteryLevel = 'new' | 'learning' | 'mastered';

export type PracticeMode =
  | 'flip'
  | 'learn'
  | 'quiz'
  | 'fill'
  | 'match'
  | 'spell'
  | 'speak'
  | 'blast'
  | 'meteor'
  | 'tank'
  | 'test';

export type LeaderboardMode =
  | PracticeMode
  | 'match_columns'
  | 'match_grid'
  | 'match_memory';

export type AppView =
  | 'decks'
  | 'community'
  | 'practice'
  | 'ai'
  | 'missions'
  | 'leaderboard';

export interface AiQuotaSnapshot {
  dateKey: string;
  chatUsed: number;
  chatBonus: number;
  chatLimit: number;
  chatRemaining: number;
  speakUsed: number;
  speakBonus: number;
  speakLimit: number;
  speakRemaining: number;
}

export interface Deck {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: string;
  cardCount: number;
  masteredCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  deckId: string;
  ownerId: string;
  term: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  tags: string[];
  mastery: MasteryLevel;
  reviewCount: number;
  correctCount: number;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  ownerId: string;
  deckId: string;
  deckTitle: string;
  mode: PracticeMode;
  totalItems: number;
  correctCount: number;
  accuracy: number;
  durationSeconds: number;
  dateKey: string; // YYYY-MM-DD
  completedAt: number;
}

export interface CommunityCardItem {
  term: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  tags?: string[];
}

export interface CommunityDeck {
  id: string;
  sourceDeckId: string | null;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  category: string;
  cardCount: number;
  downloadsCount: number;
  blobUrl?: string | null;
  cards: CommunityCardItem[];
  publishedAt: number;
}

export interface LeaderboardEntry {
  id: string;
  userId: string | null;
  playerName: string;
  deckId: string;
  deckTitle: string;
  mode: LeaderboardMode;
  score: number;
  accuracy: number;
  durationSeconds: number;
  streak: number;
  createdAt: number;
}

export interface StreakLeaderboardEntry {
  userId: string;
  displayName: string;
  username: string;
  streakDays: number;
  totalSessions: number;
  totalScore: number;
  masteredCount: number;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  dailyGoal: number;
}

export const LIMITS = {
  TITLE_MAX: 100,
  DESC_MAX: 300,
  CATEGORY_MAX: 50,
  TERM_MAX: 120,
  PHONETIC_MAX: 80,
  POS_MAX: 40,
  MEANING_MAX: 240,
  EXAMPLE_MAX: 350,
  TAG_MAX: 32,
  TAGS_PER_CARD_MAX: 8,
  IMPORT_BATCH_MAX: 500,
  DISPLAY_NAME_MAX: 80,
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  DAILY_GOAL_MIN: 5,
  DAILY_GOAL_MAX: 200,
  BASE_CHAT_LIMIT: 10,
  BASE_SPEAK_LIMIT: 20,
} as const;

export const MODE_LABELS: Record<PracticeMode, string> = {
  flip: 'Lật thẻ',
  learn: 'Học thông minh',
  quiz: 'Trắc nghiệm',
  fill: 'Điền từ',
  match: 'Nối thẻ',
  spell: 'Nghe & Viết',
  speak: 'Luyện nói AI',
  blast: 'Xếp khối Blast',
  meteor: 'Bắn thiên thạch',
  tank: 'Xe tăng 3D',
  test: 'Kiểm tra',
};

export const LEADERBOARD_MODE_LABELS: Record<LeaderboardMode, string> = {
  ...MODE_LABELS,
  match_columns: 'Nối 2 cột',
  match_grid: 'Ghép thẻ 4×3',
  match_memory: 'Lật thẻ 4×4',
};

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: 'Mới',
  learning: 'Đang học',
  mastered: 'Đã thuộc',
};

export function normalizeTags(raw: unknown): string[] {
  let parts: string[] = [];

  if (Array.isArray(raw)) {
    parts = raw.filter((item): item is string => typeof item === 'string');
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parts = parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        parts = trimmed.split(/[,;|#]/);
      }
    } else {
      parts = trimmed.split(/[,;|#]/);
    }
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawPart of parts) {
    const cleaned = rawPart
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LIMITS.TAG_MAX);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= LIMITS.TAGS_PER_CARD_MAX) break;
  }

  return result;
}

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
