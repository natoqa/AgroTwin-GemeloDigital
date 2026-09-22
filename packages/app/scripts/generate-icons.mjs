/**
 * Generates the PWA icons.
 *
 * These are **provisional**: a plain mark so the app is installable in Phase 1.
 * The real icon belongs to the Phase 4 design system. Keeping the generator in
 * the repository means the binaries are reproducible rather than mystery blobs.
 *
 * Run with `node scripts/generate-icons.mjs`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const BACKGROUND = [0x1d, 0x6f, 0x2f]; // agrotwin green, matches theme_color
const FOREGROUND = [0xf6, 0xf7, 0xf4];

/** A leaf: two circle arcs meeting at the tips, plus a midrib. */
function isLeaf(x, y, size, inset) {
  const half = size / 2;
  // Work in a square of side `span` centred on the canvas.
  const span = size * inset;
  const u = (x - half) / (span / 2);
  const v = (y - half) / (span / 2);
  // Rotate 45 degrees so the leaf points to the top-right.
  const a = (u + v) / Math.SQRT2;
  const b = (v - u) / Math.SQRT2;

  const r = 1.25;
  const offset = 0.78;
  const inLens = (a - offset) ** 2 + b ** 2 < r ** 2 && (a + offset) ** 2 + b ** 2 < r ** 2;
  const onMidrib = Math.abs(a) < 0.05 && Math.abs(b) < 0.9;
  return inLens && !onMidrib;
}

function renderPng(size, inset) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let cursor = 0;
  for (let y = 0; y < size; y += 1) {
    raw[cursor] = 0; // filter: none
    cursor += 1;
    for (let x = 0; x < size; x += 1) {
      const colour = isLeaf(x + 0.5, y + 0.5, size, inset) ? FOREGROUND : BACKGROUND;
      raw[cursor] = colour[0];
      raw[cursor + 1] = colour[1];
      raw[cursor + 2] = colour[2];
      raw[cursor + 3] = 0xff;
      cursor += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const here = fileURLToPath(new URL('../public/', import.meta.url));
const outputs = [
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  // Maskable icons get cropped to a circle; keep the mark inside the safe zone.
  ['icon-maskable-512.png', 512, 0.5],
];

for (const [name, size, inset] of outputs) {
  writeFileSync(here + name, renderPng(size, inset));
  process.stdout.write(`wrote public/${name} (${size}x${size})\n`);
}
