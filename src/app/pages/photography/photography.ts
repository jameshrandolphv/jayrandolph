import { Component, inject, signal } from '@angular/core';
import { PhotoGroup } from '../../models/Photography';
import { PhotoCard } from './photo-card/photo-card';
import { PhotographyService } from '../../services/photography.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-photography',
  imports: [PhotoCard, FormsModule],
  templateUrl: './photography.html',
  styleUrl: './photography.scss'
})
export class Photography {
  photogroups = signal<PhotoGroup[]>([]);
  photogroup = signal<PhotoGroup | null>(null);

  photoService = inject(PhotographyService);

  constructor() {
    this.photoService.fetchPhotogroups().then(groups => {
      this.photogroups.set(groups);
      this.loadPhotoGroup(groups[0]);
    });
  }

  async loadPhotoGroup(group: PhotoGroup) {
    if (!Array.isArray(group.photos)) {
      group.photos = await this.photoService.loadPhotos(group);
    }
    this.photogroup.set(group);
  }
}
