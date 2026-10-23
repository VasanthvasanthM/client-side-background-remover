/**
 * Generates the four example images shipped with the app.
 *
 * One per mode, each chosen so that the mode it belongs to visibly succeeds
 * and the obvious alternative visibly struggles — which is the only way a
 * worked example teaches anything.
 *
 * Synthesised rather than photographed so they are small, reproducible, carry
 * no licensing question and depict nobody real.
 *
 *   node scripts/generate-samples.js
 */

import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { ROOT } from './render-utils.js';

const OUT = path.join(ROOT, 'assets', 'samples');

// ------------------------------------------------------------- PNG encoding

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Write 24-bit RGB rather than RGBA.
 *
 * These are photographs, conceptually: none has transparency, and dropping the
 * alpha channel is a quarter off the file before compression even starts.
 */
function encodePng(rgba, width, height) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    // Filter 1 (Sub) predicts each byte from the one three bytes left, which
    // is a large win on the flat and gradient areas these images are made of.
    raw[y * stride] = 1;
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        const here = rgba[(y * width + x) * 4 + c];
        const left = x > 0 ? rgba[(y * width + x - 1) * 4 + c] : 0;
        raw[y * stride + 1 + x * 3 + c] = (here - left) & 0xff;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour, no alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- drawing

function canvas(width, height, rgb) {
  const d = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < d.length; p += 4) {
    d[p] = rgb[0];
    d[p + 1] = rgb[1];
    d[p + 2] = rgb[2];
    d[p + 3] = 255;
  }
  return d;
}

const px = (d, w, x, y, rgb) => {
  if (x < 0 || y < 0 || x >= w) return;
  const p = (Math.round(y) * w + Math.round(x)) * 4;
  if (p < 0 || p + 3 >= d.length) return;
  d[p] = rgb[0];
  d[p + 1] = rgb[1];
  d[p + 2] = rgb[2];
  d[p + 3] = 255;
};

const rect = (d, w, x0, y0, rw, rh, rgb) => {
  for (let y = y0; y < y0 + rh; y += 1) for (let x = x0; x < x0 + rw; x += 1) px(d, w, x, y, rgb);
};

const disc = (d, w, cx, cy, r, rgb) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) {
    for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(d, w, x, y, rgb);
    }
  }
};

const ring = (d, w, cx, cy, outer, inner, rgb) => {
  for (let y = Math.floor(cy - outer); y <= cy + outer; y += 1) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x += 1) {
      const t = (x - cx) ** 2 + (y - cy) ** 2;
      if (t <= outer * outer && t >= inner * inner) px(d, w, x, y, rgb);
    }
  }
};

/** An ellipse, for shoulders and heads. */
const ellipse = (d, w, cx, cy, rx, ry, rgb) => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) px(d, w, x, y, rgb);
    }
  }
};

let seed = 11;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/** Sensor grain. Without it a synthetic image is unrealistically easy. */
const noise = (d, amp) => {
  for (let p = 0; p < d.length; p += 4) {
    const j = Math.round((rnd() - 0.5) * 2 * amp);
    for (let c = 0; c < 3; c += 1) d[p + c] = Math.max(0, Math.min(255, d[p + c] + j));
  }
};

const sweep = (d, w, h, top, bottom) => {
  for (let y = 0; y < h; y += 1) {
    const t = y / (h - 1);
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) d[p + c] = Math.round(top[c] + (bottom[c] - top[c]) * t);
    }
  }
};

// ----------------------------------------------------------------- samples

/** Automatic: a mug on a lit paper sweep, with grain and a contact shadow. */
function product() {
  const w = 440;
  const h = 340;
  const d = canvas(w, h, [250, 250, 248]);
  sweep(d, w, h, [252, 252, 250], [231, 231, 228]);
  disc(d, w, 300, 232, 30, [238, 238, 235]); // contact shadow
  rect(d, w, 150, 110, 120, 150, [62, 78, 120]);
  ring(d, w, 290, 175, 34, 21, [62, 78, 120]);
  rect(d, w, 150, 110, 120, 14, [88, 106, 152]);
  noise(d, 5);
  return { d, w, h };
}

/** By colour: flat artwork whose enclosed gaps are background too. */
function logo() {
  const w = 360;
  const h = 360;
  const d = canvas(w, h, [255, 255, 255]);
  ring(d, w, 180, 150, 92, 52, [124, 58, 237]);
  rect(d, w, 108, 266, 144, 28, [124, 58, 237]);
  rect(d, w, 158, 120, 44, 52, [124, 58, 237]);
  return { d, w, h };
}

/** Green screen: unevenly lit backdrop, dark hair, green spill on shoulders. */
function greenScreen() {
  const w = 400;
  const h = 320;
  const d = canvas(w, h, [20, 170, 50]);
  sweep(d, w, h, [64, 214, 94], [12, 94, 32]);
  ellipse(d, w, 200, 190, 86, 70, [72, 92, 152]); // shoulders
  rect(d, w, 114, 176, 172, 10, [96, 132, 116]); // spill
  disc(d, w, 200, 118, 44, [26, 22, 20]); // hair
  disc(d, w, 200, 128, 36, [226, 190, 170]); // face
  noise(d, 4);
  return { d, w, h };
}

/**
 * AI: a figure in a cluttered room.
 *
 * Deliberately the case the colour modes cannot do: the wall behind is three
 * different colours and the subject's clothing matches one of them, so no
 * single tolerance separates them.
 */
function room() {
  const w = 400;
  const h = 330;
  const d = canvas(w, h, [196, 186, 170]);
  rect(d, w, 0, 0, w, 120, [92, 116, 140]); // wall
  rect(d, w, 0, 120, w, 90, [172, 136, 86]); // shelf
  rect(d, w, 0, 210, w, 120, [120, 104, 88]); // floor
  for (let i = 0; i < 9; i += 1) {
    rect(d, w, 18 + i * 42, 128, 26, 74, [
      Math.round(70 + rnd() * 150),
      Math.round(60 + rnd() * 130),
      Math.round(60 + rnd() * 130),
    ]); // books
  }
  ellipse(d, w, 200, 250, 92, 84, [150, 92, 72]); // shoulders, close to the shelf
  disc(d, w, 200, 150, 50, [38, 30, 26]); // hair
  disc(d, w, 200, 162, 40, [222, 186, 166]); // face
  noise(d, 6);
  return { d, w, h };
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(OUT, { recursive: true });

  const samples = [
    ['auto.png', product()],
    ['color.png', logo()],
    ['chroma.png', greenScreen()],
    ['ai.png', room()],
  ];

  console.log('build:samples');
  let total = 0;

  for (const [name, { d, w, h }] of samples) {
    const png = encodePng(d, w, h);
    await writeFile(path.join(OUT, name), png);
    total += png.length;
    console.log(`  assets/samples/${name.padEnd(12)} ${w}x${h}  ${(png.length / 1024).toFixed(1)} KB`);
  }

  console.log(`  ${samples.length} examples, ${(total / 1024).toFixed(1)} KB total`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
