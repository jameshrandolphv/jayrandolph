import { Service } from '@angular/core';
import { Photo, PhotoGroup } from '../models/Photography';

@Service()
export class PhotographyService {
  fetchPhotogroups(): Promise<PhotoGroup[]> {
    return Promise.resolve([
      {
        id: 1,
        name: '[2026-07-03] Ilford HP5+ 400',
        photos: null
      }
    ] as PhotoGroup[]);
  }

  loadPhotos(group: PhotoGroup): Promise<Photo[]> {
    return Promise.resolve(
      Array.from(Array(36)).map((_, i) => ({
        id: i + 1,
        src: `../../assets/images/film_scans/scan (${i + 1}).jpg`,
        width: 3300,
        height: 3300,
        metadata: {
          title: '',
          type: 'film_bw',
          roll_number: 1,
          developer: 'D76 [Film Photography Project]',
          fixer: 'FPP Fixer',
          dev_number: 1,
          film_stock: 'Ilford HP5+',
          iso: 400,
          expiration: 'Late 2010s',
          size: 135,
          number_of_exposures: 36,
          dates_shot: 'July 2026',
          date_developed: 'July 3, 2026',
          camera: 'Canon Sure Shot Sleek',
          lens: 'Fixed 32mm f3.5',
          dev_time_mins: 7.5,
          dev_temp_f: 68,
          fixer_time_mins: 5.5,
          dev_adjustments: '',
          scanner: 'Plustek OpticFilm 8100',
          notes:
            'First roll on the Canon Sure Shot P&S, and first BW roll developed. Came out nicely, includes random pics from UWS.'
        }
      })) as Photo[]
    );
  }
}
