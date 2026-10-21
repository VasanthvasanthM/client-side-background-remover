/**
 * Applying a mask to pixels.
 *
 * Separating this from mask generation matters more than it looks: the mask is
 * computed once and then composited many times as the user tries a white
 * background, then a transparent one, then a brand colour. Only this file runs
 * on those changes.
 *
 * Pure functions over typed arrays — no DOM, no canvas.
 */

import { srgbToLinear, linearToSrgb } from './color.js';
import { KEEP } from './mask.js';

/**
 * Write the mask into the alpha channel.
 *
 * Mutates `rgba` in place, because on a 24-megapixel export the copy is
 * 96 MB and the caller already owns the buffer.
 */
export function applyMask(rgba, mask) {
  for (let i = 0; i < mask.length; i += 1) {
    rgba[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * mask[i]) / KEEP);
  }
  return rgba;
}

/**
 * Remove the background colour's contribution from semi-transparent edges.
 *
 * This is the step that separates a clean cutout from an obviously cut-out
 * one. A pixel on the boundary is a genuine mix of subject and background, so
 * after keying it still carries background colour — a white halo on a dark
 * subject, a green rim on a chroma key. Un-mixing is the compositing equation
 * solved backwards:
 *
 *     observed = alpha * subject + (1 - alpha) * background
 *     subject  = (observed - (1 - alpha) * background) / alpha
 *
 * Done in linear light, because the mixing happened in linear light. Doing it
 * on gamma-encoded values is why so many tools leave a grey fringe instead of
 * removing one.
 *
 * Alpha below `floor` is left alone: dividing by a very small number amplifies
 * sensor noise into confetti.
 */
export function decontaminate(rgba, mask, backgroundRgb, { floor = 0.15, strength = 1 } = {}) {
  const bg = [srgbToLinear(backgroundRgb[0]), srgbToLinear(backgroundRgb[1]), srgbToLinear(backgroundRgb[2])];
  const mix = Math.max(0, Math.min(1, strength));

  for (let i = 0; i < mask.length; i += 1) {
    const alpha = mask[i] / KEEP;
    if (alpha >= 1 || alpha <= floor) continue;

    const p = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const observed = srgbToLinear(rgba[p + c]);
      const unmixed = (observed - (1 - alpha) * bg[c]) / alpha;
      const blended = observed + (unmixed - observed) * mix;
      rgba[p + c] = linearToSrgb(Math.max(0, Math.min(1, blended)));
    }
  }
  return rgba;
}

/**
 * Pull a colour cast out of the whole subject.
 *
 * Distinct from decontamination, which fixes edge pixels. Spill is light
 * bouncing off a green screen onto the subject's shoulders — fully opaque
 * pixels that are genuinely tinted. The fix is to cap the key channel at the
 * average of the other two wherever it dominates, which neutralises the cast
 * without touching colours that are legitimately that hue.
 */
export function despill(rgba, mask, channel) {
  const c = { r: 0, g: 1, b: 2 }[channel];
  if (c === undefined) return rgba;

  const other = [0, 1, 2].filter((index) => index !== c);

  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) continue;

    const p = i * 4;
    const key = rgba[p + c];
    const limit = (rgba[p + other[0]] + rgba[p + other[1]]) / 2;
    if (key > limit) rgba[p + c] = Math.round(limit);
  }
  return rgba;
}

/**
 * Composite over a flat colour.
 *
 * In linear light again: blending gamma-encoded values makes a half-covered
 * edge pixel darker than it should be, which reads as a dark outline on light
 * backgrounds. This is the single most common compositing mistake.
 */
export function flattenOnto(rgba, backgroundRgb) {
  const bg = [srgbToLinear(backgroundRgb[0]), srgbToLinear(backgroundRgb[1]), srgbToLinear(backgroundRgb[2])];

  for (let p = 0; p < rgba.length; p += 4) {
    const alpha = rgba[p + 3] / 255;
    if (alpha >= 1) continue;

    for (let c = 0; c < 3; c += 1) {
      const over = srgbToLinear(rgba[p + c]) * alpha + bg[c] * (1 - alpha);
      rgba[p + c] = linearToSrgb(over);
    }
    rgba[p + 3] = 255;
  }
  return rgba;
}

/**
 * The tight bounding box of everything kept, or null if nothing was.
 *
 * Used by "trim to subject" on export: a logo cut out of a large canvas is
 * mostly empty space, and trimming it is usually what the user wanted next.
 */
export function boundingBox(mask, width, height, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy a rectangle out of an RGBA buffer. */
export function cropRgba(rgba, width, box) {
  const out = new Uint8ClampedArray(box.width * box.height * 4);

  for (let y = 0; y < box.height; y += 1) {
    const from = ((box.y + y) * width + box.x) * 4;
    out.set(rgba.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return out;
}

/**
 * Paint a circular brush into the mask.
 *
 * `value` is KEEP to restore or 0 to erase. The edge is ramped over the outer
 * `1 - hardness` of the radius so repeated strokes build up smoothly instead
 * of leaving a visible rim at every dab.
 *
 * Only the affected rows and columns are touched, so a small brush on a huge
 * image costs the same as on a small one.
 */
export function paintBrush(mask, width, height, cx, cy, radius, value, { hardness = 0.7, flow = 1 } = {}) {
  const r = Math.max(1, radius);
  const inner = r * Math.max(0, Math.min(1, hardness));

  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));

  for (let y = y0; y <= y1; y += 1) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > r) continue;

      let weight = 1;
      if (distance > inner) weight = 1 - (distance - inner) / (r - inner || 1);
      weight *= Math.max(0, Math.min(1, flow));
      if (weight <= 0) continue;

      const index = y * width + x;
      mask[index] = Math.round(mask[index] + (value - mask[index]) * weight);
    }
  }
  return mask;
}

/**
 * Rescale a mask with bilinear sampling.
 *
 * The preview is computed at a capped resolution so the UI stays interactive;
 * export needs that mask at full size. Nearest-neighbour here would reintroduce
 * exactly the stair-stepping the soft alpha ramp was there to avoid.
 */
export function resizeMask(mask, fromWidth, fromHeight, toWidth, toHeight) {
  if (fromWidth === toWidth && fromHeight === toHeight) return mask.slice();

  const out = new Uint8ClampedArray(toWidth * toHeight);
  const scaleX = fromWidth / toWidth;
  const scaleY = fromHeight / toHeight;

  for (let y = 0; y < toHeight; y += 1) {
    // Sample from pixel centres, not corners: the half-pixel offset is what
    // keeps the rescaled mask aligned with the image instead of creeping.
    const sy = Math.min(fromHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(fromHeight - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < toWidth; x += 1) {
      const sx = Math.min(fromWidth - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(fromWidth - 1, x0 + 1);
      const fx = sx - x0;

      const top = mask[y0 * fromWidth + x0] * (1 - fx) + mask[y0 * fromWidth + x1] * fx;
      const bottom = mask[y1 * fromWidth + x0] * (1 - fx) + mask[y1 * fromWidth + x1] * fx;
      out[y * toWidth + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return out;
}
