import { FixedStep } from '../../games/fixed-step';
import type { LogicalSize } from '../../games/game-canvas';
import type { ScoreResult, ScoreStore } from '../../games/score.service';
import type { Sfx, SfxName } from '../../games/sfx';
import { BATTING_CAMERA, PITCHING_CAMERA, toPlatePlane } from './camera';
import {
  AGAIN_BUTTON,
  BACK_BUTTON,
  CONTINUE_BUTTON,
  HELP_BUTTON,
  MENU_BUTTON,
  MODE_BUTTONS,
  QUIT_BUTTON,
  RESUME_BUTTON,
  inButton,
  pauseButton,
  type Bounds,
} from './layout';
import type { Mode } from './rules';
import { BatOutSim, type SimEvent } from './sim';
import { USER_WINDOW } from './swing';
import { pitchFromRead, readPitchSwipe, readSwing, SWING_MIN, type TracePoint } from './swipe';

export const HITTING_ID = 'bat-out-hitting';
export const PITCHING_ID = 'bat-out-pitching';

const SOUNDS: Readonly<Record<SimEvent, SfxName | null>> = {
  pitch: 'flap',
  mitt: 'mitt',
  crack: 'crack',
  swish: 'swish',
  out: 'click',
  safe: 'pick',
  cheer: 'clear',
  call: null,
};

/** Swipe points are kept this long (ms) for the trail drawn behind your finger. */
const TRAIL_MS = 260;

/** Connects input, the simulation, sound and the high scores; knows nothing about rendering. */
export class BatOutGame {
  readonly sim: BatOutSim;
  result: ScoreResult | null = null;
  best = { hitting: 0, pitching: 0 };
  size: LogicalSize = { width: 180, height: 320 };
  bounds: Bounds = { left: 0, top: 0, right: 180, bottom: 320 };
  /** The current swipe, about the middle of the screen; `t` is ms for pitching, game seconds for batting. */
  trace: TracePoint[] = [];
  /** Recent finger positions with their wall-clock time (ms), for the trail. */
  trail: TracePoint[] = [];

  private readonly step = new FixedStep();
  private pointer: number | null = null;
  private clock = 0;
  private run = 0;

  constructor(
    private readonly scores: ScoreStore,
    private readonly sfx: Sfx,
    rng?: () => number,
  ) {
    this.sim = new BatOutSim(rng);
    void scores
      .getBest(HITTING_ID)
      .then((b) => (this.best.hitting = Math.max(this.best.hitting, b)));
    void scores
      .getBest(PITCHING_ID)
      .then((b) => (this.best.pitching = Math.max(this.best.pitching, b)));
  }

  frame(deltaMs: number): number {
    this.clock += deltaMs;
    this.step.advance(deltaMs, () => {
      const before = this.sim.phase;
      this.sim.step();
      if (before !== 'over' && this.sim.phase === 'over') this.saveScore();
    });
    for (const event of this.sim.drainEvents()) {
      const name = SOUNDS[event];
      if (name) this.sfx.play(name);
    }
    this.trail = this.trail.filter((p) => this.clock - p.t < TRAIL_MS);
    return this.step.alpha;
  }

  /** Converts a pointer in logical px to coordinates about the middle of the screen. */
  private centred(x: number, y: number): { x: number; y: number } {
    return { x: x - this.size.width / 2, y: y - this.size.height / 2 };
  }

  pointerDown(pointer: number, lx: number, ly: number, ms = this.clock): void {
    this.sfx.unlock();
    const { x, y } = this.centred(lx, ly);
    const { sim } = this;
    switch (sim.phase) {
      case 'title': {
        const mode = MODE_BUTTONS.find((b) => inButton(b, x, y));
        if (mode) this.start(mode.mode);
        else if (inButton(HELP_BUTTON, x, y)) {
          this.sfx.play('click');
          sim.showHelp();
        }
        return;
      }
      case 'help':
        if (inButton(BACK_BUTTON, x, y)) this.toTitle();
        return;
      case 'scorecard':
        if (inButton(CONTINUE_BUTTON, x, y)) {
          this.sfx.play('click');
          sim.continueGame();
        }
        return;
      case 'over':
        if (inButton(AGAIN_BUTTON, x, y) && sim.state) this.start(sim.state.mode);
        else if (inButton(MENU_BUTTON, x, y)) this.toTitle();
        return;
      default:
        break;
    }
    if (sim.paused) {
      if (inButton(RESUME_BUTTON, x, y)) this.togglePause();
      else if (inButton(QUIT_BUTTON, x, y)) this.toTitle();
      return;
    }
    if (inButton(pauseButton(this.bounds, this.size.width, this.size.height), x, y)) {
      this.togglePause();
      return;
    }
    this.pointer = pointer;
    this.trace = [];
    this.addPoint(x, y, ms);
  }

  /** `ms` is when the event happened, which times a pitching swipe more finely than the frames do. */
  pointerMove(pointer: number, lx: number, ly: number, ms = this.clock): void {
    if (pointer !== this.pointer) return;
    const { x, y } = this.centred(lx, ly);
    this.addPoint(x, y, ms);
    const { sim } = this;
    if (!sim.userBatting || sim.phase !== 'pitch' || sim.swing || !sim.pitch) return;
    // Only the part of the swipe made while the ball is on its way counts.
    const live = this.trace.filter((p) => p.t >= 0);
    let len = 0;
    for (let i = 1; i < live.length; i++)
      len += Math.hypot(live[i].x - live[i - 1].x, live[i].y - live[i - 1].y);
    if (len >= SWING_MIN) sim.commitSwing();
    const read = readSwing(
      live,
      (sx, sy) => toPlatePlane(BATTING_CAMERA, sx, sy),
      (t) => sim.ballSight(t),
      USER_WINDOW.height,
    );
    if (read) sim.userSwing(read.t, read.dz, read.lift, read.power);
  }

  pointerUp(pointer: number, ms = this.clock): void {
    if (pointer !== this.pointer) return;
    this.pointer = null;
    const { sim } = this;
    if (sim.phase === 'ready' && !sim.userBatting && !sim.paused) {
      // Lifting the finger ends the swipe where it last was, at this time: a long rest there is a knuckleball.
      const last = this.trace[this.trace.length - 1];
      if (last) this.trace.push({ ...last, t: ms });
      const read = readPitchSwipe(this.trace);
      if (read)
        sim.throwPitch(
          pitchFromRead(read, (sx, sy) => toPlatePlane(PITCHING_CAMERA, sx, sy), sim.rng),
        );
    }
    this.trace = [];
  }

  private addPoint(x: number, y: number, ms: number): void {
    // Batting swipes are timed against the pitch; pitching swipes in ms of their own.
    const { sim } = this;
    const t = sim.userBatting ? sim.pitchClock : ms;
    this.trace.push({ x, y, t });
    this.trail.push({ x, y, t: this.clock });
  }

  /** Enter or Space: the main button of whatever is on screen. */
  primary(): void {
    this.sfx.unlock();
    const { sim } = this;
    if (sim.phase === 'scorecard') sim.continueGame();
    else if (sim.phase === 'over' && sim.state) this.start(sim.state.mode);
    else if (sim.paused) this.togglePause();
  }

  togglePause(): void {
    if (!this.sim.state || this.sim.phase === 'over' || this.sim.phase === 'scorecard') return;
    this.sfx.play('click');
    this.pointer = null;
    this.sim.setPaused(!this.sim.paused);
  }

  autoPause(): void {
    this.pointer = null;
    this.sim.setPaused(true);
  }

  dispose(): void {
    this.sfx.dispose();
  }

  private start(mode: Mode): void {
    this.sfx.play('click');
    this.result = null;
    this.run++;
    this.sim.start(mode);
  }

  private toTitle(): void {
    this.sfx.play('click');
    this.result = null;
    this.run++;
    this.sim.toTitle();
  }

  /** A turn at bat scores its runs; a turn on the mound its strikeouts. */
  private saveScore(): void {
    const s = this.sim.state;
    if (!s || (s.mode !== 'hitting' && s.mode !== 'pitching')) return;
    const id = s.mode === 'hitting' ? HITTING_ID : PITCHING_ID;
    const score = s.mode === 'hitting' ? s.home.runs : s.strikeouts;
    const run = ++this.run;
    void this.scores.submit(id, score).then((result) => {
      if (s.mode === 'hitting') this.best.hitting = Math.max(this.best.hitting, result.best);
      else this.best.pitching = Math.max(this.best.pitching, result.best);
      if (run === this.run) this.result = result;
    });
  }
}
