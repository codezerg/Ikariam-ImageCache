// Draws the extension icon at every size it is needed, with no image
// dependencies — shapes are defined in normalized coordinates and rendered with
// 4x4 supersampling straight into a PNG.
//
//   npm run icons
//
// Subject: a picture glyph. Deliberately plain.

import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/icons');

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor per axis

const SLATE = [52, 73, 94];
const WHITE = [255, 255, 255];

// ---------------------------------------------------------------- geometry --

/** Signed-area test: is (x, y) inside this polygon? */
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (!inRect(x, y, x0, y0, x1, y1)) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// ------------------------------------------------------------------ layers --

/**
 * The standard picture glyph: a white card with a sun and mountains knocked out
 * of it. Below ~24px the sun and the second peak have no room, so the small
 * variant drops them and fills more of the tile. Shipping different artwork per
 * size is normal.
 */
function geometry(size) {
  const small = size <= 24;
  return {
    inset: small ? 0.0 : 0.015,
    radius: small ? 0.17 : 0.21,
    card: small ? [0.15, 0.24, 0.85, 0.76] : [0.17, 0.25, 0.83, 0.75],
    cardRadius: small ? 0.035 : 0.045,
    sun: small ? [0.305, 0.365, 0.062] : [0.315, 0.375, 0.055],
    peaks: small
      ? [[[0.36, 0.76], [0.60, 0.48], [0.85, 0.76]]]
      : [
          [[0.36, 0.75], [0.585, 0.475], [0.81, 0.75]],
          [[0.17, 0.75], [0.335, 0.545], [0.50, 0.75]],
        ],
  };
}

/** Colour and coverage at one sample point, composited front to back. */
function sample(x, y, g) {
  if (!inRoundRect(x, y, g.inset, g.inset, 1 - g.inset, 1 - g.inset, g.radius)) return null;
  if (!inRoundRect(x, y, ...g.card, g.cardRadius)) return SLATE;

  // Inside the card: sun and peaks are knocked back out to the tile colour.
  if (g.sun && (x - g.sun[0]) ** 2 + (y - g.sun[1]) ** 2 <= g.sun[2] ** 2) return SLATE;
  if (g.peaks.some((p) => inPolygon(x, y, p))) return SLATE;
  return WHITE;
}

// --------------------------------------------------------------------- PNG --

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function render(size) {
  const geo = geometry(size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;

  for (let py = 0; py < size; py++) {
    raw[p++] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, geo);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }

      const n = SS * SS;
      const cov = a / n;
      // Premultiplied average, un-premultiplied back out for straight alpha.
      raw[p++] = cov ? Math.round(r / n / (cov / 255)) : 0;
      raw[p++] = cov ? Math.round(g / n / (cov / 255)) : 0;
      raw[p++] = cov ? Math.round(b / n / (cov / 255)) : 0;
      raw[p++] = Math.round(cov);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  await writeFile(join(outDir, `icon-${size}.png`), render(size));
}
console.log(`  wrote ${SIZES.map((s) => `icon-${s}.png`).join(', ')} to src/icons/`);
