/**
 * Colour maths.
 *
 * Background removal lives or dies on "is this pixel the same colour as that
 * one". Doing that in raw RGB is why cheap tools leave halos: RGB distance is
 * not perceptual, so a tolerance that cleanly removes a white background will
 * also eat light skin tones, while one that spares them leaves grey fringing.
 *
 * Everything here works in CIE L*a*b*, where equal distances look equally
 * different to a human eye. The conversion is not free, so callers convert
 * once into a flat Float32Array and compare in that space afterwards.
 *
 * Pure functions over numbers and typed arrays — no DOM, no canvas.
 */

/** sRGB 0-255 to linear-light 0-1. */
export function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear-light 0-1 back to sRGB 0-255, rounded and clamped. */
export function linearToSrgb(value) {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

// D65 reference white, the one sRGB is defined against.
const WHITE_X = 0.95047;
const WHITE_Y = 1.0;
const WHITE_Z = 1.08883;

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

function pivot(t) {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/**
 * sRGB to L*a*b*.
 *
 * `out` lets a caller write straight into a packed buffer and avoid allocating
 * three million small arrays on a large image.
 */
export function rgbToLab(r, g, b, out = [0, 0, 0]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = pivot((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / WHITE_X);
  const y = pivot((lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / WHITE_Y);
  const z = pivot((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / WHITE_Z);

  out[0] = 116 * y - 16;
  out[1] = 500 * (x - y);
  out[2] = 200 * (y - z);
  return out;
}

/**
 * Every pixel's Lab, packed as [L,a,b, L,a,b, …].
 *
 * One pass up front costs about 25 ms per megapixel and turns every later
 * comparison into three subtractions. Recomputing per comparison instead would
 * make the flood fill roughly forty times slower.
 */
export function toLabBuffer(rgba, pixelCount) {
  const lab = new Float32Array(pixelCount * 3);
  const scratch = [0, 0, 0];

  for (let i = 0; i < pixelCount; i += 1) {
    const p = i * 4;
    rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2], scratch);
    const q = i * 3;
    lab[q] = scratch[0];
    lab[q + 1] = scratch[1];
    lab[q + 2] = scratch[2];
  }
  return lab;
}

/**
 * Perceptual distance between two Lab colours (CIE76).
 *
 * CIEDE2000 is more accurate near the blue axis and around very saturated
 * colours, but it costs roughly fifteen times more and needs trigonometry per
 * comparison. For deciding "background or not" against a user-adjustable
 * tolerance slider, CIE76 is accurate enough that the difference never reaches
 * a visible pixel, and the speed is what keeps the preview interactive.
 */
export function deltaE(lab, i, j) {
  const dl = lab[i] - lab[j];
  const da = lab[i + 1] - lab[j + 1];
  const db = lab[i + 2] - lab[j + 2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Distance from a packed pixel to a loose [L,a,b] triple. */
export function deltaEToColor(lab, i, target) {
  const dl = lab[i] - target[0];
  const da = lab[i + 1] - target[1];
  const db = lab[i + 2] - target[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * The slider position a human sets, mapped to a Lab distance.
 *
 * Lab distances run 0 to about 100 for black against white, but the useful
 * range for "same background colour" is the bottom fifth, and that is where
 * all the precision needs to be. A linear 0-100 slider would make the first
 * two percent do everything and the remaining ninety-eight do nothing.
 *
 * Squaring gives fine control at the low end where photographic noise lives,
 * and coarse control at the top where the user has already decided to be
 * aggressive.
 */
export function toleranceToDistance(percent) {
  const t = Math.max(0, Math.min(100, percent)) / 100;
  return t * t * 60;
}

/** "#aabbcc" or "aabbcc" to [r, g, b]; null if it is not a hex colour. */
export function parseHex(text) {
  if (typeof text !== 'string') return null;
  const hex = text.trim().replace(/^#/, '');

  if (hex.length === 3) {
    if (!/^[0-9a-f]{3}$/i.test(hex)) return null;
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6) {
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

/** [r, g, b] to "#aabbcc". */
export function toHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Hue, saturation and value, for chroma keying.
 *
 * Green screens are keyed on hue rather than Lab distance, because the whole
 * point of a chroma key is to catch every shade of the key colour from the
 * brightly lit top of the screen to the shadowed bottom. Those differ hugely
 * in Lab and barely at all in hue.
 *
 * Hue is 0-360, saturation and value 0-1.
 */
export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return [hue, max === 0 ? 0 : delta / max, max];
}

/** Shortest distance between two hues, 0-180, wrapping at 360. */
export function hueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Average colour of a set of pixel indices.
 *
 * Averaged in linear light, not in sRGB. Averaging gamma-encoded values biases
 * the result dark — the classic reason a sampled "white" background comes back
 * as light grey and then fails to match itself.
 */
export function averageColor(rgba, indices) {
  if (indices.length === 0) return [0, 0, 0];

  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of indices) {
    const p = index * 4;
    r += srgbToLinear(rgba[p]);
    g += srgbToLinear(rgba[p + 1]);
    b += srgbToLinear(rgba[p + 2]);
  }
  const n = indices.length;
  return [linearToSrgb(r / n), linearToSrgb(g / n), linearToSrgb(b / n)];
}

/** Relative luminance 0-1, for deciding whether to show light or dark UI over a colour. */
export function luminance(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
