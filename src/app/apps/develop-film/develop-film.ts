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
import { EXPORT_FORMATS, type ExportFormat } from '../../export/encoders';
import { Viewer } from '../../ui/viewer';
import { WindowFrame } from '../../ui/window-frame';

@Component({
  selector: 'app-develop-film',
  imports: [Viewer, WindowFrame],
  templateUrl: './develop-film.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopFilm {
  protected readonly session = inject(SessionService);
  protected readonly films = FILMS;
  protected readonly dragging = signal(false);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly credits = viewChild.required<ElementRef<HTMLDialogElement>>('credits');
  private readonly exporter = viewChild.required<ElementRef<HTMLDialogElement>>('exporter');
  protected readonly exportFormats = EXPORT_FORMATS;
  protected readonly exportFormat = signal<ExportFormat>('png16');
  protected readonly jpegQuality = signal(92);
  protected readonly exportError = signal('');
  protected readonly exporting = computed(() => this.session.exportProgress() !== null);

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

  protected readonly isNegative = computed(
    () => this.films.find((f) => f.id === this.session.film())?.kind === 'Negative',
  );

  protected onContrast(event: Event): void {
    this.session.contrast.set(Number((event.target as HTMLInputElement).value));
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

  protected onShowOriginal(event: Event): void {
    this.session.showOriginal.set((event.target as HTMLInputElement).checked);
  }

  protected selectFilm(id: FilmId): void {
    this.session.film.set(id);
  }

  protected showCredits(): void {
    this.credits().nativeElement.showModal();
  }

  protected closeCredits(): void {
    this.credits().nativeElement.close();
  }
}
