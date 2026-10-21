/**
 * Mask generation and morphology.
 *
 * A mask here is a Uint8ClampedArray of one byte per pixel: 255 means keep the
 * pixel, 0 means it is background, and values between are genuine partial
 * coverage at an edge. Keeping the mask separate from the pixels is what lets
 * the UI re-render a preview instantly and still export at full resolution.
 *
 * Pure functions over typed arrays — no DOM, no canvas, so this runs
 * identically on the main thread, in a worker, and under node in the tests.
 */

import { toLabBuffer, deltaEToColor, averageColor, toleranceToDistance } from './color.js';

export const KEEP = 255;
export const DROP = 0;

/**
 * Pixels around the edge of the image, as indices.
 *
 * `ring` is how many pixels deep to sample. One pixel is too few on a photo
 * with a dark vignette or a JPEG ring artefact; the default of three is enough
 * to average those out without reaching into the subject on a tight crop.
 */
export function borderIndices(width, height, ring = 3) {
  const depth = Math.max(1, Math.min(ring, Math.floor(Math.min(width, height) / 2)));
  const indices = [];

  for (let y = 0; y < height; y += 1) {
    const nearTop = y < depth;
    const nearBottom = y >= height - depth;

    if (nearTop || nearBottom) {
      for (let x = 0; x < width; x += 1) indices.push(y * width + x);
      continue;
    }
    for (let d = 0; d < depth; d += 1) {
      indices.push(y * width + d);
      indices.push(y * width + (width - 1 - d));
    }
  }
  return indices;
}

/**
 * Guess the background colour, and say how confident that guess is.
 *
 * The border is sampled, then split into clusters that are close to each other
 * in Lab. A photo on a plain backdrop gives one dominant cluster covering
 * nearly the whole border; a busy photo gives several small ones. That ratio
 * is the confidence, and the UI uses it to warn honestly rather than silently
 * producing a bad cutout.
 */
export function detectBackground(rgba, width, height, options = {}) {
  const { ring = 3, clusterDistance = 12 } = options;
  const indices = borderIndices(width, height, ring);
  if (indices.length === 0) return { color: [255, 255, 255], confidence: 0, clusters: 0 };

  // Reuse the caller's Lab buffer when there is one: recomputing it here is a
  // full extra pass over the image for the sake of the border pixels alone.
  const lab = options.lab ?? toLabBuffer(rgba, width * height);
  const clusters = [];

  for (const index of indices) {
    const q = index * 3;
    let placed = false;

    for (const cluster of clusters) {
      if (deltaEToColor(lab, q, cluster.lab) <= clusterDistance) {
        // Running mean, so a large cluster is not dragged by its latest member.
        const n = cluster.members.length;
        cluster.lab[0] = (cluster.lab[0] * n + lab[q]) / (n + 1);
        cluster.lab[1] = (cluster.lab[1] * n + lab[q + 1]) / (n + 1);
        cluster.lab[2] = (cluster.lab[2] * n + lab[q + 2]) / (n + 1);
        cluster.members.push(index);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ lab: [lab[q], lab[q + 1], lab[q + 2]], members: [index] });
    }
    // A pathological image could otherwise make this quadratic. Past this many
    // distinct border colours the background is not uniform and the answer is
    // already "low confidence".
    if (clusters.length > 64) break;
  }

  clusters.sort((a, b) => b.members.length - a.members.length);
  const dominant = clusters[0];

  return {
    color: averageColor(rgba, dominant.members),
    confidence: dominant.members.length / indices.length,
    clusters: clusters.length,
    /**
     * Border pixels that actually belong to the dominant colour, for use as
     * flood-fill seeds.
     *
     * This exists because seeding from fixed corner positions is wrong on the
     * most common photograph there is. In any head-and-shoulders portrait the
     * subject reaches the bottom edge, so the two lower corners are shirt, not
     * background — and a fill seeded there spreads through the subject and
     * eats it. Seeding from the dominant cluster instead means the seeds are
     * background by construction, wherever in the frame it happens to be.
     *
     * Capped and evenly sampled: a few dozen seeds spread around the border
     * cover every disconnected region of backdrop, and more only costs time.
     */
    seeds: sampleEvenly(dominant.members, 48),
  };
}

/** Up to `count` entries, evenly spaced, preserving order. */
function sampleEvenly(items, count) {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(items[Math.floor(i * step)]);
  return out;
}

/**
 * Flood fill from seed pixels, returning a mask.
 *
 * Scanline fill with an explicit stack. The recursive four-way version is the
 * one everyone writes first and it overflows the call stack on anything past
 * about a megapixel — a 4000x3000 photo of a uniform sky would be roughly
 * twelve million frames deep. The scanline form also touches each row once
 * instead of four times per pixel.
 *
 * `contiguous: false` skips the fill entirely and tests every pixel against
 * the seed colour, which is what "remove this colour everywhere" means — it
 * catches background showing through a handle or between letters.
 */
export function floodFill(rgba, width, height, seeds, options = {}) {
  const { tolerance = 20, contiguous = true, softness = 0.5 } = options;

  const pixelCount = width * height;
  const mask = new Uint8ClampedArray(pixelCount).fill(KEEP);
  if (seeds.length === 0) return mask;

  const lab = options.lab ?? toLabBuffer(rgba, pixelCount);
  const hard = toleranceToDistance(tolerance);

  // Everything within `hard` is certainly background; out to `soft` the alpha
  // ramps down. That ramp is the whole reason edges come out smooth instead of
  // stair-stepped, and it is what a plain threshold cannot give you.
  const soft = hard * (1 + Math.max(0, Math.min(1, softness)));

  const targets = seeds.map((index) => [lab[index * 3], lab[index * 3 + 1], lab[index * 3 + 2]]);

  /** Smallest distance to any seed colour. */
  const distance = (index) => {
    const q = index * 3;
    let best = Infinity;
    for (const target of targets) {
      const d = deltaEToColor(lab, q, target);
      if (d < best) best = d;
    }
    return best;
  };

  /** 255 inside the hard radius, 0 outside the soft one, ramped between. */
  const alphaFor = (d) => {
    if (d <= hard) return DROP;
    if (d >= soft) return KEEP;
    return Math.round(((d - hard) / (soft - hard)) * KEEP);
  };

  if (!contiguous) {
    for (let i = 0; i < pixelCount; i += 1) mask[i] = alphaFor(distance(i));
    return mask;
  }

  const visited = new Uint8Array(pixelCount);
  const stack = [];

  for (const seed of seeds) {
    if (seed >= 0 && seed < pixelCount && !visited[seed]) stack.push(seed);
  }

  while (stack.length > 0) {
    const start = stack.pop();
    if (visited[start]) continue;

    const y = Math.floor(start / width);
    const rowStart = y * width;
    const rowEnd = rowStart + width - 1;

    // Walk left and right to the ends of this run of matching pixels.
    let left = start;
    while (left > rowStart && !visited[left - 1] && distance(left - 1) < soft) left -= 1;

    let right = start;
    while (right < rowEnd && !visited[right + 1] && distance(right + 1) < soft) right += 1;

    for (let i = left; i <= right; i += 1) {
      visited[i] = 1;
      mask[i] = alphaFor(distance(i));
    }

    // Seed the rows above and below, once per run of neighbours rather than
    // once per pixel: that is the whole saving of the scanline form.
    for (const neighbourRow of [y - 1, y + 1]) {
      if (neighbourRow < 0 || neighbourRow >= height) continue;
      const offset = neighbourRow * width;
      let run = false;

      for (let x = left - rowStart; x <= right - rowStart; x += 1) {
        const index = offset + x;
        const inside = !visited[index] && distance(index) < soft;
        if (inside && !run) {
          stack.push(index);
          run = true;
        } else if (!inside) {
          run = false;
        }
      }
    }
  }

  return mask;
}

/**
 * Mask from a chroma key.
 *
 * Keyed on hue rather than Lab distance: a lit green screen runs from near
 * white at the top to near black in the shadows, which is a vast Lab distance
 * and almost no hue difference. Saturation and value floors stop the key
 * eating dark or desaturated pixels, which is where naive hue keys destroy
 * black hair and grey clothing.
 */
export function chromaKey(rgba, width, height, keyRgb, options = {}) {
  const { hueTolerance = 30, softness = 0.5, minSaturation = 0.15, minValue = 0.15 } = options;

  const pixelCount = width * height;
  const mask = new Uint8ClampedArray(pixelCount).fill(KEEP);

  const [keyHue] = rgbToHsvLocal(keyRgb[0], keyRgb[1], keyRgb[2]);
  const hard = Math.max(1, hueTolerance);
  const soft = hard * (1 + Math.max(0, Math.min(1, softness)));

  for (let i = 0; i < pixelCount; i += 1) {
    const p = i * 4;
    const [hue, saturation, value] = rgbToHsvLocal(rgba[p], rgba[p + 1], rgba[p + 2]);

    if (saturation < minSaturation || value < minValue) continue;

    const d = hueDistanceLocal(hue, keyHue);
    if (d <= hard) mask[i] = DROP;
    else if (d < soft) mask[i] = Math.round(((d - hard) / (soft - hard)) * KEEP);
  }

  return mask;
}

// Inlined rather than imported so the hot loop above avoids a cross-module
// call per pixel; kept byte-identical to color.js by the test suite.
function rgbToHsvLocal(r, g, b) {
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

function hueDistanceLocal(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// ---------------------------------------------------------------------------
// Morphology
// ---------------------------------------------------------------------------

/**
 * Shrink the kept region by `radius` pixels.
 *
 * Separable: a horizontal pass then a vertical one gives the same result as a
 * square window at a fraction of the work — O(2r) per pixel instead of O(r²).
 */
export function erode(mask, width, height, radius = 1) {
  if (radius < 1) return mask.slice();
  return minMaxPass(minMaxPass(mask, width, height, radius, true, false), width, height, radius, true, true);
}

/** Grow the kept region by `radius` pixels. */
export function dilate(mask, width, height, radius = 1) {
  if (radius < 1) return mask.slice();
  return minMaxPass(minMaxPass(mask, width, height, radius, false, false), width, height, radius, false, true);
}

function minMaxPass(mask, width, height, radius, takeMin, vertical) {
  const out = new Uint8ClampedArray(mask.length);
  const outer = vertical ? width : height;
  const inner = vertical ? height : width;

  for (let a = 0; a < outer; a += 1) {
    for (let b = 0; b < inner; b += 1) {
      let best = takeMin ? 255 : 0;

      for (let k = -radius; k <= radius; k += 1) {
        const bb = b + k;
        if (bb < 0 || bb >= inner) continue;
        const value = vertical ? mask[bb * width + a] : mask[a * width + bb];
        if (takeMin ? value < best : value > best) best = value;
      }
      out[vertical ? b * width + a : a * width + b] = best;
    }
  }
  return out;
}

/**
 * Soften the mask edge with a separable box blur, repeated three times.
 *
 * Three box passes approximate a Gaussian closely enough that no one can tell,
 * and cost three linear passes instead of a quadratic kernel. Feathering is
 * what removes the last of the aliasing along a diagonal edge.
 */
export function feather(mask, width, height, radius = 1) {
  if (radius < 1) return mask.slice();

  let current = mask;
  for (let pass = 0; pass < 3; pass += 1) {
    current = boxBlur(boxBlur(current, width, height, radius, false), width, height, radius, true);
  }
  return current;
}

function boxBlur(mask, width, height, radius, vertical) {
  const out = new Uint8ClampedArray(mask.length);
  const outer = vertical ? width : height;
  const inner = vertical ? height : width;
  const at = (a, b) => (vertical ? mask[b * width + a] : mask[a * width + b]);

  for (let a = 0; a < outer; a += 1) {
    let sum = 0;
    let count = 0;

    // Prime the window, then slide it: each step adds one sample and drops
    // one, so the cost per pixel is constant regardless of radius.
    for (let b = 0; b <= radius && b < inner; b += 1) {
      sum += at(a, b);
      count += 1;
    }

    for (let b = 0; b < inner; b += 1) {
      out[vertical ? b * width + a : a * width + b] = Math.round(sum / count);

      const leaving = b - radius;
      const entering = b + radius + 1;
      if (leaving >= 0) {
        sum -= at(a, leaving);
        count -= 1;
      }
      if (entering < inner) {
        sum += at(a, entering);
        count += 1;
      }
    }
  }
  return out;
}

/**
 * Drop small disconnected fragments, keeping every substantial one.
 *
 * This removes the speckle a tolerant fill leaves behind — isolated pixels
 * inside the subject that happened to match the background.
 *
 * It deliberately does *not* keep only the single largest region, which is
 * the obvious implementation and is wrong: a person whose head is separated
 * from their torso by a sliver of background, a mug whose handle does not
 * quite touch the body, two products side by side. Keeping only the biggest
 * silently deletes half the subject, and the user sees a confident-looking
 * result with a piece missing.
 *
 * Instead, anything at least `relative` of the largest region survives. A
 * genuine second part of a subject is well above that; a speck is orders of
 * magnitude below it.
 */
export function dropSpeckles(mask, width, height, { threshold = 128, relative = 0.05 } = {}) {
  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (labels[start] !== -1 || mask[start] < threshold) continue;

    const label = sizes.length;
    let size = 0;
    stack.push(start);
    labels[start] = label;

    while (stack.length > 0) {
      const index = stack.pop();
      size += 1;

      const x = index % width;
      const y = (index - x) / width;

      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }
    sizes.push(size);

    function push(next) {
      if (labels[next] === -1 && mask[next] >= threshold) {
        labels[next] = label;
        stack.push(next);
      }
    }
  }

  if (sizes.length <= 1) return mask.slice();

  let largest = 0;
  for (const size of sizes) {
    if (size > largest) largest = size;
  }
  const minimum = Math.max(1, largest * relative);

  const out = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    out[i] = labels[i] >= 0 && sizes[labels[i]] >= minimum ? mask[i] : DROP;
  }
  return out;
}

/** Fill holes: background regions that do not touch the image border. */
export function fillHoles(mask, width, height, threshold = 128) {
  const pixelCount = width * height;
  const reachable = new Uint8Array(pixelCount);
  const stack = [];

  for (const index of borderIndices(width, height, 1)) {
    if (mask[index] < threshold && !reachable[index]) {
      reachable[index] = 1;
      stack.push(index);
    }
  }

  while (stack.length > 0) {
    const index = stack.pop();
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }

  function visit(next) {
    if (!reachable[next] && mask[next] < threshold) {
      reachable[next] = 1;
      stack.push(next);
    }
  }

  const out = mask.slice();
  for (let i = 0; i < pixelCount; i += 1) {
    if (mask[i] < threshold && !reachable[i]) out[i] = KEEP;
  }
  return out;
}

export function invert(mask) {
  const out = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i += 1) out[i] = KEEP - mask[i];
  return out;
}

/** How much of the image survived, 0-1. Drives the "nothing was removed" hint. */
export function coverage(mask) {
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) total += mask[i];
  return total / (mask.length * KEEP);
}
