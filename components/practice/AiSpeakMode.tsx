'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Lock,
  LogIn,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Trash2,
  Volume2,
  XCircle,
} from 'lucide-react';
import { convertBlobToWav } from '@/lib/audio-wav';
import { speakEnglish } from '@/lib/speech';
import { AiQuotaSnapshot, AuthUser, Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';
import { PracticeCompletionMeta } from './MatchMode';

interface AiSpeakModeProps {
  user?: AuthUser | null;
  aiQuota?: AiQuotaSnapshot;
  cards: Flashcard[];
  autoSpeak?: boolean;
  onUpdateQuota?: (next: AiQuotaSnapshot | null | undefined) => void;
  onOpenAuth?: () => void;
  onGoToMissions?: () => void;
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
}

type SpeakTaskType = 'read_example' | 'free_sentence' | 'read_word';

interface SpeechEvalFeedback {
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

interface PronunciationTip {
  syllables: string;
  viApprox: string;
  keySounds: string;
  sentenceTip: string;
}

const MAX_RECORDING_SECONDS = 30;

function pickSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionForBlobType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function percentBarColor(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 65) return 'bg-sky-500';
  return 'bg-amber-500';
}

export function AiSpeakMode({
  user = null,
  aiQuota,
  cards,
  autoSpeak = false,
  onUpdateQuota,
  onOpenAuth,
  onGoToMissions,
  onComplete,
}: AiSpeakModeProps) {
  const [index, setIndex] = useState(0);
  const [taskType, setTaskType] = useState<SpeakTaskType>('read_example');

  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SpeechEvalFeedback | null>(null);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [scores, setScores] = useState<number[]>([]);

  const [tipsByCardId, setTipsByCardId] = useState<
    Record<string, PronunciationTip>
  >({});
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [showTipPanel, setShowTipPanel] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const previewUrlRef = useRef<string | null>(null);

  const currentCard = cards[index];

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAudioPreviewUrl(null);
  }, []);

  const stopRecording = useCallback(() => {
    clearTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        releaseStream();
      }
    } else {
      releaseStream();
    }
    setRecording(false);
  }, [clearTimer, releaseStream]);

  useEffect(() => {
    if (autoSpeak && currentCard) {
      speakEnglish(currentCard.term);
    }
  }, [autoSpeak, currentCard]);

  useEffect(() => {
    return () => {
      clearTimer();
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      releaseStream();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [clearTimer, releaseStream]);

  if (!currentCard) return null;

  const currentTip = tipsByCardId[currentCard.id] || null;
  const micSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  async function handleStartRecording() {
    if (recording) {
      stopRecording();
      return;
    }

    if (!micSupported) {
      setError(
        'Trình duyệt hiện tại không hỗ trợ ghi âm trực tiếp qua micro. Vui lòng dùng Chrome, Safari hoặc Edge phiên bản mới.'
      );
      return;
    }

    setError(null);
    setFeedback(null);
    revokePreviewUrl();
    setRecordedBlob(null);
    setRecordedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMime = pickSupportedRecorderMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recordStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        clearTimer();
        releaseStream();
        setRecording(false);
        setError('Quá trình ghi âm gặp sự cố. Vui lòng thử lại.');
      };

      recorder.onstop = () => {
        clearTimer();
        releaseStream();
        setRecording(false);

        const elapsedSec = Math.max(
          1,
          Math.round((Date.now() - recordStartedAtRef.current) / 1000)
        );
        const finalType =
          recorder.mimeType || preferredMime || 'audio/webm';
        const rawBlob = new Blob(chunksRef.current, { type: finalType });
        chunksRef.current = [];

        if (rawBlob.size < 300) {
          setError(
            'Chưa thu được âm thanh từ micro. Hãy bấm ghi âm và nói rõ ít nhất 1 giây.'
          );
          return;
        }

        void convertBlobToWav(rawBlob).then((finalBlob) => {
          const nextUrl = URL.createObjectURL(finalBlob);
          previewUrlRef.current = nextUrl;
          setRecordedBlob(finalBlob);
          setRecordedSeconds(elapsedSec);
          setAudioPreviewUrl(nextUrl);
        });
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);

      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - recordStartedAtRef.current) / 1000
        );
        setRecordingSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch {
      releaseStream();
      setRecording(false);
      setError(
        'Không thể truy cập micro. Vui lòng cấp quyền sử dụng micro trong cài đặt trình duyệt.'
      );
    }
  }

  function handleDiscardRecording() {
    stopRecording();
    revokePreviewUrl();
    setRecordedBlob(null);
    setRecordedSeconds(0);
    setRecordingSeconds(0);
    setFeedback(null);
    setError(null);
  }

  async function handleFetchPronunciationTip() {
    if (!currentCard) return;
    setShowTipPanel((prev) => {
      if (currentTip) return !prev;
      return true;
    });
    if (currentTip || tipLoading) return;

    setTipError(null);
    setTipLoading(true);
    try {
      const res = await fetch('/api/ai/pronunciation-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: currentCard.term,
          phonetic: currentCard.phonetic,
          partOfSpeech: currentCard.partOfSpeech,
          example: currentCard.example,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTipError(data.error || 'Không thể lấy gợi ý phát âm.');
        return;
      }
      setTipsByCardId((prev) => ({
        ...prev,
        [currentCard.id]: data as PronunciationTip,
      }));
    } catch {
      setTipError('Mất kết nối tới máy chủ gợi ý phát âm.');
    } finally {
      setTipLoading(false);
    }
  }

  async function handleEvaluateAudio() {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!recordedBlob || evaluating || recording) return;
    if (aiQuota && aiQuota.speakRemaining <= 0) {
      setError(
        'Bạn đã hết lượt Luyện nói AI hôm nay. Hãy hoàn thành Nhiệm vụ để nhận thêm lượt!'
      );
      return;
    }

    setError(null);
    setEvaluating(true);

    try {
      const mimeType = recordedBlob.type || 'audio/webm';
      const ext = extensionForBlobType(mimeType);
      const formData = new FormData();
      formData.append('audio', recordedBlob, `speech.${ext}`);
      formData.append('term', currentCard.term);
      formData.append('phonetic', currentCard.phonetic || '');
      formData.append('partOfSpeech', currentCard.partOfSpeech || '');
      formData.append('meaning', currentCard.meaning || '');
      formData.append('example', currentCard.example || '');
      formData.append('taskType', taskType);
      formData.append('durationSec', String(recordedSeconds || 1));

      const res = await fetch('/api/ai/evaluate-speech', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.quota) {
        onUpdateQuota?.(data.quota as AiQuotaSnapshot);
      }
      if (!res.ok) {
        setError(data.error || 'Không thể xử lý bản ghi âm lúc này.');
        return;
      }

      setFeedback(data as SpeechEvalFeedback);
    } catch {
      setError('Mất kết nối khi gửi bản ghi âm tới máy chủ AI.');
    } finally {
      setEvaluating(false);
    }
  }

  function handleNextCard(passedOverride?: boolean) {
    stopRecording();
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
      revokePreviewUrl();
      onComplete(nextResults, {
        score: totalPoints,
        leaderboardMode: 'speak',
      });
      return;
    }

    setResults(nextResults);
    setScores(nextScores);
    setIndex((i) => i + 1);
    revokePreviewUrl();
    setRecordedBlob(null);
    setRecordedSeconds(0);
    setRecordingSeconds(0);
    setFeedback(null);
    setError(null);
    setTipError(null);
    setShowTipPanel(false);
  }

  const expectedReadText =
    taskType === 'read_word'
      ? currentCard.term
      : currentCard.example || currentCard.term;

  if (!user) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Đăng nhập để ghi âm luyện nói & chấm phát âm AI
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Mỗi tài khoản nhận sẵn <strong>20 lượt ghi âm luyện nói AI</strong> mỗi ngày và có thể hoàn thành 3 nhiệm vụ hằng ngày để nhận thêm lượt.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Đăng nhập ngay</span>
            </button>
          )}
          {onGoToMissions && (
            <button
              type="button"
              onClick={onGoToMissions}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <Target className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Xem Nhiệm vụ</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const outOfSpeakTurns = Boolean(aiQuota && aiQuota.speakRemaining <= 0);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress & Task Switcher */}
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono-tabular font-semibold">
            Thẻ {index + 1}/{cards.length}
          </span>
          {scores.length > 0 && (
            <span className="font-mono-tabular font-semibold text-sky-600 dark:text-sky-400">
              TB:{' '}
              {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%
            </span>
          )}
          {aiQuota && (
            <span
              className={`font-mono-tabular rounded-md px-2 py-0.5 text-[11px] font-bold ${
                outOfSpeakTurns
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              Lượt nói: {aiQuota.speakRemaining}/{aiQuota.speakLimit}
            </span>
          )}
          {onGoToMissions && (
            <button
              type="button"
              onClick={onGoToMissions}
              className="text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer"
            >
              + Thêm lượt
            </button>
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
              disabled={recording || evaluating}
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

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => speakEnglish(expectedReadText, 0.94)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              <span>Nghe mẫu</span>
            </button>

            <button
              type="button"
              onClick={() => speakEnglish(expectedReadText, 0.65)}
              title="Phát âm chậm 0.65x để nghe rõ từng âm tiết"
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <span>0.65x Chậm</span>
            </button>

            <button
              type="button"
              onClick={() => void handleFetchPronunciationTip()}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                showTipPanel
                  ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-500 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Gợi ý phát âm</span>
            </button>
          </div>
        </div>

        {/* Pronunciation Tip Panel */}
        {showTipPanel && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs dark:border-sky-900/60 dark:bg-sky-950/30">
            {tipLoading ? (
              <p className="text-sky-700 dark:text-sky-300">
                Đang tạo hướng dẫn phát âm cho từ “{currentCard.term}”...
              </p>
            ) : tipError ? (
              <p className="text-red-700 dark:text-red-300">{tipError}</p>
            ) : currentTip ? (
              <div className="space-y-1.5 text-slate-700 dark:text-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sky-800 dark:text-sky-300">
                    Tách âm & trọng âm:
                  </span>
                  <span className="font-mono-tabular rounded bg-white px-2 py-0.5 font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                    {currentTip.syllables}
                  </span>
                  {currentTip.viApprox && (
                    <span className="text-slate-600 dark:text-slate-300">
                      (đọc gần đúng: <strong>{currentTip.viApprox}</strong>)
                    </span>
                  )}
                </div>
                <p>
                  <strong className="text-slate-900 dark:text-slate-100">
                    Cách đặt khẩu hình:
                  </strong>{' '}
                  {currentTip.keySounds}
                </p>
                {currentTip.sentenceTip && (
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">
                      Ngữ điệu câu:
                    </strong>{' '}
                    {currentTip.sentenceTip}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Speaking Prompt */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
          {taskType === 'free_sentence' ? (
            <p className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">
                Nhiệm vụ:
              </strong>{' '}
              Bấm ghi âm và nói một câu tiếng Anh có chứa từ{' '}
              <span className="font-semibold text-sky-700 dark:text-sky-400">
                “{currentCard.term}”
              </span>{' '}
              để gửi bản ghi âm cho AI nghe và chấm điểm.
            </p>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">
                Bấm ghi âm và đọc to câu/từ sau:
              </strong>{' '}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                “{expectedReadText}”
              </span>
            </p>
          )}
        </div>

        {/* Real Audio Recorder Section */}
        <div className="mt-5 space-y-3">
          {!recordedBlob ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <button
                type="button"
                disabled={evaluating || outOfSpeakTurns}
                onClick={() => void handleStartRecording()}
                className={`inline-flex min-h-[50px] items-center justify-center gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  recording
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
                }`}
              >
                {recording ? (
                  <>
                    <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                    <span>Dừng ghi âm</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    <span>Bấm để ghi âm giọng nói</span>
                  </>
                )}
              </button>

              {recording ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600 dark:bg-red-400" />
                  <span className="font-mono-tabular">
                    Đang thu âm... {formatDuration(recordingSeconds)} /{' '}
                    {formatDuration(MAX_RECORDING_SECONDS)}
                  </span>
                </div>
              ) : (
                <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                  Âm thanh giọng nói thực tế của bạn sẽ được ghi lại (tối đa 30 giây) và gửi thẳng cho AI nghe & chấm phát âm.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Mic className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    Bản ghi âm của bạn ({formatDuration(recordedSeconds)})
                  </span>
                </div>
                <button
                  type="button"
                  disabled={evaluating}
                  onClick={handleDiscardRecording}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ghi âm lại</span>
                </button>
              </div>

              {audioPreviewUrl && (
                <audio
                  controls
                  src={audioPreviewUrl}
                  className="mt-3 h-10 w-full"
                />
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {outOfSpeakTurns && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                Bạn đã dùng hết lượt Luyện nói AI hôm nay. Làm Nhiệm vụ để nhận thêm lượt!
              </span>
              {onGoToMissions && (
                <button
                  type="button"
                  onClick={onGoToMissions}
                  className="font-bold text-sky-700 underline dark:text-sky-400 cursor-pointer whitespace-nowrap"
                >
                  Nhận thêm lượt →
                </button>
              )}
            </div>
          )}

          {!feedback && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={recording || evaluating}
                onClick={() => handleNextCard(false)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Bỏ qua thẻ này
              </button>

              <button
                type="button"
                disabled={
                  evaluating || recording || outOfSpeakTurns || !recordedBlob
                }
                onClick={() => void handleEvaluateAudio()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>
                  {evaluating
                    ? 'AI đang nghe & chấm phát âm...'
                    : 'Gửi bản ghi âm cho AI chấm'}
                </span>
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
                  {feedback.passed
                    ? 'Phát âm & dùng từ đạt!'
                    : 'Cần luyện phát âm thêm'}
                </span>
              </div>

              <span className="font-mono-tabular rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100">
                {feedback.score}/100 điểm
              </span>
            </div>

            {feedback.heardTranscript && (
              <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <strong className="text-slate-900 dark:text-slate-100">
                  AI nghe được từ bản ghi âm:
                </strong>{' '}
                “{feedback.heardTranscript}”
              </div>
            )}

            {/* Target Word % and Overall Pronunciation % Meters */}
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400 truncate">
                    Phát âm từ “{currentCard.term}”
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                    {feedback.targetWordPercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${percentBarColor(
                      feedback.targetWordPercent
                    )}`}
                    style={{ width: `${feedback.targetWordPercent}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Chuẩn phát âm & ngữ điệu
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                    {feedback.pronunciationPercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${percentBarColor(
                      feedback.pronunciationPercent
                    )}`}
                    style={{ width: `${feedback.pronunciationPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {feedback.pronunciationGuide && (
                <p className="rounded-lg border border-sky-200/70 bg-white/80 px-2.5 py-2 dark:border-sky-900/50 dark:bg-slate-900/70">
                  <strong className="text-sky-700 dark:text-sky-400">
                    Hướng dẫn phát âm chuẩn:
                  </strong>{' '}
                  {feedback.pronunciationGuide}
                </p>
              )}
              <p>
                <strong>Nhận xét phát âm:</strong> {feedback.pronunciationNote}
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
                onClick={handleDiscardRecording}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ghi âm lại</span>
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
