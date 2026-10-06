/** Runs simulation ticks at a constant rate regardless of the display's frame rate. */
export class FixedStep {
  private accumulator = 0;

  constructor(
    private readonly stepMs = 1000 / 60,
    /** Longest frame honoured, so a backgrounded tab doesn't replay a burst of ticks. */
    private readonly maxFrameMs = 100,
  ) {}

  advance(frameMs: number, tick: () => void): void {
    this.accumulator += Math.min(frameMs, this.maxFrameMs);
    while (this.accumulator >= this.stepMs) {
      this.accumulator -= this.stepMs;
      tick();
    }
  }

  reset(): void {
    this.accumulator = 0;
  }
}
