'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';
import { PracticeCompletionMeta } from './MatchMode';

interface AiSpeakModeProps {
  cards: Flashcard[];
  autoSpeak?: boolean;
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
}

type SpeakTaskType = 'read_example' | 'free_sentence' | 'read_word';

interface SpeechEvalFeedback {
  score: number;
  passed: boolean;
  pronunciationNote: string;
  usageFeedback: string;
  betterSentence: string;
  betterSentenceVi: string;
}

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
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRec(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function AiSpeakMode({
  cards,
  autoSpeak = false,
  onComplete,
}: AiSpeakModeProps) {
  const [index, setIndex] = useState(0);
  const [taskType, setTaskType] = useState<SpeakTaskType>('read_example');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SpeechEvalFeedback | null>(null);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [speechSupported] = useState(() => getSpeechRec() !== null);

  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const currentCard = cards[index];

  useEffect(() => {
    if (autoSpeak && currentCard) {
      speakEnglish(currentCard.term);
    }
  }, [autoSpeak, currentCard]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // Ignore cleanup
      }
    };
  }, []);

  if (!currentCard) return null;

  function stopListening() {
    try {
      recRef.current?.stop();
    } catch {
      // Ignore
    }
    setListening(false);
  }

  function handleToggleMic() {
    if (listening) {
      stopListening();
      return;
    }

    const SpeechRec = getSpeechRec();
    if (!SpeechRec) {
      setError(
        'Trình duyệt không hỗ trợ ghi âm tự động. Hãy bật micro trên bàn phím hoặc nhập câu bạn nói vào ô bên dưới để AI chấm.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onresult = (ev) => {
        let joined = '';
        for (let i = 0; i < ev.results.length; i++) {
          joined += ev.results[i][0]?.transcript || '';
        }
        setTranscript(joined.trim());
      };

      rec.onerror = () => {
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recRef.current = rec;
      setError(null);
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError('Không thể truy cập micro. Vui lòng cấp quyền micro cho trình duyệt.');
    }
  }

  async function handleEvaluate() {
    if (!transcript.trim() || evaluating) return;
    stopListening();
    setError(null);
    setEvaluating(true);

    try {
      const res = await fetch('/api/ai/evaluate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: currentCard.term,
          phonetic: currentCard.phonetic,
          partOfSpeech: currentCard.partOfSpeech,
          meaning: currentCard.meaning,
          example: currentCard.example,
          transcript: transcript.trim(),
          taskType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể chấm điểm lúc này.');
        return;
      }

      setFeedback(data as SpeechEvalFeedback);
    } catch {
      setError('Mất kết nối tới máy chủ chấm điểm.');
    } finally {
      setEvaluating(false);
    }
  }

  function handleRetryCard() {
    setTranscript('');
    setFeedback(null);
    setError(null);
  }

  function handleNextCard(passedOverride?: boolean) {
    stopListening();
    const isPassed =
      passedOverride !== undefined
        ? passedOverride
        : Boolean(feedback?.passed);
    const cardScore = feedback ? feedback.score : isPassed ? 80 : 0;

    const nextResults: PracticeResultItem[] = [
      ...results,
      {
        cardId: currentCard.id,
        term: currentCard.term,
        meaning: currentCard.meaning,
        isCorrect: isPassed,
      },
    ];
    const nextScores = [...scores, cardScore];

    if (index + 1 >= cards.length) {
      const avgScore =
        nextScores.length > 0
          ? Math.round(
              nextScores.reduce((a, b) => a + b, 0) / nextScores.length
            )
          : 0;
      const totalPoints = nextScores.reduce((a, b) => a + b, 0) + avgScore;
      onComplete(nextResults, {
        score: totalPoints,
        leaderboardMode: 'speak',
      });
      return;
    }

    setResults(nextResults);
    setScores(nextScores);
    setIndex((i) => i + 1);
    setTranscript('');
    setFeedback(null);
    setError(null);
  }

  const expectedReadText =
    taskType === 'read_word'
      ? currentCard.term
      : currentCard.example || currentCard.term;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress & Task Switcher */}
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono-tabular font-semibold">
            Thẻ {index + 1}/{cards.length}
          </span>
          {scores.length > 0 && (
            <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400">
              TB:{' '}
              {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}đ
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Kiểu luyện nói"
          className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900"
        >
          {(
            [
              { id: 'read_example', label: 'Đọc câu mẫu' },
              { id: 'free_sentence', label: 'Đặt câu nói' },
              { id: 'read_word', label: 'Đọc từ đơn' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setTaskType(mode.id);
                setFeedback(null);
                setError(null);
              }}
              className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                taskType === mode.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-200 dark:bg-sky-500"
          style={{ width: `${((index + 1) / Math.max(1, cards.length)) * 100}%` }}
        />
      </div>

      {/* Main Prompt Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                {currentCard.term}
              </h2>
              {currentCard.phonetic && (
                <span className="font-mono-tabular text-sm text-slate-500 dark:text-slate-400">
                  {currentCard.phonetic}
                </span>
              )}
              {currentCard.partOfSpeech && (
                <span className="text-xs italic text-slate-500 dark:text-slate-400">
                  ({currentCard.partOfSpeech})
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentCard.meaning}
            </p>
          </div>

          <button
            type="button"
            onClick={() => speakEnglish(expectedReadText)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Nghe mẫu</span>
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
          {taskType === 'free_sentence' ? (
            <p className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">
                Nhiệm vụ:
              </strong>{' '}
              Tự nghĩ và nói một câu tiếng Anh có chứa từ{' '}
              <span className="font-semibold text-sky-700 dark:text-sky-400">
                “{currentCard.term}”
              </span>
              .
            </p>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">
                Hãy đọc to câu/từ sau:
              </strong>{' '}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                “{expectedReadText}”
              </span>
            </p>
          )}
        </div>

        {/* Microphone & Transcript Input */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                listening
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
              }`}
            >
              {listening ? (
                <>
                  <MicOff className="h-4 w-4" aria-hidden="true" />
                  <span>Đang nghe... (Nhấn để dừng)</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {speechSupported ? 'Bấm để nói' : 'Ghi âm (Nếu hỗ trợ)'}
                  </span>
                </>
              )}
            </button>

            <span className="text-xs text-slate-500 dark:text-slate-400">
              {listening
                ? 'Hãy đọc rõ bằng tiếng Anh...'
                : 'Hoặc chỉnh sửa/nhập nội dung bạn vừa nói bên dưới'}
            </span>
          </div>

          <textarea
            rows={2}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Nội dung giọng nói của bạn sẽ hiển thị tại đây..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!feedback && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleNextCard(false)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              >
                Bỏ qua thẻ này
              </button>

              <button
                type="button"
                disabled={evaluating || !transcript.trim()}
                onClick={handleEvaluate}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{evaluating ? 'AI đang chấm...' : 'Chấm điểm bằng AI'}</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Evaluation Feedback Card */}
        {feedback && (
          <div
            className={`mt-5 rounded-xl border p-4 ${
              feedback.passed
                ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {feedback.passed ? (
                  <CheckCircle2
                    className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle
                    className="h-5 w-5 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                )}
                <span className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {feedback.passed ? 'Phát âm & dùng từ đạt!' : 'Cần luyện thêm'}
                </span>
              </div>

              <span className="font-mono-tabular rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100">
                {feedback.score}/100 điểm
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <p>
                <strong>Phát âm:</strong> {feedback.pronunciationNote}
              </p>
              <p>
                <strong>Ngữ cảnh & ngữ pháp:</strong> {feedback.usageFeedback}
              </p>
            </div>

            {feedback.betterSentence && (
              <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Câu gợi ý tự nhiên: “{feedback.betterSentence}”
                  </div>
                  {feedback.betterSentenceVi && (
                    <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                      {feedback.betterSentenceVi}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => speakEnglish(feedback.betterSentence)}
                  aria-label="Nghe câu gợi ý"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:text-sky-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleRetryCard}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Thử nói lại</span>
              </button>
              <button
                type="button"
                onClick={() => handleNextCard()}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                <span>
                  {index + 1 >= cards.length ? 'Hoàn thành phiên' : 'Thẻ tiếp theo'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
