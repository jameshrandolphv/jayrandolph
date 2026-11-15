import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { GamePrivacyPolicy, GameSupport, type GameInfo } from '../../ui/game-info-pages';

/*
 * The pages the app stores link to: Many Mini Moon Buggies' privacy policy and support page, at
 * /many-mini-moon-buggies/privacy and /many-mini-moon-buggies/support. The wording they share with the other games is
 * in ui/game-info-pages; what is particular to this game is here, and must match the shipped apps.
 */

const MANY_MINI_MOON_BUGGIES: GameInfo = {
  name: 'Many Mini Moon Buggies',
  slug: 'many-mini-moon-buggies',
  effective: 'November 11, 2026',
  stored: [
    'your best mission;',
    'the Moon Points you have earned, the drivers and worlds you have obtained with them in the Moon Shop, and which of those are turned on;',
    'your settings, such as whether sound is turned on; and',
  ],
  shop: 'The in-game Moon Shop accepts only the Moon Points earned by playing the App; Moon Points have no real-world value, cannot be purchased, and cannot be exchanged for real money.',
  best: 'best mission',
  support: {
    tagline: 'Mission control for players on iPhone, iPad and Android',
    pitch: [
      'Ready for liftoff? Spin the whole moon under your buggy with a drag, or flick it and coast. On every mission, pick a clear spot to land, capture the green alien on the far side and race it back to your lander before the battery runs flat.',
      'Here\u2019s the twist: every mission you bring home drives again in the missions after it. Steer clear of your old buggies and landers, and stay out from under the UFOs\u2019 blue beams, because being abducted ends the game. You start with three lives and can hold up to five with extra-life pick-ups. Between missions, the depot turns your points into extras like slime, dynamite, lasers or a jet pack, and the Moon Shop on the title screen unlocks new drivers and whole new worlds. Your score is the mission you reach. How far can you go?',
    ],
    removeAdsButton: 'the Remove Ads button in the top right of the title screen',
    saved: 'Your Moon Points and everything you\u2019ve unlocked in the Moon Shop',
  },
};

@Component({
  selector: 'app-many-mini-moon-buggies-privacy',
  imports: [GamePrivacyPolicy],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-privacy-policy [game]="game" />`,
})
export class ManyMiniMoonBuggiesPrivacy {
  protected readonly game = MANY_MINI_MOON_BUGGIES;

  constructor() {
    inject(Title).setTitle('Many Mini Moon Buggies Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-many-mini-moon-buggies-support',
  imports: [GameSupport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The window lays itself out in the workspace; neither wrapper element may add a box of its own.
  host: { style: 'display: contents' },
  template: `<app-game-support [game]="game" />`,
})
export class ManyMiniMoonBuggiesSupport {
  protected readonly game = MANY_MINI_MOON_BUGGIES;

  constructor() {
    inject(Title).setTitle('Many Mini Moon Buggies Support - Jay Randolph');
  }
}
