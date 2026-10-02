import { Injectable } from '@angular/core';
import LibRaw, { type LibRawSettings } from 'libraw-wasm';

/** Linear, white-balanced, demosaiced RGB in Rec.2020 primaries (D65), 16-bit interleaved. */
export interface LinearImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint16Array;
}

export interface DecodedRaw {
  readonly image: LinearImage;
  readonly camera: string;
  readonly iso: number;
}

// outputColor 8 = Rec.2020; gamma 1/1 keeps the output linear for the spectral engine.
const LINEAR_SETTINGS: LibRawSettings = {
  outputBps: 16,
  outputColor: 8,
  gamm: [1, 1],
  noAutoBright: true,
  useCameraWb: true,
  useCameraMatrix: 3,
  highlight: 0,
  userQual: 3,
  userFlip: -1,
};

@Injectable({ providedIn: 'root' })
export class RawDecoderService {
  async decode(file: File): Promise<DecodedRaw> {
    const raw = new LibRaw();
    try {
      await raw.open(new Uint8Array(await file.arrayBuffer()), LINEAR_SETTINGS);
      const meta = await raw.metadata();
      const img = await raw.imageData();
      if (!img || img.colors !== 3 || img.bits !== 16) {
        throw new Error('Unsupported RAW output (expected 16-bit RGB).');
      }
      const data =
        img.data instanceof Uint16Array
          ? img.data
          : new Uint16Array(img.data.buffer, img.data.byteOffset, img.data.byteLength >> 1);
      return {
        image: { width: img.width, height: img.height, data },
        camera: [meta?.camera_make, meta?.camera_model].filter(Boolean).join(' '),
        iso: meta?.iso_speed ?? 0,
      };
    } finally {
      raw.dispose();
    }
  }
}
