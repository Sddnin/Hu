/* WebAudio engine & SFX synthesizer for Húc Cổng 3D (procedural, zero external files) */

export class TankAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private on = true;
  private ready = false;
  private engine: {
    g: GainNode;
    lp: BiquadFilterNode;
    o1: OscillatorNode;
    o2: OscillatorNode;
  } | null = null;

  public init(): void {
    if (this.ready || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
    } catch {
      return;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.85 : 0;
    this.master.connect(ctx.destination);

    const g = ctx.createGain();
    g.gain.value = 0;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 5;

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 58;

    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 29;

    const og = ctx.createGain();
    og.gain.value = 0.5;

    o1.connect(og);
    o2.connect(og);
    og.connect(lp);
    lp.connect(g);
    g.connect(this.master);

    o1.start();
    o2.start();

    this.engine = { g, lp, o1, o2 };
    this.ready = true;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private env(
    node: GainNode,
    t: number,
    a: number,
    d: number,
    peak: number
  ): void {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.25,
    slideTo: number | null = null,
    delay = 0
  ): void {
    if (!this.ready || !this.on || !this.ctx || !this.master) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) {
      o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    }
    o.connect(g);
    g.connect(this.master);
    this.env(g, t, 0.012, dur, vol);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private noise(
    dur: number,
    vol: number,
    f0: number,
    f1: number,
    q = 1.2
  ): void {
    if (!this.ready || !this.on || !this.ctx || !this.master) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    bp.Q.value = q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  public resume(): void {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setOn(v: boolean): void {
    this.on = Boolean(v);
    if (this.ready && this.master && this.engine) {
      const t = this.now();
      this.master.gain.setTargetAtTime(this.on ? 0.85 : 0, t, 0.05);
      if (!this.on) {
        this.engine.g.gain.setTargetAtTime(0, t, 0.05);
      }
    }
  }

  public engineUpdate(r: number, active: boolean, drifting: boolean): void {
    if (!this.ready || !this.engine) return;
    const t = this.now();
    const e = this.engine;
    e.g.gain.setTargetAtTime(active && this.on ? 0.045 + 0.065 * r : 0, t, 0.14);
    e.o1.frequency.setTargetAtTime(50 + 95 * r, t, 0.1);
    e.o2.frequency.setTargetAtTime(25 + 47 * r, t, 0.1);
    e.lp.frequency.setTargetAtTime(400 + 900 * r + (drifting ? 320 : 0), t, 0.12);
  }

  public correct(combo: number): void {
    const base = 523.25;
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone(
        base * Math.pow(2, (s + Math.min(combo, 5) * 2) / 12),
        0.22,
        'triangle',
        0.2,
        null,
        i * 0.055
      );
    });
    this.noise(0.2, 0.14, 1900, 650, 1.4);
  }

  public wrong(): void {
    this.tone(184, 0.34, 'sawtooth', 0.22, 72);
    this.noise(0.4, 0.3, 900, 90, 0.8);
  }

  public crash(): void {
    this.noise(0.5, 0.38, 1500, 80, 0.7);
    this.tone(92, 0.4, 'square', 0.2, 40);
  }

  public nitro(): void {
    this.tone(210, 0.5, 'sawtooth', 0.18, 920);
    this.noise(0.55, 0.18, 300, 3200, 0.9);
  }

  public drift(): void {
    this.noise(0.36, 0.12, 2700, 1400, 3.6);
  }

  public pickup(): void {
    this.tone(880, 0.11, 'square', 0.14);
    this.tone(1320, 0.13, 'square', 0.12, null, 0.07);
  }

  public tick(): void {
    this.tone(1250, 0.06, 'square', 0.11);
  }

  public count(step: number): void {
    this.tone(step === 0 ? 880 : 520, step === 0 ? 0.4 : 0.16, 'triangle', 0.22);
  }

  public win(): void {
    [0, 4, 7, 12, 16, 19].forEach((s, i) => {
      this.tone(
        392 * Math.pow(2, s / 12),
        0.3,
        'triangle',
        0.18,
        null,
        i * 0.09
      );
    });
  }

  public lose(): void {
    [0, -2, -5, -9].forEach((s, i) => {
      this.tone(
        330 * Math.pow(2, s / 12),
        0.4,
        'sawtooth',
        0.16,
        null,
        i * 0.14
      );
    });
  }

  public ui(): void {
    this.tone(660, 0.07, 'square', 0.1);
  }

  public swap(): void {
    this.tone(520, 0.08, 'triangle', 0.12);
    this.tone(780, 0.1, 'triangle', 0.1, null, 0.06);
  }

  public dispose(): void {
    try {
      if (this.engine) {
        this.engine.o1.stop();
        this.engine.o2.stop();
      }
    } catch {
      // ignore already stopped
    }
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.ready = false;
  }
}
