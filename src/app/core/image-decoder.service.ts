import { Injectable, inject } from '@angular/core';
import { RasterDecoderService } from './raster-decoder.service';
import { RawDecoderService, type DecodedRaw } from './raw-decoder.service';
import { TiffDecoderService } from './tiff-decoder.service';

export const SUPPORTED_EXTENSIONS = [
  '.dng',
  '.tif',
  '.tiff',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
] as const;

const RASTER_NAME = /\.(jpe?g|png|webp|heic|heif)$/;

@Injectable({ providedIn: 'root' })
export class ImageDecoderService {
  private readonly raw = inject(RawDecoderService);
  private readonly tiff = inject(TiffDecoderService);
  private readonly raster = inject(RasterDecoderService);

  decode(file: File): Promise<DecodedRaw> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.tif') || name.endsWith('.tiff')) return this.tiff.decode(file);
    if (name.endsWith('.dng')) return this.raw.decode(file);
    if (RASTER_NAME.test(name)) return this.raster.decode(file);
    return Promise.reject(
      new Error('Unsupported file type. Open a .dng, .tif, .jpg, .png, .webp or .heic file.'),
    );
  }
}
