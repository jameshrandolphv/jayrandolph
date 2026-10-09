import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, signal, viewChild } from '@angular/core';
import { WindowFrame } from '../../ui/window-frame';

const FONTS = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Lucida Grande', 'Monaco', 'Verdana', 'Trebuchet MS'];

/** Font sizes in px. execCommand only has seven keyword steps, so every size is applied as step 7 plus an inline px size. */
const SIZES = [9, 10, 12, 14, 18, 24, 36, 48, 72];

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
        <select aria-label="Size" (change)="setSize(value($event))">
          @for (px of sizes; track px) {
            <option [value]="px" [selected]="px === size()">{{ px }}</option>
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
      <div #page class="te-page" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document" spellcheck="false" (input)="onInput()"></div>
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
  protected readonly size = signal(12);
  protected readonly color = signal('#000000');
  protected readonly bold = signal(false);
  protected readonly italic = signal(false);
  protected readonly underline = signal(false);
  protected readonly align = signal('justifyLeft');

  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
  // The toolbar controls steal focus, so the last selection inside the page is kept for them.
  private range: Range | null = null;
  /** Size chosen at a bare caret: it lives in the browser's typing state, not the DOM, until the next keystroke. */
  private pending: { px: number; node: Node | null; offset: number } | null = null;

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

  private restoreSelection(): void {
    const range = this.range;
    this.page().nativeElement.focus();
    if (range) {
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  protected setSize(value: string): void {
    const px = Number(value);
    this.size.set(px);
    this.restoreSelection();
    const selection = getSelection();
    if (!selection?.rangeCount) return;
    const page = this.page().nativeElement;
    document.execCommand('styleWithCSS', false, 'false');
    // Re-applying step 7 over text that already has it is a no-op, so move it off step 7 first.
    if (!selection.isCollapsed && [...page.querySelectorAll('font[size="7"]')].some((f) => selection.containsNode(f, true))) {
      document.execCommand('fontSize', false, '3');
    }
    document.execCommand('fontSize', false, '7');
    // With a caret and no selection the font element only exists once typing starts; see onInput.
    if (selection.isCollapsed) {
      this.pending = { px, node: selection.anchorNode, offset: selection.anchorOffset };
      return;
    }
    for (const font of page.querySelectorAll<HTMLElement>('font[size="7"]')) {
      if (!selection.containsNode(font, false)) continue;
      font.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((el) => el.style.removeProperty('font-size'));
      font.style.fontSize = `${px}px`;
    }
  }

  protected onInput(): void {
    for (const font of this.page().nativeElement.querySelectorAll<HTMLElement>('font[size="7"]')) {
      if (!font.style.fontSize) font.style.fontSize = `${this.pending?.px ?? this.size()}px`;
    }
    this.pending = null;
  }

  protected run(command: string, value?: string): void {
    this.restoreSelection();
    // Plain <font> output; setSize overrides font sizes with inline px.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
  }

  protected onSelectionChange(): void {
    const selection = getSelection();
    if (!selection?.rangeCount || !this.page().nativeElement.contains(selection.anchorNode)) return;
    this.range = selection.getRangeAt(0).cloneRange();
    const node = selection.anchorNode;

    this.bold.set(document.queryCommandState('bold'));
    this.italic.set(document.queryCommandState('italic'));
    this.underline.set(document.queryCommandState('underline'));
    this.align.set(ALIGNS.find((a) => document.queryCommandState(a.command))?.command ?? 'justifyLeft');

    const family = document.queryCommandValue('fontName').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const font = FONTS.find((f) => f.toLowerCase() === family);
    if (font) this.font.set(font);

    // queryCommandValue('fontSize') only reports the nearest keyword step, so read the real size instead.
    const pending = this.pending;
    if (pending && (pending.node !== node || pending.offset !== selection.anchorOffset)) this.pending = null;
    if (!this.pending) {
      const element = node instanceof Element ? node : node?.parentElement;
      const px = element ? Math.round(parseFloat(getComputedStyle(element).fontSize)) : NaN;
      if (SIZES.includes(px)) this.size.set(px);
    }

    const color = toHex(document.queryCommandValue('foreColor'));
    if (color) this.color.set(color);
  }
}
