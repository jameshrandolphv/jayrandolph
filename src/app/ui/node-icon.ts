import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Gradients shared by every `NodeIcon`; render once near the root. */
@Component({
  selector: 'app-icon-defs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="icon-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ico-folder-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8dbff3" />
          <stop offset="1" stop-color="#3f7fd0" />
        </linearGradient>
        <linearGradient id="ico-folder-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c6e4ff" />
          <stop offset="0.5" stop-color="#63a9f0" />
          <stop offset="1" stop-color="#3a80dc" />
        </linearGradient>
        <linearGradient id="ico-app" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a6d4ff" />
          <stop offset="0.5" stop-color="#3f8fec" />
          <stop offset="1" stop-color="#1459bb" />
        </linearGradient>
        <radialGradient id="ico-lens" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stop-color="#9be0ff" />
          <stop offset="0.45" stop-color="#2a6fe0" />
          <stop offset="1" stop-color="#081f4d" />
        </radialGradient>
        <linearGradient id="ico-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.9" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.08" />
        </linearGradient>
        <linearGradient id="ico-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f86e0" />
          <stop offset="0.7" stop-color="#a9ddff" />
          <stop offset="1" stop-color="#7fcf55" />
        </linearGradient>
        <linearGradient id="ico-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f4f4f4" />
          <stop offset="1" stop-color="#a8a8a8" />
        </linearGradient>
        <clipPath id="ico-app-clip"><rect x="4" y="4" width="56" height="56" rx="13" /></clipPath>
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
            d="M6 16a4 4 0 0 1 4-4h14l6 6h24a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
            fill="url(#ico-folder-back)"
            stroke="#2b5fa8"
          />
          <path
            d="M6 26a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
            fill="url(#ico-folder-front)"
            stroke="#2b5fa8"
          />
          <path d="M8 27h48v7c-16 4-32 4-48 0z" fill="#fff" opacity="0.4" />
        }
        @case ('film') {
          <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#ico-app)" stroke="#173f7a" />
          <rect x="11" y="19" width="42" height="26" rx="3" fill="#0b2349" stroke="#fff" stroke-opacity="0.7" />
          <g fill="#fff" fill-opacity="0.85">
            <rect x="14" y="22" width="3" height="3" rx="0.6" /><rect x="14" y="29" width="3" height="3" rx="0.6" />
            <rect x="14" y="36" width="3" height="3" rx="0.6" /><rect x="47" y="22" width="3" height="3" rx="0.6" />
            <rect x="47" y="29" width="3" height="3" rx="0.6" /><rect x="47" y="36" width="3" height="3" rx="0.6" />
          </g>
          <circle cx="32" cy="32" r="9" fill="url(#ico-lens)" stroke="#fff" stroke-width="1.5" />
          <circle cx="29" cy="29" r="2.4" fill="#fff" opacity="0.8" />
          <g clip-path="url(#ico-app-clip)">
            <ellipse cx="32" cy="12" rx="34" ry="20" fill="url(#ico-gloss)" />
          </g>
        }
        @case ('desktop') {
          <rect x="6" y="8" width="52" height="38" rx="4" fill="url(#ico-metal)" stroke="#555" />
          <rect x="10" y="12" width="44" height="30" rx="2" fill="url(#ico-sky)" stroke="#2a4f86" />
          <path d="M10 12h44v10c-14 6-30 6-44 0z" fill="#fff" opacity="0.28" />
          <path d="M26 46h12l3 10H23z" fill="url(#ico-metal)" stroke="#555" />
          <rect x="16" y="55" width="32" height="3" rx="1.5" fill="#888" />
        }
        @default {
          <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#ico-app)" stroke="#173f7a" />
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
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.35));
    }
  `,
})
export class NodeIcon {
  readonly icon = input.required<string>();
}
