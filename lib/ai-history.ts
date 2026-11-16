import { and, desc, eq } from 'drizzle-orm';
import { ensureNeonSchema, getDb } from '@/db';
import { aiChatSessions } from '@/db/schema';

export interface GrammarReview {
  grammarScore: number;
  isCorrect: boolean;
  correctedEn: string;
  authenticEn: string;
  feedbackVi: string;
}

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  replyEn: string;
  replyVi?: string;
  suggestions?: string[];
  grammarReview?: GrammarReview | null;
}

export type TutorLevel = 'basic' | 'intermediate' | 'advanced';

export interface AiChatSessionSummary {
  id: string;
  topic: string;
  level: TutorLevel;
  deckTitle: string;
  messageCount: number;
  previewText: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiChatSessionDetail extends AiChatSessionSummary {
  messages: TutorMessage[];
}

function parseLevel(raw: string | null | undefined): TutorLevel {
  if (raw === 'basic' || raw === 'advanced') return raw;
  return 'intermediate';
}

function parseMessagesJson(raw: string): TutorMessage[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (item): item is TutorMessage =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.replyEn === 'string'
    );
  } catch {
    return [];
  }
}

export async function listAiChatSessions(
  userId: string,
  limit = 30
): Promise<AiChatSessionSummary[]> {
  await ensureNeonSchema();
  const db = getDb();

  const rows = await db
    .select({
      id: aiChatSessions.id,
      topic: aiChatSessions.topic,
      level: aiChatSessions.level,
      deckTitle: aiChatSessions.deckTitle,
      messageCount: aiChatSessions.messageCount,
      previewText: aiChatSessions.previewText,
      createdAt: aiChatSessions.createdAt,
      updatedAt: aiChatSessions.updatedAt,
    })
    .from(aiChatSessions)
    .where(eq(aiChatSessions.userId, userId))
    .orderBy(desc(aiChatSessions.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    level: parseLevel(r.level),
    deckTitle: r.deckTitle,
    messageCount: r.messageCount,
    previewText: r.previewText,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getAiChatSession(
  userId: string,
  sessionId: string
): Promise<AiChatSessionDetail | null> {
  await ensureNeonSchema();
  const db = getDb();

  const [row] = await db
    .select()
    .from(aiChatSessions)
    .where(
      and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId))
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    topic: row.topic,
    level: parseLevel(row.level),
    deckTitle: row.deckTitle,
    messageCount: row.messageCount,
    previewText: row.previewText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: parseMessagesJson(row.messagesJson),
  };
}

export async function upsertAiChatTurn(params: {
  userId: string;
  sessionId?: string;
  topic: string;
  level: TutorLevel;
  deckTitle: string;
  latestUserText?: string;
  botReply: {
    replyEn: string;
    replyVi: string;
    suggestions: string[];
    grammarReview: GrammarReview | null;
  };
}): Promise<AiChatSessionDetail> {
  await ensureNeonSchema();
  const db = getDb();
  const now = Date.now();

  const requestedId =
    params.sessionId && params.sessionId.trim()
      ? params.sessionId.trim().slice(0, 80)
      : '';

  const existing = requestedId
    ? await getAiChatSession(params.userId, requestedId)
    : null;

  const sessionId =
    existing?.id || requestedId || `chat_${crypto.randomUUID()}`;
  const messages: TutorMessage[] = existing ? [...existing.messages] : [];

  if (params.latestUserText && params.latestUserText.trim()) {
    messages.push({
      id: `usr_${crypto.randomUUID()}`,
      role: 'user',
      replyEn: params.latestUserText.trim(),
    });
  }

  messages.push({
    id: `ai_${crypto.randomUUID()}`,
    role: 'assistant',
    replyEn: params.botReply.replyEn,
    replyVi: params.botReply.replyVi,
    suggestions: params.botReply.suggestions,
    grammarReview: params.botReply.grammarReview,
  });

  const capped = messages.slice(-60);
  const cleanPreview = params.botReply.replyEn
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

  if (existing) {
    await db
      .update(aiChatSessions)
      .set({
        topic: params.topic,
        level: params.level,
        deckTitle: params.deckTitle,
        messagesJson: JSON.stringify(capped),
        messageCount: capped.length,
        previewText: cleanPreview,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiChatSessions.id, sessionId),
          eq(aiChatSessions.userId, params.userId)
        )
      );

    return {
      id: sessionId,
      topic: params.topic,
      level: params.level,
      deckTitle: params.deckTitle,
      messageCount: capped.length,
      previewText: cleanPreview,
      createdAt: existing.createdAt,
      updatedAt: now,
      messages: capped,
    };
  }

  await db.insert(aiChatSessions).values({
    id: sessionId,
    userId: params.userId,
    topic: params.topic,
    level: params.level,
    deckTitle: params.deckTitle,
    messagesJson: JSON.stringify(capped),
    messageCount: capped.length,
    previewText: cleanPreview,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: sessionId,
    topic: params.topic,
    level: params.level,
    deckTitle: params.deckTitle,
    messageCount: capped.length,
    previewText: cleanPreview,
    createdAt: now,
    updatedAt: now,
    messages: capped,
  };
}

export async function deleteAiChatSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  await ensureNeonSchema();
  const db = getDb();

  const deleted = await db
    .delete(aiChatSessions)
    .where(
      and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId))
    )
    .returning({ id: aiChatSessions.id });

  return deleted.length > 0;
}

export async function clearAllAiChatSessions(userId: string): Promise<void> {
  await ensureNeonSchema();
  const db = getDb();
  await db.delete(aiChatSessions).where(eq(aiChatSessions.userId, userId));
}
