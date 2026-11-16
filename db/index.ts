import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

declare global {
  var _neonSql: NeonQueryFunction<false, false> | undefined;
  var _neonDb: NeonHttpDatabase<typeof schema> | undefined;
  var _neonSchemaPromise: Promise<void> | undefined;
  var _neonSchemaConnStr: string | undefined;
}

export function getNeonConnectionString(): string | null {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isNeonConfigured(): boolean {
  return getNeonConnectionString() !== null;
}

function getSqlClient(): NeonQueryFunction<false, false> {
  const connStr = getNeonConnectionString();
  if (!connStr) {
    throw new Error('NEON_NOT_CONFIGURED');
  }
  if (!globalThis._neonSql || globalThis._neonSchemaConnStr !== connStr) {
    globalThis._neonSql = neon(connStr);
    globalThis._neonDb = drizzle(globalThis._neonSql, { schema });
    globalThis._neonSchemaPromise = undefined;
    globalThis._neonSchemaConnStr = connStr;
  }
  return globalThis._neonSql;
}

export function getDb(): NeonHttpDatabase<typeof schema> {
  getSqlClient();
  if (!globalThis._neonDb) {
    throw new Error('NEON_NOT_CONFIGURED');
  }
  return globalThis._neonDb;
}

export async function ensureNeonSchema(): Promise<void> {
  const sql = getSqlClient();
  if (!globalThis._neonSchemaPromise) {
    globalThis._neonSchemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          daily_goal INTEGER NOT NULL DEFAULT 20,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS decks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Chung',
          card_count INTEGER NOT NULL DEFAULT 0,
          mastered_count INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks (user_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS flashcards (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          term TEXT NOT NULL,
          phonetic TEXT NOT NULL DEFAULT '',
          part_of_speech TEXT NOT NULL DEFAULT '',
          meaning TEXT NOT NULL,
          example TEXT NOT NULL DEFAULT '',
          tags_json TEXT NOT NULL DEFAULT '[]',
          mastery TEXT NOT NULL DEFAULT 'new',
          review_count INTEGER NOT NULL DEFAULT 0,
          correct_count INTEGER NOT NULL DEFAULT 0,
          starred BOOLEAN NOT NULL DEFAULT false,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;

      await sql`
        ALTER TABLE flashcards
        ADD COLUMN IF NOT EXISTS tags_json TEXT NOT NULL DEFAULT '[]'
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS flashcards_user_id_idx ON flashcards (user_id)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS flashcards_deck_id_idx ON flashcards (deck_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS study_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          deck_id TEXT NOT NULL,
          deck_title TEXT NOT NULL,
          mode TEXT NOT NULL,
          total_items INTEGER NOT NULL,
          correct_count INTEGER NOT NULL,
          accuracy INTEGER NOT NULL,
          duration_seconds INTEGER NOT NULL,
          date_key TEXT NOT NULL,
          completed_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS study_sessions_user_id_idx ON study_sessions (user_id)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS community_decks (
          id TEXT PRIMARY KEY,
          source_deck_id TEXT,
          author_user_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Chung',
          blob_url TEXT,
          cards_json TEXT NOT NULL,
          card_count INTEGER NOT NULL DEFAULT 0,
          downloads_count INTEGER NOT NULL DEFAULT 0,
          published_at BIGINT NOT NULL
        )
      `;

      await sql`
        ALTER TABLE community_decks
        ADD COLUMN IF NOT EXISTS blob_url TEXT
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS community_decks_author_idx ON community_decks (author_user_id)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS community_decks_published_idx ON community_decks (published_at)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS leaderboard_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          player_name TEXT NOT NULL,
          deck_id TEXT NOT NULL,
          deck_title TEXT NOT NULL,
          mode TEXT NOT NULL,
          score INTEGER NOT NULL,
          accuracy INTEGER NOT NULL,
          duration_seconds INTEGER NOT NULL,
          streak INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS leaderboard_deck_mode_idx ON leaderboard_entries (deck_id, mode, score DESC)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS leaderboard_mode_score_idx ON leaderboard_entries (mode, score DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS user_daily_quotas (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date_key TEXT NOT NULL,
          chat_used INTEGER NOT NULL DEFAULT 0,
          speak_used INTEGER NOT NULL DEFAULT 0,
          chat_bonus INTEGER NOT NULL DEFAULT 0,
          speak_bonus INTEGER NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS user_daily_quotas_user_date_idx ON user_daily_quotas (user_id, date_key)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS user_mission_claims (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date_key TEXT NOT NULL,
          mission_id TEXT NOT NULL,
          chat_reward INTEGER NOT NULL DEFAULT 0,
          speak_reward INTEGER NOT NULL DEFAULT 0,
          claimed_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS user_mission_claims_user_date_idx ON user_mission_claims (user_id, date_key)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic TEXT NOT NULL,
          level TEXT NOT NULL DEFAULT 'intermediate',
          deck_title TEXT NOT NULL DEFAULT '',
          messages_json TEXT NOT NULL DEFAULT '[]',
          message_count INTEGER NOT NULL DEFAULT 0,
          preview_text TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS ai_chat_sessions_user_updated_idx ON ai_chat_sessions (user_id, updated_at DESC)
      `;
    })().catch((err) => {
      globalThis._neonSchemaPromise = undefined;
      throw err;
    });
  }

  await globalThis._neonSchemaPromise;
}
