import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { RawDecoderService, type LinearImage } from './raw-decoder.service';
import { buildPreview, downscaleLinear, previewFromEncoded, type PreviewImage } from './preview';
import { FilmEngineService, extractTile } from '../engine/film-engine.service';
import { DEFAULT_SETTINGS, type RenderSettings } from '../engine/film-params';
import {
  EXPORT_FORMATS,
  encodeJpeg,
  encodePng16,
  encodeTiff16,
  type ExportFormat,
} from '../export/encoders';

export type FilmId = 'kodachrome-64' | 'portra-400';

export interface FilmInfo {
  readonly id: FilmId;
  /** Baked data set name under public/film. */
  readonly stock: string;
  readonly name: string;
  readonly kind: 'Slide' | 'Negative';
  readonly blurb: string;
}

export const FILMS: readonly FilmInfo[] = [
  {
    id: 'kodachrome-64',
    stock: 'kodak_kodachrome_64',
    name: 'Kodachrome 64',
    kind: 'Slide',
    blurb: 'K-14 reversal film. Rich reds, deep contrast.',
  },
  {
    id: 'portra-400',
    stock: 'kodak_portra_400',
    name: 'Portra 400',
    kind: 'Negative',
    blurb: 'C-41 colour negative. Soft contrast, wide latitude.',
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
  readonly halation = signal(true);
  readonly contrast = signal(DEFAULT_SETTINGS.contrast);
  readonly grain = signal(true);
  readonly grainAmount = signal(DEFAULT_SETTINGS.grainAmount);
  readonly grainSize = signal(DEFAULT_SETTINGS.grainSize);
  readonly showOriginal = signal(false);
  readonly zoom = signal<ZoomMode>('fit');
  /** Centre of the 100% view in full-resolution pixels (updated live while panning). */
  readonly center = signal<Point | null>(null);
  /** Viewer size in device pixels, reported by the viewer. */
  readonly viewport = signal({ w: 0, h: 0 });

  readonly state = signal<SessionState>('idle');
  readonly message = signal('Open a Leica M10 .dng file to begin.');
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
  /** What the viewer shows when not in split view. */
  readonly preview = computed(() => (this.showOriginal() ? this.before() : this.after()));
  readonly split = signal(false);

  /** Export progress 0..1, or null when idle. */
  readonly exportProgress = signal<number | null>(null);
  readonly exportStage = signal('');
  private exportAbort: AbortController | null = null;

  private readonly source = signal<LinearImage | null>(null);
  private readonly committedCenter = signal<Point | null>(null);
  private full: LinearImage | null = null;
  private abort: AbortController | null = null;

  constructor(
    private readonly decoder: RawDecoderService,
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
      const ev = this.ev();
      const halation = this.halation();
      const contrast = this.contrast();
      const zoom = this.zoom();
      if (!source) return;
      const base = { ev, halation, contrast };
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
          ev: this.ev(),
          halation: this.halation(),
          contrast: this.contrast(),
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

  async open(file: File): Promise<void> {
    this.abort?.abort();
    this.state.set('decoding');
    this.fileName.set(file.name);
    this.message.set(`Decoding ${file.name}…`);
    try {
      const decoded = await this.decoder.decode(file);
      this.full = decoded.image;
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
      this.message.set(`${decoded.camera || 'Unknown camera'} · ${mp} MP · ISO ${decoded.iso}`);
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
