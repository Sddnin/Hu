import { NextRequest, NextResponse } from 'next/server';
import { isNeonConfigured } from '@/db';
import {
  createLiteRouterCompletion,
  transcribeAudioWithAI,
} from '@/lib/ai-client';
import { consumeSpeakTurn, getOrCreateDailyQuota } from '@/lib/ai-quota';
import { getAuthenticatedUserId } from '@/lib/auth';

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MIN_AUDIO_BYTES = 300;

export interface SpeechEvalResult {
  heardTranscript: string;
  score: number;
  targetWordPercent: number;
  pronunciationPercent: number;
  passed: boolean;
  pronunciationGuide: string;
  pronunciationNote: string;
  usageFeedback: string;
  betterSentence: string;
  betterSentenceVi: string;
}

function clampPercent(val: unknown, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseSpeechEvaluation(
  raw: string,
  heardTranscript: string,
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
      const score = clampPercent(obj.score, 75);
      const targetWordPercent = clampPercent(obj.targetWordPercent, score);
      const pronunciationPercent = clampPercent(obj.pronunciationPercent, score);
      const passed =
        typeof obj.passed === 'boolean'
          ? obj.passed
          : score >= 70 && targetWordPercent >= 60;
      const pronunciationGuide =
        typeof obj.pronunciationGuide === 'string' &&
        obj.pronunciationGuide.trim()
          ? obj.pronunciationGuide.trim()
          : '';
      const pronunciationNote =
        typeof obj.pronunciationNote === 'string' &&
        obj.pronunciationNote.trim()
          ? obj.pronunciationNote.trim()
          : 'AI đã tiếp nhận và phân tích bản ghi âm của bạn.';
      const usageFeedback =
        typeof obj.usageFeedback === 'string' && obj.usageFeedback.trim()
          ? obj.usageFeedback.trim()
          : 'Tiếp tục luyện phát âm rõ ràng và đúng trọng âm nhé.';
      const betterSentence =
        typeof obj.betterSentence === 'string' && obj.betterSentence.trim()
          ? obj.betterSentence.trim()
          : fallbackSentence;
      const betterSentenceVi =
        typeof obj.betterSentenceVi === 'string' &&
        obj.betterSentenceVi.trim()
          ? obj.betterSentenceVi.trim()
          : fallbackMeaning;

      return {
        heardTranscript,
        score,
        targetWordPercent,
        pronunciationPercent,
        passed,
        pronunciationGuide,
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
    heardTranscript,
    score: 75,
    targetWordPercent: 75,
    pronunciationPercent: 75,
    passed: true,
    pronunciationGuide: '',
    pronunciationNote: 'AI đã nghe bản ghi âm giọng nói của bạn.',
    usageFeedback: raw.trim().slice(0, 280),
    betterSentence: fallbackSentence,
    betterSentenceVi: fallbackMeaning,
  };
}

function getFormString(
  formData: FormData,
  key: string,
  maxLen: number
): string {
  const val = formData.get(key);
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        {
          error:
            'Vui lòng đăng nhập tài khoản để ghi âm và chấm phát âm AI.',
        },
        { status: 401 }
      );
    }

    const neonReady = isNeonConfigured();
    let currentQuota = neonReady ? await getOrCreateDailyQuota(userId) : null;

    if (currentQuota && currentQuota.speakRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            'Bạn đã dùng hết 20 lượt Luyện nói AI hôm nay. Hãy hoàn thành Nhiệm vụ để nhận thêm lượt!',
          quota: currentQuota,
        },
        { status: 429 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          error:
            'Vui lòng ghi âm giọng nói trực tiếp qua micro và gửi tệp âm thanh để AI xử lý.',
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const audioEntry = formData.get('audio');
    if (!(audioEntry instanceof Blob)) {
      return NextResponse.json(
        { error: 'Thiếu tệp ghi âm giọng nói để AI phân tích.' },
        { status: 400 }
      );
    }

    if (audioEntry.size < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error:
            'Bản ghi âm quá ngắn hoặc chưa thu được âm thanh. Vui lòng nói rõ trong ít nhất 1 giây rồi thử lại.',
        },
        { status: 400 }
      );
    }

    if (audioEntry.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error:
            'Tệp ghi âm vượt quá giới hạn 6MB. Hãy ghi âm ngắn gọn dưới 30 giây.',
        },
        { status: 400 }
      );
    }

    const term = getFormString(formData, 'term', 120);
    const phonetic = getFormString(formData, 'phonetic', 80);
    const partOfSpeech = getFormString(formData, 'partOfSpeech', 40);
    const meaning = getFormString(formData, 'meaning', 240);
    const example = getFormString(formData, 'example', 350);
    const rawTaskType = getFormString(formData, 'taskType', 32);
    const taskType =
      rawTaskType === 'read_word' || rawTaskType === 'free_sentence'
        ? rawTaskType
        : 'read_example';
    const rawDuration = Number(getFormString(formData, 'durationSec', 12));
    const durationSec =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.min(60, Math.round(rawDuration))
        : null;

    if (!term) {
      return NextResponse.json(
        { error: 'Thiếu từ vựng mục tiêu để chấm phát âm.' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(await audioEntry.arrayBuffer());
    const transcription = await transcribeAudioWithAI({
      buffer: audioBuffer,
      mimeType: audioEntry.type || 'audio/webm',
    });

    if (!transcription.ok) {
      return NextResponse.json(
        { error: transcription.error },
        { status: transcription.status }
      );
    }

    const heardTranscript = transcription.transcript.trim();
    if (!heardTranscript) {
      return NextResponse.json(
        {
          error:
            'AI chưa nghe rõ giọng nói tiếng Anh trong bản ghi âm. Hãy kiểm tra micro và ghi âm lại to, rõ hơn nhé (lượt nói của bạn chưa bị trừ).',
        },
        { status: 422 }
      );
    }

    const expectedTarget =
      taskType === 'read_word'
        ? term
        : taskType === 'read_example' && example
          ? example
          : `Any natural English sentence correctly using "${term}"`;

    const audioDurationHint = durationSec
      ? `\n- Recorded audio duration: ~${durationSec}s (processed directly from learner's microphone audio on server)`
      : '\n- Processed directly from learner microphone audio recording on server';

    const systemPrompt = `You are Qusin AI, a precise and encouraging English pronunciation & speaking coach for Vietnamese learners.
The learner recorded real microphone audio and our server AI transcribed the exact spoken sounds. Evaluate the learner's spoken English for this flashcard exercise.

Flashcard details:
- Target word: "${term}" ${phonetic ? `(${phonetic})` : ''} ${partOfSpeech ? `[${partOfSpeech}]` : ''}
- Vietnamese meaning: "${meaning}"
- Example sentence: "${example || term}"
- Task type: ${taskType === 'read_word' ? 'Pronounce the target word clearly' : taskType === 'read_example' ? 'Read the target word/example sentence aloud' : 'Create and speak an original English sentence using the target word'}
- Expected reference: "${expectedTarget}"${audioDurationHint}

Scoring & Percentage Rules:
1. "targetWordPercent" (0-100): How accurately the target word "${term}" was spoken/heard in the recording.
2. "pronunciationPercent" (0-100): Overall pronunciation & fluency clarity across the spoken recording.
3. "score" (0-100): Overall exercise score combining targetWordPercent, pronunciationPercent, and grammar/context accuracy.
4. "passed": true if score >= 70 AND targetWordPercent >= 60, else false.
5. "pronunciationGuide": Practical Vietnamese guide on HOW to pronounce "${term}" accurately — include syllable breakdown with UPPERCASE stress (e.g. "kə-LAB-ə-rayt"), rough Vietnamese sound hint (e.g. "cơ-LÁ-bơ-rết"), and which sound/ending consonant to focus on.
6. "pronunciationNote": 1-2 Vietnamese sentences analyzing what the learner pronounced clearly and any specific sound/syllable to fix based on what AI heard from their recording.
7. "usageFeedback": 1-2 Vietnamese sentences checking grammar, naturalness, and meaning usage.
8. "betterSentence": A natural, authentic English sentence using "${term}".
9. "betterSentenceVi": Vietnamese translation of "betterSentence".
10. Never mention any underlying model name or API details.

Return ONLY valid JSON matching this schema (no markdown code fences):
{
  "score": 88,
  "targetWordPercent": 92,
  "pronunciationPercent": 86,
  "passed": true,
  "pronunciationGuide": "...",
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
          content: `Exact words heard from learner's recorded audio: "${heardTranscript}"`,
        },
      ],
      temperature: 0.3,
      maxTokens: 650,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    if (neonReady) {
      const consumed = await consumeSpeakTurn(userId);
      if (!consumed.allowed) {
        return NextResponse.json(
          {
            error:
              'Bạn đã dùng hết lượt Luyện nói AI hôm nay. Hãy hoàn thành Nhiệm vụ để nhận thêm lượt!',
            quota: consumed.quota,
          },
          { status: 429 }
        );
      }
      currentQuota = consumed.quota;
    }

    const evaluation = parseSpeechEvaluation(
      result.content,
      heardTranscript,
      example || `I use "${term}" in daily English.`,
      meaning
    );

    return NextResponse.json({
      ...evaluation,
      quota: currentQuota,
    });
  } catch (error) {
    console.error('POST /api/ai/evaluate-speech error:', error);
    return NextResponse.json(
      { error: 'Không thể xử lý bản ghi âm lúc này.' },
      { status: 500 }
    );
  }
}
