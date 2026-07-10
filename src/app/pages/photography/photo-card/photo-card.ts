import { Component, computed, input, signal } from '@angular/core';
import { Photo } from '../../../models/Photography';
import { NgOptimizedImage } from '@angular/common';

const EXCLUDED_METADATA = ['type'];

@Component({
  selector: 'app-photo-card',
  imports: [NgOptimizedImage],
  templateUrl: './photo-card.html',
  styleUrl: './photo-card.scss'
})
export class PhotoCard {
  photo = input.required<Photo>();

  metadata = computed(() =>
    Object.keys(this.photo().metadata)
      .filter(k => !EXCLUDED_METADATA.includes(k))
      .map(k => ({
        label: k,
        value: `${(this.photo().metadata as any)[k]}` || 'N/A'
      }))
  );

  showMetadata = signal(false);

  toggleMetadata() {
    this.showMetadata.set(!this.showMetadata());
  }
}
