import { describe, expect, it } from 'vitest';
import { BATTING_CAMERA, PITCHING_CAMERA, project, toPlatePlane, vec } from './camera';
import { BASES, PITCH_SLOW, RELEASE } from './constants';
import { flyBall } from './flight';
import { computerPitch, hitsBatter, inZone, makePitch, pitchAt, PITCHES } from './pitch';
import { resolvePlay, type Bases } from './play';
import { seededRng } from './rng';
import { applyPitch, applyPlay, newGame, nextHalf } from './rules';
import { BatOutSim } from './sim';
import { computerSwing, contact, HEIGHT_WINDOW, TIMING_WINDOW, USER_WINDOW } from './swing';
import { readPitchSwipe, readSwing, type TracePoint } from './swipe';

/** A swipe through points [x, y, ms]. */
const swipe = (pts: [number, number, number][]): TracePoint[] =>
  pts.map(([x, y, t]) => ({ x, y, t }));

describe('camera', () => {
  it('reads a point on screen back onto the plate', () => {
    for (const cam of [BATTING_CAMERA, PITCHING_CAMERA]) {
      for (const [x, z] of [
        [0, 2.5],
        [0.6, 1.7],
        [-0.8, 3.3],
      ]) {
        const s = project(cam, vec(x, 0, z));
        const back = toPlatePlane(cam, s.x, s.y)!;
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.z).toBeCloseTo(z, 6);
      }
    }
  });

  it('puts the plate low and the mound high from behind the batter', () => {
    expect(project(BATTING_CAMERA, vec(0, 0)).y).toBeGreaterThan(80);
    expect(project(BATTING_CAMERA, vec(0, 60.5)).y).toBeLessThan(0);
  });
});

describe('pitches', () => {
  it('leave the hand at the release point and end where they were going', () => {
    const rng = seededRng(1);
    for (const type of Object.keys(PITCHES) as (keyof typeof PITCHES)[]) {
      const p = makePitch(type, 90, { x: 0.3, z: 2.2 }, rng, 0);
      const start = pitchAt(p, 0);
      expect(start.y).toBeCloseTo(RELEASE.y);
      expect(start.z).toBeCloseTo(RELEASE.z);
      const end = pitchAt(p, 1);
      expect(end.y).toBeCloseTo(0);
      expect(end.x).toBeCloseTo(0.3);
      expect(end.z).toBeCloseTo(2.2);
    }
  });

  it('break late: a curveball is above its final height most of the way in', () => {
    const p = makePitch('curveball', 78, { x: 0, z: 2 }, seededRng(2), 0);
    expect(pitchAt(p, 0.6).z).toBeGreaterThan(2.6);
  });

  it('call strikes over the plate and hit batters standing inside', () => {
    expect(inZone({ x: 0, z: 2.5 })).toBe(true);
    expect(inZone({ x: 1.2, z: 2.5 })).toBe(false);
    expect(inZone({ x: 0, z: 1 })).toBe(false);
    expect(hitsBatter({ x: -2, z: 3 })).toBe(true);
    expect(hitsBatter({ x: 2, z: 3 })).toBe(false);
  });

  it('from the computer stay within each pitch’s speeds', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 300; i++) {
      const p = computerPitch({ balls: i % 4, strikes: i % 3 }, rng);
      const [lo, hi] = PITCHES[p.type].mph;
      expect(p.mph).toBeGreaterThanOrEqual(lo);
      expect(p.mph).toBeLessThanOrEqual(hi);
    }
  });
});

describe('pitching swipes', () => {
  it('read a fast straight flick as a fastball and a slow one as a changeup', () => {
    expect(
      readPitchSwipe(
        swipe([
          [0, 90, 0],
          [0, 40, 25],
          [0, -10, 50],
          [0, -60, 75],
        ]),
      )?.type,
    ).toBe('fastball');
    expect(
      readPitchSwipe(
        swipe([
          [0, 90, 0],
          [0, 40, 200],
          [0, -10, 400],
          [0, -60, 600],
        ]),
      )?.type,
    ).toBe('changeup');
  });

  it('read a hooked end as a slider, a harder hook as a curveball, and which way it hooks', () => {
    const slider = readPitchSwipe(
      swipe([
        [0, 90, 0],
        [0, 30, 30],
        [0, -30, 60],
        [0, -50, 70],
        [8, -62, 80],
      ]),
    );
    expect(slider?.type).toBe('slider');
    expect(slider?.hook).toBe(1);
    const curve = readPitchSwipe(
      swipe([
        [0, 90, 0],
        [0, 30, 30],
        [0, -30, 60],
        [0, -50, 70],
        [-25, -55, 90],
      ]),
    );
    expect(curve?.type).toBe('curveball');
    expect(curve?.hook).toBe(-1);
  });

  it('read flicking back down as a sinker and stopping dead as a knuckleball', () => {
    expect(
      readPitchSwipe(
        swipe([
          [0, 90, 0],
          [0, 20, 30],
          [0, -50, 60],
          [0, -60, 70],
          [0, -30, 90],
        ]),
      )?.type,
    ).toBe('sinker');
    expect(
      readPitchSwipe(
        swipe([
          [0, 90, 0],
          [0, 20, 40],
          [0, -50, 80],
          [0, -60, 90],
          [0, -60, 300],
        ]),
      )?.type,
    ).toBe('knuckleball');
  });

  it('ignore taps and swipes down', () => {
    expect(
      readPitchSwipe(
        swipe([
          [0, 0, 0],
          [2, 1, 30],
        ]),
      ),
    ).toBeNull();
    expect(
      readPitchSwipe(
        swipe([
          [0, -60, 0],
          [0, 0, 30],
          [0, 60, 60],
        ]),
      ),
    ).toBeNull();
  });
});

describe('swings', () => {
  const pitch = makePitch('fastball', 94, { x: 0, z: 2.5 }, seededRng(4), 0);
  const toPlate = (x: number, y: number) => toPlatePlane(BATTING_CAMERA, x, y);

  it('time the bat where the swipe crosses the line of the pitch', () => {
    const at = project(BATTING_CAMERA, vec(0, 0, 2.5));
    const read = readSwing(
      swipe([
        [at.x - 30, at.y + 4, 1.0],
        [at.x - 10, at.y + 1, 1.01],
        [at.x + 10, at.y - 1, 1.02],
        [at.x + 30, at.y - 4, 1.03],
      ]),
      toPlate,
      () => pitch.end,
    )!;
    expect(read.t).toBeCloseTo(1.015, 3);
    expect(Math.abs(read.dz)).toBeLessThan(0.05);
    expect(read.lift).toBeGreaterThan(0);
  });

  it('meet the ball where you see it, even a little early', () => {
    // Swiping straight across the ball as it appears a beat before it reaches the plate.
    const sim = new BatOutSim(seededRng(9));
    sim.start('hitting');
    while (sim.phase !== 'pitch') sim.step();
    const p = sim.pitch!;
    const t = p.seconds - 0.1;
    const seen = project(BATTING_CAMERA, pitchAt(p, t / p.seconds));
    const read = readSwing(
      swipe([
        [seen.x - 40, seen.y, t - 0.02],
        [seen.x - 10, seen.y, t - 0.005],
        [seen.x + 10, seen.y, t + 0.005],
        [seen.x + 40, seen.y, t + 0.02],
      ]),
      toPlate,
      (time) => sim.ballSight(time),
    )!;
    expect(Math.abs(read.dz)).toBeLessThan(0.1);
    // Against where the pitch ends, the same swipe would have gone well over it.
    expect(toPlate(seen.x, seen.y)!.z - p.end.z).toBeGreaterThan(0.3);
    expect(
      contact(
        { dt: (read.t - p.seconds) / PITCH_SLOW, dz: read.dz, lift: 0, power: 1 },
        p,
        seededRng(1),
        USER_WINDOW,
      ),
    ).not.toBeNull();
  });

  it('meet the ball with the width of the bat when the swipe stops short of it', () => {
    const at = project(BATTING_CAMERA, vec(0, 0, 2.5));
    const px = project(BATTING_CAMERA, vec(0, 0, 2.5)).scale;
    const short = swipe([
      [at.x - 60, at.y, 1.0],
      [at.x - 0.2 * px, at.y, 1.02],
    ]);
    expect(readSwing(short, toPlate, () => pitch.end)).toBeNull();
    expect(readSwing(short, toPlate, () => pitch.end, USER_WINDOW.height)).not.toBeNull();
  });

  it('give you a wider window than the computer', () => {
    const rng = seededRng(5);
    const swing = { dt: TIMING_WINDOW * 1.2, dz: HEIGHT_WINDOW * 1.3, lift: 0, power: 1 };
    expect(contact(swing, pitch, rng)).toBeNull();
    expect(contact(swing, pitch, rng, USER_WINDOW)).not.toBeNull();
  });

  it('miss outside the timing and height windows', () => {
    const rng = seededRng(5);
    expect(contact({ dt: TIMING_WINDOW * 1.1, dz: 0, lift: 0, power: 1 }, pitch, rng)).toBeNull();
    expect(contact({ dt: 0, dz: HEIGHT_WINDOW * 1.1, lift: 0, power: 1 }, pitch, rng)).toBeNull();
  });

  it('lift the ball from under it, beat it down from over it, and pull it when early', () => {
    const rng = seededRng(6);
    const under = contact({ dt: 0, dz: 0.2, lift: 0, power: 1 }, pitch, rng)!;
    const over = contact({ dt: 0, dz: -0.2, lift: 0, power: 1 }, pitch, rng)!;
    expect(under.la).toBeGreaterThan(over.la + 20);
    let pull = 0;
    for (let i = 0; i < 50; i++)
      pull += contact({ dt: -0.04, dz: 0, lift: 0, power: 1 }, pitch, rng)!.spray;
    expect(pull / 50).toBeLessThan(-15);
  });

  it('square, well-timed, hard contact goes a long way', () => {
    const c = contact({ dt: 0, dz: 0.08, lift: 0.4, power: 1 }, pitch, seededRng(7))!;
    expect(c.ev).toBeGreaterThan(100);
  });

  it('the computer takes some and chases some', () => {
    const rng = seededRng(8);
    let swings = 0;
    for (let i = 0; i < 400; i++)
      if (
        computerSwing(computerPitch({ balls: 1, strikes: 1 }, rng), { balls: 1, strikes: 1 }, rng)
      )
        swings++;
    expect(swings).toBeGreaterThan(100);
    expect(swings).toBeLessThan(300);
  });
});

describe('batted balls', () => {
  it('carry out of the park when hit hard in the air, and stay in on the ground', () => {
    expect(flyBall({ ev: 108, la: 28, spray: 0 }).homeRun).toBe(true);
    expect(flyBall({ ev: 100, la: 5, spray: 0 }).homeRun).toBe(false);
    expect(flyBall({ ev: 75, la: 30, spray: 0 }).homeRun).toBe(false);
  });

  it('are foul outside the lines', () => {
    expect(flyBall({ ev: 90, la: 20, spray: 50 }).foul).toBe(true);
    expect(flyBall({ ev: 90, la: 20, spray: 40 }).foul).toBe(false);
  });
});

describe('plays', () => {
  const states: Bases[] = [
    [null, null, null],
    [1, null, null],
    [null, 2, null],
    [1, 2, null],
    [null, null, 3],
    [1, null, 3],
    [1, 2, 3],
  ];

  it('account for every runner: each scores, is out, or is left on base', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 1500; i++) {
      const bases = states[i % states.length];
      const outs = i % 3;
      const c = { ev: 50 + rng() * 65, la: -20 + rng() * 80, spray: -50 + rng() * 100 };
      const play = resolvePlay(flyBall(c), c, { outs, bases, batter: 4 }, rng);
      const r = play.result;
      const before = bases.filter((b) => b !== null).length + 1;
      const after = r.bases.filter((b) => b !== null).length;
      expect(r.outs).toBeLessThanOrEqual(3 - outs);
      if (r.call === 'foul') {
        expect(r.bases).toEqual(bases);
        continue;
      }
      if (outs + r.outs < 3) expect(r.runs + r.outs + after).toBe(before);
      else expect(after).toBe(0);
      // Nobody passes anyone: bases hold distinct runners.
      const ids = r.bases.filter((b) => b !== null);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('clear the bases on a grand slam', () => {
    const c = { ev: 110, la: 28, spray: 5 };
    const play = resolvePlay(
      flyBall(c),
      c,
      { outs: 1, bases: [1, 2, 3], batter: 4 },
      seededRng(10),
    );
    expect(play.result.call).toBe('grandSlam');
    expect(play.result.runs).toBe(4);
    expect(play.result.bases).toEqual([null, null, null]);
  });

  it('turn two on a routine grounder to short with a runner on first', () => {
    const c = { ev: 85, la: -4, spray: -14 };
    const play = resolvePlay(
      flyBall(c),
      c,
      { outs: 0, bases: [1, null, null], batter: 4 },
      seededRng(11),
    );
    expect(play.result.call).toBe('doublePlay');
    expect(play.result.outs).toBe(2);
  });

  it('end with every runner where the play left him', () => {
    const c = { ev: 98, la: 14, spray: 20 };
    const play = resolvePlay(
      flyBall(c),
      c,
      { outs: 0, bases: [null, 2, null], batter: 4 },
      seededRng(12),
    );
    for (const r of play.runners) {
      const end = r.track[r.track.length - 1];
      const base = play.result.bases.indexOf(r.id);
      if (base >= 0) {
        expect(end.x).toBeCloseTo(BASES[base + 1].x, 0);
        expect(end.y).toBeCloseTo(BASES[base + 1].y, 0);
      }
    }
  });
});

describe('rules', () => {
  it('walk the batter and force runners along, scoring with the bases loaded', () => {
    const s = newGame('hitting');
    s.bases = [1, 2, 3];
    s.balls = 3;
    const a = applyPitch(s, 'ball');
    expect(a.text).toBe('WALK');
    expect(s.home.runs).toBe(1);
    expect(s.bases.every((b) => b !== null)).toBe(true);
  });

  it('keep fouls from making a third strike', () => {
    const s = newGame('hitting');
    s.strikes = 2;
    applyPitch(s, 'foul');
    expect(s.strikes).toBe(2);
    expect(s.outs).toBe(0);
  });

  it('retire the side on the third out and end a single mode', () => {
    const s = newGame('hitting');
    s.outs = 2;
    s.strikes = 2;
    const a = applyPitch(s, 'swingingStrike');
    expect(a.text).toBe('STRIKEOUT!');
    expect(a.sideRetired).toBe(true);
    expect(s.over).toBe(true);
  });

  it("skip the bottom of the last inning when you're ahead, and walk it off when you go ahead", () => {
    const s = newGame('game3');
    s.inning = 3;
    s.home.runs = 2;
    s.outs = 2;
    s.strikes = 2;
    applyPitch(s, 'calledStrike');
    expect(s.over).toBe(true);

    const t = newGame('game3');
    t.inning = 3;
    t.top = false;
    t.home.line.push(0);
    t.away.runs = 1;
    t.bases = [null, null, 3];
    const a = applyPlay(t, {
      call: 'single',
      outs: 0,
      runs: 1,
      bases: [4, null, null],
      hit: 1,
      extra: null,
    });
    expect(t.over).toBe(false);
    const b = applyPlay(t, {
      call: 'double',
      outs: 0,
      runs: 1,
      bases: [null, 5, null],
      hit: 2,
      extra: null,
    });
    expect(a.sideRetired).toBe(false);
    expect(t.over).toBe(true);
    expect(b.sub).toContain('WALK-OFF');
  });

  it('start extra innings with a runner on second', () => {
    const s = newGame('game3');
    s.inning = 3;
    s.top = false;
    nextHalf(s);
    expect(s.inning).toBe(4);
    expect(s.bases[1]).not.toBeNull();
  });
});

describe('the game loop', () => {
  /** Plays a whole game: you never swing, and you pitch what the computer would. */
  const autoplay = (mode: Parameters<BatOutSim['start']>[0], seed: number): BatOutSim => {
    const sim = new BatOutSim(seededRng(seed));
    sim.start(mode);
    for (let i = 0; i < 400_000 && sim.phase !== 'over'; i++) {
      if (sim.phase === 'scorecard') sim.continueGame();
      if (sim.phase === 'ready' && !sim.userBatting)
        sim.throwPitch(computerPitch(sim.state!, sim.rng));
      sim.step();
      sim.drainEvents();
    }
    return sim;
  };

  it('finishes games of every length', () => {
    for (const mode of ['hitting', 'pitching', 'game3'] as const) {
      const sim = autoplay(mode, 13);
      expect(sim.phase).toBe('over');
      expect(sim.state!.over).toBe(true);
    }
  });

  it('plays the same way from the same seed', () => {
    const a = autoplay('pitching', 21).state!;
    const b = autoplay('pitching', 21).state!;
    expect(a.away.runs).toBe(b.away.runs);
    expect(a.away.hits).toBe(b.away.hits);
    expect(a.strikeouts).toBe(b.strikeouts);
  });
});
