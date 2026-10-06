import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { GameCanvas, type GameSurface, type LogicalPoint } from '../../games/game-canvas';
import { ScoreService } from '../../games/score.service';
import { Sfx } from '../../games/sfx';
import { WindowFrame } from '../../ui/window-frame';
import { HEIGHT, WIDTH } from './constants';
import { LongestGame } from './game';
import { DPad, type StickVector } from './dpad';
import { LongestView } from './view';

@Component({
  selector: 'app-worlds-longest-game',
  imports: [WindowFrame, GameCanvas, DPad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(document:visibilitychange)': 'onVisibility()',
    '(window:blur)': 'game?.releaseAll()',
  },
  template: `
    <app-window-frame title="World's Longest Game" landscape>
      <div class="stage" (touchstart)="$event.preventDefault()">
        <div class="screen">
          <app-game-canvas
            [logicalWidth]="width"
            [logicalHeight]="height"
            background="#000000"
            [integerScale]="false"
            [antialias]="true"
            label="World's Longest Game"
            (ready)="onReady($event)"
            (press)="onPress($event)"
          />
        </div>
        <div class="pad"><app-dpad (moved)="onStick($event)" /></div>
      </div>
    </app-window-frame>
  `,
  styles: `
    .stage {
      position: relative;
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      background: #000;
    }
    .screen {
      display: flex;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
    }
    .pad {
      display: none;
    }
    @media (pointer: coarse), (max-width: 760px) {
      /* Phones in landscape: a see-through d-pad over the bottom-left of the game. */
      .pad {
        display: block;
        position: absolute;
        left: 16px;
        bottom: 16px;
        width: 150px;
        height: 150px;
        opacity: 0.5;
      }
    }
    @media (max-width: 760px) and (orientation: portrait) {
      /* Phones in portrait: the 4:3 game on top, a solid d-pad in the space below. */
      .stage {
        flex-direction: column;
        background: #1c1c24;
      }
      .screen {
        flex: 0 0 auto;
        aspect-ratio: 4 / 3;
        background: #000;
      }
      .pad {
        position: static;
        flex: 1 1 0;
        width: 100%;
        height: auto;
        min-height: 0;
        padding: 12px;
        opacity: 1;
      }
    }
  `,
})
export class WorldsLongestGame {
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected game?: LongestGame;
  private readonly scores = inject(ScoreService);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.game?.dispose());
  }

  protected onReady({ app, root }: GameSurface): void {
    const game = new LongestGame(this.scores, new Sfx());
    const view = new LongestView(root, game);
    this.game = game;
    app.ticker.add((ticker) => view.update(game.frame(ticker.deltaMS)));
  }

  protected onPress({ x, y }: LogicalPoint): void {
    this.game?.press(x, y);
  }

  protected onStick({ x, y }: StickVector): void {
    this.game?.setStick(x, y);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.game || event.ctrlKey || event.metaKey || event.altKey || this.isFormTarget(event)) return;
    if (event.repeat) {
      if (this.game.usesKey(event.code)) event.preventDefault();
      return;
    }
    if (this.game.keyDown(event.code)) event.preventDefault();
  }

  protected onKeyUp(event: KeyboardEvent): void {
    this.game?.keyUp(event.code);
  }

  protected onVisibility(): void {
    if (document.hidden) this.game?.releaseAll();
  }

  /** Enter and Space must keep activating a focused link, button or field. */
  private isFormTarget(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    return !!target?.closest('a, button, input, select, textarea, [contenteditable]');
  }
}
