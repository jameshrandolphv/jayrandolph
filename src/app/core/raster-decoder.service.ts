import { Injectable } from '@angular/core';
import { SRGB_ENCODING } from './icc-parse';
import type { DecodedRaw } from './raw-decoder.service';
import { tiffToLinear } from './tiff-decoder.service';

const HEIF_NAME = /\.(heic|heif)$/i;
const HEIF_TYPE = /^image\/hei[cf]/i;

/** Decodes JPEG, PNG, WebP and HEIF through the browser, with a WASM fallback for HEIF. */
@Injectable({ providedIn: 'root' })
export class RasterDecoderService {
  async decode(file: File): Promise<DecodedRaw> {
    const bitmap = await this.toBitmap(file);
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
      if (!ctx) throw new Error('Could not decode this image.');
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const image = tiffToLinear(
        {
          data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
          width: bitmap.width,
          height: bitmap.height,
          samples: 4,
          bits: 8,
          channels: 3,
          whiteIsZero: false,
          orientation: 1,
        },
        SRGB_ENCODING,
      );
      return { image, camera: '', iso: 0, baselineEv: 0 };
    } finally {
      bitmap.close();
    }
  }

  private async toBitmap(file: File): Promise<ImageBitmap> {
    const options: ImageBitmapOptions = { imageOrientation: 'from-image' };
    try {
      return await createImageBitmap(file, options);
    } catch (err) {
      if (!HEIF_NAME.test(file.name) && !HEIF_TYPE.test(file.type)) {
        throw new Error('Could not decode this image.', { cause: err });
      }
    }
    // Only Safari decodes HEIF natively; load the WASM converter elsewhere.
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/png' });
    return createImageBitmap(Array.isArray(out) ? out[0] : out, options);
  }
}
