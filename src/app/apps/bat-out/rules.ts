import type { Bases, Call, PlayResult } from './play';

/**
 * The five ways to play. You are always the home team: in a game you pitch the top of each inning and bat the
 * bottom; the two single modes are one half-inning (three outs) of just batting or just pitching.
 */
export type Mode = 'hitting' | 'pitching' | 'game3' | 'game6' | 'game9';

export const MODES: readonly { id: Mode; name: string; innings: number }[] = [
  { id: 'hitting', name: 'AT BAT: HITTING', innings: 1 },
  { id: 'pitching', name: 'AT BAT: PITCHING', innings: 1 },
  { id: 'game3', name: '3 INNINGS', innings: 3 },
  { id: 'game6', name: '6 INNINGS', innings: 6 },
  { id: 'game9', name: '9 INNINGS', innings: 9 },
];

export interface Team {
  /** Runs in each inning so far (the inning in progress included). */
  line: number[];
  runs: number;
  hits: number;
  /** Next in the batting order, 0 to 8. */
  next: number;
}

export interface GameState {
  mode: Mode;
  innings: number;
  inning: number;
  /** Top of the inning: the computer bats and you pitch. */
  top: boolean;
  outs: number;
  balls: number;
  strikes: number;
  bases: Bases;
  away: Team;
  home: Team;
  /** Batters you struck out and walked as the pitcher. */
  strikeouts: number;
  walks: number;
  over: boolean;
}

const team = (): Team => ({ line: [], runs: 0, hits: 0, next: 0 });

export const newGame = (mode: Mode): GameState => {
  const spec = MODES.find((m) => m.id === mode)!;
  const state: GameState = {
    mode,
    innings: spec.innings,
    inning: 1,
    top: mode !== 'hitting',
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [null, null, null],
    away: team(),
    home: team(),
    strikeouts: 0,
    walks: 0,
    over: false,
  };
  // The single batting mode is just the bottom of the first.
  if (mode === 'hitting') state.away.line.push(0);
  state[batting(state)].line.push(0);
  return state;
};

export const batting = (s: GameState): 'away' | 'home' => (s.top ? 'away' : 'home');
export const userBats = (s: GameState): boolean => !s.top;
export const isGame = (s: GameState): boolean => s.mode !== 'hitting' && s.mode !== 'pitching';
export const batterId = (s: GameState): number => s[batting(s)].next;

export type PitchOutcome = 'ball' | 'calledStrike' | 'swingingStrike' | 'foul' | 'hitByPitch';

/** What the umpire or the play says, as shown on screen. */
export interface Announcement {
  text: string;
  /** A second, smaller line, such as a runner put out or WALK-OFF. */
  sub: string | null;
  /** Big moments get a bigger banner and a fanfare. */
  big: boolean;
  /** The half-inning (or the game) ended with it. */
  sideRetired: boolean;
}

const CALL_TEXT: Readonly<Record<Call, string>> = {
  foul: 'FOUL BALL',
  homeRun: 'HOME RUN!',
  grandSlam: 'GRAND SLAM!',
  groundRuleDouble: 'GROUND-RULE DOUBLE',
  single: 'SINGLE!',
  double: 'DOUBLE!',
  triple: 'TRIPLE!',
  insideTheParker: 'INSIDE-THE-PARK HR!',
  flyOut: 'FLY OUT',
  lineOut: 'LINE OUT',
  popOut: 'POP OUT',
  foulOut: 'FOUL OUT',
  infieldFly: 'INFIELD FLY',
  sacFly: 'SAC FLY',
  groundOut: 'GROUND OUT',
  doublePlay: 'DOUBLE PLAY!',
  triplePlay: 'TRIPLE PLAY!',
  fieldersChoice: "FIELDER'S CHOICE",
  infieldHit: 'INFIELD SINGLE!',
};

const BIG: ReadonlySet<Call> = new Set([
  'homeRun',
  'grandSlam',
  'triple',
  'insideTheParker',
  'doublePlay',
  'triplePlay',
]);

/** Runs scored this half count straight onto the line and the total. */
const score = (s: GameState, runs: number): void => {
  const t = s[batting(s)];
  t.runs += runs;
  t.line[t.line.length - 1] += runs;
};

const nextBatter = (s: GameState): void => {
  const t = s[batting(s)];
  t.next = (t.next + 1) % 9;
  s.balls = 0;
  s.strikes = 0;
};

/** Forces every runner along a base to put the batter on first, as on a walk; returns runs forced in. */
const award = (s: GameState): number => {
  const [first, second, third] = s.bases;
  const batter = batterId(s);
  if (first === null) s.bases = [batter, second, third];
  else if (second === null) s.bases = [batter, first, third];
  else if (third === null) s.bases = [batter, first, second];
  else {
    s.bases = [batter, first, second];
    return 1;
  }
  return 0;
};

/**
 * The game ends once the home side leads after the top of the last inning or later, at the end of any inning from
 * the last on if the scores differ, or the moment the home side goes ahead in the bottom of one (a walk-off).
 * The single modes end with the third out.
 */
const checkOver = (s: GameState, halfDone: boolean): boolean => {
  if (!isGame(s)) return halfDone;
  const last = s.inning >= s.innings;
  if (!last) return false;
  if (s.top) return halfDone && s.home.runs > s.away.runs;
  return s.home.runs > s.away.runs || (halfDone && s.home.runs !== s.away.runs);
};

const finishPa = (s: GameState, text: string, sub: string | null, big: boolean): Announcement => {
  const halfDone = s.outs >= 3;
  const wasBottom = !s.top;
  nextBatter(s);
  s.over = checkOver(s, halfDone);
  if (s.over && wasBottom && !halfDone && isGame(s)) sub = sub ? `${sub} WALK-OFF!` : 'WALK-OFF!';
  return {
    text,
    sub,
    big: big || (s.over && wasBottom && s.home.runs > s.away.runs && isGame(s)),
    sideRetired: halfDone || s.over,
  };
};

/** A pitch with no ball in play. */
export const applyPitch = (s: GameState, outcome: PitchOutcome): Announcement => {
  switch (outcome) {
    case 'ball':
      s.balls++;
      if (s.balls < 4) return { text: 'BALL', sub: null, big: false, sideRetired: false };
      if (s.top) s.walks++;
      {
        const runs = award(s);
        score(s, runs);
        return finishPa(s, 'WALK', runs ? 'RUN WALKED IN' : null, false);
      }
    case 'hitByPitch': {
      const runs = award(s);
      score(s, runs);
      return finishPa(s, 'HIT BY PITCH', runs ? 'RUN FORCED IN' : null, false);
    }
    case 'foul':
      if (s.strikes < 2) s.strikes++;
      return { text: 'FOUL BALL', sub: null, big: false, sideRetired: false };
    case 'calledStrike':
    case 'swingingStrike':
      s.strikes++;
      if (s.strikes < 3) return { text: 'STRIKE!', sub: null, big: false, sideRetired: false };
      s.outs++;
      if (s.top) s.strikeouts++;
      return finishPa(s, outcome === 'calledStrike' ? 'STRIKE THREE!' : 'STRIKEOUT!', null, false);
  }
};

/** A ball put in play (a foul ball goes through `applyPitch`). */
export const applyPlay = (s: GameState, r: PlayResult): Announcement => {
  s.outs += r.outs;
  s.bases = r.bases;
  score(s, r.runs);
  if (r.hit > 0) s[batting(s)].hits++;
  const text = CALL_TEXT[r.call];
  let sub = r.extra;
  if (r.runs > 0 && r.call !== 'homeRun' && r.call !== 'grandSlam')
    sub ??= r.runs === 1 ? '1 RUN SCORES' : `${r.runs} RUNS SCORE`;
  else if (r.call === 'homeRun' && r.runs > 1) sub = `${r.runs}-RUN HOMER`;
  return finishPa(s, text, sub, BIG.has(r.call));
};

/**
 * Moves on to the next half-inning. From the 10th on (or the inning after the last of a shorter game), each half
 * starts with a runner on second, as in the majors' extra innings: the batter before the leadoff man.
 */
export const nextHalf = (s: GameState): void => {
  if (s.top) s.top = false;
  else {
    s.top = true;
    s.inning++;
  }
  s.outs = 0;
  s.balls = 0;
  s.strikes = 0;
  s.bases = [null, null, null];
  const t = s[batting(s)];
  t.line.push(0);
  if (s.inning > s.innings) s.bases[1] = (t.next + 8) % 9;
};

/** The winner of a finished game, from your side: the single modes have none. */
export const outcome = (s: GameState): 'win' | 'loss' | null =>
  !isGame(s) || !s.over ? null : s.home.runs > s.away.runs ? 'win' : 'loss';
