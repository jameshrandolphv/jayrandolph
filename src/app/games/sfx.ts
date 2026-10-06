export type SfxName = 'flap' | 'score' | 'hit' | 'fall' | 'click';

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
};

/** Synthesised effects, so games need no audio assets. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  /** Browsers only allow audio after a user gesture, so call this from an input handler. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    for (const tone of TONES[name]) {
      const start = ctx.currentTime + (tone.delay ?? 0);
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
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
