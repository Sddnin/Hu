'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Rocket,
  Sparkles,
  Trophy,
  Volume2,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';
import { PracticeCompletionMeta } from './MatchMode';

interface MeteorShooterGameProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  bestScore?: number;
  autoSpeak?: boolean;
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
}

interface MeteorOrb {
  uid: string;
  cardId: string;
  label: string;
  isCorrect: boolean;
  xPct: number;
  yPct: number;
  speed: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const METEOR_LANES = [18, 42, 62, 82];
const BOTTOM_LIMIT_PCT = 86;
const TICK_MS = 55;

function buildWaveOrbs(card: Flashcard, pool: Flashcard[]): MeteorOrb[] {
  const distractors = shuffleArray(
    pool.filter((c) => c.id !== card.id)
  ).slice(0, 3);
  const candidates = shuffleArray([card, ...distractors]);
  const laneOrder = shuffleArray(METEOR_LANES);
  const startOffsets = shuffleArray([6, 15, 24, 33]);

  return candidates.map((c, idx) => ({
    uid: `orb_${card.id}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    cardId: c.id,
    label: c.meaning,
    isCorrect: c.id === card.id,
    xPct: laneOrder[idx % laneOrder.length],
    yPct: startOffsets[idx % startOffsets.length],
    speed: 0.22 + idx * 0.03,
  }));
}

function safeSpeak(text: string) {
  try {
    speakEnglish(text);
  } catch {
    // Lỗi phát âm không được phép làm treo game
  }
}

export function MeteorShooterGame({
  cards,
  allPoolCards,
  bestScore = 0,
  autoSpeak = false,
  onComplete,
}: MeteorShooterGameProps) {
  const pool = useMemo(
    () => (allPoolCards.length >= 4 ? allPoolCards : cards),
    [allPoolCards, cards]
  );

  const [waveCount, setWaveCount] = useState(0);
  const [correctHits, setCorrectHits] = useState(0);
  const [renderOrbs, setRenderOrbs] = useState<MeteorOrb[]>(() =>
    cards[0] ? buildWaveOrbs(cards[0], pool) : []
  );
  const [wrongIds, setWrongIds] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [laserTarget, setLaserTarget] = useState<{
    xPct: number;
    yPct: number;
    hitCorrect: boolean;
  } | null>(null);
  const [waveLocked, setWaveLocked] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);

  const currentCard = cards[waveCount % Math.max(1, cards.length)];

  // Vị trí orb cập nhật trực tiếp qua DOM (imperative style.top),
  // không setState mỗi nhịp và không để JSX ghi đè style.top khi React re-render.
  const orbsRef = useRef<MeteorOrb[]>(renderOrbs);
  const orbElsRef = useRef(new Map<string, HTMLButtonElement>());
  const wrongIdsRef = useRef<Record<string, boolean>>({});
  const waveCountRef = useRef(0);
  const cardRef = useRef<Flashcard | undefined>(currentCard);
  const waveLockedRef = useRef(false);
  const completedRef = useRef(false);
  const hadMissInWaveRef = useRef(false);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const resultsRef = useRef<PracticeResultItem[]>([]);
  const waveTimerRef = useRef<number | null>(null);
  const laserTimerRef = useRef<number | null>(null);

  useEffect(() => {
    cardRef.current = currentCard;
  }, [currentCard]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);
  useEffect(() => {
    maxStreakRef.current = maxStreak;
  }, [maxStreak]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    return () => {
      completedRef.current = true;
      if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
      if (laserTimerRef.current !== null) window.clearTimeout(laserTimerRef.current);
    };
  }, []);

  const finishGame = useCallback(
    (finalResults: PracticeResultItem[], finalScore: number, bestStreak: number) => {
      if (completedRef.current) return;
      completedRef.current = true;
      if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
      if (laserTimerRef.current !== null) window.clearTimeout(laserTimerRef.current);
      const normalized =
        finalResults.length > 0
          ? finalResults
          : cards.slice(0, 1).map((c) => ({
              cardId: c.id,
              term: c.term,
              meaning: c.meaning,
              isCorrect: false,
            }));
      onComplete(normalized, {
        score: finalScore,
        leaderboardMode: 'meteor',
        maxStreak: bestStreak,
      });
    },
    [cards, onComplete]
  );

  const spawnNextWave = useCallback(
    (nextWaveIndex: number) => {
      if (completedRef.current || cards.length === 0) return;
      const nextCard = cards[nextWaveIndex % cards.length];
      const nextOrbs = buildWaveOrbs(nextCard, pool);
      waveCountRef.current = nextWaveIndex;
      orbsRef.current = nextOrbs;
      orbElsRef.current.clear();
      wrongIdsRef.current = {};
      setWaveCount(nextWaveIndex);
      setRenderOrbs(nextOrbs);
      setWrongIds({});
      setLaserTarget(null);
      setStatusHint(null);
      hadMissInWaveRef.current = false;
      waveLockedRef.current = false;
      setWaveLocked(false);
      if (autoSpeak && nextCard) {
        safeSpeak(nextCard.term);
      }
    },
    [cards, pool, autoSpeak]
  );

  // Vòng lặp rơi: requestAnimationFrame + ghi trực tiếp style.top
  useEffect(() => {
    if (!currentCard || completedRef.current) return;
    let raf = 0;
    let last = performance.now();
    let carried = 0;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      carried += now - last;
      last = now;
      if (carried < TICK_MS) return;
      carried = 0;
      if (waveLockedRef.current || completedRef.current) return;

      let hitBottom = false;
      for (const orb of orbsRef.current) {
        orb.yPct += orb.speed;
        const el = orbElsRef.current.get(orb.uid);
        if (el) el.style.top = `${orb.yPct}%`;
        if (!wrongIdsRef.current[orb.uid] && orb.yPct >= BOTTOM_LIMIT_PCT) {
          hitBottom = true;
        }
      }

      if (hitBottom) {
        waveLockedRef.current = true;
        setWaveLocked(true);
        setStreak(0);
        streakRef.current = 0;
        setStatusHint('Thiên thạch vừa bay qua — nạp đợt tiếp theo!');
        const card = cardRef.current;
        if (card) {
          const updatedResults: PracticeResultItem[] = [
            ...resultsRef.current,
            {
              cardId: card.id,
              term: card.term,
              meaning: card.meaning,
              isCorrect: false,
            },
          ];
          resultsRef.current = updatedResults;
          setResults(updatedResults);
        }
        if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
        waveTimerRef.current = window.setTimeout(() => {
          spawnNextWave(waveCountRef.current + 1);
        }, 700);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [currentCard, spawnNextWave]);

  const handleShootOrb = useCallback(
    (orb: MeteorOrb) => {
      if (
        waveLockedRef.current ||
        wrongIdsRef.current[orb.uid] ||
        completedRef.current ||
        !cardRef.current
      ) {
        return;
      }

      const liveOrb = orbsRef.current.find((o) => o.uid === orb.uid) ?? orb;

      if (!liveOrb.isCorrect) {
        hadMissInWaveRef.current = true;
        setStreak(0);
        streakRef.current = 0;
        setStatusHint('Chưa đúng — bắn thiên thạch khác!');
        setLaserTarget({
          xPct: liveOrb.xPct,
          yPct: liveOrb.yPct,
          hitCorrect: false,
        });
        const nextWrong = { ...wrongIdsRef.current, [liveOrb.uid]: true };
        wrongIdsRef.current = nextWrong;
        setWrongIds(nextWrong);
        if (laserTimerRef.current !== null) window.clearTimeout(laserTimerRef.current);
        laserTimerRef.current = window.setTimeout(() => {
          setLaserTarget((cur) => (cur && !cur.hitCorrect ? null : cur));
        }, 280);
        return;
      }

      // Bắn trúng!
      waveLockedRef.current = true;
      setWaveLocked(true);
      setStatusHint(null);
      setLaserTarget({
        xPct: liveOrb.xPct,
        yPct: liveOrb.yPct,
        hitCorrect: true,
      });

      const card = cardRef.current;
      const cleanHit = !hadMissInWaveRef.current;
      const nextStreak = cleanHit ? streakRef.current + 1 : 1;
      const nextMaxStreak = Math.max(maxStreakRef.current, nextStreak);
      const earned = (cleanHit ? 100 : 50) + Math.min(nextStreak - 1, 9) * 20;
      const nextScore = scoreRef.current + earned;

      streakRef.current = nextStreak;
      maxStreakRef.current = nextMaxStreak;
      scoreRef.current = nextScore;

      const nextResults: PracticeResultItem[] = card
        ? [
            ...resultsRef.current,
            {
              cardId: card.id,
              term: card.term,
              meaning: card.meaning,
              isCorrect: cleanHit,
            },
          ]
        : resultsRef.current;
      resultsRef.current = nextResults;

      setStreak(nextStreak);
      setMaxStreak(nextMaxStreak);
      setScore(nextScore);
      setCorrectHits((h) => h + 1);
      setResults(nextResults);

      if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
      waveTimerRef.current = window.setTimeout(() => {
        spawnNextWave(waveCountRef.current + 1);
      }, 420);
    },
    [spawnNextWave]
  );

  if (!currentCard) return null;

  const displayedBest = Math.max(bestScore, score);
  const deckCyclePos = (waveCount % Math.max(1, cards.length)) + 1;
  const progressPct = Math.round((deckCyclePos / Math.max(1, cards.length)) * 100);
  const streakSegments = 10;
  const filledSegments = Math.min(streakSegments, streak);

  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-indigo-900/70 bg-[#090d2e] text-white shadow-xl">
      {/* Top Space HUD */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="font-mono-tabular text-base font-bold leading-none text-white">
              {score} điểm
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-sky-300">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              <span>Đã bắn: {correctHits} · Chơi tự do</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => safeSpeak(currentCard.term)}
            aria-label={`Phát âm ${currentCard.term}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-900/80 text-sky-300 hover:bg-indigo-800 cursor-pointer"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1 font-mono-tabular text-sm font-bold text-amber-400">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            <span>{displayedBest}</span>
          </div>
          <button
            type="button"
            onClick={() => finishGame(resultsRef.current, scoreRef.current, maxStreakRef.current)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-indigo-700/80 bg-indigo-900/70 px-2.5 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-800 cursor-pointer whitespace-nowrap"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kết thúc & Lưu</span>
          </button>
        </div>
      </div>

      {/* Blue Target Word Banner */}
      <div className="bg-[#232578] px-4 py-3 text-center">
        <div className="font-display text-2xl font-bold tracking-tight text-white">
          {currentCard.term}
        </div>
        {currentCard.phonetic && (
          <div className="mt-0.5 font-mono-tabular text-xs text-indigo-200">
            {currentCard.phonetic}
          </div>
        )}
      </div>
      <div className="h-1.5 w-full bg-indigo-950">
        <div
          className="h-full bg-sky-400 transition-all duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Space Arena Field */}
      <div className="relative h-[370px] sm:h-[420px] w-full select-none overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#1b1f5c_0%,#090d2e_75%)]">
        {statusHint && (
          <div className="pointer-events-none absolute top-2.5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-indigo-500/40 bg-indigo-950/85 px-3 py-1 text-[11px] font-semibold text-amber-300 whitespace-nowrap">
            {statusHint}
          </div>
        )}

        {/* Laser Beam */}
        {laserTarget && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <line
              x1="50"
              y1="91"
              x2={laserTarget.xPct}
              y2={laserTarget.yPct}
              stroke={laserTarget.hitCorrect ? '#34d399' : '#fb7185'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}

        {/* Falling Meteor Orbs */}
        {renderOrbs.map((orb) => {
          const isWrong = !!wrongIds[orb.uid];
          const isRevealedRight = waveLocked && orb.isCorrect;

          let orbStyle =
            'border-indigo-400/50 bg-[radial-gradient(circle_at_35%_30%,#5253ba_0%,#292a73_75%)] text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:scale-105 hover:border-sky-300 cursor-pointer';
          if (isRevealedRight) {
            orbStyle =
              'border-emerald-300 bg-[radial-gradient(circle_at_35%_30%,#34d399_0%,#059669_75%)] text-white shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105';
          } else if (isWrong) {
            orbStyle =
              'border-rose-400/60 bg-[radial-gradient(circle_at_35%_30%,#fb7185_0%,#881337_75%)] text-rose-100 opacity-45 scale-90 cursor-not-allowed';
          }

          return (
            <button
              key={orb.uid}
              ref={(el) => {
                if (el) {
                  const live = orbsRef.current.find((o) => o.uid === orb.uid);
                  el.style.top = `${live ? live.yPct : orb.yPct}%`;
                  orbElsRef.current.set(orb.uid, el);
                } else {
                  orbElsRef.current.delete(orb.uid);
                }
              }}
              type="button"
              disabled={waveLocked || isWrong}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShootOrb(orb);
              }}
              onClick={(e) => {
                if (e.detail === 0) {
                  handleShootOrb(orb);
                }
              }}
              style={{
                left: `${orb.xPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute z-10 touch-none select-none flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-2 p-2.5 text-center transition-transform duration-150 ${orbStyle}`}
            >
              <span className="pointer-events-none text-xs sm:text-sm font-bold leading-tight break-words line-clamp-3">
                {orb.label}
              </span>
            </button>
          );
        })}

        {/* Bottom Center Spaceship Cannon Turret */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-fuchsia-400 bg-fuchsia-600/80 shadow-[0_0_28px_rgba(217,70,239,0.75)]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-950/90 font-display text-sm font-bold text-amber-300">
              {currentCard.term.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Bottom Left Progress */}
        <div className="pointer-events-none absolute bottom-3 left-3 w-28 sm:w-36">
          <div className="flex items-center justify-between font-mono-tabular text-[11px] font-bold text-indigo-200">
            <span>Đợt {waveCount + 1}</span>
            <span>
              {deckCyclePos}/{cards.length}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-indigo-950/90">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Bottom Right Streak Meter */}
        <div className="pointer-events-none absolute bottom-3 right-3 text-right">
          <div className="text-[11px] font-semibold text-indigo-200">
            Streak {streak > 0 ? `×${streak}` : ''}
          </div>
          <div className="mt-1 flex items-center gap-0.5 rounded-md bg-indigo-950/90 p-1">
            {Array.from({ length: streakSegments }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2 rounded-[2px] transition-colors ${
                  i < filledSegments ? 'bg-fuchsia-400' : 'bg-indigo-900'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
