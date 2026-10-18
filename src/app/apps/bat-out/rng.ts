/** A random source returning [0, 1); the game is deterministic given one. */
export type Rng = () => number;

/** mulberry32: small, fast and the same on every platform. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A standard normal sample, from the sum of four uniforms (close enough, and cheap to port exactly). */
export const gauss = (rng: Rng): number => (rng() + rng() + rng() + rng() - 2) * 1.732;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
