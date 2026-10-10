import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { SoundSettings } from '../../core/sound-settings';
import { GameCanvas, type GameSurface } from '../../games/game-canvas';
import { ScoreService } from '../../games/score.service';
import { Sfx } from '../../games/sfx';
import { WindowFrame } from '../../ui/window-frame';
import { HEIGHT, WIDTH } from './constants';
import { FlightsGame } from './game';
import { FlightsView } from './view';

const PRIMARY_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const FAST_KEYS = new Set(['KeyF']);

/** Self-hosted so the game works offline; both are under the SIL Open Font License (see NOTICE). */
const FONTS: readonly [family: string, url: string][] = [
  ['Bangers', 'fonts/bangers.woff2'],
  ['Pacifico', 'fonts/pacifico.woff2'],
];
const FONT_TIMEOUT_MS = 4000;

/** Text is rasterised when it is created, so the fonts have to be ready before the view is built. */
const loadFonts = async (): Promise<void> => {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  const load = Promise.all(
    FONTS.map(async ([family, url]) => {
      const face = new FontFace(family, `url(${url})`);
      document.fonts.add(await face.load());
    }),
  );
  // A missing font falls back to the system ones rather than holding up the game.
  await Promise.race([load, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS))]).catch(
    () => undefined,
  );
};

@Component({
  selector: 'app-flights',
  imports: [WindowFrame, GameCanvas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibility()',
    '(window:blur)': 'game?.autoPause()',
  },
  template: `
    <!-- Fills the window: the airfield stays in the middle and the grass reaches out to the edges. -->
    <app-window-frame title="Flights!">
      <app-game-canvas
        [logicalWidth]="width"
        [logicalHeight]="height"
        background="#7c8183"
        [integerScale]="false"
        [antialias]="true"
        [fill]="true"
        [fillCentre]="true"
        label="Flights!"
        (ready)="onReady($event)"
      />
    </app-window-frame>
  `,
})
export class Flights {
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected game?: FlightsGame;
  private readonly scores = inject(ScoreService);
  private readonly sound = inject(SoundSettings);
  private destroyed = false;
  private detach?: () => void;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.detach?.();
      this.game?.dispose();
    });
  }

  protected async onReady(surface: GameSurface): Promise<void> {
    await loadFonts();
    if (this.destroyed) return;
    const { app, root } = surface;
    const game = new FlightsGame(this.scores, new Sfx(this.sound));
    const view = new FlightsView(root, game);
    this.game = game;
    // The canvas updates its bounds in place on resize, so the sim and view always see the current field.
    game.sim.bounds = surface.bounds;
    app.ticker.add((ticker) =>
      view.update(game.frame(ticker.deltaMS), ticker.deltaMS, surface.bounds),
    );
    this.detach = this.trackPointer(surface, game);
  }

  /**
   * Drags are followed by hand rather than through template bindings, so pointer moves don't run change
   * detection. One pointer at a time steers; capture keeps a drag going when it leaves the canvas.
   */
  private trackPointer({ element, toLogical }: GameSurface, game: FlightsGame): () => void {
    let active: number | null = null;
    const down = (event: PointerEvent): void => {
      if (active !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      active = event.pointerId;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events can't be captured; moves over the canvas still arrive.
      }
      const p = toLogical(event.clientX, event.clientY);
      game.pointerDown(p.x, p.y);
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== active) return;
      // Coalesced events keep a fast drag smooth where the browser batches moves into one frame.
      const events = event.getCoalescedEvents?.() ?? [];
      for (const e of events.length ? events : [event]) {
        const p = toLogical(e.clientX, e.clientY);
        game.pointerMove(p.x, p.y);
      }
    };
    const up = (event: PointerEvent): void => {
      if (event.pointerId !== active) return;
      active = null;
      game.pointerUp();
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
    };
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !this.game) return;
    const target = event.target as HTMLElement | null;
    // Enter and Space must keep activating a focused link, button or field.
    if (target?.closest('a, button, input, select, textarea, [contenteditable]')) return;

    if (PRIMARY_KEYS.has(event.code)) {
      event.preventDefault();
      this.game.primary();
    } else if (PAUSE_KEYS.has(event.code)) {
      event.preventDefault();
      this.game.togglePause();
    } else if (FAST_KEYS.has(event.code)) {
      event.preventDefault();
      this.game.toggleFast();
    }
  }

  protected onVisibility(): void {
    if (document.hidden) this.game?.autoPause();
  }
}
