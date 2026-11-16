import { GoogleGenAI } from '@google/genai';

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE_URL = 'https://literouter.fun/api/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash-1017';

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

async function tryGeminiAudioTranscription(
  geminiKey: string,
  base64Audio: string,
  mimeType: string
): Promise<{ ok: true; transcript: string } | { ok: false; detail: string }> {
  const ai = createGeminiClient(geminiKey);
  const modelsToTry = ['gemini-3.5-transcribe', 'gemini-2.5-flash'];
  let lastDetail = '';

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: 'Listen carefully to this English speaking practice recording. Transcribe ONLY the exact words spoken by the learner without correcting grammar or guessing unuttered words. Output ONLY the raw spoken transcript, or [NO_SPEECH] if there is only silence or background noise.',
            },
          ],
        },
      });

      const rawTranscript = (response.text || '').trim();
      if (rawTranscript.includes('[NO_SPEECH]')) {
        return { ok: true, transcript: '' };
      }
      if (rawTranscript) {
        return { ok: true, transcript: rawTranscript };
      }
      return { ok: true, transcript: '' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      lastDetail = msg;
      console.error(`Gemini audio transcription (${model}) failed:`, msg);
    }
  }

  return { ok: false, detail: lastDetail };
}

async function tryOpenAiCompatibleWhisper(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<
  { ok: true; transcript: string } | { ok: false; status: number; detail: string }
> {
  try {
    const ext = extensionForMime(params.mimeType);
    const formData = new FormData();
    const uint8 = new Uint8Array(params.buffer);
    const blob = new Blob([uint8], { type: params.mimeType });
    formData.append('file', blob, `recording.${ext}`);
    formData.append('model', params.model);
    formData.append('language', 'en');

    const res = await fetch(`${params.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        detail: errText.slice(0, 200),
      };
    }

    const data = await res.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return { ok: true, transcript: text };
  } catch (error) {
    return {
      ok: false,
      status: 504,
      detail: error instanceof Error ? error.message : 'Network error',
    };
  }
}

async function tryChatMultimodalAudio(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  base64Audio: string;
  format: 'wav' | 'mp3';
}): Promise<{ ok: true; transcript: string } | { ok: false; detail: string }> {
  try {
    const res = await fetch(
      `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcribe ONLY the exact English words spoken in this audio without correcting mistakes. Reply with [NO_SPEECH] if silent.',
                },
                {
                  type: 'input_audio',
                  input_audio: {
                    data: params.base64Audio,
                    format: params.format,
                  },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, detail: `${res.status} ${errText.slice(0, 150)}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { ok: false, detail: 'Empty audio chat response' };
    }
    const cleaned = content.trim();
    if (cleaned.includes('[NO_SPEECH]')) {
      return { ok: true, transcript: '' };
    }
    return { ok: true, transcript: cleaned };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Network error',
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
  const base64Audio = params.buffer.toString('base64');

  const geminiKey = getValidGeminiKey();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const customAudioKey = process.env.AUDIO_API_KEY?.trim();
  const customAudioBaseUrl = process.env.AUDIO_BASE_URL?.trim();
  const liteRouterKey = process.env.LITEROUTER_API_KEY?.trim();
  const liteRouterBaseUrl = (
    process.env.LITEROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, '');

  // 1. Gemini audio transcription (gemini-3.5-transcribe -> gemini-2.5-flash fallback)
  let geminiFailure = '';
  if (geminiKey) {
    const geminiRes = await tryGeminiAudioTranscription(
      geminiKey,
      base64Audio,
      cleanMimeType
    );
    if (geminiRes.ok) {
      return geminiRes;
    }
    geminiFailure = geminiRes.detail;
  }

  // 2. Optional dedicated Whisper APIs if user configured them (Groq free Whisper / OpenAI / custom)
  if (customAudioKey && customAudioBaseUrl) {
    const res = await tryOpenAiCompatibleWhisper({
      baseUrl: customAudioBaseUrl,
      apiKey: customAudioKey,
      model: process.env.AUDIO_MODEL?.trim() || 'whisper-1',
      buffer: params.buffer,
      mimeType: cleanMimeType,
    });
    if (res.ok) return res;
  }

  if (groqKey) {
    const res = await tryOpenAiCompatibleWhisper({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: groqKey,
      model: 'whisper-large-v3-turbo',
      buffer: params.buffer,
      mimeType: cleanMimeType,
    });
    if (res.ok) return res;
  }

  if (openaiKey) {
    const res = await tryOpenAiCompatibleWhisper({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: 'whisper-1',
      buffer: params.buffer,
      mimeType: cleanMimeType,
    });
    if (res.ok) return res;
  }

  // 3. LiteRouter fallback: try multimodal audio via chat completions if wav/mp3, then custom audio model if specified
  if (liteRouterKey) {
    const audioFormat =
      cleanMimeType === 'audio/wav'
        ? 'wav'
        : cleanMimeType === 'audio/mpeg'
          ? 'mp3'
          : null;

    if (audioFormat) {
      const candidates = [
        process.env.LITEROUTER_AUDIO_MODEL?.trim(),
        'gemini-2.5-flash',
        'gpt-4o-audio-preview',
      ].filter((m): m is string => Boolean(m));

      for (const model of Array.from(new Set(candidates))) {
        const chatAudioRes = await tryChatMultimodalAudio({
          baseUrl: liteRouterBaseUrl,
          apiKey: liteRouterKey,
          model,
          base64Audio,
          format: audioFormat,
        });
        if (chatAudioRes.ok) {
          return chatAudioRes;
        }
        console.error(
          `LiteRouter multimodal audio (${model}) failed:`,
          chatAudioRes.detail
        );
      }
    }

    if (process.env.LITEROUTER_AUDIO_MODEL?.trim()) {
      const whisperRes = await tryOpenAiCompatibleWhisper({
        baseUrl: liteRouterBaseUrl,
        apiKey: liteRouterKey,
        model: process.env.LITEROUTER_AUDIO_MODEL.trim(),
        buffer: params.buffer,
        mimeType: cleanMimeType,
      });
      if (whisperRes.ok) return whisperRes;
    }
  }

  // 4. Honest, actionable diagnostic message without leaking secrets/model names
  if (!geminiKey && !groqKey && !openaiKey && !customAudioKey) {
    return {
      ok: false,
      status: 503,
      error:
        'Máy chủ hiện mới có khóa Chat văn bản, chưa có khóa AI nghe giọng nói. Hãy thêm biến môi trường GEMINI_API_KEY (miễn phí từ Google AI Studio) hoặc GROQ_API_KEY vào Vercel/Secrets để AI xử lý bản ghi âm.',
    };
  }

  if (
    geminiFailure.includes('401') ||
    geminiFailure.includes('403') ||
    geminiFailure.includes('API_KEY_INVALID')
  ) {
    return {
      ok: false,
      status: 502,
      error:
        'Khóa AI nghe âm thanh (GEMINI_API_KEY) chưa hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại cấu hình.',
    };
  }

  if (geminiFailure.includes('429') || geminiFailure.includes('RESOURCE_EXHAUSTED')) {
    return {
      ok: false,
      status: 429,
      error: 'Hệ thống AI xử lý âm thanh đang quá tải, vui lòng thử lại sau vài giây.',
    };
  }

  return {
    ok: false,
    status: 502,
    error:
      'Máy chủ AI tạm thời chưa giải mã được bản ghi âm này. Hãy kiểm tra kết nối hoặc thử ghi âm lại.',
  };
}
