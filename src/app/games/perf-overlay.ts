import type { Application } from 'pixi.js';

const RECENT_FRAMES = 120;
const TAPS_SHOWN = 4;
/** Frames recorded around each tap: the one before it, the next one, and a few more. */
const FRAMES_AFTER_TAP = 3;

/** How long the heartbeat history is kept, and how long after a tap a stall still counts as caused by it. */
const BEAT_HISTORY_MS = 3000;
const TAP_WINDOW_MS = 250;

/** CSS that strips the effects Safari is slowest at, for `?perf=flat`: rounded clipping, shadows and blur. */
const FLAT_CSS =
  '.window{border-radius:0!important;box-shadow:none!important}' +
  '.menubar,.dock{backdrop-filter:none!important;box-shadow:none!important}' +
  '.wallpaper{background:#1c4f9a!important}';

interface Tap {
  /** Event timestamp, to match against the main-thread heartbeat. */
  eventTime: number;
  /** Where the touch landed: the game, or elsewhere on the page. */
  where: string;
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
 * `blocked` is the longest time the main thread went without running a timer after the tap: if it is as long
 * as the slow frame, something kept the page busy; if it is short, the frame itself was held up.
 * Extras: `?perf=flat` drops window clipping, shadows and blur; `?res=2` caps the canvas resolution.
 */
export const attachPerfOverlay = (app: Application, host: HTMLElement): (() => void) => {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:absolute;left:0;top:0;z-index:10;margin:0;padding:4px 6px;font:10px/1.3 monospace;color:#0f0;' +
    'background:rgb(0 0 0 / 0.7);pointer-events:none;white-space:pre';
  host.appendChild(box);

  let flatStyle: HTMLStyleElement | null = null;
  if (new URLSearchParams(location.search).get('perf') === 'flat') {
    flatStyle = document.createElement('style');
    flatStyle.textContent = FLAT_CSS;
    document.head.appendChild(flatStyle);
  }

  const beats: { end: number; gap: number }[] = [];
  let beatLast = performance.now();
  let beatTimer = 0;
  const beat = (): void => {
    const now = performance.now();
    beats.push({ end: now, gap: now - beatLast });
    beatLast = now;
    while (beats.length && now - beats[0].end > BEAT_HISTORY_MS) beats.shift();
    beatTimer = window.setTimeout(beat, 0);
  };
  beatTimer = window.setTimeout(beat, 0);

  const deltas: number[] = [];
  const taps: Tap[] = [];
  let frameIndex = 0;
  let frameStart = performance.now();
  let longTasks = 0;
  let pending: { eventTime: number; handlerMs: number; before: number; where: string } | null = null;

  const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver((l) => (longTasks += l.getEntries().length));
  try {
    observer?.observe({ entryTypes: ['longtask'] });
  } catch {
    // Not every browser reports long tasks.
  }

  let downStart = 0;
  let downEvent = 0;
  let downWhere = '';
  const onDownStart = (event: PointerEvent): void => {
    downStart = performance.now();
    downEvent = event.timeStamp;
    downWhere = host.contains(event.target as Node) ? 'game' : 'off';
  };
  // Bubbling to the window happens after every handler on the canvas host has run.
  const onDownEnd = (): void => {
    pending = { eventTime: downEvent, handlerMs: performance.now() - downStart, where: downWhere, before: deltas[deltas.length - 1] ?? 0 };
  };
  // On the window so touches outside the game are measured too: a stall there isn't caused by the game's code.
  window.addEventListener('pointerdown', onDownStart, { capture: true });
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
        eventTime: pending.eventTime,
        where: pending.where,
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
      ...taps.map((t) => {
        const blocked = Math.max(0, ...beats.filter((b) => b.end >= t.eventTime && b.end <= t.eventTime + TAP_WINDOW_MS).map((b) => b.gap));
        return `${t.where} tap in ${t.inputDelay.toFixed(0)}ms handler ${t.handlerMs.toFixed(1)}ms blocked ${blocked.toFixed(0)}ms frames ${t.frames.map((f) => f.toFixed(0)).join(' ')}`;
      }),
    ];
    box.textContent = lines.join('\n');
  };

  app.ticker.add(onFrame);
  return () => {
    app.ticker.remove(onFrame);
    window.removeEventListener('pointerdown', onDownStart, { capture: true });
    window.removeEventListener('pointerdown', onDownEnd);
    observer?.disconnect();
    clearTimeout(beatTimer);
    flatStyle?.remove();
    box.remove();
  };
};
