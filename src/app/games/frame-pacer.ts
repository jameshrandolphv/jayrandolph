/** Frames further apart than this (a hidden tab, a long freeze) are passed through rather than smoothed. */
const RESET_MS = 200;
const SAMPLES = 30;
const MIN_SAMPLES = 8;
/** Share of the outstanding backlog repaid on each frame. */
const CATCH_UP = 0.15;

/**
 * Evens out the time handed to the simulation. iOS Safari holds back one frame after every touch and then
 * delivers the next few in a burst (for example 17, 43, 1, 6 ms apart), but the screen still shows them at
 * regular intervals, so advancing the game by the raw gaps makes it jump and then crawl. This hands out roughly
 * one typical frame per frame instead and works off the extra time gradually, so nothing is lost and a late
 * frame turns into a short pause rather than a lurch.
 */
export class FramePacer {
  private readonly recent: number[] = [];
  /** Real time received but not yet handed out. */
  private owed = 0;

  pace(deltaMs: number): number {
    if (deltaMs > RESET_MS) {
      this.owed = 0;
      this.recent.length = 0;
      return deltaMs;
    }
    this.recent.push(deltaMs);
    if (this.recent.length > SAMPLES) this.recent.shift();
    if (this.recent.length < MIN_SAMPLES) return deltaMs;

    const typical = this.typical();
    this.owed = Math.max(-typical, this.owed + deltaMs);
    const given = Math.min(Math.max(typical + (this.owed - typical) * CATCH_UP, typical * 0.5), typical * 2);
    this.owed -= given;
    return given;
  }

  /** The median gap, which a few late frames can't drag around. */
  private typical(): number {
    const sorted = [...this.recent].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  }
}
