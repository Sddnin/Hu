import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  dailyGoal: integer('daily_goal').notNull().default(20),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const decks = pgTable(
  'decks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('Chung'),
    cardCount: integer('card_count').notNull().default(0),
    masteredCount: integer('mastered_count').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('decks_user_id_idx').on(table.userId)]
);

export const flashcards = pgTable(
  'flashcards',
  {
    id: text('id').primaryKey(),
    deckId: text('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    phonetic: text('phonetic').notNull().default(''),
    partOfSpeech: text('part_of_speech').notNull().default(''),
    meaning: text('meaning').notNull(),
    example: text('example').notNull().default(''),
    tagsJson: text('tags_json').notNull().default('[]'),
    mastery: text('mastery').notNull().default('new'),
    reviewCount: integer('review_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    starred: boolean('starred').notNull().default(false),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('flashcards_user_id_idx').on(table.userId),
    index('flashcards_deck_id_idx').on(table.deckId),
  ]
);

export const studySessions = pgTable(
  'study_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deckId: text('deck_id').notNull(),
    deckTitle: text('deck_title').notNull(),
    mode: text('mode').notNull(),
    totalItems: integer('total_items').notNull(),
    correctCount: integer('correct_count').notNull(),
    accuracy: integer('accuracy').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    dateKey: text('date_key').notNull(),
    completedAt: bigint('completed_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('study_sessions_user_id_idx').on(table.userId)]
);

export const communityDecks = pgTable(
  'community_decks',
  {
    id: text('id').primaryKey(),
    sourceDeckId: text('source_deck_id'),
    authorUserId: text('author_user_id').notNull(),
    authorName: text('author_name').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('Chung'),
    blobUrl: text('blob_url'),
    cardsJson: text('cards_json').notNull(),
    cardCount: integer('card_count').notNull().default(0),
    downloadsCount: integer('downloads_count').notNull().default(0),
    publishedAt: bigint('published_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('community_decks_author_idx').on(table.authorUserId),
    index('community_decks_published_idx').on(table.publishedAt),
  ]
);

export const leaderboardEntries = pgTable(
  'leaderboard_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    playerName: text('player_name').notNull(),
    deckId: text('deck_id').notNull(),
    deckTitle: text('deck_title').notNull(),
    mode: text('mode').notNull(),
    score: integer('score').notNull(),
    accuracy: integer('accuracy').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    streak: integer('streak').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('leaderboard_deck_mode_idx').on(table.deckId, table.mode, table.score),
    index('leaderboard_mode_score_idx').on(table.mode, table.score),
  ]
);

export const userDailyQuotas = pgTable(
  'user_daily_quotas',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dateKey: text('date_key').notNull(),
    chatUsed: integer('chat_used').notNull().default(0),
    speakUsed: integer('speak_used').notNull().default(0),
    chatBonus: integer('chat_bonus').notNull().default(0),
    speakBonus: integer('speak_bonus').notNull().default(0),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('user_daily_quotas_user_date_idx').on(table.userId, table.dateKey)]
);

export const userMissionClaims = pgTable(
  'user_mission_claims',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dateKey: text('date_key').notNull(),
    missionId: text('mission_id').notNull(),
    chatReward: integer('chat_reward').notNull().default(0),
    speakReward: integer('speak_reward').notNull().default(0),
    claimedAt: bigint('claimed_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('user_mission_claims_user_date_idx').on(table.userId, table.dateKey)]
);

export const aiChatSessions = pgTable(
  'ai_chat_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    level: text('level').notNull().default('intermediate'),
    deckTitle: text('deck_title').notNull().default(''),
    messagesJson: text('messages_json').notNull().default('[]'),
    messageCount: integer('message_count').notNull().default(0),
    previewText: text('preview_text').notNull().default(''),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('ai_chat_sessions_user_updated_idx').on(table.userId, table.updatedAt),
  ]
);
