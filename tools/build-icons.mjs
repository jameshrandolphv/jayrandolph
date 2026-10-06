// Renders tools/pwa-icon.svg to the PNG sizes the web app manifest and iOS home screen need.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('./pwa-icon.svg', import.meta.url));
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  await writeFile(new URL(name, out), await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer());
}
