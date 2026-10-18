import { PITCH_SLOW, PLAY_SPEED, TICK_HZ } from './constants';
import { flyBall } from './flight';
import { computerPitch, hitsBatter, inZone, pitchAt, type Pitch, PITCHES } from './pitch';
import { resolvePlay, type Play } from './play';
import { seededRng, type Rng } from './rng';
import {
  applyPitch,
  applyPlay,
  batterId,
  newGame,
  nextHalf,
  userBats,
  type Announcement,
  type GameState,
  type Mode,
} from './rules';
import { USER_WINDOW, computerSwing, contact, type Contact, type Swing } from './swing';
import { BATTING_CAMERA, project, toPlatePlane, type Vec3 } from './camera';

/**
 * title: the menu. help: how to play. ready: the pitcher on the mound before a pitch (you swipe to pitch here).
 * windup: the delivery. pitch: the ball on its way. play: a ball in play. call: the umpire's call or the result on
 * screen. scorecard: between half-innings. over: the end of a game or a single mode.
 */
export type Phase =
  'title' | 'help' | 'ready' | 'windup' | 'pitch' | 'play' | 'call' | 'scorecard' | 'over';

export type SimEvent = 'pitch' | 'mitt' | 'crack' | 'swish' | 'out' | 'safe' | 'cheer' | 'call';

/** How long the computer pitcher stands set before starting his delivery, and the delivery itself (s). */
export const READY_SECONDS = 1.1;
export const WINDUP_SECONDS = 0.75;
/** Your delivery after a pitching swipe is quicker: the swipe was the wind-up. */
export const USER_WINDUP_SECONDS = 0.35;
/** Calls stay on screen this long; big ones longer. */
export const CALL_SECONDS = 1.3;
export const BIG_CALL_SECONDS = 2.2;
/** The ball carries on this far past the plate (fraction of the flight) into the catcher's mitt. */
export const MITT_U = 1.05;

export interface SwingNow {
  /** Game seconds after release when the bat came through. */
  at: number;
  hit: boolean;
}

export class BatOutSim {
  phase: Phase = 'title';
  paused = false;
  state: GameState | null = null;
  /** Seconds in the current phase (game time). */
  time = 0;
  pitch: Pitch | null = null;
  swing: SwingNow | null = null;
  /** The computer batter's swing for the pitch in flight, decided at release. */
  private aiSwing: Swing | null = null;
  /** Your swipe has started a swing on this pitch. */
  committed = false;
  play: Play | null = null;
  /** Real seconds into the play. */
  playTime = 0;
  contact: Contact | null = null;
  announcement: Announcement | null = null;
  /** The last pitch's speed and name, shown after it. */
  pitchLabel: string | null = null;
  /** The game ended with this play; the card follows the call. */
  private callSeconds = CALL_SECONDS;
  private events: SimEvent[] = [];
  private marksDone = 0;
  readonly rng: Rng;

  constructor(rng?: Rng) {
    this.rng = rng ?? seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  }

  get userBatting(): boolean {
    return this.state ? userBats(this.state) : true;
  }

  /** Game seconds since release (negative before it). */
  get pitchClock(): number {
    return this.phase === 'pitch' ? this.time : -1;
  }

  /** Where the pitch is now, or null. */
  pitchBall(): Vec3 | null {
    if (!this.pitch || this.phase !== 'pitch') return null;
    return pitchAt(this.pitch, Math.min(this.time / this.pitch.seconds, MITT_U));
  }

  /**
   * Where the pitch looks to be from the plate `t` game seconds after release, read back onto the plate: the ball you
   * see, which is what a swipe has to go through. Null before release.
   */
  ballSight(t: number): { x: number; z: number } | null {
    if (!this.pitch || t < 0) return null;
    const s = project(
      BATTING_CAMERA,
      pitchAt(this.pitch, Math.min(t / this.pitch.seconds, MITT_U)),
    );
    return s.depth > 0 ? toPlatePlane(BATTING_CAMERA, s.x, s.y) : null;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  start(mode: Mode): void {
    this.state = newGame(mode);
    this.paused = false;
    this.toReady();
  }

  showHelp(): void {
    if (this.phase === 'title') this.phase = 'help';
  }

  toTitle(): void {
    this.phase = 'title';
    this.state = null;
    this.paused = false;
    this.play = null;
    this.pitch = null;
  }

  setPaused(paused: boolean): void {
    if (this.state && this.phase !== 'over' && this.phase !== 'scorecard') this.paused = paused;
  }

  /** Leaves the scorecard for the next half-inning. */
  continueGame(): void {
    if (this.phase !== 'scorecard' || !this.state) return;
    nextHalf(this.state);
    this.toReady();
  }

  /** You let go of a pitching swipe: the pitcher delivers it. */
  throwPitch(pitch: Pitch): void {
    if (this.phase !== 'ready' || this.userBatting || this.paused) return;
    this.pitch = pitch;
    this.enter('windup');
  }

  /** Your swipe got going: it is a swing now, whether or not it meets the ball. */
  commitSwing(): void {
    if (this.phase === 'pitch' && this.userBatting && !this.committed && !this.swing)
      this.committed = true;
  }

  /**
   * Your bat crossed the pitch's line `at` game seconds after release, `dz` ft under the ball, with this lift and
   * power. Contact starts the play straight away; a miss waits for the ball to reach the mitt.
   */
  userSwing(at: number, dz: number, lift: number, power: number): void {
    if (this.phase !== 'pitch' || !this.userBatting || this.swing || !this.pitch || this.paused)
      return;
    this.committed = true;
    const swing: Swing = { dt: (at - this.pitch.seconds) / PITCH_SLOW, dz, lift, power };
    const c = contact(swing, this.pitch, this.rng, USER_WINDOW);
    this.swing = { at: Math.min(at, this.time), hit: c !== null };
    this.events.push(c ? 'crack' : 'swish');
    if (c) this.startPlay(c);
  }

  step(): void {
    if (this.paused || this.phase === 'title' || this.phase === 'help' || !this.state) return;
    const dt = 1 / TICK_HZ;
    this.time += dt;
    switch (this.phase) {
      case 'ready':
        if (this.userBatting && this.time >= READY_SECONDS) {
          this.pitch = computerPitch(this.state, this.rng);
          this.enter('windup');
        }
        break;
      case 'windup':
        if (this.time >= (this.userBatting ? WINDUP_SECONDS : USER_WINDUP_SECONDS)) this.release();
        break;
      case 'pitch':
        this.stepPitch();
        break;
      case 'play':
        this.playTime += dt * PLAY_SPEED;
        this.stepPlay();
        break;
      case 'call':
        if (this.time >= this.callSeconds) this.afterCall();
        break;
      default:
        break;
    }
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.time = 0;
  }

  private toReady(): void {
    this.pitch = null;
    this.swing = null;
    this.aiSwing = null;
    this.committed = false;
    this.play = null;
    this.contact = null;
    this.announcement = null;
    this.enter('ready');
  }

  private release(): void {
    const pitch = this.pitch!;
    this.events.push('pitch');
    this.pitchLabel = `${Math.round(pitch.mph)} MPH ${PITCHES[pitch.type].name.toUpperCase()}`;
    if (!this.userBatting) this.aiSwing = computerSwing(pitch, this.state!, this.rng);
    this.enter('pitch');
  }

  private stepPitch(): void {
    const pitch = this.pitch!;
    const ai = this.aiSwing;
    if (ai && !this.swing) {
      const at = pitch.seconds + ai.dt * PITCH_SLOW;
      if (this.time >= at) {
        const c = contact(ai, pitch, this.rng);
        this.swing = { at, hit: c !== null };
        this.events.push(c ? 'crack' : 'swish');
        if (c) {
          this.startPlay(c);
          return;
        }
      }
    }
    // A late swing can still meet it just behind the plate, so the pitch isn't over until that chance has gone.
    if (
      this.time <
      Math.max(pitch.seconds * MITT_U, pitch.seconds + USER_WINDOW.time * PITCH_SLOW + 0.05)
    )
      return;
    this.events.push('mitt');
    const swung = this.swing !== null || this.committed;
    const outcome = swung
      ? 'swingingStrike'
      : hitsBatter(pitch.end)
        ? 'hitByPitch'
        : inZone(pitch.end)
          ? 'calledStrike'
          : 'ball';
    this.announce(applyPitch(this.state!, outcome));
  }

  private startPlay(c: Contact): void {
    const s = this.state!;
    this.contact = c;
    this.play = resolvePlay(
      flyBall(c),
      c,
      { outs: s.outs, bases: s.bases, batter: batterId(s) },
      this.rng,
    );
    this.playTime = 0;
    this.marksDone = 0;
    this.enter('play');
  }

  private stepPlay(): void {
    const play = this.play!;
    while (this.marksDone < play.marks.length && play.marks[this.marksDone].t <= this.playTime) {
      this.events.push(play.marks[this.marksDone].text === 'OUT' ? 'out' : 'safe');
      this.marksDone++;
    }
    if (this.playTime < play.duration) return;
    const s = this.state!;
    if (play.result.call === 'foul') this.announce(applyPitch(s, 'foul'));
    else this.announce(applyPlay(s, play.result));
  }

  private announce(a: Announcement): void {
    this.announcement = a;
    this.callSeconds = a.big ? BIG_CALL_SECONDS : CALL_SECONDS;
    this.events.push(a.big ? 'cheer' : 'call');
    this.enter('call');
  }

  private afterCall(): void {
    const s = this.state!;
    if (s.over) {
      this.enter('over');
      return;
    }
    if (this.announcement?.sideRetired) {
      this.enter('scorecard');
      return;
    }
    this.toReady();
  }
}
