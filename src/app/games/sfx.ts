import type { SoundSettings } from '../core/sound-settings';

export type SfxName = 'flap' | 'score' | 'hit' | 'fall' | 'click' | 'checkpoint' | 'clear';

interface Tone {
  from: number;
  to: number;
  seconds: number;
  type: OscillatorType;
  volume: number;
  delay?: number;
}

const TONES: Readonly<Record<SfxName, readonly Tone[]>> = {
  flap: [{ from: 330, to: 620, seconds: 0.09, type: 'square', volume: 0.05 }],
  score: [
    { from: 988, to: 988, seconds: 0.06, type: 'square', volume: 0.05 },
    { from: 1319, to: 1319, seconds: 0.12, type: 'square', volume: 0.05, delay: 0.06 },
  ],
  hit: [{ from: 220, to: 50, seconds: 0.16, type: 'sawtooth', volume: 0.08 }],
  fall: [{ from: 420, to: 90, seconds: 0.4, type: 'triangle', volume: 0.08 }],
  click: [{ from: 700, to: 700, seconds: 0.05, type: 'square', volume: 0.04 }],
  checkpoint: [
    { from: 523, to: 523, seconds: 0.07, type: 'triangle', volume: 0.07 },
    { from: 784, to: 784, seconds: 0.12, type: 'triangle', volume: 0.07, delay: 0.07 },
  ],
  clear: [
    { from: 523, to: 523, seconds: 0.08, type: 'square', volume: 0.05 },
    { from: 659, to: 659, seconds: 0.08, type: 'square', volume: 0.05, delay: 0.08 },
    { from: 784, to: 784, seconds: 0.08, type: 'square', volume: 0.05, delay: 0.16 },
    { from: 1047, to: 1047, seconds: 0.2, type: 'square', volume: 0.05, delay: 0.24 },
  ],
};

const NAMES = Object.keys(TONES) as SfxName[];
/** Room after the last tone so its release isn't cut off. */
const TAIL_SECONDS = 0.03;

const renderTones = (ctx: BaseAudioContext, tones: readonly Tone[]): void => {
  for (const tone of tones) {
    const start = tone.delay ?? 0;
    const end = start + tone.seconds;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(tone.to, 1), end);
    gain.gain.setValueAtTime(tone.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
};

/**
 * Synthesised effects, so games need no audio assets. Each effect is rendered once into a buffer, so
 * playing one on a tap costs a single source node instead of building an oscillator graph mid-frame.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<SfxName, AudioBuffer>();

  constructor(private readonly settings: Pick<SoundSettings, 'muted'>) {}

  /** Browsers only allow audio after a user gesture, so call this from an input handler. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      void this.prepare(this.ctx);
    }
    // iOS reports 'interrupted' as well as 'suspended'; only a running context can be left alone.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => undefined);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || this.settings.muted() || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
  }

  private async prepare(ctx: AudioContext): Promise<void> {
    const rate = ctx.sampleRate;
    try {
      for (const name of NAMES) {
        const tones = TONES[name];
        const seconds = Math.max(...tones.map((t) => (t.delay ?? 0) + t.seconds)) + TAIL_SECONDS;
        const offline = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
        renderTones(offline, tones);
        const buffer = await offline.startRendering();
        if (this.ctx !== ctx) return;
        this.buffers.set(name, buffer);
      }
    } catch {
      // Without offline rendering the game just stays silent.
    }
  }
}
