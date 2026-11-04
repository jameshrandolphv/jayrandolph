import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { GAMES_CONTACT, INFO_PAGE_STYLES } from '../../ui/info-page';
import { WindowFrame } from '../../ui/window-frame';

/*
 * The pages the App Store and Google Play link to for Many Mini Moon Buggies, which is only in the apps (there's no
 * web version): its privacy policy and support page, at /many-mini-moon-buggies/privacy and
 * /many-mini-moon-buggies/support. The apps' About screens link here too.
 */

@Component({
  selector: 'app-many-mini-moon-buggies-privacy',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame title="Many Mini Moon Buggies Privacy Policy" closeLink="/" compact>
      <div class="info-body">
        <h2>Many Mini Moon Buggies Privacy Policy</h2>
        <p class="meta">Effective November 3, 2026</p>

        <p>
          Many Mini Moon Buggies is a game for iPhone, iPad and Android made by Jay Randolph, an
          independent developer. This policy explains what information the app uses and why. The
          short version: the game itself collects nothing about you and has no accounts or servers of
          its own; the ads in it are provided by Google AdMob, which does collect some information, as
          described below.
        </p>

        <h3>What the game keeps on your device</h3>
        <p>
          Your best mission, the Moon Points you've earned and the drivers and worlds you've bought
          with them in the Moon Shop, which ones are turned on, whether the sound is on, and whether
          you have bought Remove Ads are saved on your device so the game remembers them. They are
          not sent to us. Deleting the app deletes them.
        </p>

        <h3>Advertising (Google AdMob)</h3>
        <p>
          The app shows ads from Google AdMob: an occasional full-screen ad between games, and a
          video you can choose to watch for an extra life. To show and measure these ads and to
          prevent fraud, Google's software in the app may collect:
        </p>
        <ul>
          <li>
            your device's advertising identifier (on iPhone and iPad the IDFA, only if you allow
            tracking; on Android the Android advertising ID), and other device identifiers
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
            Settings &gt; Privacy &amp; Security &gt; Tracking. If you say no, you still see ads, just
            not personalised ones.
          </li>
          <li>
            On Android, you can reset or delete your advertising ID in your phone's settings (under
            Google &gt; Ads, or Security &amp; privacy &gt; Ads, depending on the phone).
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
          switch off the ads between games. The depot's extras and the Moon Shop's drivers and worlds
          are bought with points you earn by playing, never with real money.
        </p>

        <h3>Leaderboards</h3>
        <p>
          If you are signed in to Game Center (Apple) or Google Play Games, your best mission is sent
          to Apple or Google and shown on the Many Mini Moon Buggies leaderboard with your player
          name, where other players can see it. This is handled by Apple or Google under their own
          privacy policies. If you don't sign in, nothing is sent.
        </p>

        <h3>Children</h3>
        <p>
          Many Mini Moon Buggies is not directed at children under 13, and we do not knowingly
          collect personal information from them. If you believe a child has provided information
          through the app, contact us and we will help remove it.
        </p>

        <h3>Changes and contact</h3>
        <p>
          If this policy changes, the new version will be posted on this page with a new effective
          date. Questions or requests about your information:
          <a [href]="'mailto:' + contact">{{ contact }}</a
          >.
        </p>
        <p><a routerLink="/many-mini-moon-buggies/support">Many Mini Moon Buggies support</a></p>
      </div>
    </app-window-frame>
  `,
})
export class ManyMiniMoonBuggiesPrivacy {
  protected readonly contact = GAMES_CONTACT;

  constructor() {
    inject(Title).setTitle('Many Mini Moon Buggies Privacy Policy - Jay Randolph');
  }
}

@Component({
  selector: 'app-many-mini-moon-buggies-support',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame title="Many Mini Moon Buggies Support" closeLink="/" compact>
      <div class="info-body">
        <h2>Many Mini Moon Buggies Support</h2>
        <p class="meta">For the iPhone, iPad and Android app</p>

        <p>
          Turn the whole moon under your buggy by dragging it, or flick it to coast. Each mission,
          pick a clear spot to land, capture the green alien from the far side and bring it back to
          your lander before the battery runs flat. Every mission you bring home drives again in the
          ones after it, so don't crash into your old buggies or landers, and keep out from under the
          UFOs' blue beams: being abducted ends the game. You have three lives (up to five with
          extra-life pick-ups). Between missions the depot spends your points on extras for the next
          mission, such as slime, dynamite, lasers or a jet pack, and the <em>Moon Shop</em> on the
          title screen spends the points from every game on new drivers and worlds. Your score is the
          mission you reach.
        </p>

        <h3>I bought Remove Ads but still see ads</h3>
        <p>
          Remove Ads stops the ads between games. The "Keep going" video is still offered when a
          game ends, but only plays if you tap it. If ads still appear between games, tap the Remove
          Ads button in the top right of the title screen, then <em>Restore purchase</em>. Make sure
          you are signed in with the same Apple ID or Google account you bought it with. Restoring is
          free.
        </p>

        <h3>I got a new phone or reinstalled the game</h3>
        <p>
          Remove Ads comes back with <em>Restore purchase</em>, as above. Your best mission, your
          Moon Points and what you've bought in the Moon Shop are saved on the device, so a new phone
          starts again from zero, but your best is kept on the leaderboard if you were signed in.
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
          choices. On iPhone and iPad you can also change tracking in Settings &gt; Privacy &amp;
          Security &gt; Tracking; on Android you can reset or delete your advertising ID in your
          phone's settings. More in the
          <a routerLink="/many-mini-moon-buggies/privacy">privacy policy</a>.
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
export class ManyMiniMoonBuggiesSupport {
  protected readonly contact = GAMES_CONTACT;

  constructor() {
    inject(Title).setTitle('Many Mini Moon Buggies Support - Jay Randolph');
  }
}
