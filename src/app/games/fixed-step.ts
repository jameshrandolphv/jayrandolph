/** Runs simulation ticks at a constant rate regardless of the display's frame rate. */
export class FixedStep {
  private accumulator = 0;

  constructor(
    private readonly stepMs = 1000 / 60,
    /** Longest frame honoured, so a backgrounded tab doesn't replay a burst of ticks. */
    private readonly maxFrameMs = 100,
    /** Frames this close to a whole or half tick are treated as exact. */
    private readonly snapMs = 1.2,
  ) {}

  /** How far the next tick is toward happening, 0 to 1; renderers blend the last two states by this. */
  get alpha(): number {
    return this.accumulator / this.stepMs;
  }

  advance(frameMs: number, tick: () => void): void {
    this.accumulator += this.snap(Math.min(frameMs, this.maxFrameMs));
    while (this.accumulator >= this.stepMs) {
      this.accumulator -= this.stepMs;
      tick();
    }
  }

  /**
   * Display refresh is rarely exactly the tick rate, so on a 60 Hz screen the leftover time wanders around
   * zero. Each time it wraps, a frame runs no tick (or two) and the render stalls then jumps. Snapping
   * near-exact frame times keeps the leftover constant, so every frame advances evenly.
   */
  private snap(frameMs: number): number {
    for (const ratio of [0.5, 1, 2, 3, 4]) {
      const exact = this.stepMs * ratio;
      if (Math.abs(frameMs - exact) <= this.snapMs) return exact;
    }
    return frameMs;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
