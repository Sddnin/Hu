export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE_URL = 'https://literouter.fun/api/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash-1017';

export function isAiConfigured(): boolean {
  return Boolean(process.env.LITEROUTER_API_KEY?.trim());
}

export async function createLiteRouterCompletion(params: {
  messages: ChatMessageInput[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.LITEROUTER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        'Tính năng AI chưa được cấu hình khóa API trên máy chủ (LITEROUTER_API_KEY).',
    };
  }

  const baseUrl = (process.env.LITEROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  );
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
