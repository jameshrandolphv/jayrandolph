import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { SoundSettings } from '../../core/sound-settings';
import { GameCanvas, type GameSurface } from '../../games/game-canvas';
import { ScoreService } from '../../games/score.service';
import { Sfx } from '../../games/sfx';
import { WindowFrame } from '../../ui/window-frame';
import { PAL } from './art';
import { HEIGHT, WIDTH } from './constants';
import { BatOutGame } from './game';
import { BatOutView } from './view';

const PRIMARY_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/** Chaos Park's lettering, self-hosted so the game works offline; both are under the SIL Open Font License. */
const FONTS: readonly [family: string, url: string][] = [
  ['Bangers', 'fonts/bangers.woff2'],
  ['Pacifico', 'fonts/pacifico.woff2'],
];
const FONT_TIMEOUT_MS = 4000;

/** Text is rasterised when it is first drawn, so the fonts have to be ready before the view starts. */
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
  selector: 'app-bat-out',
  imports: [WindowFrame, GameCanvas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibility()',
    '(window:blur)': 'game?.autoPause()',
  },
  template: `
    <!-- A portrait phone screen in the middle; wider or longer screens see more of the ballpark round it. -->
    <app-window-frame title="Bat Out!" portrait>
      <app-game-canvas
        [logicalWidth]="width"
        [logicalHeight]="height"
        [background]="background"
        [integerScale]="false"
        [antialias]="true"
        [fill]="true"
        [fillCentre]="true"
        label="Bat Out!"
        (ready)="onReady($event)"
      />
    </app-window-frame>
  `,
})
export class BatOut {
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly background = `#${PAL.sky.toString(16)}`;

  protected game?: BatOutGame;
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
    const game = new BatOutGame(this.scores, new Sfx(this.sound));
    const view = new BatOutView(app, root, game);
    this.game = game;
    // The canvas updates both in place on resize.
    game.size = surface.size;
    game.bounds = surface.bounds;
    app.ticker.add((ticker) =>
      view.update(game.frame(ticker.deltaMS), ticker.deltaMS, surface.bounds, surface.size),
    );
    this.detach = this.trackPointer(surface, game);
  }

  /** Pointers are followed by hand rather than through template bindings, so moves don't run change detection. */
  private trackPointer({ element, toLogical }: GameSurface, game: BatOutGame): () => void {
    const down = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events can't be captured; moves over the canvas still arrive.
      }
      const p = toLogical(event.clientX, event.clientY);
      game.pointerDown(event.pointerId, p.x, p.y, event.timeStamp);
    };
    const move = (event: PointerEvent): void => {
      // Coalesced events keep the whole path of a quick swipe, which the swing and the pitch are read from.
      const events = event.getCoalescedEvents?.() ?? [];
      for (const e of events.length ? events : [event]) {
        const p = toLogical(e.clientX, e.clientY);
        game.pointerMove(event.pointerId, p.x, p.y, e.timeStamp);
      }
    };
    const up = (event: PointerEvent): void => game.pointerUp(event.pointerId, event.timeStamp);
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
    }
  }

  protected onVisibility(): void {
    if (document.hidden) this.game?.autoPause();
  }
}
