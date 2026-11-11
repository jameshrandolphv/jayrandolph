import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { GamePrivacyPolicy, GameSupport, type GameInfo } from '../../ui/game-info-pages';

/*
 * The pages the app stores link to: Crash Crossing's privacy policy and support page, at /crash-crossing/privacy and
 * /crash-crossing/support. The wording they share with the other games is in ui/game-info-pages; what is particular to
 * Crash Crossing is here, and must match the shipped apps.
 */

const CRASH_CROSSING: GameInfo = {
  name: 'Crash Crossing',
  slug: 'crash-crossing',
  effective: 'November 11, 2026',
  stored: [
    'your best score;',
    'the in-game money you have earned and the items you have obtained with it in the in-game shop;',
    'your settings, such as whether sound is turned on; and',
  ],
  shop: 'The in-game shop accepts only the virtual money earned by playing the App; that virtual money has no real-world value, cannot be purchased, and cannot be exchanged for real money.',
  best: 'best score',
  support: {
    tagline: 'Everything you need to keep the city moving, on iPhone, iPad and Android',
    pitch: [
      'Welcome to the busiest crossing in New York, where you run the show! Draw a line from any car, bus, bike or person to the exit that matches their color and watch the city flow. Cars wait at the stop line for your line, then follow the lights. Every correct exit earns you a dollar; a wrong exit or a crash costs one. Three crashes end the game, and so does traffic backing up off the screen, so keep it moving.',
      'You have plenty of tricks up your sleeve. Tap anyone to stop them and tap again to send them on their way. Double-tap someone who has a line to wave them through a red light. Hold a finger on anyone on foot to hail them a taxi for $3. Your earnings add up from game to game, and the Shop on the title screen turns them into handy tools and fun extras like new vehicles, characters and maps.',
    ],
    removeAdsButton: 'the button with the crossed-out \u201cAD\u201d on the title screen',
    saved: 'Your earnings and everything you\u2019ve picked up in the shop',
  },
};

@Component({
  selector: 'app-crash-crossing-privacy',
  imports: [GamePrivacyPolicy],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-privacy-policy [game]="game" />`,
})
export class CrashCrossingPrivacy {
  protected readonly game = CRASH_CROSSING;

  constructor() {
    inject(Title).setTitle('Crash Crossing Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-crash-crossing-support',
  imports: [GameSupport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-support [game]="game" />`,
})
export class CrashCrossingSupport {
  protected readonly game = CRASH_CROSSING;

  constructor() {
    inject(Title).setTitle('Crash Crossing Support - Jay Randolph');
  }
}
