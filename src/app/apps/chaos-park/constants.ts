/**
 * The canvas's logical size: landscape, swapped on a portrait screen so it is always as large as it can be. Each
 * park is then generated to fill the whole screen (see `ParkFrame`), in a landscape frame the view turns on its
 * side on a portrait screen. Distances are logical px; speeds are per 60 Hz tick.
 */
export const FRAME_W = 860;
export const FRAME_H = 600;

/** How far past the frame the city is drawn, for screens of other shapes. */
export const SCENERY_EXTENT = 900;

/** Width of one lane, and how many lanes the loop has. Lane 0 is the innermost. */
export const LANE_W = 30;
export const LANES = 4;
/** Half the width of the road, from the centre line to either edge. */
export const ROAD_HALF = (LANE_W * LANES) / 2;

/**
 * Sprites are drawn for 22 px lanes; this scales them, and the lengths and speeds that go with them, to the lane
 * width in use.
 */
export const DESIGN_LANE = 22;
export const ART = LANE_W / DESIGN_LANE;

/**
 * How close the road's outer edge comes to the edges of the screen: further on the side with the score along it.
 */
export const EDGE_MARGIN = 22;
export const HUD_MARGIN = 58;
/** The park wall, inset from the frame, so it runs just inside the edge of the screen. */
export const WALL_INSET = 6;
export const WALL_RADIUS = 44;
/** The street just outside the wall. */
export const STREET_WIDTH = 34;

/** Points the loop's centre line is resampled to, evenly spaced. */
export const TRACK_SAMPLES = 640;

/**
 * What a visitor is, by how it moves. The courses after Chaos Park dress them differently (a walker is a swimmer on
 * Wild Waters, a cowboy's horse is a biker...) and add three: slow walkers, slow pairs two lanes wide, and predators.
 */
export type Kind =
  | 'walker'
  | 'dog'
  | 'runner'
  | 'biker'
  | 'car'
  | 'carriage'
  | 'group'
  | 'slow'
  | 'pair'
  | 'predator';
export const KINDS: readonly Kind[] = [
  'walker',
  'dog',
  'runner',
  'biker',
  'car',
  'carriage',
  'group',
  'slow',
  'pair',
  'predator',
];

export interface KindSpec {
  /** Centre-line px per tick. */
  speed: number;
  /** Length along the road, used for collisions. */
  len: number;
  /** Lanes it takes up. */
  width: 1 | 2;
  /** Fewest and most laps it does before leaving. */
  laps: readonly [number, number];
  /** Relative chance of arriving, once it is allowed to (see `kindWeight`). */
  weight: number;
}

/**
 * The overall pace of the game: every mover's speed (and the rats') is scaled by this, so the challenge comes from
 * how many are about rather than how fast they go.
 */
export const PACE = 0.7;

const spec = (
  speed: number,
  len: number,
  width: 1 | 2,
  laps: readonly [number, number],
  weight: number,
): KindSpec => ({ speed: speed * ART * PACE, len: len * ART, width, laps, weight });

/**
 * Walkers (and dog walkers), runners, bikers and cars are each faster; carriages go at a walk and never leave.
 * Speeds and lengths are given at the design lane width and scaled to the one in use (and speeds by `PACE`).
 */
export const KIND_SPECS: Readonly<Record<Kind, KindSpec>> = {
  walker: spec(0.72, 14, 1, [1, 2], 0.3),
  dog: spec(0.72, 24, 2, [1, 1], 0.12),
  runner: spec(1.15, 14, 1, [1, 3], 0.3),
  biker: spec(1.7, 30, 1, [1, 4], 0.32),
  /** Only a little faster than a bike. */
  car: spec(1.88, 46, 2, [1, 2], 0.07),
  carriage: spec(0.72, 62, 2, [Infinity, Infinity], 0),
  /** A run group; its length depends on how many are in it (see `groupLength`). */
  group: spec(1.15, 40, 2, [1, 1], 0),
  /** A slow walker and a slow pair; how often they come is up to the course (`CourseSpec.slow`, `slowPair`). */
  slow: spec(0.5, 14, 1, [1, 2], 0),
  pair: spec(0.4, 28, 2, [1, 1], 0),
  /** A predator does one lap, a little faster than a runner, and scores nothing. */
  predator: spec(1.3, 20, 1, [1, 1], 0),
};

/** Each mover's speed is its kind's times a factor in this range, so even two of a kind close in on each other. */
export const SPEED_SPREAD = 0.08;

/**
 * The difficulty ramp (how many are allowed in at once, how often they come, how likely cars and the wrong way are)
 * follows an effective level rather than the laps themselves: the laps up to `LEVEL_KNEE`, then `LEVEL_RATE` of a
 * level for each lap after. What comes in at a given number of laps (cars, groups, patches...) goes by the laps.
 */
export const LEVEL_KNEE = 10;
export const LEVEL_RATE = 0.4;
export const level = (laps: number, rate = LEVEL_RATE): number =>
  laps <= LEVEL_KNEE ? laps : LEVEL_KNEE + (laps - LEVEL_KNEE) * rate;

/**
 * Run groups: 6 to 12 runners two abreast, doing one lap. The first comes as soon as the laps reach
 * `GROUP_FROM_SCORE`, one every `GROUP_INTERVAL_EARLY` ticks (20 to 50 seconds) from then on, and every
 * `GROUP_INTERVAL` (10 to 45 seconds) from `GROUP_EARLY_UNTIL` laps; never two at once. Each runner's lap scores.
 */
export const GROUP_SIZE: readonly [number, number] = [6, 12];
export const GROUP_FROM_SCORE = 12;
export const GROUP_INTERVAL_EARLY: readonly [number, number] = [20 * 60, 50 * 60];
export const GROUP_EARLY_UNTIL = 50;
export const GROUP_INTERVAL: readonly [number, number] = [10 * 60, 45 * 60];
/** Spacing between the rows of a run group, front to back, as drawn. */
export const GROUP_ROW = 12;
export const groupLength = (size: number): number => (Math.ceil(size / 2) * GROUP_ROW + 4) * ART;

/**
 * Rats: now and then one waits at the kerb ahead of a walker, runner or dog walker, then darts out and bites them.
 * The bitten person stands dazed for `DAZE_TICKS`.
 */
export const RAT_FROM_SCORE = 4;
export const RAT_INTERVAL: readonly [number, number] = [1800, 3300];
/** Ticks the rat waits at the kerb, in sight, before it darts out. */
export const RAT_LURK = 55;
export const RAT_SPEED = 2.4 * ART * PACE;
/** It gives up and runs off if it hasn't reached its target in this many ticks. */
export const RAT_GIVE_UP = 150;
export const DAZE_TICKS = 180;

/**
 * Predators, on the courses that have them: one comes every `PREDATOR_INTERVAL` ticks from `PREDATOR_FROM_SCORE` laps,
 * never two at once. Every `PREDATOR_TURN` ticks it moves a lane toward the nearest person ahead of it within
 * `PREDATOR_SIGHT`; whoever on foot it catches is eaten, their laps lost, and it costs a life.
 */
export const PREDATOR_FROM_SCORE = 8;
export const PREDATOR_INTERVAL: readonly [number, number] = [40 * 60, 70 * 60];
export const PREDATOR_TURN = 50;
export const PREDATOR_SIGHT = 160 * ART;
/**
 * With nobody in sight, a predator that hasn't moved lane for `PREDATOR_WANDER` ticks has this chance each tick of
 * wandering a lane either way.
 */
export const PREDATOR_WANDER = 90;
export const PREDATOR_WANDER_CHANCE = 0.02;
/**
 * Once whoever a predator is after is less than `PREDATOR_COMMIT` ticks from being caught, it stops changing lanes and
 * runs straight on for `PREDATOR_LUNGE` ticks, so a swipe out of its lane in that time (the "!" shows from
 * `WARN_TICKS`) gets them away.
 */
export const PREDATOR_COMMIT = 90;
export const PREDATOR_LUNGE = 150;

/** A course's own event (see `CourseEvent`) comes every `EVENT_INTERVAL` ticks from `EVENT_FROM_SCORE` laps. */
export const EVENT_FROM_SCORE = 6;
export const EVENT_INTERVAL: readonly [number, number] = [25 * 60, 45 * 60];
/**
 * The fisherman's hook flies for `HOOK_CAST` ticks, then sits in its lane for `HOOK_TICKS`; whoever one lane wide runs
 * into it is reeled out. Anything wider breaks the line.
 */
export const HOOK_CAST = 50;
export const HOOK_TICKS = 300;
export const HOOK_LEN = 10 * ART;
/** A tumbleweed waits at the roadside for `RAT_LURK` ticks, then rolls across at `TUMBLE_RATE` lanes a tick. */
export const TUMBLE_RATE = 0.03;
export const TUMBLE_LEN = 16 * ART;
/** A bee sting or a haunting has its victim swerve a lane every `SWERVE_EVERY` ticks for `SWERVE_TICKS`. */
export const SWERVE_TICKS = 300;
export const SWERVE_EVERY = 45;
/** A haunted visitor's speed swings between these, times its usual speed. */
export const HAUNT_SPEEDS: readonly [number, number] = [1.5, 0.6];
/** Slime holds whoever steps in it for this long. */
export const SLIME_TICKS = 300;
/** People start steering round an obstacle this far before they would reach it. */
export const STEER_AHEAD = 36 * ART;

/**
 * A biker closing in on someone on foot shouts "Out of my way!" in a speech bubble for `SHOUT_TICKS`, at most once
 * every `SHOUT_COOLDOWN` ticks.
 */
export const SHOUT_TICKS = 100;
export const SHOUT_COOLDOWN = 300;

/** Cars only arrive from this many laps; their chance then grows a little. */
export const CARS_FROM_SCORE = 6;
/** The second (and last) carriage arrives at this many laps. */
export const SECOND_CARRIAGE_SCORE = 110;
/** Ticks before another carriage comes to replace one a star has knocked off the loop. */
export const CARRIAGE_RETURN: readonly [number, number] = [20 * 60, 40 * 60];
/** Walkers and runners going the wrong way (clockwise) appear from this many laps, more often as the level rises. */
export const WRONG_WAY_FROM_SCORE = 3;
export const WRONG_WAY_CHANCE = 0.05;
export const WRONG_WAY_MAX_CHANCE = 0.1;

/** How much faster a mover goes after a forward swipe, until swiped back. */
export const BOOST = 1.6;

/** Lanes per tick a mover slides sideways when changing lane. */
export const LANE_RATE = 0.09;

/**
 * Streaks: every `STREAK_LAPS` laps in a row without losing a life, each lap is worth a point more (2 after 10, 3
 * after 20...). Losing a life starts the streak again.
 */
export const STREAK_LAPS = 10;

/** Dusk falls over `DUSK_LAPS` laps from `DUSK_FROM`, and cars put their headlights on. */
export const DUSK_FROM = 120;
export const DUSK_LAPS = 30;

/**
 * Lives a run starts with: each collision takes one, and the last one ends it. Before that, whoever was run into is
 * stunned for `STUN_TICKS` and whoever hit them carries on through. Hearts on the road give lives back, up to
 * `MAX_LIVES`.
 */
export const LIVES = 3;
export const MAX_LIVES = 5;
export const STUN_TICKS = 90;
/** Ticks the burst shows where a collision happened. */
export const IMPACT_TICKS = 40;

/**
 * Pick-ups: from `PICKUP_FROM_SCORE`, now and then one sits on the loop in one lane until a visitor walks, runs, rides
 * or drives over it, or `PICKUP_TICKS` pass. One at a time: the first comes `PICKUP_FIRST` ticks in, the next
 * `PICKUP_INTERVAL` after the last has gone. Run groups take them too, except a duplicate (one group at a time), and
 * carriages go over a duplicate or extra laps. What each does to whoever takes it, for the rest of their laps (a carriage, which never
 * leaves, for `CARRIAGE_EFFECT_LAPS` laps):
 * - heart: a life back (never comes while lives are full);
 * - double: a copy of them right behind;
 * - ghost: they pass through everyone;
 * - star (rare): they knock everyone they touch off the loop, scoring the laps those visitors still had to do;
 * - fire / turtle: `FIRE_SPEED` / `TURTLE_SPEED` times as fast;
 * - strength: `EXTRA_LAPS` more laps to do;
 * - coin: a point;
 * - skull: a wreck, costing a life and stunning them, as if they had collided (not while they have a star);
 * - spiral: a time warp, everything at half speed for `WARP_SLOW_TICKS` then back to normal over `WARP_EASE_TICKS`;
 * - autopilot: they steer themselves out of the way of collisions, changing lane or slowing down.
 */
export type PickupKind =
  | 'heart'
  | 'double'
  | 'ghost'
  | 'star'
  | 'fire'
  | 'turtle'
  | 'strength'
  | 'coin'
  | 'skull'
  | 'spiral'
  | 'autopilot';
/** Every kind, in the order a pick-up's kind is drawn. */
export const PICKUP_KINDS: readonly PickupKind[] = [
  'heart',
  'double',
  'ghost',
  'star',
  'fire',
  'turtle',
  'strength',
  'coin',
  'skull',
  'spiral',
  'autopilot',
];
export const PICKUP_FROM_SCORE = 5;
export const PICKUP_FIRST: readonly [number, number] = [6 * 60, 12 * 60];
export const PICKUP_INTERVAL: readonly [number, number] = [15 * 60, 25 * 60];
export const PICKUP_TICKS = 18 * 60;
/** How likely each kind is, when it can come. */
export const PICKUP_WEIGHTS: Readonly<Record<PickupKind, number>> = {
  heart: 2,
  double: 1,
  ghost: 1,
  star: 0.25,
  fire: 1,
  turtle: 1,
  strength: 1,
  coin: 1.5,
  skull: 0.75,
  spiral: 0.5,
  autopilot: 0.75,
};
/** Laps a carriage keeps what a pick-up gave it. */
export const CARRIAGE_EFFECT_LAPS = 2;
/** A pick-up's length along the road, for taking it; it is drawn about this size. */
export const PICKUP_LEN = 18 * ART;
/** A pick-up only appears where nothing on the loop is within this distance of it in its lane. */
export const PICKUP_CLEAR = 60 * ART;
/** The gap a duplicate is put behind the one it copies. */
export const DOUBLE_GAP = 6 * ART;
export const FIRE_SPEED = 1.5;
export const TURTLE_SPEED = 0.5;
export const EXTRA_LAPS = 2;
/**
 * A time warp's ticks of the game at half speed (10 seconds), then of easing back to full speed (about 3 seconds).
 * Counted in game ticks, which pass at the warped speed.
 */
export const WARP_SLOW_TICKS = 300;
export const WARP_EASE_TICKS = 120;
export const WARP_SPEED = 0.5;

/** Slippery patches appear on the road as the laps reach each of these. */
export const PATCH_SCORES: readonly number[] = [50, 100];

/** Two movers collide when their lanes overlap by more than this, and their lengths by `COLLIDE_FACTOR`. */
export const LATERAL_OVERLAP = 0.3;
export const COLLIDE_FACTOR = 0.82;
/** Warn when movers sharing a lane would touch within this many ticks. */
export const WARN_TICKS = 75;
export const WARN_MAX_GAP = 120 * ART;

/** A mover joining the road (from an entrance or a short cut) waits until nothing will reach it in this many ticks. */
export const JOIN_TICKS = 100;
/**
 * A joining mover waits on its route with its front this far short of the road's edge, so nothing waiting pokes into
 * the lanes (see `joinHold`).
 */
export const JOIN_CLEAR = 4 * ART;

/** The chance a walker or runner in the inner lane cuts across the park when it passes a short cut. */
export const SHORTCUT_CHANCE = 0.3;

export const FIRST_SPAWN = 50;
/** Ticks between arrivals at level 0, the fewest it falls to, and how much each level takes off it. */
export const SPAWN_INTERVAL = 250;
export const SPAWN_INTERVAL_MIN = 64;
export const SPAWN_INTERVAL_STEP = 4;
/**
 * Movers allowed in the park at once at level 0 (not counting carriages), the most the level brings, and levels per
 * extra one. Early on one more comes every `EARLY_LAPS_PER_EXTRA` laps, up to `EARLY_MAX_MOVERS`; and from
 * `LATE_FROM` laps one more every `LATE_LAPS_PER_EXTRA`, up to `MAX_MOVERS_LATE`.
 */
export const MAX_MOVERS_START = 3;
export const MAX_MOVERS = 22;
export const LAPS_PER_EXTRA = 5;
export const EARLY_LAPS_PER_EXTRA = 4;
export const EARLY_MAX_MOVERS = 5;
export const LATE_FROM = 150;
export const LATE_LAPS_PER_EXTRA = 10;
export const MAX_MOVERS_LATE = 26;

/** A press grabs the nearest mover within this distance of its body. */
export const GRAB_RADIUS = 30 * ART;

/** Ticks a mover wobbles after sliding on a patch. */
export const SLIP_TICKS = 34;
export const POP_TICKS = 60;
export const CRASH_TICKS = 130;
/** Ticks before the game-over card accepts input, so a panicked tap can't dismiss it. */
export const GAME_OVER_LOCKOUT = 50;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** The part of the screen showing, in screen logical px; see `GameSurface.bounds`. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const pauseButton = (b: Bounds): Rect => ({
  x: b.right - 70,
  y: b.bottom - 70,
  w: 48,
  h: 48,
});

/** Bottom left of the title, opposite where the pause button is in play: sound on or off. */
export const soundButton = (b: Bounds): Rect => ({
  x: b.left + 22,
  y: b.bottom - 70,
  w: 48,
  h: 48,
});

/** Sign-plaque buttons on the cards: centre relative to the middle of the screen, and half width and height. */
export interface Plaque {
  x: number;
  y: number;
  rx: number;
  ry: number;
  label: string;
}

export const inPlaque = (p: Plaque, x: number, y: number): boolean =>
  Math.abs(x - p.x) <= p.rx && Math.abs(y - p.y) <= p.ry;

/** Buttons on a card are all one size, so a card's two choices match. */
export const BUTTON_TEXT = 30;

/** Cards are this size, centred on screen; small enough to fit either way round. */
export const CARD = { w: 540, h: 520 };
/** The how-to-play card is taller, for room round its rules. */
export const HELP_CARD = { w: 540, h: 570 };

export const PLAY_BUTTON: Plaque = { x: 116, y: 186, rx: 100, ry: 36, label: 'PLAY' };
export const HELP_BUTTON: Plaque = { x: -116, y: 186, rx: 100, ry: 36, label: 'HOW TO PLAY' };
export const BACK_BUTTON: Plaque = { x: 0, y: 216, rx: 100, ry: 36, label: 'GOT IT!' };
export const RETRY_BUTTON: Plaque = { x: 116, y: 186, rx: 100, ry: 36, label: 'RETRY' };
export const MENU_BUTTON: Plaque = { x: -116, y: 186, rx: 100, ry: 36, label: 'MENU' };
export const RESUME_BUTTON: Plaque = { x: 116, y: 44, rx: 100, ry: 36, label: 'RESUME' };
export const QUIT_BUTTON: Plaque = { x: -116, y: 44, rx: 100, ry: 36, label: 'MENU' };
