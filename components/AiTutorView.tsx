'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Tag,
  Volume2,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Deck, Flashcard } from '@/lib/types';

interface AiTutorViewProps {
  decks: Deck[];
  cardsByDeck: Record<string, Flashcard[]>;
  allCards: Flashcard[];
}

interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  replyEn: string;
  replyVi?: string;
  suggestions?: string[];
}

type TutorLevel = 'basic' | 'intermediate' | 'advanced';

interface PresetTopic {
  id: string;
  title: string;
  subtitle: string;
  promptTopic: string;
}

const PRESET_TOPICS: PresetTopic[] = [
  {
    id: 'daily',
    title: 'Giao tiếp hằng ngày',
    subtitle: 'Trò chuyện tự nhiên về công việc, thói quen, sở thích',
    promptTopic: 'Giao tiếp tiếng Anh hằng ngày',
  },
  {
    id: 'work',
    title: 'Công việc & Phỏng vấn',
    subtitle: 'Họp nhóm, báo cáo tiến độ, phỏng vấn xin việc',
    promptTopic: 'Tiếng Anh công sở, họp nhóm và phỏng vấn việc làm',
  },
  {
    id: 'travel',
    title: 'Du lịch & Sân bay',
    subtitle: 'Đặt phòng khách sạn, làm thủ tục bay, hỏi đường',
    promptTopic: 'Du lịch, sân bay, khách sạn và hỏi đường',
  },
  {
    id: 'dining',
    title: 'Nhà hàng & Mua sắm',
    subtitle: 'Gọi món, thanh toán, trao đổi với nhân viên',
    promptTopic: 'Đặt món ăn tại nhà hàng và mua sắm',
  },
  {
    id: 'ielts',
    title: 'Luyện nói IELTS',
    subtitle: 'Trả lời câu hỏi Part 1–3, mở rộng ý và từ vựng hay',
    promptTopic: 'IELTS Speaking thảo luận quan điểm và trải nghiệm cá nhân',
  },
  {
    id: 'tech',
    title: 'Công nghệ & Học tập',
    subtitle: 'Thảo luận sản phẩm số, dự án và kỹ năng mới',
    promptTopic: 'Công nghệ, phần mềm và học tập hiện đại',
  },
];

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionConstructor():
  | (new () => BrowserSpeechRecognition)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function renderFormattedEnglish(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={i}
          className="font-semibold text-sky-700 dark:text-sky-300"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AiTutorView({
  decks,
  cardsByDeck,
  allCards,
}: AiTutorViewProps) {
  const [selectedTopic, setSelectedTopic] = useState<string>(
    PRESET_TOPICS[0].promptTopic
  );
  const [customTopic, setCustomTopic] = useState('');
  const [level, setLevel] = useState<TutorLevel>('intermediate');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('none');
  const [autoSpeak, setAutoSpeak] = useState(true);

  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(
    () => getSpeechRecognitionConstructor() !== null
  );

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const msgSeqRef = useRef(0);

  const userTopicTags = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const card of allCards) {
      for (const t of card.tags || []) {
        const k = t.toLowerCase();
        const existing = counts.get(k);
        if (existing) existing.count += 1;
        else counts.set(k, { tag: t, count: 1 });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [allCards]);

  const activeTopicLabel = customTopic.trim() || selectedTopic;

  const targetWords = useMemo(() => {
    if (selectedDeckId === 'none') {
      // If user picked one of their tag topics, pull matching cards automatically
      const matchingTagCards = allCards.filter((c) =>
        (c.tags || []).some(
          (t) => t.toLowerCase() === activeTopicLabel.toLowerCase()
        )
      );
      return matchingTagCards.slice(0, 8).map((c) => ({
        term: c.term,
        meaning: c.meaning,
      }));
    }
    const deckCards = cardsByDeck[selectedDeckId] || [];
    return deckCards.slice(0, 8).map((c) => ({
      term: c.term,
      meaning: c.meaning,
    }));
  }, [selectedDeckId, cardsByDeck, allCards, activeTopicLabel]);

  const activeDeckTitle = useMemo(() => {
    if (selectedDeckId === 'none') return '';
    return decks.find((d) => d.id === selectedDeckId)?.title || '';
  }, [selectedDeckId, decks]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  async function requestTutorReply(
    historyForApi: Array<{ role: 'user' | 'assistant'; content: string }>,
    topicOverride?: string
  ) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicOverride || activeTopicLabel,
          level,
          deckTitle: activeDeckTitle,
          targetWords,
          messages: historyForApi,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể kết nối tới Trợ lý AI.');
        return;
      }

      msgSeqRef.current += 1;
      const botMsg: TutorMessage = {
        id: `ai_${msgSeqRef.current}`,
        role: 'assistant',
        replyEn: data.replyEn || '',
        replyVi: data.replyVi || '',
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      };
      setMessages((prev) => [...prev, botMsg]);

      if (autoSpeak && botMsg.replyEn) {
        speakEnglish(botMsg.replyEn.replace(/\*\*/g, ''));
      }
    } catch {
      setError('Mất kết nối tới máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartTopicChat(topicToStart?: string) {
    const resolvedTopic = topicToStart || activeTopicLabel;
    if (!resolvedTopic.trim()) return;
    setMessages([]);
    await requestTutorReply([], resolvedTopic);
  }

  async function sendUserMessage(rawContent: string) {
    const text = rawContent.trim();
    if (!text || loading) return;

    msgSeqRef.current += 1;
    const userMsg: TutorMessage = {
      id: `usr_${msgSeqRef.current}`,
      role: 'user',
      replyEn: text,
    };

    const nextHistory = [
      ...messages.map((m) => ({
        role: m.role,
        content: m.replyEn,
      })),
      { role: 'user' as const, content: text },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    await requestTutorReply(nextHistory);
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void sendUserMessage(inputText);
  }

  function toggleVoiceInput() {
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      setListening(false);
      return;
    }

    const SpeechRec = getSpeechRecognitionConstructor();
    if (!SpeechRec) {
      setError(
        'Trình duyệt hiện tại chưa hỗ trợ nhập giọng nói trực tiếp. Bạn có thể gõ hoặc dùng micro trên bàn phím điện thoại.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0]?.transcript || '';
        }
        setInputText(transcript.trim());
      };

      rec.onerror = () => {
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      setError(null);
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError('Không thể bật micro. Hãy kiểm tra quyền truy cập micro.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Trò chuyện Luyện Tiếng Anh cùng AI
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Chọn chủ đề yêu thích hoặc nhãn từ vựng của bạn để hội thoại song ngữ, sửa lỗi tự nhiên và luyện phản xạ nói.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAutoSpeak((v) => !v)}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto ${
            autoSpeak
              ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          <span>{autoSpeak ? 'Tự đọc câu AI: Bật' : 'Tự đọc câu AI: Tắt'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Sidebar: Topic & Deck Selection */}
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4 sm:p-5">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1. Chọn chủ đề trò chuyện
            </h2>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {PRESET_TOPICS.map((t) => {
                const isSelected =
                  !customTopic.trim() && selectedTopic === t.promptTopic;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setCustomTopic('');
                      setSelectedTopic(t.promptTopic);
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/70 dark:border-sky-500 dark:bg-sky-950/30'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {t.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {userTopicTags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Chủ đề từ nhãn thẻ của bạn:</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userTopicTags.map((item) => {
                  const active =
                    !customTopic.trim() &&
                    selectedTopic.toLowerCase() === item.tag.toLowerCase();
                  return (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => {
                        setCustomTopic('');
                        setSelectedTopic(item.tag);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      #{item.tag} ({item.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="ai-custom-topic"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Hoặc tự nhập chủ đề riêng
            </label>
            <input
              id="ai-custom-topic"
              type="text"
              maxLength={100}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Ví dụ: Đặt phòng khách sạn, Thuyết trình..."
              className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <label
                htmlFor="ai-level-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Trình độ hội thoại
              </label>
              <select
                id="ai-level-select"
                value={level}
                onChange={(e) => setLevel(e.target.value as TutorLevel)}
                className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="basic">Cơ bản (A1–A2, câu ngắn dễ hiểu)</option>
                <option value="intermediate">Trung cấp (B1–B2, tự nhiên)</option>
                <option value="advanced">Nâng cao (C1, chuyên sâu)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="ai-deck-vocab"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <BookOpen className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                <span>Lồng ghép từ vựng từ bộ thẻ</span>
              </label>
              <select
                id="ai-deck-vocab"
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="none">Tự động theo chủ đề</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.cardCount} từ)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleStartTopicChat()}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {messages.length > 0
                ? 'Bắt đầu cuộc trò chuyện mới'
                : 'Bắt đầu trò chuyện theo chủ đề'}
            </span>
          </button>
        </aside>

        {/* Right Zone: Chat Thread */}
        <section className="flex min-h-[540px] flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          {/* Chat Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  Chủ đề: {activeTopicLabel}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {targetWords.length > 0
                    ? `Đang lồng ghép ${targetWords.length} từ vựng mục tiêu`
                    : 'Hội thoại song ngữ Anh – Việt · Chỉnh lỗi tự nhiên'}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 max-h-[520px]">
            {messages.length === 0 && !loading && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Sẵn sàng luyện giao tiếp về “{activeTopicLabel}”
                </h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Nhấn nút bên dưới để AI mở lời trước bằng tiếng Anh, hoặc gõ / nói trực tiếp câu chào của bạn.
                </p>
                <button
                  type="button"
                  onClick={() => void handleStartTopicChat()}
                  className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>AI mở đầu hội thoại</span>
                </button>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-sky-600 px-4 py-2.5 text-sm text-white dark:bg-sky-500 dark:text-slate-950">
                    {msg.replyEn}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                        {renderFormattedEnglish(msg.replyEn)}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          speakEnglish(msg.replyEn.replace(/\*\*/g, ''))
                        }
                        title="Nghe phát âm tiếng Anh"
                        aria-label="Nghe câu trả lời tiếng Anh"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                      >
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {msg.replyVi && (
                      <p className="border-t border-slate-200/80 pt-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {msg.replyVi}
                      </p>
                    )}

                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1.5">
                        {msg.suggestions.map((sug, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={loading}
                            onClick={() => void sendUserMessage(sug)}
                            className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-left text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50 disabled:opacity-50 dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-sky-950/50 cursor-pointer"
                          >
                            “{sug}”
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                  Trợ lý AI đang phản hồi...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Input Bar */}
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4"
          >
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={
                speechSupported
                  ? listening
                    ? 'Dừng ghi âm'
                    : 'Nói bằng tiếng Anh'
                  : 'Trình duyệt không hỗ trợ Web Speech'
              }
              aria-label="Nhập bằng giọng nói"
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                listening
                  ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
              }`}
            >
              {listening ? (
                <MicOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                listening
                  ? 'Đang nghe tiếng Anh...'
                  : 'Nhập câu trả lời bằng tiếng Anh (hoặc hỏi bằng tiếng Việt)...'
              }
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
