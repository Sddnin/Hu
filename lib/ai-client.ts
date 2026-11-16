import { GoogleGenAI } from '@google/genai';

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE_URL = 'https://literouter.fun/api/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash-1017';
const DEFAULT_AUDIO_MODEL = 'whisper-1';

function getValidGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return key;
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.LITEROUTER_API_KEY?.trim() || getValidGeminiKey());
}

export function normalizeAudioMimeType(rawMimeType: string): string {
  const base = rawMimeType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/x-m4a' || base === 'video/mp4') return 'audio/mp4';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'audio/wave' || base === 'audio/x-wav') return 'audio/wav';
  if (
    base === 'audio/webm' ||
    base === 'audio/mp4' ||
    base === 'audio/mpeg' ||
    base === 'audio/mp3' ||
    base === 'audio/ogg' ||
    base === 'audio/wav' ||
    base === 'audio/aac' ||
    base === 'audio/flac'
  ) {
    return base === 'audio/mp3' ? 'audio/mpeg' : base;
  }
  return 'audio/webm';
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'webm';
  }
}

export async function createLiteRouterCompletion(params: {
  messages: ChatMessageInput[];
  temperature?: number;
  maxTokens?: number;
}): Promise<
  { ok: true; content: string } | { ok: false; status: number; error: string }
> {
  const apiKey = process.env.LITEROUTER_API_KEY?.trim();
  const geminiKey = getValidGeminiKey();

  if (!apiKey) {
    if (geminiKey) {
      return createGeminiTextFallback(geminiKey, params.messages);
    }
    return {
      ok: false,
      status: 503,
      error:
        'Tính năng AI chưa được cấu hình khóa API trên máy chủ (LITEROUTER_API_KEY).',
    };
  }

  const baseUrl = (
    process.env.LITEROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  const model = process.env.LITEROUTER_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 900,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('LiteRouter AI upstream error:', res.status, errText);
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: 502,
          error: 'Khóa AI trên máy chủ không hợp lệ hoặc đã hết hạn.',
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: 'Trợ lý AI đang bận, vui lòng thử lại sau vài giây.',
        };
      }
      return {
        ok: false,
        status: 502,
        error: 'Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại.',
      };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return {
        ok: false,
        status: 502,
        error: 'Trợ lý AI trả về nội dung trống. Vui lòng thử lại.',
      };
    }

    return { ok: true, content: content.trim() };
  } catch (error) {
    console.error('LiteRouter AI fetch failed:', error);
    return {
      ok: false,
      status: 504,
      error: 'Không thể kết nối tới Trợ lý AI lúc này.',
    };
  }
}

async function createGeminiTextFallback(
  geminiKey: string,
  messages: ChatMessageInput[]
): Promise<
  { ok: true; content: string } | { ok: false; status: number; error: string }
> {
  try {
    const ai = createGeminiClient(geminiKey);
    const systemParts = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n');

    const prompt = systemParts
      ? `${systemParts}\n\n---\n${conversation}`
      : conversation;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
    });

    const text = response.text?.trim() || '';
    if (!text) {
      return {
        ok: false,
        status: 502,
        error: 'Trợ lý AI trả về nội dung trống. Vui lòng thử lại.',
      };
    }
    return { ok: true, content: text };
  } catch (error) {
    console.error('Gemini fallback text generation failed:', error);
    return {
      ok: false,
      status: 502,
      error: 'Không thể kết nối tới Trợ lý AI lúc này.',
    };
  }
}

export async function transcribeAudioWithAI(params: {
  buffer: Buffer;
  mimeType: string;
}): Promise<
  | { ok: true; transcript: string }
  | { ok: false; status: number; error: string }
> {
  const cleanMimeType = normalizeAudioMimeType(params.mimeType);
  const geminiKey = getValidGeminiKey();
  const liteRouterKey = process.env.LITEROUTER_API_KEY?.trim();

  if (!geminiKey && !liteRouterKey) {
    return {
      ok: false,
      status: 503,
      error:
        'Máy chủ chưa cấu hình dịch vụ nhận diện giọng nói AI (GEMINI_API_KEY hoặc LITEROUTER_API_KEY).',
    };
  }

  // 1. Primary path when GEMINI_API_KEY is available: transcribe recorded audio via gemini-3.5-transcribe
  if (geminiKey) {
    try {
      const ai = createGeminiClient(geminiKey);
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: params.buffer.toString('base64'),
              },
            },
            {
              text: 'Listen carefully to this English speaking practice recording. Transcribe ONLY the exact words spoken by the learner without correcting grammar or guessing unuttered words. Output ONLY the raw spoken transcript, or [NO_SPEECH] if there is only silence or background noise.',
            },
          ],
        },
      });

      const rawTranscript = (response.text || '').trim();
      if (rawTranscript && !rawTranscript.includes('[NO_SPEECH]')) {
        return { ok: true, transcript: rawTranscript };
      }
      if (rawTranscript.includes('[NO_SPEECH]')) {
        return { ok: true, transcript: '' };
      }
    } catch (error) {
      console.error('Audio transcription via Gemini failed:', error);
      // Fall through to LiteRouter audio endpoint if configured
      if (!liteRouterKey) {
        return {
          ok: false,
          status: 502,
          error: 'Không thể xử lý tệp ghi âm giọng nói lúc này. Vui lòng thử lại.',
        };
      }
    }
  }

  // 2. Fallback / Vercel path via LiteRouter Whisper-compatible endpoint
  if (liteRouterKey) {
    const baseUrl = (
      process.env.LITEROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    const audioModel =
      process.env.LITEROUTER_AUDIO_MODEL?.trim() || DEFAULT_AUDIO_MODEL;

    try {
      const ext = extensionForMime(cleanMimeType);
      const formData = new FormData();
      const uint8 = new Uint8Array(params.buffer);
      const blob = new Blob([uint8], { type: cleanMimeType });
      formData.append('file', blob, `recording.${ext}`);
      formData.append('model', audioModel);
      formData.append('language', 'en');

      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${liteRouterKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('LiteRouter audio transcription error:', res.status, errText);
        return {
          ok: false,
          status: 502,
          error:
            'Không thể xử lý bản ghi âm trên máy chủ lúc này. Vui lòng thử ghi âm lại.',
        };
      }

      const data = await res.json();
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      return { ok: true, transcript: text };
    } catch (error) {
      console.error('LiteRouter audio transcription fetch failed:', error);
      return {
        ok: false,
        status: 504,
        error: 'Không thể gửi bản ghi âm tới máy chủ AI.',
      };
    }
  }

  return { ok: true, transcript: '' };
}
