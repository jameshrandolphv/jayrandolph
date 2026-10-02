// Generates thumbnails, display copies and public/photos/manifest.json from photos-src/<album>/*.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, parse, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'photos-src');
const outDir = join(root, 'public', 'photos');
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const THUMB = { size: 480, quality: 78 };
const DISPLAY = { size: 2560, quality: 82 };

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';

const titleCase = (s) =>
  s
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const isNewer = async (a, b) => {
  try {
    return (await stat(a)).mtimeMs >= (await stat(b)).mtimeMs;
  } catch {
    return false;
  }
};

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function albumTitle(dir, fallback) {
  try {
    const meta = JSON.parse(await readFile(join(dir, 'album.json'), 'utf8'));
    if (typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return titleCase(fallback);
}

async function resize(input, output, { size, quality }) {
  if (await isNewer(output, input)) return;
  await mkdir(dirname(output), { recursive: true });
  await sharp(input)
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(output);
}

const web = (p) => relative(join(root, 'public'), p).split('\\').join('/');

async function buildAlbum(name) {
  const dir = join(srcDir, name);
  const albumId = slug(name);
  const files = (await readdir(dir)).filter((f) => EXTENSIONS.has(extname(f).toLowerCase())).sort();
  const used = new Set();
  const images = [];

  for (const file of files) {
    const base = parse(file).name;
    let id = slug(base);
    for (let n = 2; used.has(id); n++) id = `${slug(base)}-${n}`;
    used.add(id);

    const input = join(dir, file);
    const thumb = join(outDir, albumId, 'thumbs', `${id}.webp`);
    const display = join(outDir, albumId, 'display', `${id}.webp`);
    await resize(input, thumb, THUMB);
    await resize(input, display, DISPLAY);
    const { width, height } = await sharp(display).metadata();
    images.push({ id, name: titleCase(base), thumb: web(thumb), src: web(display), width, height });
  }

  return { id: albumId, title: await albumTitle(dir, name), images };
}

const albums = [];
for (const name of (await listDirs(srcDir)).sort()) albums.push(await buildAlbum(name));

// Drop generated files for albums that no longer exist.
for (const stale of await listDirs(outDir)) {
  if (!albums.some((a) => a.id === stale)) await rm(join(outDir, stale), { recursive: true, force: true });
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'manifest.json'), JSON.stringify({ albums }, null, 2) + '\n');
const count = albums.reduce((n, a) => n + a.images.length, 0);
console.log(`photos: ${albums.length} album(s), ${count} image(s)`);
