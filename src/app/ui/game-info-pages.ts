import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAMES_CONTACT, INFO_PAGE_STYLES } from './info-page';
import { WindowFrame } from './window-frame';

/*
 * The privacy policy and support page every mobile game shares. The games are built from the same pieces (AdMob ads,
 * one Remove Ads purchase, a platform leaderboard, everything else kept on the device), so the wording lives here once
 * and each game supplies only what differs. A change to how the apps handle data is then made for all of them at once.
 *
 * The privacy policy is written as a legal notice and the support page as marketing copy; keep to those voices when
 * editing. Both must match what the shipped apps do.
 */

export interface GameInfo {
  name: string;
  /** URL segment of the game's pages: /<slug>/privacy and /<slug>/support. */
  slug: string;
  /** When the privacy policy last changed, as "Month D, YYYY". */
  effective: string;
  /** What the app saves on the device, each a noun phrase ending a list item. */
  stored: readonly string[];
  /** What the in-game shop is and what it is paid with, for games that have one; a full sentence. */
  shop?: string;
  /** What the leaderboard ranks, such as "best score". */
  best: string;
  /** Set when the game can also be played on this website. */
  webVersion?: boolean;
  support: {
    /** The line under the heading. */
    tagline: string;
    /** How to play, a paragraph each. */
    pitch: readonly string[];
    /** Where Restore purchase is found, completing "tap ...". */
    removeAdsButton: string;
    /** What starts again on a new phone, completing "... live on your device". */
    saved: string;
  };
}

@Component({
  selector: 'app-game-privacy-policy',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame [title]="game().name + ' Privacy Policy'" closeLink="/" compact>
      <div class="info-body">
        <h2>{{ game().name }} Privacy Policy</h2>
        <p class="meta">Effective Date: {{ game().effective }}</p>

        <p>
          This Privacy Policy (the &ldquo;Policy&rdquo;) describes how Jay Randolph, an independent
          developer (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), and the third-party
          service providers identified below collect, use, and disclose information in connection
          with the {{ game().name }} mobile application for iPhone, iPad, and Android devices (the
          &ldquo;App&rdquo;). By downloading, installing, or using the App, you acknowledge that you
          have read and understood this Policy. If you do not agree with this Policy, please do not
          use the App.
        </p>

        <h3>1. Summary</h3>
        <p>
          The App does not require or offer user accounts, and we do not operate servers that
          receive information from the App. We do not ourselves collect personal information through
          the App. Advertising in the App is supplied by Google AdMob, a third-party service that
          collects certain information from your device as described in Section 3. This summary is
          provided for convenience only and is qualified in its entirety by the remainder of this
          Policy.
        </p>

        <h3>2. Information Stored on Your Device</h3>
        <p>
          The App stores the following information locally on your device so that it can function:
        </p>
        <ul>
          @for (item of game().stored; track item) {
            <li>{{ item }}</li>
          }
          <li>whether the Remove Ads purchase described in Section 4 has been made.</li>
        </ul>
        <p>
          This information is not transmitted to us. It remains on your device and is deleted when
          you uninstall the App.
        </p>

        <h3>3. Third-Party Advertising</h3>
        <p>
          The App displays advertisements supplied by Google AdMob, a service of Google LLC
          (&ldquo;Google&rdquo;). The App presents two advertising formats: (a) full-screen
          advertisements displayed from time to time between games; and (b) video advertisements
          that are displayed only if you elect to view one in exchange for an additional life. In
          order to deliver and measure advertisements, to limit how often an advertisement is shown,
          and to detect and prevent fraud and abuse, Google&rsquo;s software embedded in the App may
          collect the following categories of information from your device:
        </p>
        <ul>
          <li>
            <strong>Device identifiers</strong>, including your device&rsquo;s advertising
            identifier. On iPhone and iPad this is the Identifier for Advertisers (IDFA), which is
            made available only if you grant the App permission to track; on Android this is the
            Android advertising ID.
          </li>
          <li>
            <strong>Internet Protocol (IP) address</strong>, from which your approximate (not
            precise) location may be derived.
          </li>
          <li>
            <strong>Advertising and usage data</strong>, namely information about the advertisements
            presented to you and your interactions with them.
          </li>
          <li>
            <strong>Diagnostic data</strong>, including crash logs and performance information.
          </li>
        </ul>
        <p>
          Google&rsquo;s collection and use of this information is governed by
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener"
            >Google&rsquo;s Privacy Policy</a
          >. Additional information is available in Google&rsquo;s notice describing
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener"
            >how Google uses information from sites or apps that use its services</a
          >. We do not receive this information in a form that identifies you; we have access only
          to aggregated advertising reports.
        </p>

        <h3>4. In-App Purchases</h3>
        <p>
          The App offers a single, optional, one-time purchase (&ldquo;Remove Ads&rdquo;), which
          disables the advertisements displayed between games. Video advertisements offered in
          exchange for an additional life remain available following purchase and are displayed only
          at your election. All payments are processed exclusively by the Apple App Store or Google
          Play, as applicable, under the terms and privacy policy of the relevant platform. We do
          not receive, process, or store your payment card details or billing information. The App
          is informed only of whether the Remove Ads purchase has been made, so that it may disable
          the relevant advertisements.
          @if (game().shop; as shop) {
            {{ shop }}
          }
        </p>

        <h3>5. Leaderboards</h3>
        <p>
          The App supports optional leaderboards operated by Apple Game Center and Google Play Games
          (each, a &ldquo;Platform Service&rdquo;). If, and only if, you are signed in to the
          applicable Platform Service, your {{ game().best }} is transmitted to that Platform
          Service and displayed on the applicable {{ game().name }} leaderboard together with your
          player name, where it is visible to other players. The Platform Services are operated by
          Apple Inc. and Google, respectively, under their own privacy policies. If you are not
          signed in, no leaderboard information is transmitted.
        </p>

        <h3>6. Your Choices and Controls</h3>
        <ul>
          <li>
            <strong>Advertising consent.</strong> Where required by applicable law (including in the
            European Economic Area, the United Kingdom, Switzerland, and certain U.S. states), the
            App requests your consent before personalized advertisements are shown. You may review
            or change your selection at any time using the padlock button on the App&rsquo;s title
            screen.
          </li>
          <li>
            <strong>Tracking permission (iPhone and iPad).</strong> The App requests permission
            before tracking your activity. You may change this permission at any time under Settings
            &gt; Privacy &amp; Security &gt; Tracking. If permission is declined, advertisements
            will continue to be shown but will not be personalized using your advertising
            identifier.
          </li>
          <li>
            <strong>Advertising ID (Android).</strong> You may reset or delete your advertising ID
            in your device settings (under Google &gt; Ads or Security &amp; privacy &gt; Ads,
            depending on your device).
          </li>
          <li>
            <strong>Remove Ads.</strong> You may disable the advertisements displayed between games
            by making the purchase described in Section 4.
          </li>
          <li>
            <strong>Leaderboards.</strong> You may decline to participate in leaderboards by not
            signing in to, or by signing out of, the applicable Platform Service.
          </li>
        </ul>

        <h3>7. Disclosure of Information</h3>
        <p>
          We do not sell personal information in exchange for monetary consideration, and we do not
          disclose personal information to third parties other than as described in this Policy.
          Certain U.S. state privacy laws define the terms &ldquo;sale,&rdquo;
          &ldquo;sharing,&rdquo; and &ldquo;targeted advertising&rdquo; broadly, such that
          Google&rsquo;s use of advertising identifiers to deliver personalized advertisements in
          the App may fall within those definitions. You may opt out of such processing at any time
          by exercising the controls described in Section 6.
        </p>

        <h3>8. Communications With Us</h3>
        <p>
          If you contact us by email, we will receive your email address and any information you
          elect to include in your message. We use this information solely to respond to your
          inquiry and to provide support, and we retain it only for as long as reasonably necessary
          for those purposes or as required by law.
        </p>

        <h3>9. Your Privacy Rights</h3>
        <p>
          Depending on your place of residence, you may have rights under applicable data protection
          law, which may include the rights to access, correct, delete, or obtain a copy of your
          personal information; to object to or restrict certain processing; to withdraw consent
          previously given, without affecting the lawfulness of processing prior to withdrawal; to
          opt out of the sale or sharing of personal information or of targeted advertising; and to
          lodge a complaint with your local data protection authority. We will not discriminate
          against you for exercising any of these rights.
        </p>
        <p>
          Because we do not maintain accounts and do not hold information collected through the App
          in a form that identifies you, requests relating to advertising information are in most
          cases most effectively directed to Google using the resources linked in Section 3. You may
          nevertheless submit any request to us at the address in the final section of this Policy,
          and we will respond within the period required by applicable law.
        </p>

        <h3>10. Data Retention, Security, and International Transfers</h3>
        <p>
          We do not retain information collected through the App, because none is transmitted to us.
          Information stored on your device is retained until you uninstall the App. Information
          collected by Google, Apple, or their affiliates is retained and secured in accordance with
          their respective policies, and may be processed in the United States and in other
          countries whose data protection laws may differ from those of your jurisdiction.
        </p>

        <h3>11. Children&rsquo;s Privacy</h3>
        <p>
          The App is not directed to children under the age of 13, and we do not knowingly collect
          personal information from children under 13. If you believe that a child has provided
          personal information through the App, please contact us at the address below, and we will
          take reasonable steps to assist in its removal.
        </p>

        <h3>12. Third-Party Services</h3>
        <p>
          The App relies on services provided by Google and by
          <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener">Apple</a>,
          each of which operates under its own terms and privacy policy. We are not responsible for
          the privacy practices of third parties, and we encourage you to review their policies.
        </p>

        @if (game().webVersion) {
          <h3>13. Website Version</h3>
          <p>
            A version of {{ game().name }} is also available to play on this website. The website
            version contains no advertisements, no in-app purchases, and no leaderboards. It stores
            your best score in your browser&rsquo;s storage on your device only, and that
            information is not transmitted to us.
          </p>
        }

        <h3>{{ 13 + shift() }}. Changes to This Policy</h3>
        <p>
          We may amend this Policy from time to time. Any amended Policy will be posted on this page
          with a revised Effective Date and will apply from that date. Your continued use of the App
          following the posting of an amended Policy constitutes your acknowledgment of the amended
          Policy.
        </p>

        <h3>{{ 14 + shift() }}. Contact Us</h3>
        <p>
          Questions, requests, or complaints regarding this Policy or your information may be
          directed to Jay Randolph at
          <a [href]="'mailto:' + contact">{{ contact }}</a
          >.
        </p>
        <p>
          <a [routerLink]="'/' + game().slug + '/support'">{{ game().name }} support</a>
        </p>
      </div>
    </app-window-frame>
  `,
})
export class GamePrivacyPolicy {
  readonly game = input.required<GameInfo>();

  protected readonly contact = GAMES_CONTACT;
  /** Sections after the optional Website Version one move down by one when it is there. */
  protected readonly shift = computed(() => (this.game().webVersion ? 1 : 0));
}

@Component({
  selector: 'app-game-support',
  imports: [WindowFrame, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: INFO_PAGE_STYLES,
  template: `
    <app-window-frame [title]="game().name + ' Support'" closeLink="/" compact>
      <div class="info-body">
        <h2>{{ game().name }} Support</h2>
        <p class="meta">{{ game().support.tagline }}</p>

        @for (paragraph of game().support.pitch; track paragraph) {
          <p>{{ paragraph }}</p>
        }
        <p>
          Want the full rundown? Tap <em>How to Play</em> on the title screen.
          @if (game().webVersion) {
            Or jump straight in and
            <a [routerLink]="'/' + game().slug">play it right here in your browser</a>, no download
            needed.
          }
          Got a question? You&rsquo;re in the right place: the quick answers below will have you
          back in the game in no time.
        </p>

        <h3>I bought Remove Ads but still see ads</h3>
        <p>
          Thank you for supporting the game! Remove Ads clears out every ad between games, for good.
          The one thing you&rsquo;ll still see is the &ldquo;Keep going&rdquo; video at the end of a
          game, and that&rsquo;s by design: it&rsquo;s your free second chance, and it only ever
          plays if you tap it. Still seeing ads between games? Tap
          {{ game().support.removeAdsButton }}, then <em>Restore purchase</em>, and you&rsquo;re all
          set. Just make sure you&rsquo;re signed in with the same Apple ID or Google account you
          bought it with. Restoring is always free.
        </p>

        <h3>I got a new phone or reinstalled the game</h3>
        <p>
          New phone, same ad-free game. One tap on <em>Restore purchase</em> (see above) brings
          Remove Ads right back at no charge. {{ game().support.saved }} live on your device, so a
          new phone gives you a fresh start, but your {{ game().best }} stays safe on the
          leaderboard if you were signed in. Time to beat it!
        </p>

        <h3>The leaderboard doesn&rsquo;t open or doesn&rsquo;t show my score</h3>
        <p>
          Ready to show the world what you&rsquo;ve got? On iPhone and iPad, sign in to Game Center
          under Settings &gt; Game Center. On Android, sign in to Google Play Games. Anything you
          scored before signing in is sent up automatically the next time you open the game, so not
          a single point goes to waste.
        </p>

        <h3>I can&rsquo;t hear anything</h3>
        <p>
          The game starts out quiet so it never interrupts your music or your meeting. Tap the
          speaker button on the title screen to switch the sound on, and check that your device
          isn&rsquo;t on silent. The game remembers your choice from then on.
        </p>

        <h3>Can I play offline?</h3>
        <p>
          Absolutely. On the train, on a plane, wherever you are, the whole game is right there on
          your device. Only the extras need a connection: ads (including the &ldquo;Keep
          going&rdquo; video), the leaderboard, and buying or restoring Remove Ads.
        </p>

        <h3>Can I get a refund?</h3>
        <p>
          Purchases are handled securely by Apple and Google, so refunds are too. On iPhone and
          iPad, head to
          <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener"
            >reportaproblem.apple.com</a
          >. On Android, open your
          <a
            href="https://play.google.com/store/account/orderhistory"
            target="_blank"
            rel="noopener"
            >Google Play order history</a
          >
          and pick the purchase.
        </p>

        <h3>Changing ad privacy choices</h3>
        <p>
          You&rsquo;re always in control. Where your region calls for it, the padlock button on the
          title screen reopens your ad choices whenever you like. On iPhone and iPad you can also
          change tracking under Settings &gt; Privacy &amp; Security &gt; Tracking, and on Android
          you can reset or delete your advertising ID in your device&rsquo;s settings. The full
          details are in the
          <a [routerLink]="'/' + game().slug + '/privacy'">privacy policy</a>.
        </p>

        <h3>Something else?</h3>
        <p>
          We&rsquo;d love to hear from you, whether it&rsquo;s a question, a bug or a big idea.
          Email
          <a [href]="'mailto:' + contact">{{ contact }}</a> and tell us which phone or tablet you
          have and what happened. A real person reads every message, and you&rsquo;ll hear back
          within a few days.
        </p>
        <p>
          Having fun? A quick rating on the App Store or Google Play helps more players find
          {{ game().name }}, and it makes our day.
        </p>
      </div>
    </app-window-frame>
  `,
})
export class GameSupport {
  readonly game = input.required<GameInfo>();

  protected readonly contact = GAMES_CONTACT;
}
