'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  RotateCcw,
  Volume2,
  XCircle,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';

interface TestModeProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  onComplete: (results: PracticeResultItem[]) => void;
}

type QuestionKind = 'mc' | 'tf' | 'written';

interface TestQuestion {
  id: string;
  card: Flashcard;
  kind: QuestionKind;
  prompt: string;
  shownMeaning?: string; // For T/F
  isTrueStatement?: boolean;
  options?: Array<{ id: string; label: string }>;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function TestMode({ cards, allPoolCards, onComplete }: TestModeProps) {
  const [phase, setPhase] = useState<'setup' | 'exam' | 'graded'>('setup');
  const [questionCount, setQuestionCount] = useState<number>(() =>
    Math.min(10, cards.length)
  );
  const [enabledKinds, setEnabledKinds] = useState<Record<QuestionKind, boolean>>({
    mc: true,
    tf: true,
    written: true,
  });
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0); // 0 = unlimited
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function toggleKind(kind: QuestionKind) {
    setEnabledKinds((prev) => {
      const next = { ...prev, [kind]: !prev[kind] };
      if (!next.mc && !next.tf && !next.written) return prev;
      return next;
    });
  }

  function startTest() {
    const activeKinds = (Object.keys(enabledKinds) as QuestionKind[]).filter(
      (k) => enabledKinds[k]
    );
    const chosenCards = shuffle(cards).slice(
      0,
      Math.max(1, Math.min(questionCount, cards.length))
    );
    const pool = allPoolCards.length >= 4 ? allPoolCards : cards;

    const generated: TestQuestion[] = chosenCards.map((card, idx) => {
      const kind = activeKinds[idx % activeKinds.length];
      if (kind === 'mc') {
        const distractors = shuffle(pool.filter((c) => c.id !== card.id)).slice(
          0,
          3
        );
        const options = shuffle([card, ...distractors]).map((c) => ({
          id: c.id,
          label: c.meaning,
        }));
        return {
          id: `q_${idx}_${card.id}`,
          card,
          kind: 'mc',
          prompt: card.term,
          options,
        };
      }
      if (kind === 'tf') {
        const otherCards = pool.filter((c) => c.id !== card.id);
        const makeTrue = otherCards.length === 0 || Math.random() >= 0.45;
        const fakeCard =
          otherCards[Math.floor(Math.random() * otherCards.length)] || card;
        return {
          id: `q_${idx}_${card.id}`,
          card,
          kind: 'tf',
          prompt: card.term,
          shownMeaning: makeTrue ? card.meaning : fakeCard.meaning,
          isTrueStatement: makeTrue,
        };
      }
      return {
        id: `q_${idx}_${card.id}`,
        card,
        kind: 'written',
        prompt: card.meaning,
      };
    });

    setQuestions(generated);
    setAnswers({});
    setSecondsLeft(timeLimitMinutes > 0 ? timeLimitMinutes * 60 : 0);
    setPhase('exam');
  }

  function evaluateQuestion(q: TestQuestion): boolean {
    const userAns = answers[q.id] || '';
    if (q.kind === 'mc') return userAns === q.card.id;
    if (q.kind === 'tf') {
      return userAns === (q.isTrueStatement ? 'true' : 'false');
    }
    return normalize(userAns) === normalize(q.card.term);
  }

  function submitTest() {
    if (phase !== 'exam') return;
    setPhase('graded');
    const results: PracticeResultItem[] = questions.map((q) => ({
      cardId: q.card.id,
      term: q.card.term,
      meaning: q.card.meaning,
      isCorrect: evaluateQuestion(q),
    }));
    onComplete(results);
  }

  // Countdown timer for OpenQuiz-style timed tests
  useEffect(() => {
    if (phase !== 'exam' || timeLimitMinutes <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, timeLimitMinutes]);

  // Auto-submit when countdown hits 0
  useEffect(() => {
    if (phase === 'exam' && timeLimitMinutes > 0 && secondsLeft === 0) {
      Promise.resolve().then(() => submitTest());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase, timeLimitMinutes]);

  if (phase === 'setup') {
    const countOptions = [5, 10, 15, cards.length].filter(
      (n, i, arr) => n <= cards.length && arr.indexOf(n) === i
    );

    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck
            className="h-5 w-5 text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Thiết lập bài Kiểm tra tổng hợp
          </h2>
        </div>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Tùy chỉnh số câu hỏi, dạng bài và thời gian làm bài giống Quizlet & OpenQuiz.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Số lượng câu hỏi (tối đa {cards.length})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {countOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuestionCount(n)}
                  className={`min-h-[40px] rounded-lg border px-4 py-1.5 font-mono-tabular text-xs font-semibold transition-colors cursor-pointer ${
                    questionCount === n
                      ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {n === cards.length ? `Tất cả (${n})` : `${n} câu`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Dạng câu hỏi trong đề
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { id: 'mc', label: 'Trắc nghiệm' },
                  { id: 'tf', label: 'Đúng / Sai' },
                  { id: 'written', label: 'Điền tự luận' },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => toggleKind(k.id)}
                  aria-pressed={enabledKinds[k.id]}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    enabledKinds[k.id]
                      ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                      : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Giới hạn thời gian (OpenQuiz Timer)
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { mins: 0, label: 'Không giới hạn' },
                { mins: 2, label: '2 phút' },
                { mins: 5, label: '5 phút' },
              ].map((t) => (
                <button
                  key={t.mins}
                  type="button"
                  onClick={() => setTimeLimitMinutes(t.mins)}
                  className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    timeLimitMinutes === t.mins
                      ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={startTest}
            className="mt-2 min-h-[48px] w-full rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
          >
            Bắt đầu làm bài kiểm tra
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = questions.filter((q) => Boolean(answers[q.id]?.trim())).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Sticky Exam Status Strip */}
      <div className="sticky top-[53px] md:top-[65px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 font-mono-tabular">
          Đã trả lời: {answeredCount}/{questions.length} câu
        </div>

        <div className="flex items-center gap-3">
          {timeLimitMinutes > 0 && phase === 'exam' && (
            <div
              className={`inline-flex items-center gap-1.5 font-mono-tabular text-xs font-semibold ${
                secondsLeft <= 20
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Còn {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </span>
            </div>
          )}

          {phase === 'exam' ? (
            <button
              type="button"
              onClick={submitTest}
              className="min-h-[40px] rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
            >
              Nộp bài kiểm tra
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tạo đề mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Question Cards */}
      {questions.map((q, idx) => {
        const isGraded = phase === 'graded';
        const isCorrect = isGraded ? evaluateQuestion(q) : false;

        return (
          <div
            key={q.id}
            className={`rounded-2xl border bg-white p-5 dark:bg-slate-900 sm:p-6 ${
              isGraded
                ? isCorrect
                  ? 'border-emerald-300 dark:border-emerald-800'
                  : 'border-red-300 dark:border-red-800'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Câu {idx + 1} ·{' '}
                  {q.kind === 'mc'
                    ? 'Trắc nghiệm'
                    : q.kind === 'tf'
                      ? 'Đúng / Sai'
                      : 'Điền từ tự luận'}
                </div>
                <h3 className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-slate-100 sm:text-xl">
                  {q.prompt}
                </h3>
              </div>

              {q.kind !== 'written' && (
                <button
                  type="button"
                  onClick={() => speakEnglish(q.card.term)}
                  aria-label={`Phát âm ${q.card.term}`}
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-sky-600 dark:border-slate-700 dark:text-slate-400 cursor-pointer shrink-0"
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {q.kind === 'mc' && q.options && (
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {q.options.map((opt) => {
                  const picked = answers[q.id] === opt.id;
                  const rightOpt = opt.id === q.card.id;
                  let cls =
                    'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200';
                  if (isGraded) {
                    if (rightOpt) {
                      cls =
                        'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200';
                    } else if (picked) {
                      cls =
                        'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200';
                    }
                  } else if (picked) {
                    cls =
                      'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isGraded}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                      }
                      className={`min-h-[48px] rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${cls}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.kind === 'tf' && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  Nghĩa gợi ý: <strong>{q.shownMeaning}</strong>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 'true', label: 'Đúng' },
                    { val: 'false', label: 'Sai' },
                  ].map((btn) => {
                    const picked = answers[q.id] === btn.val;
                    const rightVal = q.isTrueStatement ? 'true' : 'false';
                    let cls =
                      'border-slate-200 bg-white text-slate-800 hover:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200';
                    if (isGraded) {
                      if (btn.val === rightVal) {
                        cls =
                          'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200';
                      } else if (picked) {
                        cls =
                          'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200';
                      }
                    } else if (picked) {
                      cls =
                        'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200';
                    }

                    return (
                      <button
                        key={btn.val}
                        type="button"
                        disabled={isGraded}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [q.id]: btn.val }))
                        }
                        className={`min-h-[48px] rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-default ${cls}`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {q.kind === 'written' && (
              <div className="mt-4">
                <input
                  type="text"
                  disabled={isGraded}
                  value={answers[q.id] || ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  placeholder="Nhập từ tiếng Anh..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono-tabular text-sm text-slate-900 focus:border-sky-600 focus:outline-none disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            )}

            {isGraded && (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
                {isCorrect ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>Chính xác</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    <span>
                      Đáp án đúng: {q.card.term} — {q.card.meaning}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {phase === 'exam' && (
        <div className="pt-2">
          <button
            type="button"
            onClick={submitTest}
            className="min-h-[48px] w-full rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 cursor-pointer"
          >
            Nộp bài & Chấm điểm ({answeredCount}/{questions.length} câu)
          </button>
        </div>
      )}
    </div>
  );
}
