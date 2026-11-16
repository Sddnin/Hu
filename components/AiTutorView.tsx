'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  History,
  Lightbulb,
  Lock,
  LogIn,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AiChatSessionDetail,
  AiChatSessionSummary,
  GrammarReview,
  TutorLevel,
  TutorMessage,
} from '@/lib/ai-history';
import { speakEnglish } from '@/lib/speech';
import { AiQuotaSnapshot, AuthUser, Deck, Flashcard } from '@/lib/types';

interface AiTutorViewProps {
  user: AuthUser | null;
  decks: Deck[];
  cardsByDeck: Record<string, Flashcard[]>;
  allCards: Flashcard[];
  aiQuota: AiQuotaSnapshot;
  onUpdateQuota: (next: AiQuotaSnapshot | null | undefined) => void;
  onOpenAuth: () => void;
  onGoToMissions: () => void;
}

interface PresetTopic {
  id: string;
  title: string;
  promptTopic: string;
}

const PRESET_TOPICS: PresetTopic[] = [
  { id: 'daily', title: 'Giao tiếp hằng ngày', promptTopic: 'Daily life and casual conversation' },
  { id: 'work', title: 'Công việc & Phỏng vấn', promptTopic: 'Workplace communication and job interviews' },
  { id: 'travel', title: 'Du lịch & Sân bay', promptTopic: 'Travel, airports, hotels, and ordering food' },
  { id: 'tech', title: 'Công nghệ & Lập trình', promptTopic: 'Technology, software, and teamwork' },
  { id: 'social', title: 'Bạn bè & Sở thích', promptTopic: 'Making friends, hobbies, movies, and music' },
  { id: 'study', title: 'Học tập & Học thuật', promptTopic: 'Studying abroad, exams, and university life' },
];

const LEVEL_BADGE: Record<TutorLevel, string> = {
  basic: 'A1–A2',
  intermediate: 'B1–B2',
  advanced: 'C1',
};

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
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

function formatChatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

export function AiTutorView({
  user,
  decks,
  cardsByDeck,
  allCards,
  aiQuota,
  onUpdateQuota,
  onOpenAuth,
  onGoToMissions,
}: AiTutorViewProps) {
  const [selectedTopic, setSelectedTopic] = useState<string>(
    PRESET_TOPICS[0].promptTopic
  );
  const [customTopic, setCustomTopic] = useState('');
  const [level, setLevel] = useState<TutorLevel>('intermediate');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('none');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(
    () => getSpeechRecognitionConstructor() !== null
  );

  // Chat history state
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySessions, setHistorySessions] = useState<
    AiChatSessionSummary[]
  >([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const msgSeqRef = useRef(0);
  const loadedUserIdRef = useRef<string | null>(null);

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

  const activeTopicLabel = useMemo(() => {
    if (customTopic.trim()) return customTopic.trim();
    const preset = PRESET_TOPICS.find((p) => p.promptTopic === selectedTopic);
    return preset ? preset.title : selectedTopic;
  }, [customTopic, selectedTopic]);

  const targetWords = useMemo(() => {
    if (selectedDeckId === 'none') return [];
    const deckCards = cardsByDeck[selectedDeckId] || [];
    return deckCards
      .slice(0, 10)
      .map((c) => ({ term: c.term, meaning: c.meaning }));
  }, [selectedDeckId, cardsByDeck]);

  const activeDeckTitle = useMemo(() => {
    if (selectedDeckId === 'none') return '';
    return decks.find((d) => d.id === selectedDeckId)?.title || '';
  }, [selectedDeckId, decks]);

  const applyTopicLabel = useCallback((topicStr: string) => {
    const matchedPreset = PRESET_TOPICS.find(
      (p) => p.title === topicStr || p.promptTopic === topicStr
    );
    if (matchedPreset) {
      setCustomTopic('');
      setSelectedTopic(matchedPreset.promptTopic);
    } else {
      setCustomTopic(topicStr);
    }
  }, []);

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

  // Load saved AI chat history when user logs in
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId) {
      loadedUserIdRef.current = null;
      return;
    }
    if (loadedUserIdRef.current === userId) return;
    loadedUserIdRef.current = userId;

    let cancelled = false;
    async function loadInitialHistory() {
      setHistoryLoading(true);
      try {
        const res = await fetch('/api/ai/history');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const sessionsList = Array.isArray(data.sessions)
          ? (data.sessions as AiChatSessionSummary[])
          : [];
        setHistorySessions(sessionsList);

        const latest = data.latestSession as AiChatSessionDetail | null;
        if (latest && Array.isArray(latest.messages) && latest.messages.length > 0) {
          setCurrentSessionId(latest.id);
          setMessages(latest.messages);
          setLevel(latest.level);
          applyTopicLabel(latest.topic);
        }
      } catch {
        // Non-blocking history load
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadInitialHistory();
    return () => {
      cancelled = true;
    };
  }, [userId, applyTopicLabel]);

  async function handleSelectHistorySession(sessionId: string) {
    if (loading || loadingSessionId === sessionId) return;
    setLoadingSessionId(sessionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/ai/history?sessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      if (!res.ok || !data.session) {
        setError(data.error || 'Không thể tải cuộc trò chuyện này.');
        return;
      }
      const detail = data.session as AiChatSessionDetail;
      setCurrentSessionId(detail.id);
      setMessages(detail.messages || []);
      setLevel(detail.level);
      applyTopicLabel(detail.topic);
      setShowHistory(false);
    } catch {
      setError('Mất kết nối khi tải lịch sử trò chuyện.');
    } finally {
      setLoadingSessionId(null);
    }
  }

  async function handleDeleteHistorySession(sessionId: string) {
    try {
      const res = await fetch(
        `/api/ai/history?sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) return;
      setHistorySessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch {
      // Ignore transient error
    }
  }

  async function handleClearAllHistory() {
    try {
      const res = await fetch('/api/ai/history?all=1', { method: 'DELETE' });
      if (!res.ok) return;
      setHistorySessions([]);
      setCurrentSessionId(null);
      setMessages([]);
      setConfirmClearAll(false);
    } catch {
      // Ignore transient error
    }
  }

  function handleNewBlankConversation() {
    setCurrentSessionId(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
  }

  async function requestTutorReply(
    historyForApi: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: { topicOverride?: string; sessionIdOverride?: string | null }
  ) {
    if (!user) {
      onOpenAuth();
      return;
    }

    const activeSessId =
      options && 'sessionIdOverride' in options
        ? options.sessionIdOverride
        : currentSessionId;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessId || undefined,
          topic: options?.topicOverride || activeTopicLabel,
          level,
          deckTitle: activeDeckTitle,
          targetWords,
          messages: historyForApi,
        }),
      });
      const data = await res.json();
      if (data.quota) {
        onUpdateQuota(data.quota as AiQuotaSnapshot);
      }
      if (!res.ok) {
        setError(data.error || 'Không thể kết nối tới Qusin AI.');
        return;
      }

      if (typeof data.sessionId === 'string' && data.sessionId) {
        setCurrentSessionId(data.sessionId);
      }
      if (data.sessionSummary) {
        const summary = data.sessionSummary as AiChatSessionSummary;
        setHistorySessions((prev) => [
          summary,
          ...prev.filter((item) => item.id !== summary.id),
        ]);
      }

      msgSeqRef.current += 1;
      const botMsg: TutorMessage = {
        id: `ai_${msgSeqRef.current}`,
        role: 'assistant',
        replyEn: data.replyEn || '',
        replyVi: data.replyVi || '',
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        grammarReview:
          data.grammarReview && typeof data.grammarReview === 'object'
            ? (data.grammarReview as GrammarReview)
            : null,
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
    if (!user) {
      onOpenAuth();
      return;
    }
    const resolvedTopic = topicToStart || activeTopicLabel;
    if (!resolvedTopic.trim()) return;
    setCurrentSessionId(null);
    setMessages([]);
    await requestTutorReply([], {
      topicOverride: resolvedTopic,
      sessionIdOverride: null,
    });
  }

  async function sendUserMessage(rawContent: string) {
    if (!user) {
      onOpenAuth();
      return;
    }
    const text = rawContent.trim();
    if (!text || loading) return;
    if (aiQuota.chatRemaining <= 0) {
      setError(
        'Bạn đã hết lượt Chat AI hôm nay. Hãy hoàn thành Nhiệm vụ để nhận thêm lượt!'
      );
      return;
    }

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

  // Login Gate for Chat AI
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900 sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
            <Lock className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Đăng nhập để trò chuyện cùng Qusin AI
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Chỉ tài khoản đã đăng nhập mới được sử dụng tính năng Chat AI và lưu lịch sử hội thoại. Mỗi tài khoản nhận sẵn{' '}
            <strong className="text-slate-900 dark:text-slate-100">10 lượt chat</strong> và{' '}
            <strong className="text-slate-900 dark:text-slate-100">20 lượt luyện nói</strong> mỗi ngày!
          </p>

          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Đăng nhập / Tạo tài khoản</span>
            </button>
            <button
              type="button"
              onClick={onGoToMissions}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <Target className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Xem Nhiệm vụ nhận lượt</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const outOfChatTurns = aiQuota.chatRemaining <= 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      {/* Compact Header & Live Quota */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
              Qusin AI · Hội thoại tiếng Anh
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chấm ngữ pháp · Đề xuất câu tự nhiên · Tự lưu lịch sử
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold ${
              outOfChatTurns
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300'
            }`}
          >
            <span className="font-mono-tabular">
              Lượt chat: {aiQuota.chatRemaining}/{aiQuota.chatLimit}
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToMissions}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
          >
            <Target className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>Thêm lượt</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowHistory((v) => !v);
              setConfirmClearAll(false);
            }}
            aria-expanded={showHistory}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              showHistory
                ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                : 'border-slate-200 bg-white text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lịch sử ({historySessions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoSpeak((v) => !v)}
            className={`inline-flex min-h-[36px] items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              autoSpeak
                ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {autoSpeak ? 'Tự đọc: Bật' : 'Tự đọc: Tắt'}
            </span>
          </button>
        </div>
      </div>

      {/* Compact Topic Bar */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
                className={`min-h-[32px] shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                }`}
              >
                {t.title}
              </button>
            );
          })}

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
                className={`min-h-[32px] shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                }`}
              >
                #{item.tag}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            maxLength={100}
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="Hoặc tự nhập chủ đề riêng (VD: Đặt phòng khách sạn...)"
            className="min-h-[36px] min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-semibold cursor-pointer ${
              showOptions
                ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Trình độ & Bộ thẻ</span>
          </button>

          <button
            type="button"
            onClick={handleNewBlankConversation}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cuộc mới</span>
          </button>

          <button
            type="button"
            disabled={loading || outOfChatTurns}
            onClick={() => void handleStartTopicChat()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>AI mở lời</span>
          </button>
        </div>

        {showOptions && (
          <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-slate-200 pt-2.5 dark:border-slate-800 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="ai-level-select"
                className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Trình độ:
              </label>
              <select
                id="ai-level-select"
                value={level}
                onChange={(e) => setLevel(e.target.value as TutorLevel)}
                className="min-h-[36px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="basic">Cơ bản (A1–A2)</option>
                <option value="intermediate">Trung cấp (B1–B2)</option>
                <option value="advanced">Nâng cao (C1)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="ai-deck-vocab"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                <BookOpen className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                <span>Bộ thẻ:</span>
              </label>
              <select
                id="ai-deck-vocab"
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="min-h-[36px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
        )}
      </div>

      {/* Main Split Area: Optional History Drawer + Chat Thread */}
      <div
        className={`grid gap-4 ${
          showHistory ? 'grid-cols-1 lg:grid-cols-[300px_1fr]' : 'grid-cols-1'
        }`}
      >
        {showHistory && (
          <aside className="flex max-h-[560px] flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2.5 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                <History className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <span>Lịch sử trò chuyện</span>
              </div>
              <div className="flex items-center gap-1.5">
                {historySessions.length > 0 && !confirmClearAll && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 cursor-pointer"
                  >
                    Xóa hết
                  </button>
                )}
                {confirmClearAll && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleClearAllHistory()}
                      className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      Xác nhận
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="text-[11px] font-semibold text-slate-500 cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  aria-label="Đóng lịch sử"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 lg:hidden cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
              {historyLoading ? (
                <p className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Đang tải lịch sử hội thoại...
                </p>
              ) : historySessions.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Chưa có cuộc trò chuyện nào được lưu. Bắt đầu nhắn tin với Qusin AI để tự động lưu lại nhé!
                </div>
              ) : (
                historySessions.map((item) => {
                  const isActive = currentSessionId === item.id;
                  const isLoadingItem = loadingSessionId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`group flex items-start justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                        isActive
                          ? 'border-sky-500 bg-sky-50/70 dark:border-sky-600 dark:bg-sky-950/30'
                          : 'border-slate-200/80 bg-slate-50/50 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-950/40'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={isLoadingItem}
                        onClick={() => void handleSelectHistorySession(item.id)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                            {item.topic}
                          </span>
                          <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {LEVEL_BADGE[item.level] || 'B1–B2'}
                          </span>
                        </div>
                        {item.previewText && (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                            {item.previewText}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {formatChatTime(item.updatedAt)}
                          </span>
                          <span>· {item.messageCount} tin nhắn</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        title="Xóa cuộc trò chuyện"
                        aria-label={`Xóa cuộc trò chuyện ${item.topic}`}
                        onClick={() => void handleDeleteHistorySession(item.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Chat Thread Box */}
        <section className="flex min-h-[480px] flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 text-xs dark:border-slate-800 sm:px-5">
            <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
              Chủ đề: {activeTopicLabel}
              {activeDeckTitle ? ` · Bộ thẻ: ${activeDeckTitle}` : ''}
            </span>
            <span className="shrink-0 text-slate-500 dark:text-slate-400">
              {currentSessionId ? 'Đã lưu lịch sử' : 'Qusin AI'}
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 max-h-[500px]">
            {messages.length === 0 && !loading && (
              <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Trò chuyện cùng Qusin AI về “{activeTopicLabel}”
                </h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Nhấn nút bên dưới để Qusin AI mở lời trước bằng tiếng Anh, hoặc gõ / nói trực tiếp câu chào của bạn. Toàn bộ cuộc hội thoại được tự động lưu vào Lịch sử.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    disabled={outOfChatTurns}
                    onClick={() => void handleStartTopicChat()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Qusin AI mở đầu hội thoại</span>
                  </button>
                  {historySessions.length > 0 && !showHistory && (
                    <button
                      type="button"
                      onClick={() => setShowHistory(true)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                    >
                      <History className="h-4 w-4" aria-hidden="true" />
                      <span>Mở lại lịch sử ({historySessions.length})</span>
                    </button>
                  )}
                </div>
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
                <div key={msg.id} className="space-y-2">
                  {msg.grammarReview && (
                    <div className="flex justify-end">
                      <div className="max-w-[90%] rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20 sm:max-w-[85%]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-100">
                            <CheckCircle2
                              className={`h-3.5 w-3.5 ${
                                msg.grammarReview.grammarScore >= 85
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                              aria-hidden="true"
                            />
                            <span>
                              {msg.grammarReview.isCorrect
                                ? 'Ngữ pháp chuẩn'
                                : 'Góp ý ngữ pháp & diễn đạt'}
                            </span>
                          </span>
                          <span
                            className={`font-mono-tabular rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              msg.grammarReview.grammarScore >= 85
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : msg.grammarReview.grammarScore >= 65
                                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            }`}
                          >
                            Ngữ pháp: {msg.grammarReview.grammarScore}%
                          </span>
                        </div>

                        {!msg.grammarReview.isCorrect &&
                          msg.grammarReview.correctedEn && (
                            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-500 dark:text-slate-400">
                                  Sửa chuẩn:{' '}
                                </span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  “{msg.grammarReview.correctedEn}”
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  speakEnglish(msg.grammarReview!.correctedEn)
                                }
                                aria-label="Nghe câu đã sửa ngữ pháp"
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          )}

                        {msg.grammarReview.authenticEn && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-sky-200/80 bg-white px-2.5 py-1.5 dark:border-sky-900/50 dark:bg-slate-900">
                            <div className="min-w-0">
                              <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
                                <Lightbulb className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>Nói tự nhiên & chân thực hơn:</span>
                              </span>{' '}
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                “{msg.grammarReview.authenticEn}”
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                speakEnglish(msg.grammarReview!.authenticEn)
                              }
                              aria-label="Nghe câu nói tự nhiên hơn"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}

                        {msg.grammarReview.feedbackVi && (
                          <p className="mt-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                            {msg.grammarReview.feedbackVi}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-start">
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
                              disabled={loading || outOfChatTurns}
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
                </div>
              )
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                  Qusin AI đang phản hồi...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {outOfChatTurns && (
            <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                Bạn đã hết lượt Chat Qusin AI hôm nay ({aiQuota.chatUsed}/
                {aiQuota.chatLimit}). Làm nhiệm vụ hằng ngày để nhận thêm lượt ngay!
              </span>
              <button
                type="button"
                onClick={onGoToMissions}
                className="font-bold text-sky-700 underline hover:no-underline dark:text-sky-400 cursor-pointer whitespace-nowrap"
              >
                Mở tab Nhiệm vụ →
              </button>
            </div>
          )}

          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4"
          >
            <button
              type="button"
              disabled={outOfChatTurns}
              onClick={toggleVoiceInput}
              title={
                speechSupported
                  ? listening
                    ? 'Dừng ghi âm'
                    : 'Nói bằng tiếng Anh'
                  : 'Trình duyệt không hỗ trợ Web Speech'
              }
              aria-label="Nhập bằng giọng nói"
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
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
              disabled={outOfChatTurns}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                outOfChatTurns
                  ? 'Đã hết lượt chat hôm nay — vào Nhiệm vụ để nhận thêm lượt'
                  : listening
                    ? 'Đang nghe tiếng Anh...'
                    : 'Nhập câu trả lời bằng tiếng Anh (hoặc hỏi Qusin AI)...'
              }
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            <button
              type="submit"
              disabled={loading || outOfChatTurns || !inputText.trim()}
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
