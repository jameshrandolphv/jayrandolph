import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, signal, viewChild } from '@angular/core';
import { WindowFrame } from '../../ui/window-frame';

const FONTS = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Lucida Grande', 'Monaco', 'Verdana', 'Trebuchet MS'];

/** `size` is the execCommand fontSize step; os.css maps each step to `px`. */
const SIZES = [
  { size: 1, px: 9 },
  { size: 2, px: 10 },
  { size: 3, px: 12 },
  { size: 4, px: 14 },
  { size: 5, px: 18 },
  { size: 6, px: 24 },
  { size: 7, px: 36 },
];

/** Each line is [x, width] in a 14 x 12 icon. */
const ALIGNS = [
  { command: 'justifyLeft', label: 'Align Left', lines: [[0, 14], [0, 9], [0, 14], [0, 9]] },
  { command: 'justifyCenter', label: 'Center', lines: [[0, 14], [2.5, 9], [0, 14], [2.5, 9]] },
  { command: 'justifyFull', label: 'Justify', lines: [[0, 14], [0, 14], [0, 14], [0, 14]] },
  { command: 'justifyRight', label: 'Align Right', lines: [[0, 14], [5, 9], [0, 14], [5, 9]] },
];

const toHex = (css: string): string | null => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return /^#[0-9a-f]{6}$/i.test(css) ? css.toLowerCase() : null;
};

/** Rich text editor styled after Mac OS X Tiger's TextEdit. Contents are not persisted. */
@Component({
  selector: 'app-text-edit',
  imports: [WindowFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:selectionchange)': 'onSelectionChange()' },
  template: `
    <app-window-frame [title]="name()" [closeLink]="closeLink()" compact>
      <div class="toolbar te-toolbar" role="toolbar" aria-label="Format">
        <select aria-label="Font" (change)="run('fontName', value($event))">
          @for (f of fonts; track f) {
            <option [value]="f" [selected]="f === font()" [style.font-family]="f">{{ f }}</option>
          }
        </select>
        <select aria-label="Size" (change)="run('fontSize', value($event))">
          @for (s of sizes; track s.size) {
            <option [value]="s.size" [selected]="s.size === size()">{{ s.px }}</option>
          }
        </select>
        <input type="color" class="te-color" aria-label="Text color" [value]="color()" (input)="run('foreColor', value($event))" />
        <span class="segmented te-seg">
          <button type="button" class="btn te-tool te-bold" aria-label="Bold" [attr.aria-pressed]="bold()" (mousedown)="$event.preventDefault()" (click)="run('bold')">B</button>
          <button type="button" class="btn te-tool te-italic" aria-label="Italic" [attr.aria-pressed]="italic()" (mousedown)="$event.preventDefault()" (click)="run('italic')">I</button>
          <button type="button" class="btn te-tool te-underline" aria-label="Underline" [attr.aria-pressed]="underline()" (mousedown)="$event.preventDefault()" (click)="run('underline')">U</button>
        </span>
        <span class="segmented te-seg" role="group" aria-label="Alignment">
          @for (a of aligns; track a.command) {
            <button
              type="button"
              class="btn te-tool"
              [attr.aria-label]="a.label"
              [attr.aria-pressed]="align() === a.command"
              (mousedown)="$event.preventDefault()"
              (click)="run(a.command)"
            >
              <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="currentColor">
                @for (l of a.lines; track $index) {
                  <rect [attr.x]="l[0]" [attr.y]="$index * 3" [attr.width]="l[1]" height="1.4" />
                }
              </svg>
            </button>
          }
        </span>
      </div>
      <div class="te-ruler" aria-hidden="true">
        @for (n of inches; track n) {
          <span [style.left.px]="n * 72 + 6">{{ n }}</span>
        }
      </div>
      <div #page class="te-page" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document" spellcheck="false"></div>
    </app-window-frame>
  `,
})
export class TextEdit {
  /** Document title and initial text; the text is only read once, on creation. */
  readonly name = input('Untitled');
  readonly content = input('');
  readonly closeLink = input('/');

  protected readonly fonts = FONTS;
  protected readonly sizes = SIZES;
  protected readonly aligns = ALIGNS;
  protected readonly inches = Array.from({ length: 14 }, (_, i) => i);

  protected readonly font = signal('Helvetica');
  protected readonly size = signal(3);
  protected readonly color = signal('#000000');
  protected readonly bold = signal(false);
  protected readonly italic = signal(false);
  protected readonly underline = signal(false);
  protected readonly align = signal('justifyLeft');

  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
  // The toolbar controls steal focus, so the last selection inside the page is kept for them.
  private range: Range | null = null;

  constructor() {
    afterNextRender(() => {
      const page = this.page().nativeElement;
      page.textContent = this.content();
      page.focus();
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected run(command: string, value?: string): void {
    const range = this.range;
    this.page().nativeElement.focus();
    if (range) {
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    // Plain <font> output, which os.css maps to sizes; CSS spans would only offer keyword sizes.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
  }

  protected onSelectionChange(): void {
    const selection = getSelection();
    if (!selection?.rangeCount || !this.page().nativeElement.contains(selection.anchorNode)) return;
    this.range = selection.getRangeAt(0).cloneRange();

    this.bold.set(document.queryCommandState('bold'));
    this.italic.set(document.queryCommandState('italic'));
    this.underline.set(document.queryCommandState('underline'));
    this.align.set(ALIGNS.find((a) => document.queryCommandState(a.command))?.command ?? 'justifyLeft');

    const family = document.queryCommandValue('fontName').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const font = FONTS.find((f) => f.toLowerCase() === family);
    if (font) this.font.set(font);

    const size = Number(document.queryCommandValue('fontSize'));
    if (SIZES.some((s) => s.size === size)) this.size.set(size);

    const color = toHex(document.queryCommandValue('foreColor'));
    if (color) this.color.set(color);
  }
}
