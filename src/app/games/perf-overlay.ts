import type { Application } from 'pixi.js';

const RECENT_FRAMES = 120;
const TAPS_SHOWN = 4;
/** Frames recorded around each tap: the one before it, the next one, and a few more. */
const FRAMES_AFTER_TAP = 3;

interface Tap {
  /** Milliseconds from the touch event being created to the next frame starting. */
  inputDelay: number;
  /** Time the pointerdown handlers took to run. */
  handlerMs: number;
  /** Frame times spanning the tap: one before, then the next few. */
  frames: number[];
  frameIndex: number;
}

/**
 * Turned on with `?perf`: shows frame times and how each tap lines up with them, to find out whether a
 * hitch comes from the tap itself, from slow frames, or from uneven frame delivery on a particular device.
 */
export const attachPerfOverlay = (app: Application, host: HTMLElement): (() => void) => {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:absolute;left:0;top:0;z-index:10;margin:0;padding:4px 6px;font:10px/1.3 monospace;color:#0f0;' +
    'background:rgb(0 0 0 / 0.7);pointer-events:none;white-space:pre';
  host.appendChild(box);

  const deltas: number[] = [];
  const taps: Tap[] = [];
  let frameIndex = 0;
  let frameStart = performance.now();
  let longTasks = 0;
  let pending: { eventTime: number; handlerMs: number; before: number } | null = null;

  const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver((l) => (longTasks += l.getEntries().length));
  try {
    observer?.observe({ entryTypes: ['longtask'] });
  } catch {
    // Not every browser reports long tasks.
  }

  let downStart = 0;
  let downEvent = 0;
  const onDownStart = (event: PointerEvent): void => {
    downStart = performance.now();
    downEvent = event.timeStamp;
  };
  // Bubbling to the window happens after every handler on the canvas host has run.
  const onDownEnd = (): void => {
    pending = { eventTime: downEvent, handlerMs: performance.now() - downStart, before: deltas[deltas.length - 1] ?? 0 };
  };
  host.addEventListener('pointerdown', onDownStart, { capture: true });
  window.addEventListener('pointerdown', onDownEnd);

  const onFrame = (): void => {
    const now = performance.now();
    const delta = now - frameStart;
    frameStart = now;
    frameIndex++;
    deltas.push(delta);
    if (deltas.length > RECENT_FRAMES) deltas.shift();

    if (pending) {
      taps.push({
        inputDelay: now - pending.eventTime,
        handlerMs: pending.handlerMs,
        frames: [pending.before, delta],
        frameIndex,
      });
      if (taps.length > TAPS_SHOWN) taps.shift();
      pending = null;
    }
    for (const tap of taps) {
      if (tap.frames.length < FRAMES_AFTER_TAP + 1 && frameIndex > tap.frameIndex) tap.frames.push(delta);
    }
    if (frameIndex % 15 === 0) render();
  };

  const render = (): void => {
    const avg = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
    const worst = Math.max(...deltas);
    const slow = deltas.filter((d) => d > 20).length;
    const lines = [
      `frame avg ${avg.toFixed(1)}ms worst ${worst.toFixed(0)}ms slow(>20) ${slow}/${deltas.length} longtasks ${longTasks}`,
      `dpr ${window.devicePixelRatio} canvas ${app.canvas.width}x${app.canvas.height}`,
      ...taps.map((t) => `tap in ${t.inputDelay.toFixed(0)}ms handler ${t.handlerMs.toFixed(1)}ms frames ${t.frames.map((f) => f.toFixed(0)).join(' ')}`),
    ];
    box.textContent = lines.join('\n');
  };

  app.ticker.add(onFrame);
  return () => {
    app.ticker.remove(onFrame);
    host.removeEventListener('pointerdown', onDownStart, { capture: true });
    window.removeEventListener('pointerdown', onDownEnd);
    observer?.disconnect();
    box.remove();
  };
};
