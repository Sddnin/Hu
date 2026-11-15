export type MasteryLevel = 'new' | 'learning' | 'mastered';

export type PracticeMode =
  | 'flip'
  | 'learn'
  | 'quiz'
  | 'fill'
  | 'match'
  | 'spell'
  | 'test';

export type AppView = 'decks' | 'practice' | 'progress';

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
  DISPLAY_NAME_MAX: 80,
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  DAILY_GOAL_MIN: 5,
  DAILY_GOAL_MAX: 200,
} as const;

export const MODE_LABELS: Record<PracticeMode, string> = {
  flip: 'Lật thẻ',
  learn: 'Học thông minh',
  quiz: 'Trắc nghiệm',
  fill: 'Điền từ',
  match: 'Nối thẻ',
  spell: 'Nghe & Viết',
  test: 'Kiểm tra',
};

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: 'Mới',
  learning: 'Đang học',
  mastered: 'Đã thuộc',
};

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
