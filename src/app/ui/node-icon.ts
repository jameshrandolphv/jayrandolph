import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Gradients shared by every `NodeIcon`; render once near the root. */
@Component({
  selector: 'app-icon-defs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="icon-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ico-folder-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7db4ee" />
          <stop offset="1" stop-color="#2f6cc0" />
        </linearGradient>
        <linearGradient id="ico-folder-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d4ebff" />
          <stop offset="0.12" stop-color="#8cc4f6" />
          <stop offset="0.55" stop-color="#4b95e6" />
          <stop offset="1" stop-color="#2a68c4" />
        </linearGradient>
        <linearGradient id="ico-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" />
          <stop offset="1" stop-color="#dfe6ee" />
        </linearGradient>
        <linearGradient id="ico-app" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8fc8ff" />
          <stop offset="0.5" stop-color="#3b88ea" />
          <stop offset="1" stop-color="#103f96" />
        </linearGradient>
        <linearGradient id="ico-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.1" />
        </linearGradient>
        <linearGradient id="ico-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f86e0" />
          <stop offset="0.7" stop-color="#a9ddff" />
          <stop offset="1" stop-color="#7fcf55" />
        </linearGradient>
        <linearGradient id="ico-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fafafa" />
          <stop offset="0.5" stop-color="#d2d2d2" />
          <stop offset="0.51" stop-color="#bcbcbc" />
          <stop offset="1" stop-color="#8e8e8e" />
        </linearGradient>
        <linearGradient id="ico-bezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e9e9e9" />
          <stop offset="1" stop-color="#9a9a9a" />
        </linearGradient>
        <linearGradient id="ico-film-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a4a36" />
          <stop offset="0.5" stop-color="#2a2118" />
          <stop offset="1" stop-color="#0f0b07" />
        </linearGradient>
        <linearGradient id="ico-frame-warm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd9a0" />
          <stop offset="0.6" stop-color="#f08a5a" />
          <stop offset="1" stop-color="#7a3a5a" />
        </linearGradient>
        <linearGradient id="ico-pen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#8a8a8a" />
          <stop offset="0.3" stop-color="#fdfdfd" />
          <stop offset="0.6" stop-color="#c4c4c4" />
          <stop offset="1" stop-color="#6e6e6e" />
        </linearGradient>
        <linearGradient id="ico-note" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbec8e" />
          <stop offset="1" stop-color="#e9cf55" />
        </linearGradient>
        <clipPath id="ico-app-clip"><rect x="4" y="4" width="56" height="56" rx="13" /></clipPath>
        <clipPath id="ico-park-clip"><rect x="16" y="16" width="32" height="32" rx="2" /></clipPath>
        <clipPath id="ico-screen-clip"><rect x="10" y="12" width="44" height="30" rx="2" /></clipPath>
      </defs>
    </svg>
  `,
})
export class IconDefs {}

@Component({
  selector: 'app-node-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64" focusable="false">
      @switch (icon()) {
        @case ('folder') {
          <path
            d="M5 14a4 4 0 0 1 4-4h15l6 6h25a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"
            fill="url(#ico-folder-back)"
            stroke="#235296"
          />
          <path d="M10 22h44v8H10z" fill="url(#ico-paper)" stroke="#9aa7b8" stroke-width="0.8" />
          <path d="M12 18h40v6H12z" fill="#fff" stroke="#9aa7b8" stroke-width="0.8" transform="rotate(-1.5 32 21)" />
          <path
            d="M5 28a4 4 0 0 1 4-4h46a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"
            fill="url(#ico-folder-front)"
            stroke="#235296"
          />
          <path d="M7 29a2 2 0 0 1 2-2h46a2 2 0 0 1 2 2v1H7z" fill="#fff" opacity="0.65" />
          <path d="M7 31h50v6c-17 5-33 5-50 0z" fill="url(#ico-gloss)" opacity="0.4" />
        }
        @case ('film') {
          <g transform="rotate(-16 32 32)">
            <rect x="3" y="14" width="58" height="38" rx="2.5" fill="url(#ico-film-base)" stroke="#050403" />
            <g fill="#f4efe4" stroke="#8a7f6a" stroke-width="0.4">
              <rect x="7" y="16.5" width="3.6" height="3.6" rx="0.8" /><rect x="14" y="16.5" width="3.6" height="3.6" rx="0.8" />
              <rect x="21" y="16.5" width="3.6" height="3.6" rx="0.8" /><rect x="28" y="16.5" width="3.6" height="3.6" rx="0.8" />
              <rect x="35" y="16.5" width="3.6" height="3.6" rx="0.8" /><rect x="42" y="16.5" width="3.6" height="3.6" rx="0.8" />
              <rect x="49" y="16.5" width="3.6" height="3.6" rx="0.8" /><rect x="56" y="16.5" width="3.6" height="3.6" rx="0.8" />
              <rect x="7" y="45.9" width="3.6" height="3.6" rx="0.8" /><rect x="14" y="45.9" width="3.6" height="3.6" rx="0.8" />
              <rect x="21" y="45.9" width="3.6" height="3.6" rx="0.8" /><rect x="28" y="45.9" width="3.6" height="3.6" rx="0.8" />
              <rect x="35" y="45.9" width="3.6" height="3.6" rx="0.8" /><rect x="42" y="45.9" width="3.6" height="3.6" rx="0.8" />
              <rect x="49" y="45.9" width="3.6" height="3.6" rx="0.8" /><rect x="56" y="45.9" width="3.6" height="3.6" rx="0.8" />
            </g>
            <rect x="6" y="23" width="16" height="18" rx="1" fill="url(#ico-sky)" stroke="#e8dcc4" stroke-width="0.8" />
            <rect x="25" y="23" width="16" height="18" rx="1" fill="url(#ico-frame-warm)" stroke="#e8dcc4" stroke-width="0.8" />
            <rect x="44" y="23" width="16" height="18" rx="1" fill="url(#ico-sky)" stroke="#e8dcc4" stroke-width="0.8" />
            <path d="M6 36c5-4 10-2 16 1v4H6z" fill="#3f9f2b" opacity="0.8" />
            <circle cx="33" cy="31" r="4" fill="#fff6c8" opacity="0.85" />
            <path d="M44 37c6-5 11-1 16 0v4H44z" fill="#3f9f2b" opacity="0.8" />
            <path d="M3 14h58v10c-18 5-40 5-58 0z" fill="url(#ico-gloss)" opacity="0.28" />
          </g>
        }
        @case ('desktop') {
          <rect x="4" y="6" width="56" height="40" rx="5" fill="url(#ico-bezel)" stroke="#4d4d4d" />
          <rect x="8" y="10" width="48" height="32" rx="2.5" fill="#0c1220" stroke="#222" />
          <rect x="10" y="12" width="44" height="30" rx="2" fill="url(#ico-sky)" />
          <g clip-path="url(#ico-screen-clip)">
            <path d="M10 34c10-8 22-2 44-10v20H10z" fill="#fff" opacity="0.22" />
            <ellipse cx="32" cy="10" rx="34" ry="14" fill="url(#ico-gloss)" opacity="0.7" />
          </g>
          <path d="M25 46h14l4 9H21z" fill="url(#ico-metal)" stroke="#555" stroke-width="0.8" />
          <rect x="14" y="54" width="36" height="4" rx="2" fill="url(#ico-metal)" stroke="#555" stroke-width="0.8" />
        }
        @case ('text') {
          <path d="M12 4h28l14 14v40a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="url(#ico-paper)" stroke="#7b8695" />
          <path d="M40 4v12a2 2 0 0 0 2 2h12z" fill="#c9d3df" stroke="#7b8695" stroke-linejoin="round" />
          <g stroke="#8a96a6" stroke-width="2" stroke-linecap="round">
            <path d="M17 28h30M17 35h30M17 42h30M17 49h18" />
          </g>
        }
        @case ('cat') {
          <!-- The in-game cat sprite (wings-up frame), one path per colour. -->
          <svg x="4" y="4" width="56" height="56" viewBox="0 0 17 19" shape-rendering="crispEdges">
            <path fill="#543847" d="M2 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM2 3h1v1h-1zM4 3h2v1h-2zM7 3h2v1h-2zM1 4h2v1h-2zM5 4h1v1h-1zM7 4h1v1h-1zM9 4h1v1h-1zM14 4h1v1h-1zM0 5h1v1h-1zM2 5h1v1h-1zM7 5h1v1h-1zM10 5h1v1h-1zM13 5h1v1h-1zM15 5h1v1h-1zM1 6h1v1h-1zM7 6h1v1h-1zM10 6h3v1h-3zM16 6h1v1h-1zM1 7h1v1h-1zM8 7h1v1h-1zM16 7h1v1h-1zM0 8h1v1h-1zM2 8h1v1h-1zM8 8h1v1h-1zM16 8h1v1h-1zM0 9h1v1h-1zM2 9h1v1h-1zM8 9h1v1h-1zM16 9h1v1h-1zM0 10h1v1h-1zM3 10h1v1h-1zM6 10h2v1h-2zM10 10h1v1h-1zM14 10h1v1h-1zM16 10h1v1h-1zM0 11h1v1h-1zM3 11h1v1h-1zM5 11h1v1h-1zM16 11h1v1h-1zM0 12h1v1h-1zM4 12h1v1h-1zM16 12h1v1h-1zM0 13h1v1h-1zM15 13h1v1h-1zM0 14h1v1h-1zM12 14h3v1h-3zM1 15h1v1h-1zM11 15h1v1h-1zM2 16h1v1h-1zM11 16h1v1h-1zM3 17h2v1h-2zM10 17h1v1h-1zM5 18h5v1h-5z" />
            <path fill="#f7f8fc" d="M2 1h1v1h-1zM3 2h1v1h-1zM3 3h1v1h-1zM3 4h2v1h-2zM3 5h3v1h-3zM3 6h3v1h-3zM3 7h4v1h-4zM4 8h4v1h-4zM4 9h3v1h-3zM4 10h1v1h-1z" />
            <path fill="#c3cbe0" d="M6 3h1v1h-1zM6 4h1v1h-1zM1 5h1v1h-1zM6 5h1v1h-1zM2 6h1v1h-1zM6 6h1v1h-1zM2 7h1v1h-1zM7 7h1v1h-1zM3 8h1v1h-1zM3 9h1v1h-1zM7 9h1v1h-1zM5 10h1v1h-1zM4 11h1v1h-1z" />
            <path fill="#7b8aa6" d="M8 4h1v1h-1zM9 5h1v1h-1zM9 6h1v1h-1zM13 6h1v1h-1zM15 6h1v1h-1zM9 7h7v1h-7zM9 8h7v1h-7zM11 9h2v1h-2zM15 9h1v1h-1zM8 10h1v1h-1zM11 10h2v1h-2zM15 10h1v1h-1zM2 11h1v1h-1zM6 11h4v1h-4zM14 11h2v1h-2zM1 12h3v1h-3zM5 12h5v1h-5zM15 12h1v1h-1zM1 13h10v1h-10zM14 13h1v1h-1zM1 14h6v1h-6zM8 14h4v1h-4zM2 15h2v1h-2zM3 16h1v1h-1z" />
            <path fill="#f08aa4" d="M8 5h1v1h-1zM14 5h1v1h-1zM8 6h1v1h-1zM14 6h1v1h-1zM11 12h2v1h-2z" />
            <path fill="#5a6a89" d="M1 8h1v1h-1zM1 9h1v1h-1zM1 10h2v1h-2zM1 11h1v1h-1z" />
            <path fill="#ffffff" d="M9 9h1v1h-1zM13 9h1v1h-1z" />
            <path fill="#8be05a" d="M10 9h1v1h-1zM14 9h1v1h-1zM9 10h1v1h-1zM13 10h1v1h-1z" />
            <path fill="#aab7cd" d="M10 11h4v1h-4zM10 12h1v1h-1zM13 12h2v1h-2zM11 13h3v1h-3zM7 14h1v1h-1zM4 15h7v1h-7zM4 16h7v1h-7zM5 17h5v1h-5z" />
          </svg>
        }
        @case ('square') {
          <rect x="4" y="4" width="56" height="56" rx="11" fill="#b3b3ff" stroke="#000" stroke-width="2" />
          <g fill="#f6f6ff">
            <rect x="8" y="8" width="16" height="16" /><rect x="40" y="8" width="16" height="16" />
            <rect x="24" y="24" width="16" height="16" />
            <rect x="8" y="40" width="16" height="16" /><rect x="40" y="40" width="16" height="16" />
          </g>
          <rect x="18" y="18" width="28" height="28" fill="#ff0000" stroke="#000" stroke-width="4" />
        }
        @case ('plane') {
          <!-- Flights!: a white jet banking across a striped blue tile, after the original's app icon. -->
          <rect x="4" y="4" width="56" height="56" rx="13" fill="#1f64e0" stroke="#0f3a8f" />
          <g clip-path="url(#ico-app-clip)">
            <path d="M-8 30L30-8h9L-8 39zM-8 50L50-8h9L-8 59zM2 68L68 2v9L11 68zM22 68l46-46v9L31 68zM42 68l26-26v9L51 68z" fill="#3a82f2" />
            <ellipse cx="32" cy="12" rx="34" ry="20" fill="url(#ico-gloss)" opacity="0.45" />
          </g>
          <g transform="rotate(-38 32 32)" stroke="#3a3a3a" stroke-width="1.6" stroke-linejoin="round">
            <!-- Engines hang under the wings, whose roots run under the fuselage so the wings join it. -->
            <rect x="23" y="21" width="8" height="4" rx="2" fill="#f6a01a" />
            <rect x="23" y="39" width="8" height="4" rx="2" fill="#f6a01a" />
            <path d="M37 30L15 16l-4 2 10 13zM37 34L15 48l-4-2 10-13z" fill="#e4e6ea" />
            <path d="M13 29l-4-5h-2l1 8-1 8h2l4-5z" fill="#e4e6ea" />
            <path d="M8 32c0-3 4-5 10-5h26c6 0 12 2 13 5-1 3-7 5-13 5H18c-6 0-10-2-10-5z" fill="#fafafa" />
            <path d="M51 30.5c1.5.3 3 .9 3.6 1.5-.6.6-2.1 1.2-3.6 1.5z" fill="#36506b" stroke="none" />
            <path d="M14 31.2h30" stroke="#f6a01a" stroke-width="2" />
          </g>
        }
        @case ('park') {
          <!-- Chaos Park: the loop round a park from above, with a pond, trees, paths and a taxi on the drive. The same
               drawing as the iOS and Android app icons (64 units across, scaled onto the tile), with an even band of grass. -->
          <rect x="4" y="4" width="56" height="56" rx="13" fill="#4f9a34" stroke="#2f6a20" />
          <g clip-path="url(#ico-app-clip)">
            <g transform="translate(4 4) scale(0.875)">
              <rect x="10" y="10" width="44" height="44" rx="7" fill="none" stroke="#c9c3b6" stroke-width="12" />
              <rect x="10" y="10" width="44" height="44" rx="7" fill="none" stroke="#5d5b60" stroke-width="9" />
              <rect x="10" y="10" width="44" height="44" rx="7" fill="none" stroke="#fff" stroke-width="0.9" stroke-dasharray="2.5 2.5" />
              <rect x="16" y="16" width="32" height="32" rx="2" fill="#93d465" />
              <g clip-path="url(#ico-park-clip)">
                <path d="M8 40 L40 8 M8 48 L48 8 M8 56 L56 8 M16 56 L56 16 M24 56 L56 24 M32 56 L56 32 M40 56 L56 40" stroke="#9ddb70" stroke-width="2" />
                <path d="M16 31.2 Q23.5 29.4 30.4 30.6 M33.2 34.5 Q31.6 41 32.6 48" fill="none" stroke="#e6d9ad" stroke-width="1.7" stroke-linecap="round" />
                <g fill="#000" opacity="0.17">
                  <ellipse cx="38.3" cy="29.9" rx="7.5" ry="5.6" />
                  <circle cx="23.4" cy="25.5" r="3.6" /><circle cx="26.3" cy="37.4" r="3.2" />
                  <circle cx="21.8" cy="42.9" r="2.6" /><circle cx="41.9" cy="41.9" r="3.2" />
                </g>
              </g>
              <ellipse cx="37.5" cy="29" rx="7.5" ry="5.6" fill="#5ab6e4" stroke="#8fb36a" stroke-width="1.2" />
              <ellipse cx="35.5" cy="27.2" rx="4" ry="2.1" fill="#8fd0f0" />
              <path d="M41.9 31.6 a1.1 1.1 0 1 1 0.9 -0.9 l-0.9 0 z" fill="#5fae3e" />
              <circle cx="40" cy="32.6" r="0.6" fill="#5fae3e" />
              <path d="M33.2 30.8 q1.2 -0.7 2.4 0" fill="none" stroke="#bfe6f7" stroke-width="0.4" stroke-linecap="round" />
              <g stroke="#2e6a24" stroke-width="0.7">
                <circle cx="22.5" cy="24.5" r="3.6" fill="#5fa83b" /><circle cx="25.5" cy="36.5" r="3.2" fill="#6cb544" />
                <circle cx="21" cy="42" r="2.6" fill="#f3a0bf" stroke="#b9577c" /><circle cx="41" cy="41" r="3.2" fill="#5fa83b" />
              </g>
              <g fill="#82c957">
                <circle cx="21.3" cy="23.3" r="1.6" /><circle cx="24.4" cy="35.4" r="1.4" /><circle cx="39.9" cy="39.9" r="1.4" />
              </g>
              <circle cx="20.2" cy="41.2" r="1.1" fill="#fbcadb" />
              <g fill="#fff"><circle cx="21.9" cy="41.4" r="0.45" /><circle cx="20.6" cy="43" r="0.45" /><circle cx="22" cy="43.1" r="0.4" /></g>
              <g>
                <circle cx="43.6" cy="19.4" r="0.7" fill="#ff6f7d" /><circle cx="45.4" cy="20.6" r="0.7" fill="#ffd23f" />
                <circle cx="44.2" cy="21.6" r="0.7" fill="#fff" /><circle cx="18.8" cy="46" r="0.6" fill="#ffd23f" />
                <circle cx="30" cy="45.6" r="0.6" fill="#ff6f7d" />
              </g>
              <rect x="26.6" y="27.3" width="2.8" height="1.1" rx="0.3" fill="#a06a3c" stroke="#5a3a22" stroke-width="0.35" />
            </g>
            <ellipse cx="32" cy="32" rx="34" ry="22" fill="url(#ico-gloss)" opacity="0.25" transform="translate(0 -18)" />
          </g>
          <g transform="translate(4 4) scale(0.875)">
            <g transform="translate(38 10)">
              <rect x="-5.6" y="-3.1" width="12" height="7.2" rx="2.2" fill="#000" opacity="0.25" />
              <g fill="#1e1b1d"><rect x="-4.6" y="-4.5" width="2.4" height="1.6" rx="0.5" /><rect x="2.2" y="-4.5" width="2.4" height="1.6" rx="0.5" />
                <rect x="-4.6" y="2.9" width="2.4" height="1.6" rx="0.5" /><rect x="2.2" y="2.9" width="2.4" height="1.6" rx="0.5" /></g>
              <rect x="-6" y="-3.6" width="12" height="7.2" rx="2.2" fill="#f7c531" stroke="#2e2a2c" stroke-width="0.9" />
              <rect x="-2.5" y="-2.6" width="5" height="5.2" rx="1" fill="#37506b" />
              <rect x="-1.5" y="-2.6" width="3" height="5.2" fill="#e9b422" />
              <rect x="-0.6" y="-2" width="1.2" height="4" rx="0.3" fill="#fff6d0" stroke="#2e2a2c" stroke-width="0.25" />
              <g fill="#fff7b0"><rect x="4.4" y="-2.7" width="1" height="1.3" rx="0.4" /><rect x="4.4" y="1.4" width="1" height="1.3" rx="0.4" /></g>
              <g fill="#e2423a"><rect x="-5.4" y="-2.7" width="0.8" height="1.3" rx="0.3" /><rect x="-5.4" y="1.4" width="0.8" height="1.3" rx="0.3" /></g>
            </g>
            <circle cx="13.1" cy="41.6" r="2.6" fill="#000" opacity="0.22" />
            <circle cx="12.5" cy="41" r="2.6" fill="#ff8a00" stroke="#2e2a2c" stroke-width="0.8" />
            <circle cx="11.7" cy="41.6" r="0.9" fill="#ffb24a" />
            <circle cx="12.9" cy="37.4" r="1.7" fill="#3b2a20" stroke="#2e2a2c" stroke-width="0.6" />
          </g>
        }
        @case ('bat') {
          <!-- Bat Out!: a ball and bat over a sunny ballpark tile. -->
          <rect x="4" y="4" width="56" height="56" rx="13" fill="#8fd3ff" stroke="#2f6aa0" />
          <g clip-path="url(#ico-app-clip)">
            <path d="M-4 44Q32 30 68 44V68H-4z" fill="#4cb03a" />
            <path d="M14 60L32 42L50 60z" fill="#d49a58" />
            <path d="M22 60L32 50L42 60z" fill="#4cb03a" />
            <ellipse cx="32" cy="12" rx="34" ry="20" fill="url(#ico-gloss)" opacity="0.35" />
          </g>
          <g transform="rotate(-40 32 32)">
            <path d="M30 6h4l2.2 34h-8.4z" fill="#c9893d" stroke="#5a3a1a" stroke-width="1.2" stroke-linejoin="round" />
            <rect x="29.2" y="40" width="5.6" height="12" rx="2" fill="#a86b2a" stroke="#5a3a1a" stroke-width="1.2" />
            <rect x="28" y="51" width="8" height="3" rx="1.5" fill="#5a3a1a" />
          </g>
          <circle cx="46" cy="20" r="7.5" fill="#fff" stroke="#3a3a48" stroke-width="1.2" />
          <path d="M41 16q3 4 0 8M51 16q-3 4 0 8" fill="none" stroke="#e0383e" stroke-width="1.1" />
        }
        @case ('write') {
          <rect x="6" y="14" width="34" height="44" rx="1.5" fill="url(#ico-note)" stroke="#a8923a" stroke-width="0.8" transform="rotate(-14 23 36)" />
          <g transform="rotate(-9 28 28)">
            <rect x="10" y="4" width="36" height="48" rx="1.5" fill="url(#ico-paper)" stroke="#7b8695" stroke-width="0.9" />
            <g stroke="#b4c3da" stroke-width="0.9">
              <path d="M12 11h32M12 16h32M12 21h32M12 26h32M12 31h32M12 36h32M12 41h32M12 46h32" />
            </g>
          </g>
          <g transform="translate(49 15) rotate(36)">
            <rect x="-3" y="0" width="6" height="17" rx="3" fill="url(#ico-pen)" stroke="#5c5c5c" stroke-width="0.7" />
            <rect x="2.6" y="3" width="1.8" height="11" rx="0.9" fill="url(#ico-pen)" stroke="#5c5c5c" stroke-width="0.6" />
            <rect x="-3.6" y="17" width="7.2" height="9" rx="1" fill="url(#ico-pen)" stroke="#4a4a4a" stroke-width="0.7" />
            <path d="M-3.6 19.5h7.2M-3.6 21.5h7.2M-3.6 23.5h7.2" stroke="#555" stroke-width="0.6" />
            <path d="M-3 26h6l-1.6 6h-2.8z" fill="url(#ico-pen)" stroke="#5c5c5c" stroke-width="0.7" stroke-linejoin="round" />
            <path d="M0 32v4" stroke="#444" stroke-width="0.9" stroke-linecap="round" />
          </g>
        }
        @default {
          <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#ico-app)" stroke="#12356e" />
          <g clip-path="url(#ico-app-clip)">
            <ellipse cx="32" cy="12" rx="34" ry="20" fill="url(#ico-gloss)" />
          </g>
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 3px 2px rgb(0 20 60 / 0.4));
    }
  `,
})
export class NodeIcon {
  readonly icon = input.required<string>();
}
