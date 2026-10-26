import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { WindowFrame } from '../../ui/window-frame';

/*
 * The pages the App Store and Google Play link to: Chaos Park's privacy policy and support page, and a marketing
 * contact page for the games. Plain reading windows on the desktop, at /chaos-park/privacy, /chaos-park/support and
 * /marketing.
 */

const CONTACT = 'jayrandolphgames@gmail.com';

const PAGE_STYLES = `
  .info-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px 28px 28px;
    background: #fff;
    color: #222;
    font: 15px/1.55 'Lucida Grande', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .info-body > * { max-width: 680px; }
  h2 { margin: 0 0 4px; font-size: 24px; }
  h3 { margin: 22px 0 6px; font-size: 17px; }
  p, ul { margin: 0 0 10px; }
  ul { padding-left: 22px; }
  li { margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
  a { color: #1a5fb4; }
`;

@Component({
  selector: 'app-chaos-park-privacy',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: PAGE_STYLES,
  template: `
    <app-window-frame title="Chaos Park Privacy Policy" closeLink="/" compact>
      <div class="info-body">
        <h2>Chaos Park Privacy Policy</h2>
        <p class="meta">Effective October 20, 2026</p>

        <p>
          Chaos Park is a game for iPhone, iPad and Android made by Jay Randolph, an independent
          developer. This policy explains what information the apps use and why. The short version:
          the game itself collects nothing about you and has no accounts or servers of its own; the
          ads in it are provided by Google AdMob, which does collect some information, as described
          below.
        </p>

        <h3>What the game keeps on your device</h3>
        <p>
          Your best score, and whether you have bought Remove Ads, are saved on your device so the
          game remembers them. They are not sent to us. Deleting the app deletes them.
        </p>

        <h3>Advertising (Google AdMob)</h3>
        <p>
          The app shows ads from Google AdMob: an occasional full-screen ad between games, and a
          video you can choose to watch for an extra life. To show and measure these ads and to
          prevent fraud, Google's software in the app may collect:
        </p>
        <ul>
          <li>
            your device's advertising identifier (the IDFA on iPhone, only if you allow tracking;
            the advertising ID on Android), and other device identifiers
          </li>
          <li>your IP address and approximate location derived from it</li>
          <li>information about the ads you see and interact with</li>
          <li>diagnostic information such as crash and performance data</li>
        </ul>
        <p>
          Google's use of this information is governed by
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener"
            >Google's Privacy Policy</a
          >; see also
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener"
            >how Google uses information from apps that use its services</a
          >.
        </p>

        <h3>Your choices</h3>
        <ul>
          <li>
            Where the law requires it (for example in the European Economic Area, the UK,
            Switzerland and some US states), the app asks for your consent before personalised ads
            are shown. You can change your choice at any time with the padlock button on the title
            screen.
          </li>
          <li>
            On iPhone and iPad, the app asks whether it may track you. You can change this in
            Settings &gt; Privacy &amp; Security &gt; Tracking. If you say no, you still see ads,
            just not personalised ones.
          </li>
          <li>
            On Android, you can reset or delete your advertising ID in your device's settings
            (Privacy &gt; Ads, or Google &gt; Ads, depending on the device).
          </li>
          <li>
            Buying Remove Ads ($0.99) removes the ads between games. The extra-life video is still
            offered, and only plays if you choose it.
          </li>
        </ul>

        <h3>Purchases</h3>
        <p>
          The Remove Ads purchase is handled entirely by the App Store or Google Play. We never see
          your payment details; the app only learns whether Remove Ads has been bought, so it can
          switch off the ads between games.
        </p>

        <h3>Leaderboards</h3>
        <p>
          If you are signed in to Game Center (Apple) or Google Play Games, your best score is sent
          to that service and shown on the Chaos Park leaderboard with your player name, where other
          players can see it. This is handled by Apple or Google under their own privacy policies.
          If you don't sign in, nothing is sent.
        </p>

        <h3>Children</h3>
        <p>
          Chaos Park is not directed at children under 13, and we do not knowingly collect personal
          information from them. If you believe a child has provided information through the app,
          contact us and we will help remove it.
        </p>

        <h3>The website version</h3>
        <p>
          The version of Chaos Park on this website has no ads, no purchases and no leaderboard. It
          keeps your best score in your browser's storage only.
        </p>

        <h3>Changes and contact</h3>
        <p>
          If this policy changes, the new version will be posted on this page with a new effective
          date. Questions or requests about your information:
          <a [href]="'mailto:' + contact">{{ contact }}</a
          >.
        </p>
        <p><a routerLink="/chaos-park/support">Chaos Park support</a></p>
      </div>
    </app-window-frame>
  `,
})
export class ChaosParkPrivacy {
  protected readonly contact = CONTACT;

  constructor() {
    inject(Title).setTitle('Chaos Park Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-chaos-park-support',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: PAGE_STYLES,
  template: `
    <app-window-frame title="Chaos Park Support" closeLink="/" compact>
      <div class="info-body">
        <h2>Chaos Park Support</h2>
        <p class="meta">For the iPhone, iPad and Android apps</p>

        <p>
          Keep the park's visitors from crashing into each other: swipe across the road to change a
          visitor's lane, and along it to speed them up or slow them down. Every lap is a point, and
          three collisions end the game. The
          <em>How to Play</em> button on the title screen has the full rules, and you can also
          <a routerLink="/chaos-park">play it here in your browser</a>.
        </p>

        <h3>I bought Remove Ads but still see ads</h3>
        <p>
          Remove Ads stops the ads between games. The "Keep going" video is still offered after a
          crash, but only plays if you tap it. If ads still appear between games, tap the button
          with the crossed-out "AD" on the title screen, then <em>Restore purchase</em>. Make sure
          you are signed in with the same Apple ID or Google account you bought it with. Restoring
          is free.
        </p>

        <h3>I got a new phone or reinstalled the game</h3>
        <p>
          Remove Ads comes back with <em>Restore purchase</em>, as above. Your best score is saved
          on the device, so a new phone starts again from zero, but your best is kept on the
          leaderboard if you were signed in.
        </p>

        <h3>The leaderboard doesn't open or doesn't show my score</h3>
        <p>
          On iPhone and iPad, sign in to Game Center in Settings &gt; Game Center. On Android, sign
          in to Google Play Games. Scores you set before signing in are sent the next time you open
          the game signed in.
        </p>

        <h3>Changing ad privacy choices</h3>
        <p>
          Where your region requires it, a padlock button on the title screen reopens your ad
          choices. On iPhone you can also change tracking in Settings &gt; Privacy &amp; Security
          &gt; Tracking. More in the
          <a routerLink="/chaos-park/privacy">privacy policy</a>.
        </p>

        <h3>Something else</h3>
        <p>
          Email <a [href]="'mailto:' + contact">{{ contact }}</a
          >. It helps to say which phone or tablet you have and what happened. You should hear back
          within a few days.
        </p>
      </div>
    </app-window-frame>
  `,
})
export class ChaosParkSupport {
  protected readonly contact = CONTACT;

  constructor() {
    inject(Title).setTitle('Chaos Park Support - Jay Randolph');
  }
}

@Component({
  selector: 'app-marketing',
  imports: [WindowFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: PAGE_STYLES,
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
  protected readonly contact = CONTACT;

  constructor() {
    inject(Title).setTitle('Marketing - Jay Randolph');
  }
}
