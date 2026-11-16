import { NextRequest, NextResponse } from 'next/server';
import { createLiteRouterCompletion } from '@/lib/ai-client';

export interface SpeechEvalResult {
  score: number;
  passed: boolean;
  pronunciationNote: string;
  usageFeedback: string;
  betterSentence: string;
  betterSentenceVi: string;
}

function parseSpeechEvaluation(
  raw: string,
  fallbackSentence: string,
  fallbackMeaning: string
): SpeechEvalResult {
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
      const rawScore = Number(obj.score);
      const score = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : 75;
      const passed =
        typeof obj.passed === 'boolean' ? obj.passed : score >= 70;
      const pronunciationNote =
        typeof obj.pronunciationNote === 'string' && obj.pronunciationNote.trim()
          ? obj.pronunciationNote.trim()
          : 'Đã ghi nhận giọng nói của bạn.';
      const usageFeedback =
        typeof obj.usageFeedback === 'string' && obj.usageFeedback.trim()
          ? obj.usageFeedback.trim()
          : 'Tiếp tục luyện phát âm rõ ràng và đúng trọng âm nhé.';
      const betterSentence =
        typeof obj.betterSentence === 'string' && obj.betterSentence.trim()
          ? obj.betterSentence.trim()
          : fallbackSentence;
      const betterSentenceVi =
        typeof obj.betterSentenceVi === 'string' && obj.betterSentenceVi.trim()
          ? obj.betterSentenceVi.trim()
          : fallbackMeaning;

      return {
        score,
        passed,
        pronunciationNote,
        usageFeedback,
        betterSentence,
        betterSentenceVi,
      };
    } catch {
      // Fallback below
    }
  }

  return {
    score: 75,
    passed: true,
    pronunciationNote: 'Đã ghi nhận phần nói của bạn.',
    usageFeedback: raw.trim().slice(0, 280),
    betterSentence: fallbackSentence,
    betterSentenceVi: fallbackMeaning,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const term = typeof body.term === 'string' ? body.term.trim().slice(0, 120) : '';
    const phonetic =
      typeof body.phonetic === 'string' ? body.phonetic.trim().slice(0, 80) : '';
    const partOfSpeech =
      typeof body.partOfSpeech === 'string'
        ? body.partOfSpeech.trim().slice(0, 40)
        : '';
    const meaning =
      typeof body.meaning === 'string' ? body.meaning.trim().slice(0, 240) : '';
    const example =
      typeof body.example === 'string' ? body.example.trim().slice(0, 350) : '';
    const transcript =
      typeof body.transcript === 'string'
        ? body.transcript.trim().slice(0, 400)
        : '';
    const taskType =
      body.taskType === 'read_word' || body.taskType === 'free_sentence'
        ? body.taskType
        : 'read_example';

    if (!term || !transcript) {
      return NextResponse.json(
        { error: 'Cần có từ mục tiêu và nội dung bạn vừa nói.' },
        { status: 400 }
      );
    }

    const expectedTarget =
      taskType === 'read_word'
        ? term
        : taskType === 'read_example' && example
          ? example
          : `Any natural English sentence correctly using "${term}"`;

    const systemPrompt = `You are a concise, encouraging English speaking coach for Vietnamese learners.
Evaluate the learner's spoken English (captured via speech-to-text transcript) for a flashcard practice exercise.

Flashcard details:
- Target word: "${term}" ${phonetic ? `(${phonetic})` : ''} ${partOfSpeech ? `[${partOfSpeech}]` : ''}
- Vietnamese meaning: "${meaning}"
- Example sentence: "${example || term}"
- Task type: ${taskType === 'read_word' ? 'Pronounce the target word clearly' : taskType === 'read_example' ? 'Read the target word/example sentence aloud' : 'Create and speak an original English sentence using the target word'}
- Expected reference: "${expectedTarget}"

Scoring rules:
- 90-100: Accurate target word + fluent/natural sentence matching the task.
- 70-89: Minor speech-recognition difference, small grammar slip, or missing article, while clearly using/pronouncing the target word.
- Below 70: Target word missing/mispronounced completely, wrong word form/meaning, or unrelated speech.
- Mark "passed": true if score >= 70, else false.
- All feedback ("pronunciationNote", "usageFeedback", "betterSentenceVi") must be in natural Vietnamese, concise (1-2 sentences each).
- Never mention any model name or API details.

Return ONLY valid JSON matching this schema (no markdown code fences):
{
  "score": 85,
  "passed": true,
  "pronunciationNote": "...",
  "usageFeedback": "...",
  "betterSentence": "...",
  "betterSentenceVi": "..."
}`;

    const result = await createLiteRouterCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Learner's spoken transcript: "${transcript}"`,
        },
      ],
      temperature: 0.3,
      maxTokens: 450,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const evaluation = parseSpeechEvaluation(
      result.content,
      example || `I use "${term}" in daily English.`,
      meaning
    );

    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('POST /api/ai/evaluate-speech error:', error);
    return NextResponse.json(
      { error: 'Không thể chấm điểm phần nói lúc này.' },
      { status: 500 }
    );
  }
}
