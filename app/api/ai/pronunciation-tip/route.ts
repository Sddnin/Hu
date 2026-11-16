import { NextRequest, NextResponse } from 'next/server';
import { createLiteRouterCompletion } from '@/lib/ai-client';
import { getAuthenticatedUserId } from '@/lib/auth';

export interface PronunciationTipResult {
  syllables: string;
  viApprox: string;
  keySounds: string;
  sentenceTip: string;
}

function parseTip(
  raw: string,
  fallbackTerm: string,
  fallbackPhonetic: string
): PronunciationTipResult {
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
      const syllables =
        typeof obj.syllables === 'string' && obj.syllables.trim()
          ? obj.syllables.trim()
          : fallbackTerm;
      const viApprox =
        typeof obj.viApprox === 'string' ? obj.viApprox.trim() : '';
      const keySounds =
        typeof obj.keySounds === 'string' && obj.keySounds.trim()
          ? obj.keySounds.trim()
          : 'Chú ý trọng âm và bật rõ âm cuối của từ.';
      const sentenceTip =
        typeof obj.sentenceTip === 'string' ? obj.sentenceTip.trim() : '';
      return { syllables, viApprox, keySounds, sentenceTip };
    } catch {
      // Fallback below
    }
  }

  return {
    syllables: fallbackPhonetic ? `${fallbackTerm} (${fallbackPhonetic})` : fallbackTerm,
    viApprox: '',
    keySounds: raw.trim().slice(0, 220) || 'Nhấn đúng trọng âm và phát âm rõ âm cuối.',
    sentenceTip: '',
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để xem gợi ý phát âm AI.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const term =
      typeof body.term === 'string' ? body.term.trim().slice(0, 120) : '';
    const phonetic =
      typeof body.phonetic === 'string' ? body.phonetic.trim().slice(0, 80) : '';
    const partOfSpeech =
      typeof body.partOfSpeech === 'string'
        ? body.partOfSpeech.trim().slice(0, 40)
        : '';
    const example =
      typeof body.example === 'string' ? body.example.trim().slice(0, 300) : '';

    if (!term) {
      return NextResponse.json(
        { error: 'Thiếu từ vựng để tạo gợi ý phát âm.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an English pronunciation coach for Vietnamese learners.
Provide a clear, practical pronunciation guide for this target word (and optional example sentence).

Details:
- Word: "${term}" ${phonetic ? `(${phonetic})` : ''} ${partOfSpeech ? `[${partOfSpeech}]` : ''}
- Example sentence: "${example || 'None'}"

Rules:
1. "syllables": Break the word into syllables with the stressed syllable in UPPERCASE (e.g., "ig-ZAS-ər-bayt" or "kə-LAB-ə-rayt").
2. "viApprox": A short, easy-to-read Vietnamese-style phonetic approximation showing stress (e.g., "ig-GIÁT-sơ-bết") so a Vietnamese speaker immediately knows how it sounds.
3. "keySounds": 1-2 concise Vietnamese sentences explaining mouth/tongue position, stress, and tricky consonant clusters or ending sounds (like /t/, /d/, /s/, /z/, /θ/, /ð/).
4. "sentenceTip": If an example sentence is provided, 1 short Vietnamese tip on rhythm, linking, or key words to stress in that sentence (empty string if no example).
5. Never mention model names or API details.

Return ONLY valid JSON (no markdown fences):
{
  "syllables": "...",
  "viApprox": "...",
  "keySounds": "...",
  "sentenceTip": "..."
}`;

    const result = await createLiteRouterCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `How do I pronounce "${term}" accurately?` },
      ],
      temperature: 0.25,
      maxTokens: 350,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(parseTip(result.content, term, phonetic));
  } catch (error) {
    console.error('POST /api/ai/pronunciation-tip error:', error);
    return NextResponse.json(
      { error: 'Không thể tạo gợi ý phát âm lúc này.' },
      { status: 500 }
    );
  }
}
