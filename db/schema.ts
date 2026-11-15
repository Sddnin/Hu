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
