import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { ImageDecoderService, SUPPORTED_EXTENSIONS } from './image-decoder.service';
import type { LinearImage } from './raw-decoder.service';
import { buildPreview, downscaleLinear, previewFromEncoded, type PreviewImage } from './preview';
import { FilmEngineService, extractTile } from '../engine/film-engine.service';
import { DEFAULT_SETTINGS, NO_ADJUSTMENTS, type Adjustments, type RenderSettings } from '../engine/film-params';
import {
  EXPORT_FORMATS,
  encodeJpeg,
  encodePng16,
  encodeTiff16,
  type ExportFormat,
} from '../export/encoders';

export type FilmId =
  | 'kodachrome-64'
  | 'ektachrome-100'
  | 'portra-160'
  | 'portra-400'
  | 'portra-800'
  | 'gold-200'
  | 'ektar-100'
  | 'ultramax-400'
  | 'vision3-50d'
  | 'vision3-250d'
  | 'vision3-500t'
  | 'fuji-velvia-100'
  | 'fuji-provia-100f'
  | 'fuji-pro-400h'
  | 'fuji-xtra-400'
  | 'tri-x-400'
  | 't-max-100'
  | 'hp5-plus';

export interface FilmInfo {
  readonly id: FilmId;
  /** Baked data set name under public/film. */
  readonly stock: string;
  readonly brand: 'Kodak' | 'Fujifilm' | 'Ilford';
  readonly name: string;
  readonly kind: 'Slide' | 'Negative';
  readonly blurb: string;
}

export const FILMS: readonly FilmInfo[] = [
  {
    id: 'kodachrome-64',
    stock: 'kodak_kodachrome_64',
    brand: 'Kodak',
    name: 'Kodachrome 64',
    kind: 'Slide',
    blurb: 'K-14 reversal film, projected. Rich reds, deep contrast.',
  },
  {
    id: 'ektachrome-100',
    stock: 'kodak_ektachrome_100',
    brand: 'Kodak',
    name: 'Ektachrome E100',
    kind: 'Slide',
    blurb: 'E-6 reversal film, projected. Clean, neutral colour.',
  },
  {
    id: 'portra-160',
    stock: 'kodak_portra_160',
    brand: 'Kodak',
    name: 'Portra 160',
    kind: 'Negative',
    blurb: 'C-41 portrait negative. Fine grain, muted natural tones.',
  },
  {
    id: 'portra-400',
    stock: 'kodak_portra_400',
    brand: 'Kodak',
    name: 'Portra 400',
    kind: 'Negative',
    blurb: 'C-41 colour negative, printed on RA4 paper. Wide latitude.',
  },
  {
    id: 'portra-800',
    stock: 'kodak_portra_800',
    brand: 'Kodak',
    name: 'Portra 800',
    kind: 'Negative',
    blurb: 'Fast C-41 portrait negative for low light.',
  },
  {
    id: 'gold-200',
    stock: 'kodak_gold_200',
    brand: 'Kodak',
    name: 'Gold 200',
    kind: 'Negative',
    blurb: 'Warm, everyday C-41 negative.',
  },
  {
    id: 'ektar-100',
    stock: 'kodak_ektar_100',
    brand: 'Kodak',
    name: 'Ektar 100',
    kind: 'Negative',
    blurb: 'Very fine grain, saturated C-41 negative.',
  },
  {
    id: 'ultramax-400',
    stock: 'kodak_ultramax_400',
    brand: 'Kodak',
    name: 'Ultramax 400',
    kind: 'Negative',
    blurb: 'Punchy consumer 400-speed C-41 negative.',
  },
  {
    id: 'vision3-50d',
    stock: 'kodak_vision3_50d',
    brand: 'Kodak',
    name: 'Vision3 50D',
    kind: 'Negative',
    blurb: 'Daylight-balanced ECN-2 cine negative, finest grain.',
  },
  {
    id: 'vision3-250d',
    stock: 'kodak_vision3_250d',
    brand: 'Kodak',
    name: 'Vision3 250D',
    kind: 'Negative',
    blurb: 'Daylight-balanced ECN-2 cine negative.',
  },
  {
    id: 'vision3-500t',
    stock: 'kodak_vision3_500t',
    brand: 'Kodak',
    name: 'Vision3 500T',
    kind: 'Negative',
    blurb: 'Tungsten-balanced ECN-2 cine negative.',
  },
  {
    id: 'fuji-velvia-100',
    stock: 'fujifilm_velvia_100',
    brand: 'Fujifilm',
    name: 'Velvia 100',
    kind: 'Slide',
    blurb: 'E-6 reversal film. Vivid, saturated colour.',
  },
  {
    id: 'fuji-provia-100f',
    stock: 'fujifilm_provia_100f',
    brand: 'Fujifilm',
    name: 'Provia 100F',
    kind: 'Slide',
    blurb: 'E-6 reversal film. Neutral, fine grain.',
  },
  {
    id: 'fuji-pro-400h',
    stock: 'fujifilm_pro_400h',
    brand: 'Fujifilm',
    name: 'Pro 400H',
    kind: 'Negative',
    blurb: 'C-41 negative. Soft, pastel skin tones.',
  },
  {
    id: 'fuji-xtra-400',
    stock: 'fujifilm_xtra_400',
    brand: 'Fujifilm',
    name: 'Superia X-TRA 400',
    kind: 'Negative',
    blurb: 'Consumer 400-speed C-41 negative. Green-leaning, punchy.',
  },
  {
    id: 'tri-x-400',
    stock: 'kodak_tri_x_400',
    brand: 'Kodak',
    name: 'Tri-X 400 (B&W)',
    kind: 'Negative',
    blurb: 'Black & white negative, printed. Contrasty, classic coarse grain.',
  },
  {
    id: 't-max-100',
    stock: 'kodak_t_max_100',
    brand: 'Kodak',
    name: 'T-Max 100 (B&W)',
    kind: 'Negative',
    blurb: 'Black & white negative, printed. Very fine grain, smooth tones.',
  },
  {
    id: 'hp5-plus',
    stock: 'ilford_hp5_plus',
    brand: 'Ilford',
    name: 'HP5 Plus 400 (B&W)',
    kind: 'Negative',
    blurb: 'Black & white negative, printed. Wide latitude, moderate grain.',
  },
];

export type SessionState = 'idle' | 'decoding' | 'ready' | 'error';

const PREVIEW_MAX_DIM = 2400;
/** Extra pixels rendered around the 100% viewport so small pans need no re-render. */
const CROP_MARGIN = 192;
const CROP_DEBOUNCE_MS = 150;

export type ZoomMode = 'fit' | 'actual';

interface Point {
  readonly x: number;
  readonly y: number;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly film = signal<FilmId>('kodachrome-64');
  readonly ev = signal(0);
  private readonly baselineEv = signal(0);
  readonly halation = signal(true);
  readonly print = signal(DEFAULT_SETTINGS.print);
  /** How negatives are rendered; slides use `print` (projection) instead. */
  readonly negativeOutput = signal<'lab' | 'print'>('lab');
  readonly printEv = signal(DEFAULT_SETTINGS.printEv);
  readonly grain = signal(true);
  readonly grainAmount = signal(DEFAULT_SETTINGS.grainAmount);
  readonly grainSize = signal(DEFAULT_SETTINGS.grainSize);
  /** Post-film tone and colour sliders, each -100..100. */
  readonly adjustments = signal<Adjustments>({ ...NO_ADJUSTMENTS });
  private readonly grade = computed(() => {
    const a = this.adjustments();
    return {
      whites: a.whites / 100,
      highlights: a.highlights / 100,
      blacks: a.blacks / 100,
      shadows: a.shadows / 100,
      temperature: a.temperature / 100,
      tint: a.tint / 100,
      // The slider scales the film look's own saturation; -100 is monochrome.
      saturation: (1 + DEFAULT_SETTINGS.saturation) * (1 + a.saturation / 100) - 1,
    };
  });
  readonly zoom = signal<ZoomMode>('fit');
  /** Centre of the 100% view in full-resolution pixels (updated live while panning). */
  readonly center = signal<Point | null>(null);
  /** Viewer size in device pixels, reported by the viewer. */
  readonly viewport = signal({ w: 0, h: 0 });

  readonly state = signal<SessionState>('idle');
  readonly message = signal('Open a RAW, TIFF, JPEG, PNG, WebP or HEIF image to begin.');
  readonly fileName = signal<string | null>(null);
  readonly processing = signal(false);
  readonly dimensions = signal<{ width: number; height: number } | null>(null);

  /** Unprocessed (before) preview. */
  readonly original = signal<PreviewImage | null>(null);
  /** Film-processed (after) preview. */
  readonly result = signal<PreviewImage | null>(null);
  private readonly cropOriginal = signal<PreviewImage | null>(null);
  private readonly cropResult = signal<PreviewImage | null>(null);
  /** The unprocessed image at the current zoom. */
  readonly before = computed(() =>
    this.zoom() === 'actual' && this.cropOriginal() ? this.cropOriginal() : this.original(),
  );
  /** The film-processed image at the current zoom (falls back to `before` until ready). */
  readonly after = computed(() => {
    const actual = this.zoom() === 'actual' && this.cropOriginal();
    return (actual ? this.cropResult() : this.result()) ?? this.before();
  });
  readonly split = signal(false);

  /** Whether the print/projection stage is on for the current film. */
  private readonly effectivePrint = computed(() =>
    FILMS.find((f) => f.id === this.film())?.kind === 'Negative'
      ? this.negativeOutput() === 'print'
      : this.print(),
  );

  /** Export progress 0..1, or null when idle. */
  readonly exportProgress = signal<number | null>(null);
  readonly exportStage = signal('');
  private exportAbort: AbortController | null = null;

  private readonly source = signal<LinearImage | null>(null);
  private readonly committedCenter = signal<Point | null>(null);
  private full: LinearImage | null = null;
  private abort: AbortController | null = null;

  constructor(
    private readonly decoder: ImageDecoderService,
    private readonly engine: FilmEngineService,
  ) {
    effect((onCleanup) => {
      const c = this.center();
      const t = setTimeout(() => this.committedCenter.set(c), CROP_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(t));
    });
    effect(() => {
      const source = this.source();
      const film = this.film();
      const ev = this.ev() + this.baselineEv();
      const halation = this.halation();
      const print = this.effectivePrint();
      const printEv = this.printEv();
      const zoom = this.zoom();
      if (!source) return;
      const base = { ev, halation, print, printEv, ...this.grade() };
      if (zoom === 'fit') {
        untracked(() => void this.render(source, film, { ...DEFAULT_SETTINGS, ...base }));
        return;
      }
      const settings: RenderSettings = {
        ...DEFAULT_SETTINGS,
        ...base,
        grain: this.grain(),
        grainAmount: this.grainAmount(),
        grainSize: this.grainSize(),
      };
      const center = this.committedCenter();
      const vp = this.viewport();
      if (center && vp.w > 0) untracked(() => void this.renderCrop(film, settings, center, vp));
    });
  }

  setAdjustment(key: keyof Adjustments, value: number): void {
    this.adjustments.update((a) => ({ ...a, [key]: value }));
  }

  resetAll(): void {
    this.film.set('kodachrome-64');
    this.ev.set(0);
    this.halation.set(true);
    this.print.set(DEFAULT_SETTINGS.print);
    this.negativeOutput.set('lab');
    this.printEv.set(DEFAULT_SETTINGS.printEv);
    this.grain.set(true);
    this.grainAmount.set(DEFAULT_SETTINGS.grainAmount);
    this.grainSize.set(DEFAULT_SETTINGS.grainSize);
    this.adjustments.set({ ...NO_ADJUSTMENTS });
  }

  /** Renders the whole image at full resolution (grain included) and downloads it. */
  async exportImage(format: ExportFormat, jpegQuality: number): Promise<void> {
    const full = this.full;
    if (!full || this.exportProgress() !== null) return;
    const info = FILMS.find((f) => f.id === this.film())!;
    const abort = new AbortController();
    this.exportAbort = abort;
    this.exportProgress.set(0);
    this.exportStage.set('Developing');
    try {
      const out = await this.engine.process({
        source: full,
        stock: info.stock,
        settings: {
          ...DEFAULT_SETTINGS,
          ev: this.ev() + this.baselineEv(),
          halation: this.halation(),
          print: this.effectivePrint(),
          printEv: this.printEv(),
          ...this.grade(),
          grain: this.grain(),
          grainAmount: this.grainAmount(),
          grainSize: this.grainSize(),
        },
        signal: abort.signal,
        onProgress: (f) => this.exportProgress.set(f * 0.9),
      });
      this.exportStage.set('Encoding');
      this.exportProgress.set(0.95);
      const blob =
        format === 'png16'
          ? await encodePng16(out)
          : format === 'tiff16'
            ? encodeTiff16(out)
            : await encodeJpeg(out, jpegQuality);
      const ext = EXPORT_FORMATS.find((f) => f.id === format)!.ext;
      const base = (this.fileName() ?? 'image').replace(/\.[^.]+$/, '');
      download(blob, `${base}-${info.id}.${ext}`);
      this.message.set(`Exported ${base}-${info.id}.${ext} (${full.width}×${full.height}).`);
    } finally {
      this.exportProgress.set(null);
      this.exportStage.set('');
      if (this.exportAbort === abort) this.exportAbort = null;
    }
  }

  cancelExport(): void {
    this.exportAbort?.abort();
  }

  setZoom(mode: ZoomMode): void {
    if (mode === 'actual' && this.full && !this.center()) {
      const c = { x: this.full.width / 2, y: this.full.height / 2 };
      this.center.set(c);
      this.committedCenter.set(c);
    }
    this.zoom.set(mode);
  }

  /** Pans the 100% view by a delta in full-resolution pixels. */
  pan(dx: number, dy: number): void {
    const c = this.center();
    const f = this.full;
    if (!c || !f) return;
    this.center.set({
      x: Math.min(f.width, Math.max(0, c.x + dx)),
      y: Math.min(f.height, Math.max(0, c.y + dy)),
    });
  }

  private loadId = 0;

  /** Downloads an image by URL and opens it, as if the user had picked the file. */
  async openUrl(url: string, name: string): Promise<void> {
    const id = ++this.loadId;
    this.abort?.abort();
    this.state.set('decoding');
    this.fileName.set(name);
    this.message.set(`Loading ${name}…`);
    let file: File;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      file = new File([blob], withExtension(name, blob.type), { type: blob.type });
    } catch {
      if (id !== this.loadId) return;
      this.state.set('error');
      this.message.set(`Could not load ${name}.`);
      return;
    }
    if (id === this.loadId) await this.open(file);
  }

  async open(file: File): Promise<void> {
    this.loadId++;
    this.abort?.abort();
    this.state.set('decoding');
    this.fileName.set(file.name);
    this.message.set(`Decoding ${file.name}…`);
    try {
      const decoded = await this.decoder.decode(file);
      this.full = decoded.image;
      this.baselineEv.set(decoded.baselineEv);
      this.dimensions.set({ width: decoded.image.width, height: decoded.image.height });
      const small = downscaleLinear(decoded.image, PREVIEW_MAX_DIM);
      this.original.set(buildPreview(small));
      this.result.set(null);
      this.cropOriginal.set(null);
      this.cropResult.set(null);
      this.center.set(null);
      this.committedCenter.set(null);
      this.zoom.set('fit');
      this.source.set(small);
      this.state.set('ready');
      const mp = ((decoded.image.width * decoded.image.height) / 1e6).toFixed(1);
      const iso = decoded.iso > 0 ? ` · ISO ${decoded.iso}` : '';
      this.message.set(`${decoded.camera || file.name} · ${mp} MP${iso}`);
    } catch (err) {
      this.state.set('error');
      this.message.set(err instanceof Error ? err.message : 'Could not decode this file.');
    }
  }

  private async renderCrop(
    filmId: FilmId,
    settings: RenderSettings,
    center: Point,
    vp: { w: number; h: number },
  ): Promise<void> {
    const full = this.full;
    if (!full) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const info = FILMS.find((f) => f.id === filmId)!;
    const rw = Math.min(full.width, Math.round(vp.w) + 2 * CROP_MARGIN);
    const rh = Math.min(full.height, Math.round(vp.h) + 2 * CROP_MARGIN);
    const rx = Math.min(full.width - rw, Math.max(0, Math.round(center.x - rw / 2)));
    const ry = Math.min(full.height - rh, Math.max(0, Math.round(center.y - rh / 2)));
    this.processing.set(true);
    try {
      const out = await this.engine.process({
        source: full,
        stock: info.stock,
        settings,
        region: { x: rx, y: ry, w: rw, h: rh },
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const origin = { x: rx, y: ry };
      const before = extractTile(full, rx, ry, rw, rh);
      this.cropOriginal.set({
        ...buildPreview({ width: rw, height: rh, data: before }),
        origin,
      });
      this.cropResult.set(previewFromEncoded(out, origin));
    } catch (err) {
      if (abort.signal.aborted) return;
      this.state.set('error');
      this.message.set(err instanceof Error ? err.message : 'Processing failed.');
    } finally {
      if (this.abort === abort) this.processing.set(false);
    }
  }

  private async render(
    source: LinearImage,
    filmId: FilmId,
    settings: RenderSettings,
  ): Promise<void> {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const info = FILMS.find((f) => f.id === filmId)!;
    this.processing.set(true);
    try {
      const out = await this.engine.process({
        source,
        stock: info.stock,
        settings,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      this.result.set(previewFromEncoded(out));
    } catch (err) {
      if (abort.signal.aborted) return;
      this.state.set('error');
      this.message.set(err instanceof Error ? err.message : 'Processing failed.');
    } finally {
      if (this.abort === abort) this.processing.set(false);
    }
  }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/tiff': '.tiff',
};

/** The decoder picks a format from the file extension, so make sure the name has one. */
function withExtension(name: string, mime: string): string {
  const lower = name.toLowerCase();
  if (SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return name;
  return name + (MIME_EXTENSIONS[mime] ?? '.jpg');
}
