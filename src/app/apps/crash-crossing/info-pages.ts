import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { GAMES_CONTACT, INFO_PAGE_STYLES } from '../../ui/info-page';
import { WindowFrame } from '../../ui/window-frame';

/*
 * The pages the App Store links to for Crash Crossing, which is only in the apps (there's no web version): its
 * privacy policy and support page, at /crash-crossing/privacy and /crash-crossing/support.
 */

@Component({
  selector: 'app-crash-crossing-privacy',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame title="Crash Crossing Privacy Policy" closeLink="/" compact>
      <div class="info-body">
        <h2>Crash Crossing Privacy Policy</h2>
        <p class="meta">Effective October 27, 2026</p>

        <p>
          Crash Crossing is a game for iPhone and iPad made by Jay Randolph, an independent
          developer. This policy explains what information the app uses and why. The short version:
          the game itself collects nothing about you and has no accounts or servers of its own; the
          ads in it are provided by Google AdMob, which does collect some information, as described
          below.
        </p>

        <h3>What the game keeps on your device</h3>
        <p>
          Your best score, the money you've earned in the game and what you've bought with it in its
          shop, whether the sound is on, and whether you have bought Remove Ads are saved on your
          device so the game remembers them. They are not sent to us. Deleting the app deletes them.
        </p>

        <h3>Advertising (Google AdMob)</h3>
        <p>
          The app shows ads from Google AdMob: an occasional full-screen ad between games, and a
          video you can choose to watch for an extra life. To show and measure these ads and to
          prevent fraud, Google's software in the app may collect:
        </p>
        <ul>
          <li>
            your device's advertising identifier (the IDFA, only if you allow tracking), and other
            device identifiers
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
            The app asks whether it may track you. You can change this in Settings &gt; Privacy
            &amp; Security &gt; Tracking. If you say no, you still see ads, just not personalised
            ones.
          </li>
          <li>
            Buying Remove Ads ($0.99) removes the ads between games. The extra-life video is still
            offered, and only plays if you choose it.
          </li>
        </ul>

        <h3>Purchases</h3>
        <p>
          The Remove Ads purchase is handled entirely by the App Store. We never see your payment
          details; the app only learns whether Remove Ads has been bought, so it can switch off the
          ads between games. The game's shop sells tools and extras for the dollars you earn by
          playing, never for real money.
        </p>

        <h3>Leaderboards</h3>
        <p>
          If you are signed in to Game Center, your best score is sent to Apple and shown on the
          Crash Crossing leaderboards with your player name, where other players can see it. This is
          handled by Apple under its own privacy policy. If you don't sign in, nothing is sent.
        </p>

        <h3>Children</h3>
        <p>
          Crash Crossing is not directed at children under 13, and we do not knowingly collect
          personal information from them. If you believe a child has provided information through
          the app, contact us and we will help remove it.
        </p>

        <h3>Changes and contact</h3>
        <p>
          If this policy changes, the new version will be posted on this page with a new effective
          date. Questions or requests about your information:
          <a [href]="'mailto:' + contact">{{ contact }}</a
          >.
        </p>
        <p><a routerLink="/crash-crossing/support">Crash Crossing support</a></p>
      </div>
    </app-window-frame>
  `,
})
export class CrashCrossingPrivacy {
  protected readonly contact = GAMES_CONTACT;

  constructor() {
    inject(Title).setTitle('Crash Crossing Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-crash-crossing-support',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame title="Crash Crossing Support" closeLink="/" compact>
      <div class="info-body">
        <h2>Crash Crossing Support</h2>
        <p class="meta">For the iPhone and iPad app</p>

        <p>
          Get the traffic and people through a busy New York crossing: draw a line from a car, bus,
          bike or person to the exit of their own colour. Cars wait at the stop line for their line,
          then keep to the lights. Every one who gets out the right way earns a dollar; a wrong exit
          or a crash costs one, and three crashes end the game, as does traffic backing up off the
          screen. Tapping someone stops them and tapping again sets them going, double-tapping
          someone with a line sends them on through a red light, and holding a finger on someone on
          foot hails them a taxi for $3. The money you earn adds up across games, and the
          <em>Shop</em> on the title screen spends it on tools for a game and extras such as new
          vehicles, characters and maps. The <em>How to Play</em> button has the rules in short.
        </p>

        <h3>I bought Remove Ads but still see ads</h3>
        <p>
          Remove Ads stops the ads between games. The "Keep going" video is still offered when a
          game ends, but only plays if you tap it. If ads still appear between games, tap the button
          with the crossed-out "AD" on the title screen, then <em>Restore purchase</em>. Make sure
          you are signed in with the same Apple ID you bought it with. Restoring is free.
        </p>

        <h3>I got a new phone or reinstalled the game</h3>
        <p>
          Remove Ads comes back with <em>Restore purchase</em>, as above. Your best score, the money
          you've earned and what you've bought in the shop are saved on the device, so a new phone
          starts again from zero, but your best is kept on the leaderboard if you were signed in.
        </p>

        <h3>The leaderboard doesn't open or doesn't show my score</h3>
        <p>
          Sign in to Game Center in Settings &gt; Game Center. Scores you set before signing in are
          sent the next time you open the game signed in.
        </p>

        <h3>Changing ad privacy choices</h3>
        <p>
          Where your region requires it, a padlock button on the title screen reopens your ad
          choices. You can also change tracking in Settings &gt; Privacy &amp; Security &gt;
          Tracking. More in the
          <a routerLink="/crash-crossing/privacy">privacy policy</a>.
        </p>

        <h3>Something else</h3>
        <p>
          Email <a [href]="'mailto:' + contact">{{ contact }}</a
          >. It helps to say which iPhone or iPad you have and what happened. You should hear back
          within a few days.
        </p>
      </div>
    </app-window-frame>
  `,
})
export class CrashCrossingSupport {
  protected readonly contact = GAMES_CONTACT;

  constructor() {
    inject(Title).setTitle('Crash Crossing Support - Jay Randolph');
  }
}
