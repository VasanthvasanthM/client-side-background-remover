/**
 * Generates the social card, the icons and the web manifest.
 *
 * A dependency-free PNG encoder rather than sharp or resvg, because the images
 * are a flat card and a rounded badge — a few rectangles, a clock face and some
 * text. Pulling a native image toolchain into a static site's install for that
 * would cost more than it is worth, and this keeps `npm install` to one package.
 *
 * The type is an 8x8 uppercase bitmap face scaled up, which is a deliberate
 * choice rather than a limitation: it stays perfectly crisp at the one size the
 * card is ever shown at, and needs no font file.
 *
 *   node scripts/generate-assets.js
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ROOT } from './render-utils.js';
import { LOCALES, SITE_URL } from './site.config.js';

/* ------------------------------------------------------------- PNG encoding */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encode an RGBA buffer as a PNG. Colour type 6, 8 bits, no interlacing. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 means "store as-is",
  // which deflate compresses perfectly well for flat colour.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy
      ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ drawing */

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  /** Source-over blend, so rounded corners and circles get real antialiasing. */
  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const index = (y * this.width + x) * 4;
    const a = Math.min(1, alpha);
    const existing = this.data[index + 3] / 255;
    const out = a + existing * (1 - a);
    for (let channel = 0; channel < 3; channel += 1) {
      const src = [r, g, b][channel];
      const dst = this.data[index + channel];
      this.data[index + channel] = Math.round((src * a + dst * existing * (1 - a)) / (out || 1));
    }
    this.data[index + 3] = Math.round(out * 255);
  }

  fillRect(x, y, w, h, colour) {
    for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py += 1) {
      for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px += 1) {
        this.blend(px, py, colour, 1);
      }
    }
  }

  /** Vertical two-stop gradient, interpolated per row. */
  fillGradient(from, to) {
    for (let y = 0; y < this.height; y += 1) {
      const ratio = y / (this.height - 1);
      const colour = [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * ratio));
      this.fillRect(0, y, this.width, 1, colour);
    }
  }

  /**
   * Rounded rectangle, supersampled 3x3 per pixel at the corners.
   *
   * Cheap, and enough to remove the stair-stepping that is otherwise the first
   * thing the eye catches on a flat card.
   */
  fillRoundRect(x, y, w, h, radius, colour, alpha = 1) {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py += 1) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px += 1) {
        let hits = 0;
        for (let sy = 0; sy < 3; sy += 1) {
          for (let sx = 0; sx < 3; sx += 1) {
            if (insideRoundRect(px + (sx + 0.5) / 3, py + (sy + 0.5) / 3, x, y, w, h, radius)) hits += 1;
          }
        }
        if (hits) this.blend(px, py, colour, (hits / 9) * alpha);
      }
    }
  }

  fillCircle(cx, cy, r, colour, alpha = 1) {
    for (let py = Math.max(0, Math.floor(cy - r)); py < Math.min(this.height, Math.ceil(cy + r + 1)); py += 1) {
      for (let px = Math.max(0, Math.floor(cx - r)); px < Math.min(this.width, Math.ceil(cx + r + 1)); px += 1) {
        let hits = 0;
        for (let sy = 0; sy < 3; sy += 1) {
          for (let sx = 0; sx < 3; sx += 1) {
            const dx = px + (sx + 0.5) / 3 - cx;
            const dy = py + (sy + 0.5) / 3 - cy;
            if (dx * dx + dy * dy <= r * r) hits += 1;
          }
        }
        if (hits) this.blend(px, py, colour, (hits / 9) * alpha);
      }
    }
  }

  png() {
    return encodePng(this.width, this.height, this.data);
  }
}

function insideRoundRect(px, py, x, y, w, h, radius) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const left = x + radius;
  const right = x + w - radius;
  const top = y + radius;
  const bottom = y + h - radius;
  const cx = px < left ? left : px > right ? right : px;
  const cy = py < top ? top : py > bottom ? bottom : py;
  if (cx === px || cy === py) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/* --------------------------------------------------------------- bitmap font */

/**
 * 8x8 uppercase face, one string row per scanline.
 *
 * Uppercase only, which is all the card needs and keeps the table to the
 * 29 glyphs actually used rather than a full ASCII set.
 */
const FONT = {
  A: ['..XX..', '.X..X.', 'X....X', 'X....X', 'XXXXXX', 'X....X', 'X....X', '......'],
  B: ['XXXXX.', 'X....X', 'X....X', 'XXXXX.', 'X....X', 'X....X', 'XXXXX.', '......'],
  C: ['.XXXX.', 'X....X', 'X.....', 'X.....', 'X.....', 'X....X', '.XXXX.', '......'],
  D: ['XXXXX.', 'X....X', 'X....X', 'X....X', 'X....X', 'X....X', 'XXXXX.', '......'],
  E: ['XXXXXX', 'X.....', 'X.....', 'XXXXX.', 'X.....', 'X.....', 'XXXXXX', '......'],
  F: ['XXXXXX', 'X.....', 'X.....', 'XXXXX.', 'X.....', 'X.....', 'X.....', '......'],
  G: ['.XXXX.', 'X....X', 'X.....', 'X..XXX', 'X....X', 'X....X', '.XXXX.', '......'],
  H: ['X....X', 'X....X', 'X....X', 'XXXXXX', 'X....X', 'X....X', 'X....X', '......'],
  I: ['.XXXX.', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '.XXXX.', '......'],
  J: ['..XXXX', '....XX', '....XX', '....XX', '....XX', 'X...XX', '.XXXX.', '......'],
  K: ['X....X', 'X...X.', 'X..X..', 'XXX...', 'X..X..', 'X...X.', 'X....X', '......'],
  L: ['X.....', 'X.....', 'X.....', 'X.....', 'X.....', 'X.....', 'XXXXXX', '......'],
  M: ['X....X', 'XX..XX', 'X.XX.X', 'X.XX.X', 'X....X', 'X....X', 'X....X', '......'],
  N: ['X....X', 'XX...X', 'X.X..X', 'X..X.X', 'X...XX', 'X....X', 'X....X', '......'],
  O: ['.XXXX.', 'X....X', 'X....X', 'X....X', 'X....X', 'X....X', '.XXXX.', '......'],
  P: ['XXXXX.', 'X....X', 'X....X', 'XXXXX.', 'X.....', 'X.....', 'X.....', '......'],
  Q: ['.XXXX.', 'X....X', 'X....X', 'X....X', 'X..X.X', 'X...XX', '.XXXXX', '......'],
  R: ['XXXXX.', 'X....X', 'X....X', 'XXXXX.', 'X..X..', 'X...X.', 'X....X', '......'],
  S: ['.XXXX.', 'X....X', 'X.....', '.XXXX.', '.....X', 'X....X', '.XXXX.', '......'],
  T: ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '......'],
  U: ['X....X', 'X....X', 'X....X', 'X....X', 'X....X', 'X....X', '.XXXX.', '......'],
  V: ['X....X', 'X....X', 'X....X', 'X....X', '.X..X.', '.X..X.', '..XX..', '......'],
  W: ['X....X', 'X....X', 'X....X', 'X.XX.X', 'X.XX.X', 'XX..XX', 'X....X', '......'],
  X: ['X....X', '.X..X.', '..XX..', '..XX..', '..XX..', '.X..X.', 'X....X', '......'],
  Y: ['X....X', '.X..X.', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '......'],
  Z: ['XXXXXX', '....X.', '...X..', '..XX..', '.X....', 'X.....', 'XXXXXX', '......'],
  '&': ['..XX..', '.X..X.', '.X.X..', '..X...', '.X.X.X', 'X...X.', '.XXX.X', '......'],
  '-': ['......', '......', '......', 'XXXXXX', '......', '......', '......', '......'],
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......'],
};

const GLYPH_W = 6;
const GLYPH_H = 8;

function textWidth(text, scale, tracking) {
  return text.length * (GLYPH_W * scale + tracking) - tracking;
}

function drawText(canvas, text, x, y, scale, colour, tracking = scale) {
  // A glyph the face does not carry renders as a blank, which is invisible in
  // a build log and obvious only once the card is shared. Fail loudly instead.
  const missing = [...text.toUpperCase()].filter((ch) => ch !== ' ' && !FONT[ch]);
  if (missing.length) {
    throw new Error(`generate-assets: no glyph for ${[...new Set(missing)].join('')} in "${text}"`);
  }

  let cursor = x;
  for (const character of text.toUpperCase()) {
    const glyph = FONT[character];
    if (!glyph) {
      cursor += GLYPH_W * scale + tracking;
      continue;
    }
    for (let row = 0; row < GLYPH_H; row += 1) {
      const line = glyph[row] ?? '';
      for (let column = 0; column < GLYPH_W; column += 1) {
        if (line[column] === 'X') {
          canvas.fillRect(cursor + column * scale, y + row * scale, scale, scale, colour);
        }
      }
    }
    cursor += GLYPH_W * scale + tracking;
  }
  return cursor - tracking;
}

/* ------------------------------------------------------------------- shapes */

const CUT = [0x7c, 0x3a, 0xed, 255];
const CUT_DEEP = [0x2e, 0x10, 0x65, 255];
const CUT_MID = [0x5b, 0x21, 0xb6, 255];
const CHECKER = [0xd8, 0xd8, 0xd8, 255];
const INK = [0x24, 0x29, 0x36];
const INK_SOFT = [0x66, 0x73, 0x8e];
const WHITE = [0xff, 0xff, 0xff];

/**
 * The product mark: a checkerboard square with one corner cut away.
 *
 * The checkerboard is the universal sign for "transparent", and the missing
 * corner is the cut. Both read at 16 pixels, which a pair of scissors does
 * not — scissors become a grey smudge at favicon size.
 */
function drawCutMark(canvas, x, y, size, squares = 4) {
  const cell = size / squares;

  for (let row = 0; row < squares; row += 1) {
    for (let column = 0; column < squares; column += 1) {
      // The cut: the top-right quadrant is absent, which is what makes the
      // mark read as a cutout rather than as a plain checkerboard.
      if (row < squares / 2 && column >= squares / 2) continue;
      const light = (row + column) % 2 === 0;
      canvas.fillRect(x + column * cell, y + row * cell, cell, cell, light ? WHITE : CHECKER);
    }
  }
}

/* ------------------------------------------------------------------ outputs */

function buildOgCard() {
  const canvas = new Canvas(1200, 630);
  canvas.fillGradient(CUT_DEEP, CUT_MID);

  // Inset card.
  canvas.fillRoundRect(56, 56, 1088, 518, 40, WHITE);

  // Badge carrying the cutout mark.
  canvas.fillRoundRect(112, 112, 128, 128, 36, CUT);
  drawCutMark(canvas, 136, 136, 80);

  drawText(canvas, 'REMOVE THE', 112, 300, 9, INK, 9);
  drawText(canvas, 'BACKGROUND', 112, 392, 9, CUT_DEEP, 9);
  drawText(canvas, 'IN YOUR BROWSER - NOTHING IS UPLOADED', 112, 484, 3, INK_SOFT, 3);

  // Three dots echoing the "private, no signup, no watermark" badges.
  for (let index = 0; index < 3; index += 1) {
    canvas.fillCircle(1060 - index * 36, 176, 10, CUT, 1 - index * 0.28);
  }

  return canvas.png();
}

function buildTouchIcon(size) {
  const canvas = new Canvas(size, size);
  canvas.fillRoundRect(0, 0, size, size, size * 0.22, CUT);
  drawCutMark(canvas, size * 0.19, size * 0.19, size * 0.62);
  return canvas.png();
}

/** The favicon stays vector: it is pure geometry and scales for free. */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Cutout">
  <rect width="64" height="64" rx="14" fill="#7c3aed"/>
  <g>
    <rect x="14" y="34" width="10" height="10" fill="#ffffff"/>
    <rect x="34" y="34" width="10" height="10" fill="#ffffff"/>
    <rect x="24" y="24" width="10" height="10" fill="#ffffff"/>
    <rect x="44" y="24" width="10" height="10" fill="#ffffff"/>
    <rect x="24" y="44" width="10" height="10" fill="#ffffff"/>
    <rect x="44" y="44" width="10" height="10" fill="#ffffff"/>
    <rect x="14" y="14" width="10" height="10" fill="#ffffff"/>
    <rect x="34" y="14" width="10" height="10" fill="#ffffff" opacity="0.35"/>
    <rect x="14" y="54" width="10" height="0" fill="#ffffff"/>
  </g>
</svg>
`;

function buildManifest(dict) {
  return JSON.stringify(
    {
      name: dict['app.name'],
      short_name: dict['app.name'],
      description: dict['meta.description'],
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f6f7f9',
      theme_color: '#3a4de8',
      orientation: 'any',
      icons: [
        { src: '/assets/icon/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/assets/icon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { src: '/assets/icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable any' },
      ],
      lang: 'en',
      dir: 'ltr',
      categories: ['productivity', 'utilities'],
    },
    null,
    2,
  );
}

async function main() {
  const { loadDictionary } = await import('./render-utils.js');
  const dict = await loadDictionary('en');

  await mkdir(path.join(ROOT, 'assets', 'og'), { recursive: true });
  await mkdir(path.join(ROOT, 'assets', 'icon'), { recursive: true });

  const outputs = [
    ['assets/og/cover.png', buildOgCard()],
    ['assets/icon/apple-touch-icon.png', buildTouchIcon(180)],
    ['assets/icon/icon-512.png', buildTouchIcon(512)],
    ['assets/icon/favicon.svg', FAVICON_SVG],
    ['assets/site.webmanifest', buildManifest(dict)],
  ];

  for (const [relative, contents] of outputs) {
    await writeFile(path.join(ROOT, relative), contents);
    const size = Buffer.isBuffer(contents) ? contents.length : Buffer.byteLength(contents);
    console.log(`  ${relative} (${(size / 1024).toFixed(1)} KB)`);
  }

  console.log(`build:assets — ${outputs.length} files, ${LOCALES.length} locales share them (${SITE_URL})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
