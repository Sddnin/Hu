import { NextRequest, NextResponse } from 'next/server';
import { isNeonConfigured } from '@/db';
import { ChatMessageInput, createLiteRouterCompletion } from '@/lib/ai-client';
import { GrammarReview, upsertAiChatTurn } from '@/lib/ai-history';
import { consumeChatTurn, getOrCreateDailyQuota } from '@/lib/ai-quota';
import { getAuthenticatedUserId } from '@/lib/auth';

export type { GrammarReview };

interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TargetWord {
  term: string;
  meaning: string;
}

interface ParsedTutorReply {
  replyEn: string;
  replyVi: string;
  suggestions: string[];
  grammarReview: GrammarReview | null;
}

function parseGrammarReview(raw: unknown): GrammarReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const correctedEn =
    typeof obj.correctedEn === 'string' ? obj.correctedEn.trim() : '';
  const authenticEn =
    typeof obj.authenticEn === 'string' ? obj.authenticEn.trim() : '';
  const feedbackVi =
    typeof obj.feedbackVi === 'string' ? obj.feedbackVi.trim() : '';

  if (!correctedEn && !authenticEn && !feedbackVi) return null;

  const rawScore = Number(obj.grammarScore);
  const grammarScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 85;
  const isCorrect =
    typeof obj.isCorrect === 'boolean' ? obj.isCorrect : grammarScore >= 85;

  return {
    grammarScore,
    isCorrect,
    correctedEn: correctedEn || authenticEn,
    authenticEn: authenticEn || correctedEn,
    feedbackVi:
      feedbackVi ||
      (isCorrect
        ? 'Câu của bạn đúng ngữ pháp. Bạn có thể tham khảo cách diễn đạt tự nhiên hơn ở trên.'
        : 'Hãy xem lại cấu trúc câu đã chỉnh và thử cách diễn đạt tự nhiên hơn nhé.'),
  };
}

function parseTutorResponse(
  raw: string,
  hasUserInput: boolean
): ParsedTutorReply {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      const replyEn =
        typeof obj.replyEn === 'string' && obj.replyEn.trim()
          ? obj.replyEn.trim()
          : '';
      const replyVi =
        typeof obj.replyVi === 'string' ? obj.replyVi.trim() : '';
      const suggestions = Array.isArray(obj.suggestions)
        ? obj.suggestions
            .filter(
              (s: unknown): s is string =>
                typeof s === 'string' && s.trim().length > 0
            )
            .map((s: string) => s.trim())
            .slice(0, 3)
        : [];
      const grammarReview = hasUserInput
        ? parseGrammarReview(obj.grammarReview)
        : null;

      if (replyEn) {
        return { replyEn, replyVi, suggestions, grammarReview };
      }
    } catch {
      // Fallback below
    }
  }

  return {
    replyEn: raw.trim(),
    replyVi: '',
    suggestions: [],
    grammarReview: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        {
          error:
            'Chỉ tài khoản đã đăng nhập mới được trò chuyện với Qusin AI.',
        },
        { status: 401 }
      );
    }

    const neonReady = isNeonConfigured();
    let currentQuota = neonReady ? await getOrCreateDailyQuota(userId) : null;

    if (currentQuota && currentQuota.chatRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            'Bạn đã dùng hết lượt Chat AI hôm nay. Hãy vào tab Nhiệm vụ để làm nhiệm vụ nhận thêm lượt!',
          quota: currentQuota,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim().slice(0, 80)
        : undefined;
    const topic =
      typeof body.topic === 'string' && body.topic.trim()
        ? body.topic.trim().slice(0, 120)
        : 'Giao tiếp hằng ngày';
    const level =
      body.level === 'basic' || body.level === 'advanced'
        ? body.level
        : 'intermediate';
    const deckTitle =
      typeof body.deckTitle === 'string'
        ? body.deckTitle.trim().slice(0, 100)
        : '';

    const targetWords: TargetWord[] = Array.isArray(body.targetWords)
      ? body.targetWords
          .slice(0, 10)
          .filter(
            (w: unknown): w is TargetWord =>
              Boolean(w) &&
              typeof (w as TargetWord).term === 'string' &&
              typeof (w as TargetWord).meaning === 'string'
          )
      : [];

    const rawMessages: ClientMessage[] = Array.isArray(body.messages)
      ? body.messages
          .slice(-14)
          .filter(
            (m: unknown): m is ClientMessage =>
              Boolean(m) &&
              ((m as ClientMessage).role === 'user' ||
                (m as ClientMessage).role === 'assistant') &&
              typeof (m as ClientMessage).content === 'string' &&
              (m as ClientMessage).content.trim().length > 0
          )
          .map((m: ClientMessage) => ({
            role: m.role,
            content: m.content.trim().slice(0, 1000),
          }))
      : [];

    const hasUserInput =
      rawMessages.length > 0 &&
      rawMessages[rawMessages.length - 1].role === 'user';

    const levelHint =
      level === 'basic'
        ? 'A1-A2 (natural everyday spoken English with short, clear sentences)'
        : level === 'advanced'
          ? 'B2-C1 (authentic, idiomatic, nuanced real-world English)'
          : 'B1-B2 (authentic, warm, conversational everyday English)';

    const vocabInstruction =
      targetWords.length > 0
        ? `\nOptional vocabulary words the learner wants to practice (naturally weave 1-2 of them into your reply when relevant, wrapping them in **bold**): ${targetWords
            .map((w) => `${w.term} (${w.meaning})`)
            .join(', ')}.`
        : '';

    const deckInstruction = deckTitle
      ? `\nSelected vocabulary deck context: "${deckTitle}".`
      : '';

    const grammarInstruction = hasUserInput
      ? `5. CRITICAL - Grade the learner's LATEST message in "grammarReview":
   - "grammarScore": integer 0-100 evaluating grammar, word choice, and naturalness of their latest message (if they wrote in Vietnamese asking a question, set grammarScore to 100 and translate/suggest how to say it naturally in English in "authenticEn").
   - "isCorrect": boolean (true if grammarScore >= 85 and no major grammar error).
   - "correctedEn": the learner's sentence fixed for accurate grammar/spelling while keeping their original meaning (keep identical if already grammatically correct).
   - "authenticEn": a MORE NATURAL, AUTHENTIC, native-like way to say what the learner meant in this exact real-life conversation (not stiff textbook English — use natural spoken phrasing, contractions, or collocations appropriate to level ${level}).
   - "feedbackVi": concise Vietnamese explanation (1-2 sentences): point out specific grammar/word-choice errors if any, and explain why "authenticEn" sounds more natural/authentic.`
      : `5. Since this is the opening turn (no user message yet), set "grammarReview": null.`;

    const systemPrompt = `You are "Qusin AI", a friendly, authentic English conversation partner and coach for Vietnamese learners on LexiCard.
Topic: "${topic}".
Target English proficiency: ${levelHint}.${deckInstruction}${vocabInstruction}

Rules:
1. Keep the conversation strictly focused on the chosen topic and react genuinely to what the learner says (avoid robotic textbook replies).
2. IDENTITY RULE (STRICT): Your name is **Qusin AI**. Whenever anyone asks who you are, which AI/model you are, what system powers you, or anything about your identity (in English or Vietnamese), you MUST reply that you are **Qusin AI** — trợ lý luyện tiếng Anh của ứng dụng. NEVER mention any underlying model name (such as DeepSeek, GPT, OpenAI, Claude, Gemini, Llama, Qwen) or external API/provider.
3. In "replyEn", respond naturally in authentic spoken English (2-4 concise sentences, using natural contractions/reactions) and always end with an engaging follow-up question.
4. In "replyVi", write a brief, clear Vietnamese translation/summary of your "replyEn" (1-2 sentences).
${grammarInstruction}
6. In "suggestions", provide 2-3 realistic, authentic English replies (under 15 words each) that a real person would naturally say next in this situation.

Return ONLY valid JSON matching this exact structure (no markdown code fences):
{
  "replyEn": "...",
  "replyVi": "...",
  "grammarReview": ${
    hasUserInput
      ? `{
    "grammarScore": 85,
    "isCorrect": false,
    "correctedEn": "...",
    "authenticEn": "...",
    "feedbackVi": "..."
  }`
      : 'null'
  },
  "suggestions": ["...", "..."]
}`;

    const promptMessages: ChatMessageInput[] = [
      { role: 'system', content: systemPrompt },
      ...(rawMessages.length > 0
        ? rawMessages
        : [
            {
              role: 'user' as const,
              content: `Start a short, realistic, welcoming English conversation as Qusin AI about the topic "${topic}".`,
            },
          ]),
    ];

    const result = await createLiteRouterCompletion({
      messages: promptMessages,
      temperature: 0.65,
      maxTokens: 900,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    if (neonReady && hasUserInput) {
      const consumed = await consumeChatTurn(userId);
      if (!consumed.allowed) {
        return NextResponse.json(
          {
            error:
              'Bạn đã dùng hết lượt Chat AI hôm nay. Hãy vào tab Nhiệm vụ để làm nhiệm vụ nhận thêm lượt!',
            quota: consumed.quota,
          },
          { status: 429 }
        );
      }
      currentQuota = consumed.quota;
    }

    const parsed = parseTutorResponse(result.content, hasUserInput);

    let savedSessionSummary = null;
    if (neonReady) {
      try {
        const latestUserText = hasUserInput
          ? rawMessages[rawMessages.length - 1].content
          : undefined;
        const saved = await upsertAiChatTurn({
          userId,
          sessionId,
          topic,
          level,
          deckTitle,
          latestUserText,
          botReply: parsed,
        });
        savedSessionSummary = {
          id: saved.id,
          topic: saved.topic,
          level: saved.level,
          deckTitle: saved.deckTitle,
          messageCount: saved.messageCount,
          previewText: saved.previewText,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };
      } catch (saveErr) {
        console.error('Failed to persist AI chat history:', saveErr);
      }
    }

    return NextResponse.json({
      ...parsed,
      sessionId: savedSessionSummary?.id || sessionId || null,
      sessionSummary: savedSessionSummary,
      quota: currentQuota,
    });
  } catch (error) {
    console.error('POST /api/ai/chat error:', error);
    return NextResponse.json(
      { error: 'Không thể xử lý yêu cầu trò chuyện AI.' },
      { status: 500 }
    );
  }
}
