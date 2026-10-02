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
        <clipPath id="ico-app-clip"><rect x="4" y="4" width="56" height="56" rx="13" /></clipPath>
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
