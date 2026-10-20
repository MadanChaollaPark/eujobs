// Run with Node after npm ci; Next.js includes Sharp for image processing.
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const app = new URL('../src/app/', import.meta.url);
const icons = new URL('../public/icons/', import.meta.url);
await mkdir(icons, { recursive: true });
const svg = await readFile(new URL('icon.svg', app));
for (const size of [192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(new URL(`icon-${size}.png`, icons).pathname);
}
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: '#153e35' })
  .png()
  .toFile(new URL('apple-icon.png', app).pathname);
await writeFile(
  new URL('../public/apple-touch-icon.png', import.meta.url),
  await readFile(new URL('apple-icon.png', app)),
);
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#153e35"/><svg x="77" y="77" width="358" height="358" viewBox="0 0 64 64">${svg
    .toString()
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')}</svg></svg>`,
);
await sharp(maskable).png().toFile(new URL('maskable-512.png', icons).pathname);

// ICO supports embedded PNG frames; browsers can pick the closest native size.
const frames = await Promise.all(
  [16, 32, 48].map(async (size) => ({
    size,
    png: await sharp(svg).resize(size, size).png().toBuffer(),
  })),
);
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(
  new URL('favicon.ico', app),
  Buffer.concat([header, ...frames.map(({ png }) => png)]),
);
console.log('Generated EUJobs browser, Apple and manifest icons.');
