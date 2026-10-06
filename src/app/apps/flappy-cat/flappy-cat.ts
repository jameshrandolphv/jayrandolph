import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { SoundSettings } from '../../core/sound-settings';
import { GameCanvas, type GameSurface, type LogicalPoint } from '../../games/game-canvas';
import { ScoreService } from '../../games/score.service';
import { Sfx } from '../../games/sfx';
import { WindowFrame } from '../../ui/window-frame';
import { COLORS } from './sprites';
import { HEIGHT, WIDTH } from './constants';
import { FlappyGame } from './game';
import { FlappyView } from './view';

const PRIMARY_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

@Component({
  selector: 'app-flappy-cat',
  imports: [WindowFrame, GameCanvas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibility()',
    '(window:blur)': 'game?.autoPause()',
  },
  template: `
    <app-window-frame title="Flappy Cat" portrait>
      <app-game-canvas
        [logicalWidth]="width"
        [logicalHeight]="height"
        [background]="background"
        [integerScale]="false"
        label="Flappy Cat"
        (ready)="onReady($event)"
        (press)="onPress($event)"
      />
    </app-window-frame>
  `,
})
export class FlappyCat {
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly background = COLORS.sky;

  protected game?: FlappyGame;
  private readonly scores = inject(ScoreService);
  private readonly sound = inject(SoundSettings);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.dispose());
  }

  protected onReady({ app, root }: GameSurface): void {
    const game = new FlappyGame(this.scores, new Sfx(this.sound));
    const view = new FlappyView(root, game.sim);
    this.game = game;
    app.ticker.add((ticker) => {
      const alpha = game.frame(ticker.deltaMS);
      view.update(game.result, alpha);
    });
  }

  protected onPress({ x, y }: LogicalPoint): void {
    this.game?.press(x, y);
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
