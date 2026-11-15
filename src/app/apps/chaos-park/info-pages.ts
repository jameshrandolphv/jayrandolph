import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { GamePrivacyPolicy, GameSupport, type GameInfo } from '../../ui/game-info-pages';
import { GAMES_CONTACT, INFO_PAGE_STYLES } from '../../ui/info-page';
import { WindowFrame } from '../../ui/window-frame';

/*
 * The pages the App Store and Google Play link to: Chaos Park's privacy policy and support page, and a marketing
 * contact page for the games. Plain reading windows on the desktop, at /chaos-park/privacy, /chaos-park/support and
 * /marketing. The wording the first two share with the other games is in ui/game-info-pages; what is particular to
 * Chaos Park is here, and must match the shipped apps.
 */

const CHAOS_PARK: GameInfo = {
  name: 'Chaos Park',
  slug: 'chaos-park',
  effective: 'November 11, 2026',
  stored: ['your best scores;', 'your settings, such as whether sound is turned on; and'],
  best: 'best score',
  webVersion: true,
  support: {
    tagline: 'Everything you need to keep the park moving, on iPhone, iPad and Android',
    pitch: [
      'Welcome to the busiest park in town! Walkers, runners, bikes, cars and horse carriages all share one loop, and it\u2019s up to you to keep them from colliding. Swipe across the road to move a visitor into another lane, or swipe along it to speed them up or slow them down. Every lap scores a point, and three collisions end the game. How many laps can you rack up?',
    ],
    removeAdsButton: 'the button with the crossed-out \u201cAD\u201d on the title screen',
    saved: 'Your scores',
  },
};

@Component({
  selector: 'app-chaos-park-privacy',
  imports: [GamePrivacyPolicy],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-privacy-policy [game]="game" />`,
})
export class ChaosParkPrivacy {
  protected readonly game = CHAOS_PARK;

  constructor() {
    inject(Title).setTitle('Chaos Park Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-chaos-park-support',
  imports: [GameSupport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-support [game]="game" />`,
})
export class ChaosParkSupport {
  protected readonly game = CHAOS_PARK;

  constructor() {
    inject(Title).setTitle('Chaos Park Support - Jay Randolph');
  }
}

@Component({
  selector: 'app-marketing',
  imports: [WindowFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame title="Marketing" closeLink="/" compact>
      <div class="info-body">
        <h2>Marketing</h2>
        <p>
          For any marketing-related queries, please contact
          <a [href]="'mailto:' + contact">{{ contact }}</a
          >.
        </p>
      </div>
    </app-window-frame>
  `,
})
export class Marketing {
  protected readonly contact = GAMES_CONTACT;

  constructor() {
    inject(Title).setTitle('Marketing - Jay Randolph');
  }
}
