'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flag,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { speakEnglish } from '@/lib/speech';
import { prioritizeCards } from '@/lib/spaced-repetition';
import { TankAudioEngine } from '@/lib/tank-audio';
import { Flashcard } from '@/lib/types';
import { PracticeResultItem } from './FlipMode';
import { PracticeCompletionMeta } from './MatchMode';

export interface TankGateGameProps {
  cards: Flashcard[];
  allPoolCards: Flashcard[];
  deckTitle: string;
  bestScore?: number;
  autoSpeak?: boolean;
  isLoggedIn?: boolean;
  onQuickSave?: (
    results: PracticeResultItem[],
    meta: PracticeCompletionMeta
  ) => Promise<void>;
  onComplete: (
    results: PracticeResultItem[],
    meta?: PracticeCompletionMeta
  ) => void;
  onViewLeaderboard?: () => void;
  onOpenAuth?: () => void;
}

type DiffKey = 'easy' | 'normal' | 'hard';
type DirectionMode = 'term_to_meaning' | 'meaning_to_term';
type GameScreenMode = 'menu' | 'count' | 'play' | 'pause' | 'over';

interface DiffConfig {
  label: string;
  speedDesc: string;
  speed: number;
  gap: number;
}

const DIFF: Record<DiffKey, DiffConfig> = {
  easy: {
    label: 'Tân binh',
    speedDesc: 'Tốc độ vừa · Dễ ngắm',
    speed: 24,
    gap: 112,
  },
  normal: {
    label: 'Chiến sĩ',
    speedDesc: 'Tốc độ chuẩn · Vòng lặp',
    speed: 31,
    gap: 102,
  },
  hard: {
    label: 'Đặc công',
    speedDesc: 'Tốc độ cao · Phản xạ nhanh',
    speed: 39,
    gap: 92,
  },
};

function safeSpeak(text: string) {
  try {
    speakEnglish(text);
  } catch {
    // Bỏ qua lỗi Web Speech API để không ảnh hưởng vòng lặp game
  }
}

interface ResolvedGateWord {
  card: Flashcard;
  question: string;
  hint: string;
  answer: string;
  alt: string;
  wrongOptions: string[];
}

interface GateLogItem {
  cardId: string;
  term: string;
  meaning: string;
  phonetic: string;
  question: string;
  answer: string;
  alt: string;
  chose: string;
  ok: boolean;
}

interface ActiveQuestionHud {
  cardId: string;
  term: string;
  question: string;
  hint: string;
  dirLabel: string;
  feedback: 'none' | 'correct' | 'wrong';
}

interface ToastItem {
  id: number;
  text: string;
  sub?: string;
  tone: 'good' | 'bad' | 'gold' | 'cyan';
}

interface BannerState {
  word: string;
  text: string;
  ok: boolean;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function resolveCardForGate(
  card: Flashcard,
  pool: Flashcard[],
  dir: DirectionMode
): ResolvedGateWord {
  const isTermToMeaning = dir === 'term_to_meaning';
  const question = isTermToMeaning ? card.term : card.meaning;
  const answer = isTermToMeaning ? card.meaning : card.term;
  const alt = isTermToMeaning ? card.term : card.meaning;
  const hint = isTermToMeaning
    ? [card.partOfSpeech, card.phonetic].filter(Boolean).join(' · ')
    : [card.partOfSpeech, 'Chọn từ khớp nghĩa'].filter(Boolean).join(' · ');

  const seen = new Set<string>([answer.trim().toLowerCase()]);
  const distractors: string[] = [];
  const shuffledPool = shuffleInPlace(pool.filter((c) => c.id !== card.id));
  for (const item of shuffledPool) {
    const candidate = (isTermToMeaning ? item.meaning : item.term).trim();
    if (!candidate) continue;
    const norm = candidate.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    distractors.push(candidate);
    if (distractors.length >= 3) break;
  }
  if (distractors.length === 0) {
    distractors.push(isTermToMeaning ? 'Nghĩa khác' : 'Another word');
  }

  return {
    card,
    question,
    hint,
    answer,
    alt,
    wrongOptions: distractors,
  };
}

export function TankGateGame({
  cards,
  allPoolCards,
  deckTitle,
  bestScore = 0,
  autoSpeak = false,
  isLoggedIn = false,
  onQuickSave,
  onComplete,
  onViewLeaderboard,
  onOpenAuth,
}: TankGateGameProps) {
  const pool = useMemo(
    () => (allPoolCards.length >= 2 ? allPoolCards : cards),
    [allPoolCards, cards]
  );

  const [screenMode, setScreenMode] = useState<GameScreenMode>('menu');
  const [diffKey, setDiffKey] = useState<DiffKey>('normal');
  const [direction, setDirection] = useState<DirectionMode>('term_to_meaning');
  const [soundOn, setSoundOn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const [hudScore, setHudScore] = useState(0);
  const [hudCorrect, setHudCorrect] = useState(0);
  const [hudPassed, setHudPassed] = useState(0);
  const [hudCycle, setHudCycle] = useState(1);
  const [hudCombo, setHudCombo] = useState(0);
  const [activeQ, setActiveQ] = useState<ActiveQuestionHud | null>(null);
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [flashKind, setFlashKind] = useState<'none' | 'good' | 'bad' | 'nitro'>(
    'none'
  );
  const [showGateHint, setShowGateHint] = useState(false);
  const [steerLeftActive, setSteerLeftActive] = useState(false);
  const [steerRightActive, setSteerRightActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [nitroReady, setNitroReady] = useState(false);
  const [nitroActive, setNitroActive] = useState(false);
  const [driftActive, setDriftActive] = useState(false);
  const [driftCooling, setDriftCooling] = useState(false);

  const [localBest, setLocalBest] = useState(bestScore);
  const [localBestCombo, setLocalBestCombo] = useState(0);
  const [playCount, setPlayCount] = useState(0);

  const [resultStats, setResultStats] = useState<{
    finalScore: number;
    correct: number;
    total: number;
    accuracy: number;
    cycles: number;
    maxCombo: number;
    rank: 'S' | 'A' | 'B' | 'C';
    title: string;
    log: GateLogItem[];
    savedToServer: boolean;
  } | null>(null);
  const [onlyMissFilter, setOnlyMissFilter] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nitroFillRef = useRef<HTMLDivElement | null>(null);
  const driftCdRef = useRef<HTMLDivElement | null>(null);
  const gateHintTextRef = useRef<HTMLSpanElement | null>(null);
  const viewWidthRef = useRef<number>(640);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
  }>({ active: false, pointerId: null, lastX: 0 });

  const audioRef = useRef<TankAudioEngine | null>(null);
  const cardsRef = useRef(cards);
  const poolRef = useRef(pool);
  const autoSpeakRef = useRef(autoSpeak);
  const diffRef = useRef<DiffKey>(diffKey);
  const dirRef = useRef<DirectionMode>(direction);
  const soundRef = useRef<boolean>(soundOn);
  const onQuickSaveRef = useRef(onQuickSave);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);
  useEffect(() => {
    diffRef.current = diffKey;
  }, [diffKey]);
  useEffect(() => {
    dirRef.current = direction;
  }, [direction]);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    onQuickSaveRef.current = onQuickSave;
  }, [onQuickSave]);

  const leftPointersRef = useRef<Set<number>>(new Set());
  const rightPointersRef = useRef<Set<number>>(new Set());

  const simRef = useRef<{
    mode: GameScreenMode;
    prevMode: GameScreenMode;
    z: number;
    x: number;
    vx: number;
    dragVx: number;
    speed: number;
    targetSpeed: number;
    score: number;
    correct: number;
    combo: number;
    maxCombo: number;
    cycle: number;
    nitro: number;
    nitroOn: number;
    driftOn: number;
    driftCd: number;
    stun: number;
    gateIdx: number;
    wordCursor: number;
    nextGateZ: number;
    nextPickZ: number;
    words: Flashcard[];
    log: GateLogItem[];
    shake: number;
    tilt: number;
    countdown: number;
    cdStep: number;
    elapsed: number;
    shownQId: string | null;
    left: boolean;
    right: boolean;
    runSaved: boolean;
    startGame: () => void;
    goMenu: () => void;
    pauseGame: () => void;
    resumeGame: () => void;
    activateNitro: () => void;
    activateDrift: () => void;
    relabelGates: () => void;
    endGame: () => void;
  } | null>(null);

  const pushToast = useCallback(
    (text: string, tone: ToastItem['tone'], sub?: string) => {
      const id = Date.now() + Math.floor(Math.random() * 10000);
      setToasts((prev) => [...prev.slice(-2), { id, text, sub, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 1150);
    },
    []
  );

  const triggerFlash = useCallback(
    (kind: 'good' | 'bad' | 'nitro') => {
      setFlashKind(kind);
      window.setTimeout(() => {
        setFlashKind((cur) => (cur === kind ? 'none' : cur));
      }, 220);
    },
    []
  );

  const showBanner = useCallback(
    (word: string, text: string, ok: boolean) => {
      setBanner({ word, text, ok });
      window.setTimeout(() => {
        setBanner((cur) => (cur && cur.word === word ? null : cur));
      }, ok ? 900 : 1250);
    },
    []
  );

  const samplePreview = useMemo(() => {
    const first = cards[0];
    if (!first) return { q: 'LexiCard', a: 'Sẵn sàng đua' };
    return direction === 'term_to_meaning'
      ? { q: first.term, a: first.meaning }
      : { q: first.meaning, a: first.term };
  }, [cards, direction]);

  useEffect(() => {
    const container = viewportRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const audio = new TankAudioEngine();
    audioRef.current = audio;

    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const probeGl =
        probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!probeGl) {
        queueMicrotask(() => setWebglError(true));
        return;
      }
      const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = dbg
        ? String(probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
        : String(probeGl.getParameter(probeGl.RENDERER) || '');
      isSoftwareGl = /swiftshader|llvmpipe|softpipe|mesa|software/i.test(
        rendererName
      );
    } catch {
      queueMicrotask(() => setWebglError(true));
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !isSoftwareGl,
        powerPreference: isSoftwareGl ? 'default' : 'high-performance',
      });
    } catch {
      queueMicrotask(() => setWebglError(true));
      return;
    }

    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xa9d8f2, 95, 330);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    envScene.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

    const skyGeo = new THREE.SphereGeometry(600, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7dff) },
        bot: { value: new THREE.Color(0xd3ecff) },
      },
      vertexShader:
        'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'uniform vec3 top;uniform vec3 bot;varying vec3 vP;void main(){float h=clamp((normalize(vP).y+.12)/.85,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,.85)),1.);}',
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    scene.add(sky);

    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x4a6b32, 0.85);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0cf, 1.32);
    sun.position.set(-40, 70, 30);
    sun.castShadow = !isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 190;
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 52;
    sun.shadow.camera.bottom = -34;
    sun.shadow.bias = -0.0013;
    scene.add(sun);
    scene.add(sun.target);

    const rim = new THREE.DirectionalLight(0x66aaff, 0.5);
    rim.position.set(35, 22, -45);
    scene.add(rim);

    const glowLight = new THREE.PointLight(0xffc21f, 0, 60);
    scene.add(glowLight);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
      fog: false,
    });
    const cloudGeo = new THREE.SphereGeometry(1, 7, 5);
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 9; i++) {
      const cg = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        m.position.set(rand(-11, 11), rand(-2, 2), rand(-6, 6));
        m.scale.setScalar(rand(5, 9));
        cg.add(m);
      }
      cg.position.set(rand(-190, 190), rand(54, 88), rand(-40, 430));
      scene.add(cg);
      clouds.push(cg);
    }

    const disposableTextures: THREE.Texture[] = [];
    const makeCv = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    const makeTex = (
      c: HTMLCanvasElement,
      rx = 0,
      ry = 1,
      srgb = true
    ): THREE.CanvasTexture => {
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      if (rx) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
      }
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      disposableTextures.push(t);
      return t;
    };

    const roadTex = (() => {
      const c = makeCv(128, 256);
      const x = c.getContext('2d')!;
      x.fillStyle = '#3b4048';
      x.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 2200; i++) {
        const g = (Math.random() * 40) | 0;
        x.fillStyle = `rgba(${120 + g},${124 + g},${132 + g},${Math.random() * 0.16})`;
        x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
      }
      for (let i = 0; i < 150; i++) {
        x.fillStyle = `rgba(190,40,40,${Math.random() * 0.1})`;
        x.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
      }
      x.fillStyle = '#ffd84d';
      x.fillRect(60, 26, 8, 110);
      x.fillRect(60, 166, 8, 70);
      x.fillStyle = 'rgba(255,255,255,.5)';
      x.fillRect(3, 0, 3, 256);
      x.fillRect(122, 0, 3, 256);
      return makeTex(c, 1, 1, true);
    })();

    const kerbTex = (() => {
      const c = makeCv(16, 64);
      const x = c.getContext('2d')!;
      x.fillStyle = '#f2f4f7';
      x.fillRect(0, 0, 16, 64);
      x.fillStyle = '#e8232f';
      x.fillRect(0, 0, 16, 32);
      return makeTex(c, 1, 1, true);
    })();

    const grassTex = (() => {
      const c = makeCv(64, 64);
      const x = c.getContext('2d')!;
      x.fillStyle = '#5aa03a';
      x.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 800; i++) {
        x.fillStyle = `rgba(${(60 + Math.random() * 50) | 0},${(140 + Math.random() * 60) | 0},60,.35)`;
        x.fillRect(Math.random() * 64, Math.random() * 64, 2, 3);
      }
      return makeTex(c, 30, 30, true);
    })();

    const flagTex = (() => {
      const c = makeCv(120, 80);
      const x = c.getContext('2d')!;
      x.fillStyle = '#da251d';
      x.fillRect(0, 0, 120, 80);
      x.fillStyle = '#ffff00';
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 22 : 8.4;
        const px = 60 + Math.cos(a) * r;
        const py = 40 + Math.sin(a) * r;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.fill();
      return makeTex(c, 0, 1, true);
    })();

    const dotTex = (() => {
      const c = makeCv(64, 64);
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      disposableTextures.push(t);
      return t;
    })();

    const numTex = (() => {
      const c = makeCv(128, 64);
      const x = c.getContext('2d')!;
      x.font = '800 46px system-ui, -apple-system, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#f4efe2';
      x.fillText('390', 64, 34);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      disposableTextures.push(t);
      return t;
    })();

    const boardCache = new Map<string, THREE.CanvasTexture>();
    const boardTexture = (text: string): THREE.CanvasTexture => {
      const cached = boardCache.get(text);
      if (cached) return cached;
      const W = 512;
      const H = 170;
      const c = makeCv(W, H);
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#16273c');
      g.addColorStop(1, '#060b12');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      x.strokeStyle = '#ffc21f';
      x.lineWidth = 10;
      x.strokeRect(5, 5, W - 10, H - 10);
      x.strokeStyle = 'rgba(255,255,255,.13)';
      x.lineWidth = 2;
      x.strokeRect(19, 19, W - 38, H - 38);
      x.textAlign = 'center';
      x.textBaseline = 'middle';

      const setF = (s: number) => {
        x.font = `800 ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      };
      setF(60);
      let lines = [String(text)];
      if (x.measureText(text).width > W - 80) {
        const words = String(text).split(' ');
        if (words.length > 1) {
          let best = 1;
          let bestDiff = 1e9;
          for (let i = 1; i < words.length; i++) {
            const d = Math.abs(
              words.slice(0, i).join(' ').length -
                words.slice(i).join(' ').length
            );
            if (d < bestDiff) {
              bestDiff = d;
              best = i;
            }
          }
          lines = [
            words.slice(0, best).join(' '),
            words.slice(best).join(' '),
          ];
        }
      }
      let size = lines.length > 1 ? 50 : 60;
      setF(size);
      let widest = Math.max(...lines.map((l) => x.measureText(l).width));
      while (widest > W - 72 && size > 16) {
        size -= 2;
        setF(size);
        widest = Math.max(...lines.map((l) => x.measureText(l).width));
      }
      const lh = size * 1.14;
      const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => {
        x.fillStyle = 'rgba(0,0,0,.55)';
        x.fillText(l, W / 2 + 3, y0 + i * lh + 4);
        x.fillStyle = '#f7f3e6';
        x.fillText(l, W / 2, y0 + i * lh);
      });

      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      boardCache.set(text, t);
      if (boardCache.size > 150) {
        const firstKey = boardCache.keys().next().value;
        if (firstKey !== undefined) {
          boardCache.get(firstKey)?.dispose();
          boardCache.delete(firstKey);
        }
      }
      return t;
    };

    const G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
      cone: new THREE.ConeGeometry(1, 1, 8),
      sphere: new THREE.SphereGeometry(1, 12, 10),
      plane: new THREE.PlaneGeometry(1, 1),
      oct: new THREE.OctahedronGeometry(1, 0),
    };

    const M = {
      road: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.94 }),
      kerb: new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 }),
      grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
      body: new THREE.MeshStandardMaterial({
        color: 0x4f7a2e,
        roughness: 0.72,
        metalness: 0.22,
        flatShading: true,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: 0x35521f,
        roughness: 0.8,
        flatShading: true,
      }),
      track: new THREE.MeshStandardMaterial({
        color: 0x1d2418,
        roughness: 0.95,
        flatShading: true,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: 0x39432c,
        roughness: 0.5,
        metalness: 0.6,
        flatShading: true,
      }),
      trunk: new THREE.MeshStandardMaterial({
        color: 0x7a5230,
        roughness: 1,
        flatShading: true,
      }),
      leafA: new THREE.MeshStandardMaterial({
        color: 0x2f8f3e,
        roughness: 0.95,
        flatShading: true,
      }),
      leafB: new THREE.MeshStandardMaterial({
        color: 0x49b04a,
        roughness: 0.95,
        flatShading: true,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: 0xeef2f5,
        roughness: 0.9,
        flatShading: true,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: 0x35c07a,
        roughness: 0.8,
        flatShading: true,
      }),
      roof2: new THREE.MeshStandardMaterial({
        color: 0x2f7dff,
        roughness: 0.8,
        flatShading: true,
      }),
      win: new THREE.MeshStandardMaterial({
        color: 0x1d3550,
        roughness: 0.3,
        metalness: 0.4,
        emissive: 0x0d2038,
        emissiveIntensity: 0.6,
      }),
      pole: new THREE.MeshStandardMaterial({
        color: 0xd7dee6,
        roughness: 0.5,
        metalness: 0.4,
      }),
      lamp: new THREE.MeshStandardMaterial({
        color: 0xfff3c4,
        emissive: 0xffc21f,
        emissiveIntensity: 1.1,
      }),
      pillar: new THREE.MeshStandardMaterial({
        color: 0xf1ece0,
        roughness: 0.85,
        flatShading: true,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xffc21f,
        roughness: 0.28,
        metalness: 0.85,
        emissive: 0x4a3200,
        emissiveIntensity: 0.5,
      }),
      bar: new THREE.MeshStandardMaterial({
        color: 0x1a1f26,
        roughness: 0.6,
        metalness: 0.6,
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: 0xffc21f,
        roughness: 0.7,
        emissive: 0x3a2a00,
        emissiveIntensity: 0.6,
      }),
      flag: new THREE.MeshBasicMaterial({
        map: flagTex,
        side: THREE.DoubleSide,
      }),
      num: new THREE.MeshBasicMaterial({ map: numTex, transparent: true }),
      crystal: new THREE.MeshStandardMaterial({
        color: 0x39e0ff,
        emissive: 0x2f7dff,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        transparent: true,
        opacity: 0.92,
        flatShading: true,
      }),
    };

    const mk = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
      sx = 1,
      sy = 1,
      sz = 1
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    };

    const ROAD_W = 15;
    const HALF = ROAD_W / 2;
    const SEG = 6;
    const CHUNK = 18;
    const NCHUNK = 26;

    // Đường thẳng hoàn toàn giúp người chơi dễ căn làn Trái / Phải
    const centerX = (_z: number) => 0;
    const slopeX = (_z: number) => 0;

    const ground = mk(G.plane, M.grass, 0, -0.06, 0, 900, 900, 1);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    interface TrackChunk {
      g: THREE.Group;
      road: THREE.Mesh;
      kerbs: THREE.Mesh[];
      props: THREE.Group;
      z: number;
    }

    const disposableChunkGeos: THREE.BufferGeometry[] = [];
    const buildChunk = (): TrackChunk => {
      const g = new THREE.Group();
      const rg = new THREE.PlaneGeometry(ROAD_W, CHUNK, 1, SEG);
      rg.rotateX(-Math.PI / 2);
      rg.userData.bx = (rg.attributes.position.array as Float32Array).slice();
      disposableChunkGeos.push(rg);
      const road = new THREE.Mesh(rg, M.road);
      road.receiveShadow = true;
      g.add(road);

      const kerbs: THREE.Mesh[] = [];
      for (let s = -1; s <= 1; s += 2) {
        const kg = new THREE.PlaneGeometry(1.5, CHUNK, 1, SEG);
        kg.rotateX(-Math.PI / 2);
        kg.userData.bx = (kg.attributes.position.array as Float32Array).slice();
        disposableChunkGeos.push(kg);
        const k = new THREE.Mesh(kg, M.kerb);
        k.position.y = 0.02;
        k.receiveShadow = true;
        g.add(k);
        kerbs.push(k);
      }
      const props = new THREE.Group();
      g.add(props);
      scene.add(g);
      return { g, road, kerbs, props, z: 0 };
    };

    const chunks: TrackChunk[] = [];
    for (let i = 0; i < NCHUNK; i++) chunks.push(buildChunk());

    const shapeChunk = (ch: TrackChunk) => {
      const pos = ch.road.geometry.attributes.position;
      const bxRoad = ch.road.geometry.userData.bx as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(
          i,
          bxRoad[i * 3] + centerX(ch.z + pos.getZ(i)) - centerX(ch.z)
        );
      }
      pos.needsUpdate = true;
      ch.road.geometry.computeVertexNormals();

      ch.kerbs.forEach((k, s) => {
        const p = k.geometry.attributes.position;
        const bxKerb = k.geometry.userData.bx as Float32Array;
        const side = s === 0 ? -1 : 1;
        for (let i = 0; i < p.count; i++) {
          p.setX(
            i,
            bxKerb[i * 3] +
              side * (HALF + 0.75) +
              centerX(ch.z + p.getZ(i)) -
              centerX(ch.z)
          );
        }
        p.needsUpdate = true;
        k.geometry.computeVertexNormals();
      });
    };

    const buildTree = (x: number, z: number) => {
      const g = new THREE.Group();
      g.add(mk(G.cyl, M.trunk, 0, 1.1, 0, 0.32, 2.2, 0.32));
      if (Math.random() < 0.5) {
        g.add(mk(G.cone, M.leafA, 0, 3.4, 0, 1.9, 3.4, 1.9));
        g.add(mk(G.cone, M.leafB, 0, 5.1, 0, 1.35, 2.6, 1.35));
      } else {
        g.add(mk(G.box, M.leafB, 0, 3.3, 0, 2.9, 2.6, 2.9));
        g.add(mk(G.box, M.leafA, 0.5, 4.7, 0.3, 1.9, 1.7, 1.9));
      }
      g.position.set(x, 0, z);
      g.rotation.y = rand(0, 6.28);
      if (!isSoftwareGl) {
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
      }
      return g;
    };

    const buildHouse = (x: number, z: number) => {
      const g = new THREE.Group();
      const w = rand(5, 8);
      const h = rand(4, 7);
      const d = rand(5, 8);
      const body = mk(G.box, M.wall, 0, h / 2, 0, w, h, d);
      body.castShadow = !isSoftwareGl;
      g.add(body);
      const roof = mk(
        G.cone,
        Math.random() < 0.5 ? M.roof : M.roof2,
        0,
        h + 1.5,
        0,
        Math.max(w, d) * 0.82,
        3,
        Math.max(w, d) * 0.82
      );
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = !isSoftwareGl;
      g.add(roof);
      for (let i = -1; i <= 1; i += 2) {
        g.add(mk(G.box, M.win, i * w * 0.24, h * 0.55, d / 2 + 0.03, 1.3, 1.5, 0.1));
      }
      g.add(mk(G.box, M.dark, 0, 1.1, d / 2 + 0.03, 1.4, 2.2, 0.12));
      g.position.set(x, 0, z);
      g.rotation.y = rand(-0.4, 0.4);
      return g;
    };

    const buildLamp = (x: number, z: number) => {
      const g = new THREE.Group();
      g.add(mk(G.cyl, M.pole, 0, 3.4, 0, 0.16, 6.8, 0.16));
      g.add(mk(G.box, M.pole, x > 0 ? -1 : 1, 6.7, 0, 2.2, 0.18, 0.18));
      g.add(mk(G.box, M.lamp, x > 0 ? -2 : 2, 6.55, 0, 0.9, 0.22, 0.5));
      g.position.set(x, 0, z);
      return g;
    };

    const decorateChunk = (ch: TrackChunk) => {
      while (ch.props.children.length) ch.props.remove(ch.props.children[0]);
      const n = 5 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const lz = rand(-CHUNK / 2, CHUNK / 2);
        const off = centerX(ch.z + lz) - centerX(ch.z);
        const r = Math.random();
        let prop: THREE.Group;
        if (r < 0.62) prop = buildTree(off + side * rand(HALF + 3, HALF + 26), lz);
        else if (r < 0.86)
          prop = buildHouse(off + side * rand(HALF + 11, HALF + 24), lz);
        else prop = buildLamp(off + side * (HALF + 2.4), lz);
        ch.props.add(prop);
      }
    };

    const placeChunk = (ch: TrackChunk, z: number) => {
      ch.z = z;
      ch.g.position.z = z;
      shapeChunk(ch);
      decorateChunk(ch);
    };

    const resetTrack = () => {
      for (let i = 0; i < NCHUNK; i++) placeChunk(chunks[i], (i - 3) * CHUNK);
    };

    const recycleTrack = (z: number) => {
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (ch.z < z - CHUNK * 3.2) {
          let maxZ = -1e9;
          for (let j = 0; j < chunks.length; j++) {
            maxZ = Math.max(maxZ, chunks[j].z);
          }
          placeChunk(ch, maxZ + CHUNK);
        }
      }
    };

    const tank = new THREE.Group();
    scene.add(tank);
    const hull = new THREE.Group();
    tank.add(hull);

    const lowerHull = mk(G.box, M.dark, 0, 0.62, 0, 3.1, 0.7, 4.9);
    lowerHull.castShadow = !isSoftwareGl;
    hull.add(lowerHull);

    const upperHull = mk(G.box, M.body, 0, 1.22, 0, 2.8, 0.75, 4.4);
    upperHull.castShadow = !isSoftwareGl;
    hull.add(upperHull);

    const nose = mk(G.box, M.body, 0, 1.05, 2.35, 2.6, 0.6, 0.9);
    nose.rotation.x = -0.32;
    nose.castShadow = !isSoftwareGl;
    hull.add(nose);

    for (let s = -1; s <= 1; s += 2) {
      const tr = mk(G.box, M.track, s * 1.62, 0.62, 0, 0.72, 1.05, 5.2);
      tr.castShadow = !isSoftwareGl;
      hull.add(tr);
      for (let i = -2; i <= 2; i++) {
        const w = mk(G.cyl, M.metal, s * 1.62, 0.6, i * 1.05, 0.44, 0.8, 0.44);
        w.rotation.z = Math.PI / 2;
        hull.add(w);
      }
      hull.add(mk(G.box, M.body, s * 1.62, 1.2, 0, 0.8, 0.28, 5.0));
      const numPlate = mk(G.plane, M.num, s * 2.03, 1.25, -0.2, 1.5, 0.75, 1);
      numPlate.rotation.y = (s * Math.PI) / 2;
      hull.add(numPlate);
      hull.add(mk(G.box, M.hazard, s * 1.0, 1.35, -2.45, 0.35, 0.22, 0.12));
    }

    const turret = new THREE.Group();
    turret.position.set(0, 1.85, -0.2);
    hull.add(turret);

    const dome = mk(G.sphere, M.body, 0, 0.25, 0, 1.25, 0.85, 1.35);
    dome.castShadow = !isSoftwareGl;
    turret.add(dome);
    turret.add(mk(G.cyl, M.dark, 0, 0.72, -0.2, 0.42, 0.3, 0.42));

    const barrel = mk(G.cyl, M.metal, 0, 0.28, 2.1, 0.17, 3.1, 0.17);
    barrel.rotation.x = Math.PI / 2;
    barrel.castShadow = !isSoftwareGl;
    turret.add(barrel);

    const muzzle = mk(G.cyl, M.dark, 0, 0.28, 3.5, 0.24, 0.5, 0.24);
    muzzle.rotation.x = Math.PI / 2;
    turret.add(muzzle);

    hull.add(mk(G.cyl, M.pole, -0.9, 2.9, -2.1, 0.06, 3.2, 0.06));
    const flagGeo = new THREE.PlaneGeometry(1.7, 1.1, 10, 4);
    const flagMesh = new THREE.Mesh(flagGeo, M.flag);
    flagMesh.position.set(-0.05, 4.05, -2.1);
    hull.add(flagMesh);
    const flagBase = (flagGeo.attributes.position.array as Float32Array).slice();

    const shadowBlobMat = new THREE.MeshBasicMaterial({
      map: dotTex,
      transparent: true,
      opacity: 0.32,
      color: 0x000000,
      depthWrite: false,
    });
    const shadowBlob = mk(G.plane, shadowBlobMat, 0, 0.04, 0, 6, 8, 1);
    shadowBlob.rotation.x = -Math.PI / 2;
    scene.add(shadowBlob);

    interface GateHalf {
      group: THREE.Group;
      board: THREE.Mesh;
      bars: THREE.Group;
      mat: THREE.MeshStandardMaterial;
      side: -1 | 1;
      fall: number;
    }

    interface GateSlot {
      g: THREE.Group;
      halves: GateHalf[];
      beam: THREE.Mesh;
      z: number;
      active: boolean;
      answered: boolean;
      correctSide: -1 | 1;
      rawCard: Flashcard | null;
      item: ResolvedGateWord | null;
      opts: { left: string; right: string } | null;
    }

    const disposableGateMats: THREE.MeshStandardMaterial[] = [];
    const buildGate = (): GateSlot => {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      const halves: GateHalf[] = [];
      for (const s of [-1, 1] as const) {
        const half = new THREE.Group();
        g.add(half);
        const px = s * (HALF * 0.52);
        const pillar = mk(G.box, M.pillar, s * (HALF + 0.6), 2.6, 0, 1.1, 5.2, 1.1);
        pillar.castShadow = !isSoftwareGl;
        half.add(pillar);
        half.add(mk(G.sphere, M.gold, s * (HALF + 0.6), 5.5, 0, 0.55, 0.55, 0.55));
        const mat = new THREE.MeshStandardMaterial({
          map: boardTexture('—'),
          roughness: 0.6,
          emissive: 0x101820,
          emissiveIntensity: 0.5,
        });
        disposableGateMats.push(mat);
        const board = mk(G.box, mat, px, 4.1, 0, HALF * 0.94, 2.1, 0.28);
        board.castShadow = !isSoftwareGl;
        half.add(board);
        half.add(mk(G.box, M.gold, px, 4.1, -0.02, HALF * 0.98, 2.24, 0.2));

        const bars = new THREE.Group();
        half.add(bars);
        for (let i = 0; i < 7; i++) {
          const bx = px - HALF * 0.42 + i * ((HALF * 0.84) / 6);
          bars.add(mk(G.cyl, M.bar, bx, 1.5, 0, 0.07, 3, 0.07));
          bars.add(mk(G.cone, M.gold, bx, 3.1, 0, 0.13, 0.4, 0.13));
        }
        bars.add(mk(G.box, M.bar, px, 2.5, 0, HALF * 0.9, 0.12, 0.12));
        bars.add(mk(G.box, M.bar, px, 0.6, 0, HALF * 0.9, 0.12, 0.12));

        halves.push({ group: half, board, bars, mat, side: s, fall: 0 });
      }
      const beam = mk(G.box, M.pillar, 0, 5.35, 0, ROAD_W + 2.4, 0.5, 0.7);
      g.add(beam);
      return {
        g,
        halves,
        beam,
        z: 0,
        active: false,
        answered: false,
        correctSide: 1,
        rawCard: null,
        item: null,
        opts: null,
      };
    };

    const gates: GateSlot[] = [];
    for (let i = 0; i < 4; i++) gates.push(buildGate());

    const armGate = (gt: GateSlot, z: number, rawCard: Flashcard) => {
      const it = resolveCardForGate(rawCard, poolRef.current, dirRef.current);
      const correctLeft = Math.random() < 0.5;
      const wrong =
        it.wrongOptions[(Math.random() * it.wrongOptions.length) | 0] ||
        it.answer;
      gt.item = it;
      gt.rawCard = rawCard;
      gt.z = z;
      gt.active = true;
      gt.answered = false;
      gt.correctSide = correctLeft ? -1 : 1;
      gt.opts = {
        left: correctLeft ? it.answer : wrong,
        right: correctLeft ? wrong : it.answer,
      };
      gt.g.visible = true;
      gt.g.position.set(centerX(z), 0, z);
      gt.g.rotation.y = Math.atan(slopeX(z));
      gt.beam.visible = true;
      gt.halves.forEach((h) => {
        h.group.position.set(0, 0, 0);
        h.group.rotation.set(0, 0, 0);
        h.group.visible = true;
        h.fall = 0;
        h.bars.visible = true;
        h.mat.map = boardTexture(h.side < 0 ? gt.opts!.left : gt.opts!.right);
        h.mat.color.setHex(0xffffff);
        h.mat.emissive.setHex(0x101820);
        h.mat.needsUpdate = true;
      });
    };

    const disarmGate = (gt: GateSlot) => {
      gt.active = false;
      gt.g.visible = false;
    };

    const relabelGates = () => {
      gates.forEach((gt) => {
        if (!gt.active || gt.answered || !gt.rawCard) return;
        const it = resolveCardForGate(
          gt.rawCard,
          poolRef.current,
          dirRef.current
        );
        const wasLeftCorrect = gt.correctSide < 0;
        const wrong =
          it.wrongOptions[(Math.random() * it.wrongOptions.length) | 0] ||
          it.answer;
        gt.item = it;
        gt.opts = {
          left: wasLeftCorrect ? it.answer : wrong,
          right: wasLeftCorrect ? wrong : it.answer,
        };
        gt.halves.forEach((h) => {
          h.mat.map = boardTexture(h.side < 0 ? gt.opts!.left : gt.opts!.right);
          h.mat.needsUpdate = true;
        });
      });
      if (S.shownQId) {
        const nearest = gates.find(
          (gt) => gt.active && !gt.answered && gt.rawCard?.id === S.shownQId
        );
        if (nearest?.item) {
          setActiveQ({
            cardId: nearest.item.card.id,
            term: nearest.item.card.term,
            question: nearest.item.question,
            hint: nearest.item.hint,
            dirLabel:
              dirRef.current === 'term_to_meaning' ? 'TỪ → NGHĨA' : 'NGHĨA → TỪ',
            feedback: 'none',
          });
        }
      }
    };

    const disposableHaloMats: THREE.MeshBasicMaterial[] = [];
    const picks: Array<{
      m: THREE.Mesh;
      halo: THREE.Mesh;
      z: number;
      x: number;
      active: boolean;
    }> = [];
    for (let i = 0; i < 8; i++) {
      const m = mk(G.oct, M.crystal, 0, 1.6, 0, 0.7, 1.05, 0.7);
      m.visible = false;
      scene.add(m);
      const haloMat = new THREE.MeshBasicMaterial({
        map: dotTex,
        transparent: true,
        opacity: 0.5,
        color: 0x39e0ff,
        depthWrite: false,
      });
      disposableHaloMats.push(haloMat);
      const halo = mk(G.plane, haloMat, 0, 0.06, 0, 3.4, 3.4, 1);
      halo.rotation.x = -Math.PI / 2;
      halo.visible = false;
      scene.add(halo);
      picks.push({ m, halo, z: 0, x: 0, active: false });
    }

    const spawnPick = (z: number) => {
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        if (p.active) continue;
        p.active = true;
        p.z = z;
        p.x = centerX(z) + rand(-HALF + 2.5, HALF - 2.5);
        p.m.visible = true;
        p.halo.visible = true;
        p.m.position.set(p.x, 1.6, z);
        p.halo.position.set(p.x, 0.06, z);
        return;
      }
    };

    const PMAX = 260;
    const pPos = new Float32Array(PMAX * 3);
    const pCol = new Float32Array(PMAX * 3);
    const pSize = new Float32Array(PMAX);
    const pVel = new Float32Array(PMAX * 3);
    const pLife = new Float32Array(PMAX);
    const pMax = new Float32Array(PMAX);
    const pGrav = new Float32Array(PMAX);
    const pBase = new Float32Array(PMAX);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    const pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: dotTex } },
      vertexShader:
        'attribute float size;attribute vec3 color;varying vec3 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*(300./max(-mv.z,1.));gl_Position=projectionMatrix*mv;}',
      fragmentShader:
        'uniform sampler2D map;varying vec3 vC;void main(){gl_FragColor=vec4(vC,1.)*texture2D(map,gl_PointCoord);}',
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    scene.add(points);

    let pHead = 0;
    const tmpC = new THREE.Color();
    const emit = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      life: number,
      size: number,
      color: number,
      grav = -9
    ) => {
      const i = pHead;
      pHead = (pHead + 1) % PMAX;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
      pVel[i * 3] = vx;
      pVel[i * 3 + 1] = vy;
      pVel[i * 3 + 2] = vz;
      pLife[i] = life;
      pMax[i] = life;
      pBase[i] = size;
      pSize[i] = size;
      pGrav[i] = grav;
      tmpC.setHex(color);
      pCol[i * 3] = tmpC.r;
      pCol[i * 3 + 1] = tmpC.g;
      pCol[i * 3 + 2] = tmpC.b;
    };

    const burst = (
      x: number,
      y: number,
      z: number,
      n: number,
      color: number,
      power: number,
      size?: number
    ) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, 6.283);
        const e = rand(0.1, 1.3);
        emit(
          x,
          y,
          z,
          Math.cos(a) * power * e,
          rand(2, 9) * e,
          Math.sin(a) * power * e,
          rand(0.5, 1.1),
          size || rand(0.5, 1.3),
          color
        );
      }
    };

    const updateParticles = (dt: number) => {
      for (let i = 0; i < PMAX; i++) {
        if (pLife[i] <= 0) {
          pSize[i] = 0;
          continue;
        }
        pLife[i] -= dt;
        pVel[i * 3 + 1] += pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.05) {
          pPos[i * 3 + 1] = 0.05;
          pVel[i * 3 + 1] *= -0.32;
          pVel[i * 3] *= 0.7;
          pVel[i * 3 + 2] *= 0.7;
        }
        pSize[i] =
          pLife[i] > 0 ? pBase[i] * ((pLife[i] / pMax[i]) * 0.85 + 0.25) : 0;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.size.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    };

    const DEB = 42;
    const debris: Array<{
      m: THREE.Mesh;
      v: THREE.Vector3;
      rv: THREE.Vector3;
      life: number;
    }> = [];
    for (let i = 0; i < DEB; i++) {
      const m = mk(
        G.box,
        i % 3 === 0 ? M.gold : M.bar,
        0,
        -50,
        0,
        0.4,
        0.4,
        0.4
      );
      m.visible = false;
      scene.add(m);
      debris.push({ m, v: new THREE.Vector3(), rv: new THREE.Vector3(), life: 0 });
    }
    let debHead = 0;

    const throwDebris = (
      x: number,
      y: number,
      z: number,
      n: number,
      spread: number
    ) => {
      for (let i = 0; i < n; i++) {
        const d = debris[debHead];
        debHead = (debHead + 1) % DEB;
        d.m.visible = true;
        d.m.position.set(
          x + rand(-spread, spread),
          y + rand(-1, 1.6),
          z + rand(-0.6, 0.6)
        );
        d.m.scale.set(rand(0.25, 0.7), rand(0.2, 0.6), rand(0.2, 0.5));
        d.v.set(rand(-9, 9), rand(5, 15), rand(-4, 12));
        d.rv.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
        d.life = rand(1.1, 1.9);
      }
    };

    const updateDebris = (dt: number) => {
      for (let i = 0; i < DEB; i++) {
        const d = debris[i];
        if (d.life <= 0) continue;
        d.life -= dt;
        d.v.y -= 22 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.rv.x * dt;
        d.m.rotation.y += d.rv.y * dt;
        d.m.rotation.z += d.rv.z * dt;
        if (d.m.position.y < 0.2) {
          d.m.position.y = 0.2;
          d.v.y *= -0.35;
          d.v.x *= 0.7;
          d.v.z *= 0.7;
        }
        if (d.life <= 0) d.m.visible = false;
      }
    };

    const S = {
      mode: 'menu' as GameScreenMode,
      prevMode: 'play' as GameScreenMode,
      z: 0,
      x: 0,
      vx: 0,
      dragVx: 0,
      speed: 14,
      targetSpeed: 31,
      score: 0,
      correct: 0,
      combo: 0,
      maxCombo: 0,
      cycle: 1,
      nitro: 0.5,
      nitroOn: 0,
      driftOn: 0,
      driftCd: 0,
      stun: 0,
      gateIdx: 0,
      wordCursor: 0,
      nextGateZ: 95,
      nextPickZ: 60,
      words: [] as Flashcard[],
      log: [] as GateLogItem[],
      shake: 0,
      tilt: 0,
      countdown: 0,
      cdStep: 9,
      elapsed: 0,
      shownQId: null as string | null,
      left: false,
      right: false,
      runSaved: false,
      lastNitroReady: false,
      lastNitroActive: false,
      lastDriftActive: false,
      lastDriftCooling: false,
      lastGateHintShown: false,
      startGame: () => {},
      goMenu: () => {},
      pauseGame: () => {},
      resumeGame: () => {},
      activateNitro: () => {},
      activateDrift: () => {},
      relabelGates: () => {},
      endGame: () => {},
    };
    simRef.current = S;

    const resetWorld = () => {
      resetTrack();
      gates.forEach(disarmGate);
      picks.forEach((p) => {
        p.active = false;
        p.m.visible = false;
        p.halo.visible = false;
      });
      debris.forEach((d) => {
        d.life = 0;
        d.m.visible = false;
      });
      for (let i = 0; i < PMAX; i++) {
        pLife[i] = 0;
        pSize[i] = 0;
      }
      pGeo.attributes.size.needsUpdate = true;
    };

    // Thẻ đã trả lời sai trong vòng hiện tại và đã được xếp lại 1 lần (tránh lặp vô hạn)
    const requeuedIds = new Set<string>();

    const buildDeckCycle = (first = false): Flashcard[] => {
      const src = cardsRef.current;
      if (src.length === 0) return [];
      requeuedIds.clear();
      // Lần đầu: giữ đúng thứ tự ưu tiên (thẻ mới/yếu/quá hạn trước) do PracticeArena truyền vào.
      // Các vòng sau: xáo có trọng số để vẫn ưu tiên thẻ yếu nhưng không lặp y hệt.
      if (first) return [...src];
      return prioritizeCards(src, (Math.random() * 1e9) | 0);
    };

    const nextLoopCard = (): Flashcard | null => {
      if (cardsRef.current.length === 0) return null;
      if (S.wordCursor >= S.words.length) {
        S.words = buildDeckCycle();
        S.wordCursor = 0;
        S.cycle += 1;
        setHudCycle(S.cycle);
        pushToast(`VÒNG ${S.cycle}`, 'gold', 'TIẾP TỤC LUYỆN TẬP');
      }
      const card = S.words[S.wordCursor] ?? cardsRef.current[0];
      S.wordCursor += 1;
      return card;
    };

    const syncImperativeHud = () => {
      if (nitroFillRef.current) {
        nitroFillRef.current.style.width = `${(S.nitro * 100).toFixed(0)}%`;
      }
      if (driftCdRef.current) {
        driftCdRef.current.style.height =
          S.driftCd > 0 ? `${((S.driftCd / 2.2) * 100).toFixed(0)}%` : '0%';
      }

      const nr = S.nitro >= 0.34 && S.nitroOn <= 0;
      const na = S.nitroOn > 0;
      const da = S.driftOn > 0;
      const dc = S.driftCd > 0;
      if (nr !== S.lastNitroReady) {
        S.lastNitroReady = nr;
        setNitroReady(nr);
      }
      if (na !== S.lastNitroActive) {
        S.lastNitroActive = na;
        setNitroActive(na);
      }
      if (da !== S.lastDriftActive) {
        S.lastDriftActive = da;
        setDriftActive(da);
      }
      if (dc !== S.lastDriftCooling) {
        S.lastDriftCooling = dc;
        setDriftCooling(dc);
      }
    };

    const startGame = () => {
      const D = DIFF[diffRef.current];
      S.mode = 'count';
      S.prevMode = 'count';
      S.z = 0;
      S.x = 0;
      S.vx = 0;
      S.dragVx = 0;
      S.speed = 0;
      S.targetSpeed = D.speed;
      S.score = 0;
      S.correct = 0;
      S.combo = 0;
      S.maxCombo = 0;
      S.cycle = 1;
      S.nitro = 0.5;
      S.nitroOn = 0;
      S.driftOn = 0;
      S.driftCd = 0;
      S.stun = 0;
      S.gateIdx = 0;
      S.wordCursor = 0;
      S.nextGateZ = 95;
      S.nextPickZ = 60;
      S.words = buildDeckCycle(true);
      S.log = [];
      S.shake = 0;
      S.tilt = 0;
      S.cdStep = 9;
      S.countdown = 3.2;
      S.elapsed = 0;
      S.shownQId = null;
      S.left = false;
      S.right = false;
      S.runSaved = false;
      S.lastGateHintShown = false;
      leftPointersRef.current.clear();
      rightPointersRef.current.clear();
      dragRef.current = { active: false, pointerId: null, lastX: 0 };

      resetWorld();
      setScreenMode('count');
      setHudScore(0);
      setHudCorrect(0);
      setHudPassed(0);
      setHudCycle(1);
      setHudCombo(0);
      setActiveQ(null);
      setBanner(null);
      setShowGateHint(false);
      setSteerLeftActive(false);
      setSteerRightActive(false);
      setIsDragging(false);
      setResultStats(null);
      setOnlyMissFilter(false);
      setCountdownLabel('3');
      setPlayCount((c) => c + 1);

      syncImperativeHud();
      audio.resume();
      audio.setOn(soundRef.current);
      audio.count(3);
    };

    const goMenu = () => {
      S.mode = 'menu';
      dragRef.current = { active: false, pointerId: null, lastX: 0 };
      setIsDragging(false);
      audio.engineUpdate(0, false, false);
      resetWorld();
      S.z = 0;
      S.x = 0;
      S.speed = 14;
      setScreenMode('menu');
      setCountdownLabel(null);
      setBanner(null);
      setActiveQ(null);
      setShowGateHint(false);
    };

    const pauseGame = () => {
      if (S.mode !== 'play' && S.mode !== 'count') return;
      S.prevMode = S.mode;
      S.mode = 'pause';
      dragRef.current = { active: false, pointerId: null, lastX: 0 };
      setIsDragging(false);
      setScreenMode('pause');
      audio.engineUpdate(0, false, false);
      audio.ui();
    };

    const resumeGame = () => {
      if (S.mode !== 'pause') return;
      S.mode = S.prevMode || 'play';
      setScreenMode(S.mode);
      audio.resume();
      audio.ui();
    };

    const endGame = () => {
      if (S.mode === 'over') return;
      S.mode = 'over';
      dragRef.current = { active: false, pointerId: null, lastX: 0 };
      setIsDragging(false);
      const snapshotLog = [...S.log];
      const totalAnswered = snapshotLog.length;
      const finalScore = S.score;
      const acc = totalAnswered > 0 ? S.correct / totalAnswered : 0;
      const accuracy = Math.round(acc * 100);

      let rank: 'S' | 'A' | 'B' | 'C' = 'C';
      let title = 'CẦN LUYỆN THÊM';
      if (totalAnswered > 0 && acc >= 0.95) {
        rank = 'S';
        title = 'XUẤT SẮC!';
      } else if (totalAnswered > 0 && acc >= 0.8) {
        rank = 'A';
        title = 'GIỎI LẮM!';
      } else if (totalAnswered > 0 && acc >= 0.55) {
        rank = 'B';
        title = 'KHÁ TỐT!';
      } else if (totalAnswered === 0) {
        rank = 'C';
        title = 'KẾT THÚC SỚM';
      }

      setLocalBest((b) => Math.max(b, finalScore));
      setLocalBestCombo((bc) => Math.max(bc, S.maxCombo));
      setCountdownLabel(null);
      setBanner(null);
      setActiveQ(null);
      setShowGateHint(false);
      setScreenMode('over');
      audio.engineUpdate(0, false, false);
      if (acc >= 0.8 && totalAnswered > 0) audio.win();
      else audio.lose();

      setResultStats({
        finalScore,
        correct: S.correct,
        total: totalAnswered,
        accuracy,
        cycles: S.cycle,
        maxCombo: S.maxCombo,
        rank,
        title,
        log: snapshotLog,
        savedToServer: false,
      });

      if (!S.runSaved && onQuickSaveRef.current && snapshotLog.length > 0) {
        S.runSaved = true;
        const practiceResults: PracticeResultItem[] = snapshotLog.map((r) => ({
          cardId: r.cardId,
          term: r.term,
          meaning: r.meaning,
          isCorrect: r.ok,
        }));
        void onQuickSaveRef
          .current(practiceResults, {
            score: finalScore,
            leaderboardMode: 'tank',
            maxStreak: S.maxCombo,
          })
          .then(() => {
            setResultStats((prev) =>
              prev ? { ...prev, savedToServer: true } : null
            );
          })
          .catch(() => {
            // ignore
          });
      }
    };

    const activateNitro = () => {
      if (S.mode !== 'play' || S.nitro < 0.34 || S.nitroOn > 0) return;
      S.nitro -= 0.34;
      S.nitroOn = 1.9;
      S.shake = Math.max(S.shake, 0.35);
      triggerFlash('nitro');
      audio.nitro();
      pushToast('NITRO!', 'cyan', 'BỨT TỐC');
      syncImperativeHud();
    };

    const activateDrift = () => {
      if (S.mode !== 'play' || S.driftCd > 0) return;
      S.driftOn = 1.15;
      S.driftCd = 2.2;
      audio.drift();
      syncImperativeHud();
    };

    S.startGame = startGame;
    S.goMenu = goMenu;
    S.pauseGame = pauseGame;
    S.resumeGame = resumeGame;
    S.activateNitro = activateNitro;
    S.activateDrift = activateDrift;
    S.relabelGates = relabelGates;
    S.endGame = endGame;

    const resolveGate = (gt: GateSlot) => {
      if (!gt.item || !gt.opts) return;
      gt.answered = true;
      // `side` theo dấu của trục X thế giới, KHỚP với cách dựng bảng cổng:
      // bảng side = -1 nằm ở x < 0 (hiển thị opts.left), side = +1 nằm ở x > 0 (opts.right).
      // (Camera nhìn theo +Z nên x > 0 hiện ở bên TRÁI màn hình, nhưng điều đó không ảnh
      // hưởng việc chấm đúng/sai vì bảng và xe cùng nằm trong hệ toạ độ thế giới.)
      const side: -1 | 1 = S.x > centerX(gt.z) ? 1 : -1;
      const ok = side === gt.correctSide;
      const chose = side < 0 ? gt.opts.left : gt.opts.right;
      const hit = gt.halves[side < 0 ? 0 : 1];
      const hx = centerX(gt.z) + side * (HALF * 0.52);

      const entry: GateLogItem = {
        cardId: gt.item.card.id,
        term: gt.item.card.term,
        meaning: gt.item.card.meaning,
        phonetic: gt.item.card.phonetic,
        question: gt.item.question,
        answer: gt.item.answer,
        alt: gt.item.alt,
        chose,
        ok,
      };
      S.log.push(entry);

      hit.bars.visible = false;
      hit.fall = 1;
      throwDebris(hx, 2.2, gt.z, ok ? 10 : 16, HALF * 0.4);

      if (ok) {
        S.correct++;
        S.combo++;
        S.maxCombo = Math.max(S.maxCombo, S.combo);
        const mult = 1 + Math.min(S.combo - 1, 4) * 0.25;
        const nitroBonus = S.nitroOn > 0 ? 60 : 0;
        const gain = Math.round(100 * mult) + nitroBonus;
        S.score += gain;
        S.nitro = clamp(S.nitro + 0.22, 0, 1);

        burst(hx, 3, gt.z, 26, 0x3ddc84, 10, 1.1);
        burst(hx, 3, gt.z, 14, 0xc6ff3d, 7, 0.9);
        triggerFlash('good');
        audio.correct(S.combo);
        S.shake = Math.max(S.shake, 0.28);
        pushToast(
          `+${gain} ĐIỂM`,
          'good',
          nitroBonus ? 'NITRO BONUS · CHUẨN!' : `COMBO ×${S.combo}`
        );
        showBanner(gt.item.question, `${gt.item.answer} ✓`, true);
        setActiveQ((prev) => (prev ? { ...prev, feedback: 'correct' } : null));
        glowLight.color.setHex(0x3ddc84);
        glowLight.intensity = 2.4;
      } else {
        S.combo = 0;
        S.stun = 0.45;
        S.speed *= 0.48;

        // Lặp lại cách quãng trong phiên: từ vừa sai sẽ quay lại sau vài cổng nữa
        if (gt.rawCard && !requeuedIds.has(gt.rawCard.id)) {
          requeuedIds.add(gt.rawCard.id);
          const at = Math.min(S.words.length, S.wordCursor + 4);
          S.words.splice(at, 0, gt.rawCard);
        }

        burst(hx, 3, gt.z, 30, 0xff3b46, 12, 1.2);
        triggerFlash('bad');
        audio.wrong();
        audio.crash();
        S.shake = Math.max(S.shake, 0.7);
        pushToast('CHƯA ĐÚNG', 'bad', 'MẤT COMBO · TIẾP TỤC!');
        showBanner(gt.item.question, `Đáp án đúng: ${gt.item.answer}`, false);
        setActiveQ((prev) => (prev ? { ...prev, feedback: 'wrong' } : null));
        glowLight.color.setHex(0xff3b46);
        glowLight.intensity = 2.8;
      }

      setHudCorrect(S.correct);
      setHudPassed(S.log.length);
      setHudScore(S.score);
      setHudCombo(S.combo);
      glowLight.position.set(hx, 4, gt.z);
      syncImperativeHud();
    };

    resetWorld();
    S.z = 0;
    S.x = 0;
    S.speed = 14;

    let viewW = Math.max(300, container.clientWidth);
    let viewH = Math.max(240, container.clientHeight);
    viewWidthRef.current = viewW;
    const applyResize = () => {
      viewW = Math.max(300, container.clientWidth);
      viewH = Math.max(240, container.clientHeight);
      viewWidthRef.current = viewW;
      renderer.setSize(viewW, viewH, false);
      camera.aspect = viewW / Math.max(viewH, 1);
      camera.updateProjectionMatrix();
    };
    applyResize();

    const ro = new ResizeObserver(() => {
      applyResize();
    });
    ro.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') {
        if (S.mode === 'play' || S.mode === 'count') e.preventDefault();
        S.left = true;
        setSteerLeftActive(true);
      } else if (k === 'arrowright' || k === 'd') {
        if (S.mode === 'play' || S.mode === 'count') e.preventDefault();
        S.right = true;
        setSteerRightActive(true);
      } else if (k === ' ') {
        if (S.mode === 'play' || S.mode === 'count') {
          e.preventDefault();
          activateNitro();
        }
      } else if (k === 'shift') {
        if (S.mode === 'play') activateDrift();
      } else if (k === 'p' || k === 'escape') {
        if (S.mode === 'pause') resumeGame();
        else if (S.mode === 'play' || S.mode === 'count') pauseGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') {
        S.left = false;
        setSteerLeftActive(false);
      } else if (k === 'arrowright' || k === 'd') {
        S.right = false;
        setSteerRightActive(false);
      }
    };

    const onBlurOrHidden = () => {
      S.left = false;
      S.right = false;
      S.dragVx = 0;
      dragRef.current = { active: false, pointerId: null, lastX: 0 };
      leftPointersRef.current.clear();
      rightPointersRef.current.clear();
      setSteerLeftActive(false);
      setSteerRightActive(false);
      setIsDragging(false);
      if (S.mode === 'play' || S.mode === 'count') {
        pauseGame();
      }
    };

    const onVisChange = () => {
      if (document.hidden) onBlurOrHidden();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrHidden);
    document.addEventListener('visibilitychange', onVisChange);

    const camPos = new THREE.Vector3(0, 7.4, -15);
    const camLook = new THREE.Vector3();
    const desired = new THREE.Vector3();

    let lastTime = performance.now();
    let rafId = 0;
    let swTimerId = 0;
    let disposed = false;

    const tickFrame = () => {
      if (disposed) return;
      const now = performance.now();
      let dt = (now - lastTime) / 1000;
      lastTime = now;
      if (dt > 0.05) dt = 0.05;

      const D = DIFF[diffRef.current];

      if (S.mode === 'count') {
        S.countdown -= dt;
        const step = Math.ceil(S.countdown);
        if (step !== S.cdStep && step >= 0) {
          S.cdStep = step;
          setCountdownLabel(step > 0 ? String(step) : 'ĐI!');
          audio.count(step);
        }
        if (S.countdown <= -0.35) {
          S.mode = 'play';
          setCountdownLabel(null);
          setScreenMode('play');
        }
      }

      const playing = S.mode === 'play';
      const moving = playing || S.mode === 'count' || S.mode === 'menu';

      if (playing) {
        S.elapsed += dt;
        if (S.stun > 0) S.stun -= dt;
        if (S.nitroOn > 0) S.nitroOn -= dt;
        if (S.driftOn > 0) S.driftOn -= dt;
        if (S.driftCd > 0) S.driftCd -= dt;

        const boost = S.nitroOn > 0 ? 1.72 : 1;
        const stunK = S.stun > 0 ? 0.35 : 1;
        S.targetSpeed =
          D.speed * boost * stunK * (1 + Math.min(S.elapsed / 120, 0.16));
        S.speed = lerp(S.speed, S.targetSpeed, 1 - Math.pow(0.001, dt));

        // Camera hướng +Z nên +X là Trái màn hình, -X là Phải màn hình
        const steer = (S.left ? 1 : 0) - (S.right ? 1 : 0);
        const grip = S.driftOn > 0 ? 1.85 : 1;
        const targetVx = steer * 13.5 * grip + S.dragVx;
        S.vx = lerp(S.vx, targetVx, 1 - Math.pow(0.0006, dt));
        S.dragVx *= Math.pow(0.02, dt);
        S.x += S.vx * dt;

        const cx = centerX(S.z);
        const lim = HALF + 1.1;
        if (S.x < cx - lim) {
          S.x = cx - lim;
          S.vx *= -0.25;
          S.speed *= 0.965;
          if (Math.random() < 0.4) {
            emit(
              S.x,
              0.4,
              S.z,
              rand(-2, 2),
              rand(1, 4),
              rand(-3, 0),
              0.5,
              0.7,
              0xffc21f
            );
          }
        }
        if (S.x > cx + lim) {
          S.x = cx + lim;
          S.vx *= -0.25;
          S.speed *= 0.965;
          if (Math.random() < 0.4) {
            emit(
              S.x,
              0.4,
              S.z,
              rand(-2, 2),
              rand(1, 4),
              rand(-3, 0),
              0.5,
              0.7,
              0xffc21f
            );
          }
        }
        S.z += S.speed * dt;

        if (S.driftOn > 0) {
          S.nitro = clamp(S.nitro + dt * 0.3, 0, 1);
          if (Math.random() < 0.85) {
            for (let s = -1; s <= 1; s += 2) {
              emit(
                S.x + s * 1.6,
                0.35,
                S.z - 2.2,
                rand(-3, 3) - S.vx * 0.25,
                rand(0.6, 2.4),
                rand(-7, -2),
                0.65,
                1.15,
                0xf2f4f7,
                -1.2
              );
            }
          }
        }
        if (S.nitroOn > 0 && Math.random() < 0.9) {
          for (let s = -1; s <= 1; s += 2) {
            emit(
              S.x + s * 1.0,
              0.9,
              S.z - 2.6,
              rand(-1.5, 1.5),
              rand(0.4, 2),
              rand(-14, -7),
              0.42,
              1.05,
              0x39e0ff,
              -1
            );
          }
        }
        if (Math.random() < 0.35) {
          emit(
            S.x - 0.9,
            1.5,
            S.z - 2.5,
            rand(-0.6, 0.6),
            rand(0.8, 1.8),
            rand(-3, -1),
            0.7,
            0.6,
            0x8d99a6,
            -0.6
          );
        }

        if (S.z > S.nextGateZ - 260) {
          const slot = gates.find((gt) => !gt.active);
          const card = slot ? nextLoopCard() : null;
          if (slot && card) {
            armGate(slot, S.nextGateZ, card);
            S.gateIdx++;
            S.nextGateZ += D.gap;
          }
        }
        if (S.z > S.nextPickZ - 200) {
          spawnPick(S.nextPickZ);
          S.nextPickZ += rand(46, 78);
        }

        let nearest: GateSlot | null = null;
        for (let i = 0; i < gates.length; i++) {
          const gt = gates[i];
          if (!gt.active) continue;
          if (!gt.answered && S.z >= gt.z - 1.2) resolveGate(gt);
          if (
            !gt.answered &&
            gt.z > S.z &&
            (!nearest || gt.z < nearest.z)
          ) {
            nearest = gt;
          }
          if (S.z > gt.z + 40) disarmGate(gt);
        }

        if (nearest && nearest.item) {
          const qKey = `${nearest.z}_${nearest.item.card.id}`;
          if (S.shownQId !== qKey) {
            S.shownQId = qKey;
            setActiveQ({
              cardId: nearest.item.card.id,
              term: nearest.item.card.term,
              question: nearest.item.question,
              hint: nearest.item.hint,
              dirLabel:
                dirRef.current === 'term_to_meaning'
                  ? 'TỪ → NGHĨA'
                  : 'NGHĨA → TỪ',
              feedback: 'none',
            });
            if (autoSpeakRef.current) {
              safeSpeak(nearest.item.card.term);
            }
          }
          const dist = Math.round(nearest.z - S.z);
          if (gateHintTextRef.current) {
            gateHintTextRef.current.textContent = `CỔNG ${S.log.length + 1} · VÒNG ${S.cycle} · ${dist}m`;
          }
          const hintVisible = dist < 80;
          if (hintVisible !== S.lastGateHintShown) {
            S.lastGateHintShown = hintVisible;
            setShowGateHint(hintVisible);
          }
        } else {
          if (S.lastGateHintShown) {
            S.lastGateHintShown = false;
            setShowGateHint(false);
          }
        }

        for (let i = 0; i < picks.length; i++) {
          const p = picks[i];
          if (!p.active) continue;
          p.m.rotation.y += dt * 2.4;
          p.m.position.y = 1.6 + Math.sin(now * 0.004 + p.z) * 0.22;
          if (Math.abs(S.z - p.z) < 2.2 && Math.abs(S.x - p.x) < 2.4) {
            p.active = false;
            p.m.visible = false;
            p.halo.visible = false;
            S.nitro = clamp(S.nitro + 0.28, 0, 1);
            S.score += 25;
            setHudScore(S.score);
            burst(p.x, 1.8, p.z, 16, 0x39e0ff, 7, 0.9);
            audio.pickup();
            pushToast('+NITRO', 'cyan', '+25 điểm');
          }
          if (S.z > p.z + 20) {
            p.active = false;
            p.m.visible = false;
            p.halo.visible = false;
          }
        }

        syncImperativeHud();
      } else if (S.mode === 'menu' || S.mode === 'over') {
        S.speed = lerp(S.speed, 16, 1 - Math.pow(0.02, dt));
        S.z += S.speed * dt;
        S.x = lerp(
          S.x,
          centerX(S.z) + Math.sin(now * 0.0006) * 3.2,
          1 - Math.pow(0.05, dt)
        );
      }

      for (let i = 0; i < gates.length; i++) {
        const gt = gates[i];
        if (!gt.active) continue;
        for (const h of gt.halves) {
          if (h.fall > 0) {
            h.fall += dt * 2.6;
            const f = Math.min(h.fall - 1, 1);
            h.group.rotation.x = -f * 1.35;
            h.group.position.z = f * 2.4;
            h.group.position.y = -f * 0.6;
            if (f >= 1) {
              h.fall = 0;
              h.group.visible = false;
            }
          }
        }
      }

      if (S.mode !== 'pause') {
        const cx = centerX(S.z);
        const ahead = centerX(S.z + 12);
        const yaw =
          Math.atan2(ahead - cx, 12) +
          clamp(S.vx * 0.028, -0.35, 0.35) +
          (S.driftOn > 0 ? clamp(S.vx * 0.03, -0.4, 0.4) : 0);

        tank.position.set(S.x, Math.sin(now * 0.012) * 0.035, S.z);
        tank.rotation.y = yaw;
        S.tilt = lerp(
          S.tilt,
          clamp(-S.vx * 0.022, -0.22, 0.22),
          1 - Math.pow(0.002, dt)
        );
        hull.rotation.z = S.tilt;
        hull.rotation.x = S.nitroOn > 0 ? -0.05 : S.stun > 0 ? 0.07 : 0;
        turret.rotation.y = lerp(
          turret.rotation.y,
          clamp(-S.vx * 0.02, -0.25, 0.25),
          1 - Math.pow(0.01, dt)
        );

        const pa = flagMesh.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const bx = flagBase[i * 3];
          const by = flagBase[i * 3 + 1];
          pa.setZ(i, Math.sin(now * 0.011 + bx * 3.4) * 0.16 * (bx + 0.9));
          pa.setY(
            i,
            by + Math.sin(now * 0.009 + bx * 2.6) * 0.05 * (bx + 0.9)
          );
        }
        pa.needsUpdate = true;
        shadowBlob.position.set(S.x, 0.04, S.z);
      }

      const camBack = S.nitroOn > 0 ? 17.5 : 14.5;
      desired.set(
        lerp(centerX(S.z - 6), S.x, 0.55),
        7.4 + (S.nitroOn > 0 ? 0.5 : 0),
        S.z - camBack
      );
      camPos.lerp(desired, 1 - Math.pow(0.0009, dt));
      if (S.shake > 0) {
        S.shake = Math.max(0, S.shake - dt * 1.9);
        const sh = S.shake * S.shake;
        camPos.x += rand(-1, 1) * sh * 1.6;
        camPos.y += rand(-1, 1) * sh * 1.2;
      }
      camera.position.copy(camPos);
      camLook.set(lerp(S.x, centerX(S.z + 22), 0.45), 2.4, S.z + 16);
      camera.lookAt(camLook);

      const targetFov = (viewH > viewW ? 70 : 62) + (S.nitroOn > 0 ? 7 : 0);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = lerp(camera.fov, targetFov, 1 - Math.pow(0.02, dt));
        camera.updateProjectionMatrix();
      }

      sky.position.set(camera.position.x, 0, camera.position.z);
      ground.position.set(centerX(S.z), -0.06, S.z + 120);
      sun.position.set(S.x - 40, 70, S.z + 30);
      sun.target.position.set(S.x, 0, S.z + 18);
      sun.target.updateMatrixWorld();
      rim.position.set(S.x + 35, 22, S.z - 45);

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.position.x += dt * 0.6;
        if (c.position.z < S.z - 120) c.position.z = S.z + rand(300, 430);
        if (c.position.x > 240) c.position.x = -240;
      }

      if (moving || S.mode === 'over') recycleTrack(S.z);

      if (glowLight.intensity > 0) {
        glowLight.intensity = Math.max(0, glowLight.intensity - dt * 4.2);
      }

      updateParticles(dt);
      updateDebris(dt);

      const rpm = clamp(S.speed / (D.speed * 1.6), 0, 1);
      audio.engineUpdate(rpm, playing || S.mode === 'count', S.driftOn > 0);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        swTimerId = window.setTimeout(() => {
          rafId = requestAnimationFrame(tickFrame);
        }, 28);
      } else {
        rafId = requestAnimationFrame(tickFrame);
      }
    };

    rafId = requestAnimationFrame(tickFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(swTimerId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrHidden);
      document.removeEventListener('visibilitychange', onVisChange);

      audio.dispose();
      audioRef.current = null;
      simRef.current = null;

      Object.values(G).forEach((geo) => geo.dispose());
      disposableChunkGeos.forEach((geo) => geo.dispose());
      skyGeo.dispose();
      cloudGeo.dispose();
      flagGeo.dispose();
      pGeo.dispose();

      Object.values(M).forEach((mat) => mat.dispose());
      skyMat.dispose();
      cloudMat.dispose();
      shadowBlobMat.dispose();
      pMat.dispose();
      disposableGateMats.forEach((mat) => mat.dispose());
      disposableHaloMats.forEach((mat) => mat.dispose());

      disposableTextures.forEach((t) => t.dispose());
      boardCache.forEach((t) => t.dispose());
      boardCache.clear();
      envRT.dispose();
      renderer.dispose();
    };
  }, [pushToast, showBanner, triggerFlash]);

  const handleToggleDirection = () => {
    const next: DirectionMode =
      direction === 'term_to_meaning' ? 'meaning_to_term' : 'term_to_meaning';
    dirRef.current = next;
    setDirection(next);
    simRef.current?.relabelGates();
    audioRef.current?.resume();
    audioRef.current?.swap();
    if (screenMode === 'play' || screenMode === 'pause') {
      pushToast(
        next === 'term_to_meaning' ? 'TỪ → NGHĨA' : 'NGHĨA → TỪ',
        'cyan',
        'ĐÃ ĐỔI BẢNG CỔNG'
      );
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    soundRef.current = next;
    setSoundOn(next);
    audioRef.current?.resume();
    audioRef.current?.setOn(next);
    if (next) audioRef.current?.ui();
  };

  const handleSelectDiff = (k: DiffKey) => {
    diffRef.current = k;
    setDiffKey(k);
    audioRef.current?.resume();
    audioRef.current?.ui();
  };

  const handleStart = () => {
    simRef.current?.startGame();
  };

  const handleFinishToSummary = () => {
    if (!resultStats) return;
    const practiceResults: PracticeResultItem[] = resultStats.log.map((r) => ({
      cardId: r.cardId,
      term: r.term,
      meaning: r.meaning,
      isCorrect: r.ok,
    }));
    onComplete(practiceResults, {
      score: resultStats.finalScore,
      leaderboardMode: 'tank',
      maxStreak: resultStats.maxCombo,
    });
  };

  const handleSteerDown = (dir: 'left' | 'right', pointerId: number) => {
    const S = simRef.current;
    if (!S || S.mode !== 'play') return;
    if (dir === 'left') {
      leftPointersRef.current.add(pointerId);
      S.left = true;
      setSteerLeftActive(true);
    } else {
      rightPointersRef.current.add(pointerId);
      S.right = true;
      setSteerRightActive(true);
    }
  };

  const handleSteerUp = (dir: 'left' | 'right', pointerId: number) => {
    const S = simRef.current;
    if (dir === 'left') {
      leftPointersRef.current.delete(pointerId);
      const stillHeld = leftPointersRef.current.size > 0;
      if (S) S.left = stillHeld;
      setSteerLeftActive(stillHeld);
    } else {
      rightPointersRef.current.delete(pointerId);
      const stillHeld = rightPointersRef.current.size > 0;
      if (S) S.right = stillHeld;
      setSteerRightActive(stillHeld);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const S = simRef.current;
    if (!S || S.mode !== 'play') return;
    // Trên PC: kéo chuột trái/phải trực tiếp trên đường đua để lái xe tăng
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const S = simRef.current;
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId || !S || S.mode !== 'play') {
      return;
    }
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    const w = Math.max(viewWidthRef.current, 320);
    // Kéo sang phải (dx > 0) giảm X (sang phải màn hình); kéo sang trái (dx < 0) tăng X (sang trái màn hình)
    const worldShift = -(dx / w) * 21;
    S.x = clamp(S.x + worldShift, -8.6, 8.6);
    S.dragVx = clamp(worldShift * 28, -22, 22);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current = { active: false, pointerId: null, lastX: 0 };
      setIsDragging(false);
    }
  };

  const filteredReviewLog = useMemo(() => {
    if (!resultStats) return [];
    return onlyMissFilter
      ? resultStats.log.filter((r) => !r.ok)
      : resultStats.log;
  }, [resultStats, onlyMissFilter]);

  if (webglError) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Không tải được đồ hoạ 3D WebGL
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Trình duyệt chưa hỗ trợ hoặc đang tắt tăng tốc phần cứng WebGL. Hãy thử
          bật WebGL hoặc dùng Chrome / Safari phiên bản mới.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      onContextMenu={(e) => e.preventDefault()}
      className={
        expanded
          ? 'fixed inset-0 z-50 overflow-hidden bg-[#060b12] text-[#f4efe2] select-none touch-none'
          : 'relative w-full h-[560px] sm:h-[630px] overflow-hidden rounded-2xl border border-slate-800 bg-[#060b12] text-[#f4efe2] shadow-2xl select-none touch-none'
      }
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        className={`absolute inset-0 block h-full w-full touch-none ${
          screenMode === 'play'
            ? isDragging
              ? 'cursor-grabbing'
              : 'md:cursor-grab'
            : ''
        }`}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(125%_92%_at_50%_44%,transparent_46%,rgba(3,7,12,0.58)_100%)]"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-[3] transition-opacity duration-150 ${
          flashKind === 'good'
            ? 'opacity-100 bg-[radial-gradient(92%_72%_at_50%_62%,rgba(61,220,132,0.34),transparent_70%)]'
            : flashKind === 'bad'
              ? 'opacity-100 bg-[linear-gradient(180deg,rgba(232,35,47,0.45),rgba(232,35,47,0.14))]'
              : flashKind === 'nitro'
                ? 'opacity-100 bg-[radial-gradient(82%_62%_at_50%_72%,rgba(57,224,255,0.28),transparent_72%)]'
                : 'opacity-0'
        }`}
      />

      {(screenMode === 'play' ||
        screenMode === 'count' ||
        screenMode === 'pause') && (
        <div className="pointer-events-none absolute inset-0 z-[6]">
          <div className="absolute top-0 right-0 left-0 flex flex-col items-center gap-1.5 px-2.5 pt-2.5 sm:px-4 sm:pt-3">
            {/* Hàng 1: Chỉ số bên trái & Thao tác bên phải */}
            <div className="flex w-full items-center justify-between gap-1.5">
              <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  aria-label="Tạm dừng"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    simRef.current?.pauseGame();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) simRef.current?.pauseGame();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#8fc44a]/40 bg-[#0c1522]/95 text-[#f4efe2] transition hover:border-[#c6ff3d] hover:text-[#c6ff3d] cursor-pointer sm:h-10 sm:w-10"
                >
                  <Pause className="h-4 w-4" aria-hidden="true" />
                </button>

                <div className="flex items-center gap-1.5 rounded-xl border border-[#8fc44a]/35 bg-[#0c1522]/95 px-2.5 py-1.5 shadow-lg">
                  <span className="hidden text-[10px] font-extrabold tracking-widest text-[#8fc44a] sm:inline">
                    ĐÚNG
                  </span>
                  <span className="font-mono-tabular text-sm font-extrabold leading-none text-white sm:text-base">
                    {hudCorrect}
                    <span className="text-[11px] font-semibold text-[#9fb0bf]">
                      /{hudPassed}
                    </span>
                  </span>
                  <span className="rounded-md bg-[#8fc44a]/20 px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#c6ff3d]">
                    V{hudCycle}
                  </span>
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-[#ffc21f]/40 bg-[#0c1522]/95 px-2.5 py-1.5 shadow-lg">
                  <span className="hidden text-[9px] font-extrabold tracking-widest text-[#ffc21f] sm:inline">
                    ĐIỂM
                  </span>
                  <span className="font-mono-tabular text-sm font-extrabold leading-none text-[#ffc21f] sm:text-base sm:text-white">
                    {hudScore}
                  </span>
                </div>

                {hudCombo >= 2 && (
                  <div
                    className={`flex items-center gap-0.5 rounded-xl border px-2 py-1 text-white shadow-lg ${
                      hudCombo >= 5
                        ? 'border-pink-200 bg-gradient-to-br from-[#ff3ea5] to-[#a3006b]'
                        : 'border-[#ffc21f] bg-gradient-to-br from-[#ff8a00] to-[#e8232f]'
                    }`}
                  >
                    <span className="font-mono-tabular text-xs font-extrabold leading-none sm:text-sm">
                      x{hudCombo}
                    </span>
                  </div>
                )}
              </div>

              <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  title="Đổi chiều câu hỏi trên cổng"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleDirection();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) handleToggleDirection();
                  }}
                  className="hidden h-9 items-center gap-1 rounded-xl border border-[#39e0ff]/40 bg-[#0c1522]/95 px-2.5 text-[10px] font-extrabold text-[#39e0ff] hover:border-[#39e0ff] sm:inline-flex cursor-pointer"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {direction === 'term_to_meaning' ? 'TỪ→NGHĨA' : 'NGHĨA→TỪ'}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="Bật/tắt âm thanh"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleSound();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) handleToggleSound();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#8fc44a]/35 bg-[#0c1522]/95 text-[#f4efe2] hover:border-[#c6ff3d] cursor-pointer sm:h-10 sm:w-10"
                >
                  {soundOn ? (
                    <Volume2 className="h-4 w-4 text-[#c6ff3d]" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-[#9fb0bf]" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  aria-label={expanded ? 'Thu nhỏ màn hình' : 'Toàn màn hình'}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) setExpanded((v) => !v);
                  }}
                  className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#0c1522]/95 text-[#f4efe2] hover:border-[#39e0ff] sm:flex cursor-pointer"
                >
                  {expanded ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    simRef.current?.endGame();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) simRef.current?.endGame();
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#c6ff3d]/55 bg-[#4f7a2e]/95 px-2.5 text-xs font-extrabold text-white shadow-lg transition hover:bg-[#5e9238] cursor-pointer whitespace-nowrap sm:h-10 sm:px-3"
                >
                  <Flag className="h-3.5 w-3.5 text-[#c6ff3d]" aria-hidden="true" />
                  <span className="hidden sm:inline">Kết thúc & Lưu</span>
                  <span className="sm:hidden">Lưu</span>
                </button>
              </div>
            </div>

            {/* Hàng 2: Thẻ câu hỏi ở giữa, tách biệt hoàn toàn với thanh chỉ số */}
            {activeQ && (
              <div
                className={`pointer-events-auto w-fit max-w-[92%] sm:max-w-[440px] rounded-2xl border bg-[#09121e]/95 px-3.5 py-1.5 text-center shadow-2xl transition-colors sm:px-5 sm:py-2 ${
                  activeQ.feedback === 'correct'
                    ? 'border-[#3ddc84]'
                    : activeQ.feedback === 'wrong'
                      ? 'border-[#ff3b46]'
                      : 'border-[#ffc21f]/50'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-[9px] font-extrabold tracking-wider">
                  <button
                    type="button"
                    title="Chạm để đổi chiều câu hỏi"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleDirection();
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) handleToggleDirection();
                    }}
                    className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-[#39e0ff] to-[#2f7dff] px-1.5 py-0.5 text-[#04121f] cursor-pointer"
                  >
                    <span>{activeQ.dirLabel}</span>
                    <ArrowLeftRight className="h-2.5 w-2.5 sm:hidden" aria-hidden="true" />
                  </button>
                  <em className="hidden truncate not-italic text-[#ffc21f] sm:inline">
                    HÚC CỔNG ĐÚNG NGHĨA
                  </em>
                </div>
                <div className="mt-0.5 flex items-center justify-center gap-1.5">
                  <span className="truncate font-display text-lg font-extrabold leading-tight text-white sm:text-2xl">
                    {activeQ.question}
                  </span>
                  <button
                    type="button"
                    aria-label={`Phát âm ${activeQ.term}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      safeSpeak(activeQ.term);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) safeSpeak(activeQ.term);
                    }}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[#39e0ff] hover:bg-white/20 cursor-pointer"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                {activeQ.hint && (
                  <div className="truncate text-[10px] text-[#9fb0bf]">
                    {activeQ.hint}
                  </div>
                )}
              </div>
            )}

            {/* Hàng 3: Khoảng cách tới cổng */}
            <div
              className={`pointer-events-none rounded-full bg-[#060b12]/80 px-3 py-0.5 font-mono-tabular text-[10px] font-extrabold tracking-widest text-[#f4efe2]/85 transition-opacity ${
                showGateHint ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span ref={gateHintTextRef}>CỔNG 1 · VÒNG 1</span>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0">
            {/* Nút điều khiển Trái / Phải dành cho Mobile */}
            <button
              type="button"
              aria-label="Rẽ trái"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSteerDown('left', e.pointerId);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSteerUp('left', e.pointerId);
              }}
              onPointerCancel={(e) => handleSteerUp('left', e.pointerId)}
              onPointerLeave={(e) => handleSteerUp('left', e.pointerId)}
              className={`pointer-events-auto md:hidden absolute bottom-4 left-3 z-20 flex h-16 w-24 flex-col items-center justify-center rounded-2xl border-2 touch-none select-none transition-all ${
                steerLeftActive
                  ? 'border-[#c6ff3d] bg-[#c6ff3d]/30 text-[#c6ff3d] scale-95'
                  : 'border-white/25 bg-[#0c1522]/80 text-white'
              }`}
            >
              <ChevronLeft className="h-7 w-7" aria-hidden="true" />
              <span className="text-[10px] font-extrabold tracking-wider">
                TRÁI
              </span>
            </button>

            <button
              type="button"
              aria-label="Rẽ phải"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSteerDown('right', e.pointerId);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSteerUp('right', e.pointerId);
              }}
              onPointerCancel={(e) => handleSteerUp('right', e.pointerId)}
              onPointerLeave={(e) => handleSteerUp('right', e.pointerId)}
              className={`pointer-events-auto md:hidden absolute bottom-4 right-3 z-20 flex h-16 w-24 flex-col items-center justify-center rounded-2xl border-2 touch-none select-none transition-all ${
                steerRightActive
                  ? 'border-[#c6ff3d] bg-[#c6ff3d]/30 text-[#c6ff3d] scale-95'
                  : 'border-white/25 bg-[#0c1522]/80 text-white'
              }`}
            >
              <ChevronRight className="h-7 w-7" aria-hidden="true" />
              <span className="text-[10px] font-extrabold tracking-wider">
                PHẢI
              </span>
            </button>

            {/* Gợi ý kéo chuột trên PC */}
            <div className="pointer-events-none hidden md:flex absolute bottom-4 left-1/2 -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#060b12]/75 px-3.5 py-1 text-[11px] font-semibold text-[#cbd8e2]">
              <ArrowLeftRight className="h-3.5 w-3.5 text-[#39e0ff]" aria-hidden="true" />
              <span>Kéo chuột trái/phải để lái xe tăng · hoặc A / D</span>
            </div>

            <button
              type="button"
              aria-label="Drift tích Nitro"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                simRef.current?.activateDrift();
              }}
              onClick={(e) => {
                if (e.detail === 0) simRef.current?.activateDrift();
              }}
              className={`pointer-events-auto absolute bottom-24 left-3 z-20 flex h-14 w-16 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-[#fff3c4] bg-gradient-to-br from-[#ffe27a] via-[#ffc21f] to-[#e08a00] text-[#08121b] shadow-xl touch-none select-none transition-transform active:scale-90 md:bottom-5 md:left-5 md:h-[84px] md:w-[84px] cursor-pointer ${
                driftActive
                  ? 'brightness-125 ring-4 ring-[#ffc21f]/60'
                  : driftCooling
                    ? 'grayscale-[70%] brightness-75 cursor-not-allowed'
                    : ''
              }`}
            >
              <Flame className="h-4 w-4 md:h-6 md:w-6" aria-hidden="true" />
              <span className="text-[9.5px] md:text-[11px] font-extrabold tracking-wider">
                DRIFT
              </span>
              <div
                ref={driftCdRef}
                className="pointer-events-none absolute right-0 bottom-0 left-0 bg-[#060b12]/65"
                style={{ height: '0%' }}
              />
            </button>

            <div className="pointer-events-auto absolute right-3 bottom-24 z-20 flex flex-col items-center gap-1 md:right-5 md:bottom-5 md:gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full border border-[#39e0ff]/45 bg-[#060b12]/85 md:h-2 md:w-[84px]">
                <div
                  ref={nitroFillRef}
                  className="h-full rounded-full bg-gradient-to-r from-[#2f7dff] to-[#39e0ff] transition-[width] duration-100"
                  style={{ width: '50%' }}
                />
              </div>
              <button
                type="button"
                aria-label="Kích hoạt Nitro"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  simRef.current?.activateNitro();
                }}
                onClick={(e) => {
                  if (e.detail === 0) simRef.current?.activateNitro();
                }}
                className={`flex h-14 w-16 flex-col items-center justify-center rounded-full border-2 border-[#cfe6ff] bg-gradient-to-br from-[#9fd0ff] via-[#2f7dff] to-[#1246b8] text-[#04121f] shadow-xl touch-none select-none transition-transform active:scale-90 md:h-[84px] md:w-[84px] cursor-pointer ${
                  nitroActive
                    ? 'brightness-125 ring-4 ring-[#39e0ff]/75'
                    : !nitroReady
                      ? 'grayscale-[80%] brightness-60 cursor-not-allowed'
                      : 'ring-2 ring-[#39e0ff]/55'
                }`}
              >
                <Zap className="h-4 w-4 md:h-6 md:w-6" aria-hidden="true" />
                <span className="text-[9.5px] md:text-[11px] font-extrabold tracking-wider">
                  NITRO
                </span>
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute top-[38%] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`text-center font-display text-xl font-extrabold drop-shadow-[0_4px_14px_rgba(0,0,0,0.85)] sm:text-2xl ${
                  t.tone === 'good'
                    ? 'text-[#3ddc84]'
                    : t.tone === 'bad'
                      ? 'text-[#ff3b46]'
                      : t.tone === 'cyan'
                        ? 'text-[#39e0ff]'
                        : 'text-[#ffc21f]'
                }`}
              >
                <div>{t.text}</div>
                {t.sub && (
                  <div className="text-[11px] font-bold tracking-wider text-[#f4efe2]">
                    {t.sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {banner && (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4">
              <div
                className={`w-full max-w-md rounded-2xl border-2 px-4 py-3 text-center text-white shadow-2xl ${
                  banner.ok
                    ? 'border-[#c9ffe3] bg-gradient-to-b from-[#57e79a] to-[#17a75d]'
                    : 'border-[#ffb3b7] bg-gradient-to-b from-[#ff4a52] to-[#e8232f]'
                }`}
              >
                <div className="font-display text-lg font-extrabold leading-tight sm:text-2xl">
                  {banner.word}
                </div>
                <div className="mt-0.5 text-xs font-bold sm:text-sm">
                  {banner.text}
                </div>
              </div>
            </div>
          )}

          {countdownLabel && (
            <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[#04080e]/40">
              <span className="font-display text-7xl font-black text-white drop-shadow-[0_0_40px_rgba(198,255,61,0.75)] sm:text-8xl">
                {countdownLabel}
              </span>
            </div>
          )}
        </div>
      )}

      {screenMode === 'menu' && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[radial-gradient(120%_100%_at_16%_10%,rgba(79,122,46,0.34),transparent_55%),radial-gradient(95%_95%_at_88%_90%,rgba(47,125,255,0.28),transparent_60%),linear-gradient(160deg,rgba(4,8,14,0.88),rgba(4,8,14,0.93))] p-4 sm:p-6">
          <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-5 lg:grid-cols-12">
            <div className="space-y-3.5 lg:col-span-7">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#8fc44a]/40 bg-[#4f7a2e]/20 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.18em] text-[#8fc44a]">
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  <span>LEXICARD · VÒNG LẶP VÔ HẠN</span>
                </div>

                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? 'Thu nhỏ màn hình' : 'Toàn màn hình'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-[#f4efe2] hover:border-[#39e0ff] cursor-pointer"
                >
                  {expanded ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div>
                <h2 className="font-display text-3xl font-black tracking-tight text-[#f4efe2] sm:text-5xl">
                  HÚC <span className="text-[#ffc21f]">CỔNG 3D</span>
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[#cbd8e2] sm:text-sm">
                  Lái xe tăng <strong className="text-[#c6ff3d]">390</strong> trên
                  đường thẳng húc cổng mang nghĩa đúng của bộ thẻ{' '}
                  <strong className="text-white">{deckTitle}</strong>. Không giới
                  hạn thời gian — luyện lặp toàn bộ flashcard và lưu điểm khi xong.
                </p>
              </div>

              <div>
                <div className="mb-1.5 text-[10px] font-extrabold tracking-[0.18em] text-[#9fb0bf]">
                  ĐÁP ÁN HIỂN THỊ TRÊN CỔNG
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      dirRef.current = 'term_to_meaning';
                      setDirection('term_to_meaning');
                      audioRef.current?.resume();
                      audioRef.current?.swap();
                    }}
                    className={`rounded-xl border px-3 py-2 text-left transition cursor-pointer ${
                      direction === 'term_to_meaning'
                        ? 'border-[#39e0ff] bg-[#2f7dff]/35 text-white'
                        : 'border-white/15 bg-[#0c1522]/85 text-[#cbd8e2] hover:border-[#39e0ff]/50'
                    }`}
                  >
                    <div className="text-xs font-extrabold">Từ → Nghĩa</div>
                    <div className="text-[10px] text-[#9fb0bf]">
                      Húc cổng nghĩa đúng
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      dirRef.current = 'meaning_to_term';
                      setDirection('meaning_to_term');
                      audioRef.current?.resume();
                      audioRef.current?.swap();
                    }}
                    className={`rounded-xl border px-3 py-2 text-left transition cursor-pointer ${
                      direction === 'meaning_to_term'
                        ? 'border-[#39e0ff] bg-[#2f7dff]/35 text-white'
                        : 'border-white/15 bg-[#0c1522]/85 text-[#cbd8e2] hover:border-[#39e0ff]/50'
                    }`}
                  >
                    <div className="text-xs font-extrabold">Nghĩa → Từ</div>
                    <div className="text-[10px] text-[#9fb0bf]">
                      Húc cổng từ vựng đúng
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[10px] font-extrabold tracking-[0.18em] text-[#9fb0bf]">
                  TỐC ĐỘ CHẠY
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'normal', 'hard'] as const).map((k) => {
                    const cfg = DIFF[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleSelectDiff(k)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition cursor-pointer ${
                          diffKey === k
                            ? 'border-[#c6ff3d] bg-[#4f7a2e]/50 text-white'
                            : 'border-white/15 bg-[#0c1522]/85 text-[#cbd8e2] hover:border-[#c6ff3d]/50'
                        }`}
                      >
                        <div className="text-xs font-extrabold uppercase">
                          {cfg.label}
                        </div>
                        <div className="text-[10px] text-[#9fb0bf]">
                          {cfg.speedDesc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleStart}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#c6ff3d] via-[#8fc44a] to-[#5fae2f] px-6 py-3 text-sm font-black tracking-wider text-[#0a1408] shadow-lg transition hover:brightness-105 active:scale-95 cursor-pointer"
                >
                  <span>BẮT ĐẦU LUYỆN</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                    <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                      KỶ LỤC
                    </div>
                    <div className="font-mono-tabular text-base font-extrabold text-[#ffc21f]">
                      {Math.max(localBest, bestScore)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                    <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                      COMBO MAX
                    </div>
                    <div className="font-mono-tabular text-base font-extrabold text-[#39e0ff]">
                      {localBestCombo}
                    </div>
                  </div>
                  <div className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 sm:block">
                    <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                      SỐ THẺ
                    </div>
                    <div className="font-mono-tabular text-base font-extrabold text-white">
                      {cards.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/15 bg-[#0c1522]/90 p-4 shadow-xl lg:col-span-5">
              <div className="text-[11px] font-extrabold tracking-[0.18em] text-[#ffc21f]">
                CÁCH CHƠI
              </div>
              <ul className="mt-3 space-y-2.5 text-xs text-[#cbd8e2]">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                    ◀ ▶
                  </span>
                  <span>
                    <strong className="text-white">Mobile</strong>: Bấm nút Trái / Phải.{' '}
                    <strong className="text-white">PC</strong>: Kéo chuột sang trái / phải trên đường thẳng (hoặc{' '}
                    <strong className="text-white">A / D</strong>).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-[#ffc21f] px-1.5 py-0.5 text-[10px] font-extrabold text-[#3a2600]">
                    DRIFT
                  </span>
                  <span>
                    Đánh lái nhanh & tích <strong className="text-white">Nitro</strong>. Phím{' '}
                    <strong className="text-white">Shift</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-[#39e0ff] px-1.5 py-0.5 text-[10px] font-extrabold text-[#04121f]">
                    NITRO
                  </span>
                  <span>
                    Bứt tốc; húc đúng lúc đang Nitro được{' '}
                    <strong className="text-[#39e0ff]">+60 điểm</strong>. Phím{' '}
                    <strong className="text-white">Space</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-[#3ddc84] px-1.5 py-0.5 text-[10px] font-extrabold text-[#04220f]">
                    VÔ HẠN
                  </span>
                  <span>
                    Luyện lặp liên tục từ vựng trong bộ thẻ, không giới hạn thời gian. Bấm <strong className="text-white">Kết thúc & Lưu</strong> bất cứ lúc nào.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex shrink-0 items-center rounded-md bg-[#a9f2ff] px-1.5 py-0.5 text-[10px] font-extrabold text-[#04222b]">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span>
                    Nhặt tinh thể xanh trên đường:{' '}
                    <strong className="text-white">+Nitro, +25 điểm</strong>.
                  </span>
                </li>
              </ul>

              <div className="mt-3.5 flex items-center justify-center gap-2.5 rounded-xl border border-dashed border-[#ffc21f]/45 bg-gradient-to-r from-[#4f7a2e]/30 to-[#2f7dff]/25 px-3 py-2.5 text-center">
                <span className="font-display text-sm font-extrabold text-white">
                  {samplePreview.q}
                </span>
                <span className="font-bold text-[#ffc21f]">→</span>
                <span className="text-sm font-extrabold text-[#c6ff3d]">
                  {samplePreview.a}
                </span>
              </div>
            </aside>
          </div>
        </div>
      )}

      {screenMode === 'pause' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#04080e]/85 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0c1522] p-6 text-center shadow-2xl">
            <h3 className="font-display text-2xl font-black text-white">
              TẠM DỪNG
            </h3>
            <p className="mt-1 text-xs text-[#9fb0bf]">
              Xe tăng 390 đang chờ lệnh xuất kích tiếp.
            </p>

            <div className="mt-4">
              <div className="mb-1.5 text-[10px] font-extrabold tracking-widest text-[#9fb0bf]">
                ĐỔI CHIỀU ĐÁP ÁN CỔNG
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    dirRef.current = 'term_to_meaning';
                    setDirection('term_to_meaning');
                    simRef.current?.relabelGates();
                    audioRef.current?.swap();
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-extrabold cursor-pointer ${
                    direction === 'term_to_meaning'
                      ? 'border-[#39e0ff] bg-[#2f7dff]/35 text-white'
                      : 'border-white/15 bg-white/5 text-[#cbd8e2]'
                  }`}
                >
                  Từ → Nghĩa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dirRef.current = 'meaning_to_term';
                    setDirection('meaning_to_term');
                    simRef.current?.relabelGates();
                    audioRef.current?.swap();
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-extrabold cursor-pointer ${
                    direction === 'meaning_to_term'
                      ? 'border-[#39e0ff] bg-[#2f7dff]/35 text-white'
                      : 'border-white/15 bg-white/5 text-[#cbd8e2]'
                  }`}
                >
                  Nghĩa → Từ
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => simRef.current?.resumeGame()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c6ff3d] to-[#8fc44a] px-4 py-2.5 text-sm font-black text-[#0a1408] cursor-pointer"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>TIẾP TỤC</span>
              </button>
              <button
                type="button"
                onClick={() => simRef.current?.endGame()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[#c6ff3d]/45 bg-[#4f7a2e]/40 px-4 py-2 text-xs font-bold text-[#c6ff3d] hover:bg-[#4f7a2e]/60 cursor-pointer"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>KẾT THÚC & LƯU ĐIỂM</span>
              </button>
              <button
                type="button"
                onClick={() => simRef.current?.startGame()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:border-[#c6ff3d] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>CHƠI LẠI</span>
              </button>
              <button
                type="button"
                onClick={() => simRef.current?.goMenu()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-[#9fb0bf] hover:text-white cursor-pointer"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>VỀ MENU</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {screenMode === 'over' && resultStats && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-[#04080e]/90 p-4 sm:p-6">
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/15 bg-[#0c1522] p-5 shadow-2xl sm:p-6">
            <div className="flex items-center gap-4">
              <div
                className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl border-2 font-display text-3xl font-black shadow-lg ${
                  resultStats.rank === 'S'
                    ? 'border-[#fff0b8] bg-gradient-to-br from-[#ffc21f] to-[#ff8a00] text-[#0a1408]'
                    : resultStats.rank === 'A'
                      ? 'border-[#eaffc0] bg-gradient-to-br from-[#c6ff3d] to-[#8fc44a] text-[#0a1408]'
                      : resultStats.rank === 'B'
                        ? 'border-[#cfe6ff] bg-gradient-to-br from-[#9fd0ff] to-[#2f7dff] text-[#04121f]'
                        : 'border-[#cbd8e2] bg-gradient-to-br from-[#8fa3b3] to-[#4a5c6b] text-[#0a1408]'
                }`}
              >
                {resultStats.rank}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold tracking-[0.18em] text-[#ffc21f]">
                  HOÀN THÀNH LUYỆN TẬP · VÒNG {resultStats.cycles} ·{' '}
                  {DIFF[diffKey].label.toUpperCase()}
                </div>
                <h3 className="font-display text-2xl font-black text-white">
                  {resultStats.title}
                </h3>
                <div className="mt-0.5 text-xs text-[#9fb0bf]">
                  {deckTitle} ·{' '}
                  {isLoggedIn
                    ? resultStats.savedToServer
                      ? 'Đã ghi danh lên Bảng xếp hạng'
                      : 'Đang đồng bộ điểm lên Bảng xếp hạng...'
                    : 'Chế độ Khách (chưa lên BXH)'}
                </div>
              </div>
            </div>

            {!isLoggedIn && onOpenAuth && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ffc21f]/40 bg-[#ffc21f]/10 px-3 py-2 text-xs text-[#fff0b8]">
                <span>Đăng nhập để lưu kỷ lục Xe tăng 3D lên Bảng xếp hạng.</span>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="font-bold text-[#39e0ff] underline cursor-pointer"
                >
                  Đăng nhập ngay
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-[#c6ff3d]/40 bg-gradient-to-br from-[#4f7a2e]/45 to-[#2f7dff]/20 p-3">
                <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                  TỔNG ĐIỂM
                </div>
                <div className="mt-0.5 font-mono-tabular text-2xl font-black text-[#c6ff3d]">
                  {resultStats.finalScore}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                  ĐÚNG
                </div>
                <div className="mt-0.5 font-mono-tabular text-xl font-black text-white">
                  {resultStats.correct}/{resultStats.total}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                  COMBO MAX
                </div>
                <div className="mt-0.5 font-mono-tabular text-xl font-black text-[#39e0ff]">
                  {resultStats.maxCombo}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[9px] font-extrabold tracking-widest text-[#9fb0bf]">
                  CHÍNH XÁC
                </div>
                <div className="mt-0.5 font-mono-tabular text-xl font-black text-white">
                  {resultStats.accuracy}%
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-extrabold tracking-[0.18em] text-[#ffc21f]">
                XEM LẠI TỪ VỰNG ({resultStats.total} CỔNG ĐÃ QUA)
              </div>
              <button
                type="button"
                onClick={() => setOnlyMissFilter((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-extrabold tracking-wider cursor-pointer ${
                  onlyMissFilter
                    ? 'border-[#ffb3b7] bg-[#e8232f] text-white'
                    : 'border-white/15 bg-white/5 text-[#9fb0bf] hover:text-white'
                }`}
              >
                CHỈ TỪ SAI
              </button>
            </div>

            <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {filteredReviewLog.length === 0 ? (
                <div className="rounded-xl bg-white/5 p-3 text-center text-xs text-[#9fb0bf]">
                  {onlyMissFilter
                    ? 'Không có từ sai — quá đỉnh!'
                    : 'Chưa húc được cổng nào — thử lại nhé!'}
                </div>
              ) : (
                filteredReviewLog.map((r, idx) => (
                  <div
                    key={`${r.cardId}_${idx}`}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border-l-4 px-3 py-2 text-xs ${
                      r.ok
                        ? 'border-l-[#3ddc84] bg-white/5'
                        : 'border-l-[#ff3b46] bg-[#ff3b46]/10'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white">{r.question}</div>
                      <div className="text-[11px] text-[#9fb0bf]">
                        Đáp án: <span className="text-[#f4efe2]">{r.answer}</span>
                        {!r.ok && ` · Bạn chọn: ${r.chose}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Phát âm ${r.term}`}
                      onClick={() => speakEnglish(r.term)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[#39e0ff] hover:bg-white/20 cursor-pointer"
                    >
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span
                      className={`font-extrabold ${
                        r.ok ? 'text-[#3ddc84]' : 'text-[#ff3b46]'
                      }`}
                    >
                      {r.ok ? '✓' : '✕'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => simRef.current?.startGame()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c6ff3d] to-[#8fc44a] px-4 py-2 text-xs font-black tracking-wider text-[#0a1408] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>CHƠI LẠI</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next: DirectionMode =
                    direction === 'term_to_meaning'
                      ? 'meaning_to_term'
                      : 'term_to_meaning';
                  dirRef.current = next;
                  setDirection(next);
                  simRef.current?.startGame();
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-extrabold text-[#39e0ff] hover:border-[#39e0ff] cursor-pointer"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  ĐỔI SANG{' '}
                  {direction === 'term_to_meaning'
                    ? 'NGHĨA → TỪ'
                    : 'TỪ → NGHĨA'}
                </span>
              </button>

              {onViewLeaderboard ? (
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    onViewLeaderboard();
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2 text-xs font-extrabold text-amber-300 hover:bg-amber-400/20 cursor-pointer"
                >
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>XEM BXH</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinishToSummary}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                >
                  <span>TỔNG KẾT</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
