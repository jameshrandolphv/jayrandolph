import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FILMS, FilmId, SessionService } from '../../core/session.service';
import type { Adjustments } from '../../engine/film-params';
import { EXPORT_FORMATS, type ExportFormat } from '../../export/encoders';
import { Viewer } from '../../ui/viewer';
import { WindowFrame } from '../../ui/window-frame';

interface AdjustControl {
  readonly key: keyof Adjustments;
  readonly label: string;
}

@Component({
  selector: 'app-film-sim',
  imports: [Viewer, WindowFrame],
  templateUrl: './film-sim.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class FilmSim {
  protected readonly session = inject(SessionService);
  protected readonly dragging = signal(false);
  protected readonly menuOpen = signal(false);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly credits = viewChild.required<ElementRef<HTMLDialogElement>>('credits');
  private readonly exporter = viewChild.required<ElementRef<HTMLDialogElement>>('exporter');
  protected readonly exportFormats = EXPORT_FORMATS;
  protected readonly exportFormat = signal<ExportFormat>('png16');
  protected readonly jpegQuality = signal(92);
  protected readonly exportError = signal('');
  protected readonly exporting = computed(() => this.session.exportProgress() !== null);

  protected onDocumentClick(event: Event): void {
    if (!(event.target as Element).closest('.toolbar-menu, .menu-toggle')) this.menuOpen.set(false);
  }

  protected showExport(): void {
    this.exportError.set('');
    this.exporter().nativeElement.showModal();
  }

  protected closeExport(): void {
    this.session.cancelExport();
    this.exporter().nativeElement.close();
  }

  protected onExportCancel(): void {
    this.session.cancelExport();
  }

  protected onJpegQuality(event: Event): void {
    this.jpegQuality.set(Number((event.target as HTMLInputElement).value));
  }

  protected async runExport(): Promise<void> {
    this.exportError.set('');
    try {
      await this.session.exportImage(this.exportFormat(), this.jpegQuality() / 100);
      this.exporter().nativeElement.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.exportError.set(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  protected onSplit(event: Event): void {
    this.session.split.set((event.target as HTMLInputElement).checked);
  }

  protected pickFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.session.open(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.session.open(file);
  }

  protected readonly evLabel = computed(() => {
    const v = this.session.ev();
    return `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`;
  });

  protected onEv(event: Event): void {
    this.session.ev.set(Number((event.target as HTMLInputElement).value));
  }

  protected onHalation(event: Event): void {
    this.session.halation.set((event.target as HTMLInputElement).checked);
  }

  protected readonly filmGroups = [...new Set(FILMS.map((f) => f.brand))].map((brand) => ({
    brand,
    films: FILMS.filter((f) => f.brand === brand),
  }));

  protected readonly filmInfo = computed(() => FILMS.find((f) => f.id === this.session.film())!);

  protected readonly isNegative = computed(() => this.filmInfo().kind === 'Negative');

  protected readonly printEvLabel = computed(() => {
    const v = this.session.printEv();
    return `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`;
  });

  protected onPrint(event: Event): void {
    this.session.print.set((event.target as HTMLInputElement).checked);
  }

  protected readonly exposureLabel = computed(() => {
    if (!this.isNegative()) return 'Projection';
    return this.session.negativeOutput() === 'print' ? 'Print' : 'Scan';
  });

  protected onOutput(event: Event): void {
    this.session.negativeOutput.set((event.target as HTMLSelectElement).value as 'lab' | 'print');
  }

  protected onPrintEv(event: Event): void {
    this.session.printEv.set(Number((event.target as HTMLInputElement).value));
  }

  protected onGrain(event: Event): void {
    this.session.grain.set((event.target as HTMLInputElement).checked);
  }

  protected onGrainAmount(event: Event): void {
    this.session.grainAmount.set(Number((event.target as HTMLInputElement).value));
  }

  protected onGrainSize(event: Event): void {
    this.session.grainSize.set(Number((event.target as HTMLInputElement).value));
  }

  protected readonly toneControls: readonly AdjustControl[] = [
    { key: 'highlights', label: 'Highlights' },
    { key: 'shadows', label: 'Shadows' },
    { key: 'whites', label: 'Whites' },
    { key: 'blacks', label: 'Blacks' },
  ];

  protected readonly colorControls: readonly AdjustControl[] = [
    { key: 'saturation', label: 'Saturation' },
    { key: 'temperature', label: 'Temperature' },
    { key: 'tint', label: 'Tint' },
  ];

  protected onAdjust(key: keyof Adjustments, event: Event): void {
    this.session.setAdjustment(key, Number((event.target as HTMLInputElement).value));
  }

  protected onFilm(event: Event): void {
    this.session.film.set((event.target as HTMLSelectElement).value as FilmId);
  }

  protected showCredits(): void {
    this.credits().nativeElement.showModal();
  }

  protected closeCredits(): void {
    this.credits().nativeElement.close();
  }
}
