/** Film metadata baked by tools/reference/bake.py and the parameter vector the engine consumes. */

export interface FilmMeta {
  readonly stock: string;
  readonly name: string;
  readonly type: 'positive' | 'negative';
  readonly format_mm: number;
  readonly halation: {
    readonly active: boolean;
    readonly scatter_amount: number;
    readonly scatter_spatial_scale: number;
    readonly scatter_core_um: readonly number[];
    readonly scatter_tail_um: readonly number[];
    readonly scatter_tail_weight: readonly number[];
    readonly halation_amount: number;
    readonly halation_spatial_scale: number;
    readonly halation_strength: readonly number[];
    readonly halation_first_sigma_um: readonly number[];
    readonly halation_n_bounces: number;
    readonly halation_bounce_decay: number;
    readonly halation_renormalize: boolean;
  };
  readonly dir: {
    readonly active: boolean;
    readonly diffusion_size_um: number;
    readonly diffusion_tail_um: number;
    readonly diffusion_tail_weight: number;
  };
  readonly grain: {
    /** Gaussian softening of the grain field in pixels. */
    readonly blur: number;
  };
}

/** User tone and colour sliders, each -100..100 (0 = untouched). */
export interface Adjustments {
  readonly highlights: number;
  readonly shadows: number;
  readonly whites: number;
  readonly blacks: number;
  readonly saturation: number;
  readonly temperature: number;
  readonly tint: number;
}

export const NO_ADJUSTMENTS: Adjustments = {
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
};

export interface RenderSettings {
  /** Exposure compensation in stops. */
  readonly ev: number;
  readonly halation: boolean;
  /** Tonal contrast of inverted negatives when the print stage is off (1 = scene-linear). */
  readonly contrast: number;
  /** Print the negative on RA4 paper / project the slide, instead of a plain scan. */
  readonly print: boolean;
  /** Print or projection exposure in stops; positive is lighter. */
  readonly printEv: number;
  /** Negatives without a print: lab-scanner S-curve instead of a plain inversion. */
  readonly labScan: boolean;
  /** Display-referred S-curve strength about mid-gray (0 = off). */
  readonly punch: number;
  /** Extra saturation after the S-curve (0 = off). */
  readonly saturation: number;
  /** Tone sliders in -1..1, applied after the film look. */
  readonly whites: number;
  readonly highlights: number;
  readonly blacks: number;
  readonly shadows: number;
  /** Colour sliders in -1..1; positive temperature is warmer, positive tint is magenta. */
  readonly temperature: number;
  readonly tint: number;
  /** Sub-pixel Boolean grain; only meaningful at full resolution. */
  readonly grain: boolean;
  /** 0 = smooth, 1 = film-accurate. */
  readonly grainAmount: number;
  /** Multiplier on grain particle area. */
  readonly grainSize: number;
  readonly grainSeed: number;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  ev: 0,
  halation: true,
  contrast: 1.15,
  print: true,
  printEv: 0,
  labScan: true,
  punch: 0.2,
  saturation: 0.12,
  whites: 0,
  highlights: 0,
  blacks: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  grain: false,
  grainAmount: 1,
  grainSize: 1,
  grainSeed: 1,
};

/** Must match `PARAM_COUNT` and `Params::from_slice` in engine/src/pipeline.rs. */
export const PARAM_COUNT = 49;
/** Indices of the per-tile grain origin, filled in by the engine service. */
export const GRAIN_ORIGIN_X = 36;
export const GRAIN_ORIGIN_Y = 37;

/**
 * @param pixelSizeUm film-plane pixel pitch for the image being processed
 *   (larger for downscaled previews).
 */
export function buildParams(
  meta: FilmMeta,
  settings: RenderSettings,
  pixelSizeUm: number,
): Float32Array {
  const h = meta.halation;
  const p = new Float32Array(PARAM_COUNT);
  p[0] = settings.ev;
  p[1] = pixelSizeUm;
  p[2] = h.active && settings.halation ? 1 : 0;
  p[3] = h.scatter_amount;
  p[4] = h.scatter_spatial_scale;
  p.set(h.scatter_core_um, 5);
  p.set(h.scatter_tail_um, 8);
  p.set(h.scatter_tail_weight, 11);
  p[14] = h.halation_amount;
  p[15] = h.halation_spatial_scale;
  p.set(h.halation_strength, 16);
  p.set(h.halation_first_sigma_um, 19);
  p[22] = h.halation_n_bounces;
  p[23] = h.halation_bounce_decay;
  p[24] = h.halation_renormalize ? 1 : 0;
  p[25] = meta.dir.active ? 1 : 0;
  p[26] = meta.dir.diffusion_size_um;
  p[27] = meta.dir.diffusion_tail_um;
  p[28] = meta.dir.diffusion_tail_weight;
  p[29] = 1;
  p[30] = settings.contrast;
  p[31] = settings.grain ? 1 : 0;
  p[32] = settings.grainAmount;
  p[33] = settings.grainSize;
  p[34] = meta.grain.blur;
  p[35] = settings.grainSeed;
  p[38] = settings.print ? 1 : 0;
  p[39] = settings.printEv;
  p[40] = settings.labScan ? 1 : 0;
  p[41] = settings.punch;
  p[42] = settings.saturation;
  p[43] = settings.whites;
  p[44] = settings.highlights;
  p[45] = settings.blacks;
  p[46] = settings.shadows;
  p[47] = settings.temperature;
  p[48] = settings.tint;
  return p;
}

/** Film-plane pixel pitch when the long image side spans the 36 mm frame. */
export function pixelSizeUm(longSidePx: number): number {
  return 36000 / longSidePx;
}
