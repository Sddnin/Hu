'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Heart,
  Rocket,
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
  xPct: number; // 14..86
  yPct: number; // 4..84
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

function buildWaveOrbs(card: Flashcard, pool: Flashcard[]): MeteorOrb[] {
  const distractors = shuffleArray(
    pool.filter((c) => c.id !== card.id)
  ).slice(0, 3);
  const candidates = shuffleArray([card, ...distractors]);
  const laneOrder = shuffleArray(METEOR_LANES);
  const startOffsets = shuffleArray([6, 16, 26, 36]);

  return candidates.map((c, idx) => ({
    uid: `orb_${card.id}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    cardId: c.id,
    label: c.meaning,
    isCorrect: c.id === card.id,
    xPct: laneOrder[idx % laneOrder.length],
    yPct: startOffsets[idx % startOffsets.length],
    speed: 0.24 + idx * 0.03,
  }));
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

  const [waveIdx, setWaveIdx] = useState(0);
  const [orbs, setOrbs] = useState<MeteorOrb[]>(() =>
    cards[0] ? buildWaveOrbs(cards[0], pool) : []
  );
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lives, setLives] = useState(3);
  const [results, setResults] = useState<PracticeResultItem[]>([]);
  const [laserTarget, setLaserTarget] = useState<{
    xPct: number;
    yPct: number;
    hitCorrect: boolean;
  } | null>(null);
  const [waveLocked, setWaveLocked] = useState(false);

  const currentCard = cards[waveIdx];
  const waveLockedRef = useRef(false);
  const completedRef = useRef(false);

  const finishGame = useCallback(
    (finalResults: PracticeResultItem[], finalScore: number, bestStreak: number) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete(finalResults, {
        score: finalScore,
        leaderboardMode: 'meteor',
        maxStreak: bestStreak,
      });
    },
    [onComplete]
  );

  const advanceWave = useCallback(
    (
      nextResults: PracticeResultItem[],
      nextScore: number,
      nextLives: number,
      nextMaxStreak: number
    ) => {
      const nextIdx = waveIdx + 1;
      if (nextLives <= 0 || nextIdx >= cards.length) {
        finishGame(nextResults, nextScore, nextMaxStreak);
        return;
      }
      const nextCard = cards[nextIdx];
      setWaveIdx(nextIdx);
      setOrbs(buildWaveOrbs(nextCard, pool));
      setLaserTarget(null);
      waveLockedRef.current = false;
      setWaveLocked(false);
      if (autoSpeak && nextCard) {
        speakEnglish(nextCard.term);
      }
    },
    [waveIdx, cards, pool, autoSpeak, finishGame]
  );

  // Smooth descent timer (~30fps)
  useEffect(() => {
    if (!currentCard || completedRef.current) return;
    const id = window.setInterval(() => {
      if (waveLockedRef.current) return;
      setOrbs((prev) => {
        const next = prev.map((o) => ({ ...o, yPct: o.yPct + o.speed }));
        const hitBottom = next.some((o) => o.yPct >= 86);
        if (hitBottom) {
          waveLockedRef.current = true;
          setWaveLocked(true);
          const updatedResults = [
            ...results,
            {
              cardId: currentCard.id,
              term: currentCard.term,
              meaning: currentCard.meaning,
              isCorrect: false,
            },
          ];
          const nextLives = lives - 1;
          setLives(nextLives);
          setStreak(0);
          setResults(updatedResults);
          window.setTimeout(() => {
            advanceWave(updatedResults, score, nextLives, maxStreak);
          }, 750);
        }
        return next;
      });
    }, 55);
    return () => window.clearInterval(id);
  }, [
    currentCard,
    results,
    lives,
    score,
    maxStreak,
    advanceWave,
  ]);

  function handleShootOrb(orb: MeteorOrb) {
    if (waveLockedRef.current || !currentCard || completedRef.current) return;
    waveLockedRef.current = true;
    setWaveLocked(true);

    const isCorrect = orb.isCorrect;
    setLaserTarget({
      xPct: orb.xPct,
      yPct: orb.yPct,
      hitCorrect: isCorrect,
    });

    const nextStreak = isCorrect ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const earned = isCorrect ? 100 + Math.min(nextStreak - 1, 9) * 20 : 0;
    const nextScore = score + earned;
    const nextLives = isCorrect ? lives : lives - 1;

    const nextResults = [
      ...results,
      {
        cardId: currentCard.id,
        term: currentCard.term,
        meaning: currentCard.meaning,
        isCorrect,
      },
    ];

    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setScore(nextScore);
    setLives(nextLives);
    setResults(nextResults);

    window.setTimeout(() => {
      advanceWave(nextResults, nextScore, nextLives, nextMaxStreak);
    }, isCorrect ? 460 : 820);
  }

  if (!currentCard) return null;

  const displayedBest = Math.max(bestScore, score);
  const progressPct = Math.round(((waveIdx + 1) / Math.max(1, cards.length)) * 100);
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
          <div className="flex items-center gap-1" aria-label={`Còn ${lives} lá chắn`}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                className={`h-4 w-4 ${
                  i < lives
                    ? 'fill-rose-500 text-rose-500'
                    : 'text-indigo-800'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
          <span className="font-mono-tabular text-sm font-bold text-white">
            {score} điểm
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => speakEnglish(currentCard.term)}
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
            onClick={() => finishGame(results, score, maxStreak)}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-indigo-700/80 bg-indigo-900/70 px-2 py-1 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-800 cursor-pointer"
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
            <span>Dừng</span>
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
        {orbs.map((orb) => {
          const isRevealedRight = waveLocked && orb.isCorrect;
          const isLaserHit =
            laserTarget &&
            Math.abs(laserTarget.xPct - orb.xPct) < 1 &&
            Math.abs(laserTarget.yPct - orb.yPct) < 2;

          let orbStyle =
            'border-indigo-400/50 bg-[radial-gradient(circle_at_35%_30%,#5253ba_0%,#292a73_75%)] text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:scale-105 hover:border-sky-300';
          if (isRevealedRight) {
            orbStyle =
              'border-emerald-300 bg-[radial-gradient(circle_at_35%_30%,#34d399_0%,#059669_75%)] text-white shadow-[0_0_24px_rgba(52,211,153,0.65)] scale-105';
          } else if (isLaserHit && !orb.isCorrect) {
            orbStyle =
              'border-rose-300 bg-[radial-gradient(circle_at_35%_30%,#fb7185_0%,#e11d48_75%)] text-white shadow-[0_0_24px_rgba(244,63,94,0.65)]';
          }

          return (
            <button
              key={orb.uid}
              type="button"
              disabled={waveLocked}
              onClick={() => handleShootOrb(orb)}
              style={{
                left: `${orb.xPct}%`,
                top: `${orb.yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-2 p-2.5 text-center transition-transform duration-150 cursor-pointer ${orbStyle}`}
            >
              <span className="text-xs sm:text-sm font-bold leading-tight break-words line-clamp-3">
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
            <span>{waveIdx + 1}</span>
            <span>
              {waveIdx + 1}/{cards.length}
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
