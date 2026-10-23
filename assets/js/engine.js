/**
 * The removal pipeline.
 *
 * One place that turns pixels plus settings into a mask, and a mask plus
 * settings into finished pixels. Keeping the two halves separate is what makes
 * the UI feel instant: changing the output background re-runs only the second
 * half, which is a single pass, while the expensive segmentation is reused.
 *
 * Pure: takes and returns typed arrays, touches no DOM. The worker calls it,
 * the main thread calls it as a fallback, and the tests call it directly.
 */

import { parseHex, toLabBuffer } from './color.js';
import {
  KEEP,
  floodFill,
  chromaKey,
  detectBackground,
  borderIndices,
  erode,
  dilate,
  feather,
  dropSpeckles,
  fillHoles,
  coverage,
} from './mask.js';
import {
  applyMask,
  decontaminate,
  despill,
  flattenOnto,
  boundingBox,
  cropRgba,
  paintBrush,
} from './composite.js';

/** Longest edge of the preview. Beyond this the UI stops feeling immediate. */
export const PREVIEW_MAX_EDGE = 1400;

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'auto', // 'auto' | 'color' | 'chroma'
  // 32 maps to about ΔE 6. Typical JPEG and sensor noise on a plain backdrop
  // spans ΔE 2-6, so a lower default leaves speckles on real photographs even
  // though it looks fine on a synthetic flat colour.
  tolerance: 32, // 0-100, mapped to a Lab distance
  softness: 50, // 0-100, width of the alpha ramp past the hard threshold
  contiguous: true, // fill from the edges, or match the colour everywhere
  edgeShift: 0, // -5 shrinks the subject, +5 grows it
  featherRadius: 1,
  removeSpeckles: true,
  fillHoles: false,
  decontaminate: true,
  despillChannel: '', // '', 'r', 'g', 'b'
  pickedColor: '', // hex; '' means detect from the border
  background: 'transparent', // 'transparent' or a hex colour
  trim: false,
});

/**
 * Scale factor that fits an image inside a maximum edge, never upscaling.
 */
export function previewScale(width, height, maxEdge = PREVIEW_MAX_EDGE) {
  const longest = Math.max(width, height);
  return longest <= maxEdge ? 1 : maxEdge / longest;
}

/**
 * Build a mask for an image.
 *
 * Returns the mask plus the diagnostics the UI needs to be honest with the
 * user: what colour it keyed on, how uniform the border was, and how much of
 * the image survived.
 */
export function buildMask(rgba, width, height, input = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...input };
  const pixelCount = width * height;

  if (pixelCount === 0) {
    return { mask: new Uint8ClampedArray(0), keyColor: [255, 255, 255], confidence: 0, coverage: 0, warning: 'empty' };
  }

  const lab = toLabBuffer(rgba, pixelCount);
  const picked = parseHex(settings.pickedColor);

  let mask;
  let keyColor;
  let confidence = 1;

  if (settings.mode === 'chroma') {
    keyColor = picked ?? [0, 255, 0];
    mask = chromaKey(rgba, width, height, keyColor, {
      hueTolerance: Math.max(2, settings.tolerance * 0.6),
      softness: settings.softness / 100,
    });
  } else {
    // 'auto' seeds from the border; 'color' keys on one chosen colour.
    let seeds;

    if (settings.mode === 'color' && picked) {
      keyColor = picked;
      // A synthetic seed: append the chosen colour as an extra pixel's worth
      // of Lab so floodFill can treat it exactly like a sampled one.
      seeds = [nearestIndexToColor(lab, pixelCount, picked)];
    } else {
      const detected = detectBackground(rgba, width, height, { lab });
      keyColor = detected.color;
      confidence = detected.confidence;
      // Seed from the border pixels that are actually the dominant backdrop
      // colour. Corner positions are only a fallback for a degenerate image,
      // because in a portrait the lower corners are the subject's shoulders.
      seeds = detected.seeds.length > 0 ? detected.seeds : cornerSeeds(width, height);
    }

    mask = floodFill(rgba, width, height, seeds, {
      tolerance: settings.tolerance,
      softness: settings.softness / 100,
      contiguous: settings.mode === 'color' ? settings.contiguous : true,
      lab,
    });
  }

  mask = refine(mask, width, height, settings);

  const kept = coverage(mask);
  return {
    mask,
    keyColor,
    confidence,
    coverage: kept,
    warning: diagnose(kept, confidence, settings),
  };
}

/** Order matters: speckles and holes first, then shift, then soften. */
function refine(mask, width, height, settings) {
  let out = mask;

  if (settings.removeSpeckles) out = dropSpeckles(out, width, height);
  if (settings.fillHoles) out = fillHoles(out, width, height);

  const shift = Math.round(settings.edgeShift);
  if (shift < 0) out = erode(out, width, height, -shift);
  else if (shift > 0) out = dilate(out, width, height, shift);

  if (settings.featherRadius > 0) out = feather(out, width, height, Math.round(settings.featherRadius));

  return out;
}

/**
 * Say when the result is probably not what the user wanted.
 *
 * The honest failure mode of a colour-based remover is a busy background, and
 * saying so beats shipping a bad cutout silently. These thresholds are the
 * difference between a tool people trust and one they stop using.
 */
function diagnose(kept, confidence, settings) {
  // 1%, because the seed pixels themselves are always removed: at a tolerance
  // that matches nothing else, a few dozen isolated seeds still count as
  // "nothing happened" to the person looking at it.
  if (kept > 0.99) return 'nothing-removed';
  // 0.1%, not 2%: a signature, a sketch or a thin line drawing legitimately
  // covers well under one percent of its frame, and warning on those made a
  // perfect cutout look like a failure. This now fires only on a real wipe.
  if (kept < 0.001) return 'everything-removed';

  if (settings.mode === 'auto') {
    // Below this the border is genuinely chaotic and colour matching is the
    // wrong tool.
    if (confidence < 0.45) return 'busy-background';
    // Between the two: one backdrop colour dominates and has been removed
    // cleanly, but a second one is still there — a wall plus a door frame, a
    // sweep plus the table under it. The result is good and incomplete, so
    // the useful thing to say is which action finishes it, not that the image
    // is difficult.
    if (confidence < 0.78) return 'mixed-background';
  }
  return '';
}

/** The four corners, which is where a backdrop is most likely to be visible. */
function cornerSeeds(width, height) {
  const inset = Math.max(0, Math.min(2, Math.floor(Math.min(width, height) / 4)));
  const left = inset;
  const right = width - 1 - inset;
  const top = inset;
  const bottom = height - 1 - inset;

  return [top * width + left, top * width + right, bottom * width + left, bottom * width + right];
}

/**
 * The border pixel closest to a chosen colour, used as a flood-fill seed.
 *
 * Searching the border rather than the whole image keeps this cheap and
 * targets where a background actually is; falling back to a global scan would
 * let a seed land in the middle of the subject.
 */
function nearestIndexToColor(lab, pixelCount, rgb) {
  const target = [];
  rgbToLabInline(rgb[0], rgb[1], rgb[2], target);

  let best = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < pixelCount; i += 1) {
    const q = i * 3;
    const dl = lab[q] - target[0];
    const da = lab[q + 1] - target[1];
    const db = lab[q + 2] - target[2];
    const distance = dl * dl + da * da + db * db;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
      if (distance === 0) break;
    }
  }
  return best;
}

function rgbToLabInline(r, g, b, out) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const p = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

  const lr = f(r);
  const lg = f(g);
  const lb = f(b);

  const x = p((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047);
  const y = p(lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175);
  const z = p((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883);

  out[0] = 116 * y - 16;
  out[1] = 500 * (x - y);
  out[2] = 200 * (y - z);
  return out;
}

/**
 * Turn an image plus a finished mask into output pixels.
 *
 * `rgba` is mutated, so callers that still need the original pass a copy. On a
 * large export that copy is the single biggest allocation in the app, which is
 * why it is the caller's decision rather than something done here by default.
 */
export function renderResult(rgba, mask, width, height, input = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...input };

  if (settings.despillChannel) despill(rgba, mask, settings.despillChannel);

  if (settings.decontaminate) {
    // buildMask already worked out which colour it keyed on; re-detecting here
    // would be a second full Lab pass on every background change.
    const key = settings.keyColor ?? parseHex(settings.pickedColor) ?? detectBackground(rgba, width, height).color;
    decontaminate(rgba, mask, key);
  }

  applyMask(rgba, mask);

  const background = parseHex(settings.background);
  if (background) flattenOnto(rgba, background);

  if (!settings.trim) return { rgba, width, height };

  const box = boundingBox(mask, width, height);
  if (!box || (box.width === width && box.height === height)) return { rgba, width, height };

  return { rgba: cropRgba(rgba, width, box), width: box.width, height: box.height };
}

/**
 * Finish a mask that came from somewhere other than colour matching.
 *
 * The AI mode produces a raw alpha map; everything after that — dropping
 * speckles, filling holes, shifting and feathering the edge — is the same
 * work the colour modes need, so it runs through the identical path rather
 * than a parallel one that could drift.
 *
 * `keyColor` is still reported because decontamination needs a background
 * colour to un-mix, and the border estimate is as good a guess as exists when
 * no colour was keyed on.
 */
export function refineExternalMask(rgba, mask, width, height, input = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...input };
  if (width * height === 0) {
    return { mask, keyColor: [255, 255, 255], confidence: 0, coverage: 0, warning: 'empty' };
  }

  const refined = refine(mask, width, height, settings);
  const kept = coverage(refined);

  return {
    mask: refined,
    keyColor: detectBackground(rgba, width, height).color,
    // The model does not read the border, so border uniformity says nothing
    // about whether to trust this result.
    confidence: 1,
    coverage: kept,
    // Only the two absolute checks apply; "busy background" is precisely the
    // case this mode exists to handle, so warning about it would be wrong.
    warning: kept > 0.99 ? 'nothing-removed' : kept < 0.001 ? 'everything-removed' : '',
  };
}

/**
 * Replay manual brush strokes onto a mask.
 *
 * Strokes are stored in normalised 0-1 image coordinates rather than pixels,
 * which is what lets the same stroke list apply to the downscaled preview and
 * to the full-resolution export and land in exactly the same place. Storing
 * pixel coordinates would mean the export silently differed from the preview
 * on every image large enough to be downscaled.
 */
export function applyStrokes(mask, width, height, strokes = []) {
  if (strokes.length === 0) return mask;
  const scale = Math.max(width, height);

  for (const stroke of strokes) {
    paintBrush(
      mask,
      width,
      height,
      stroke.x * width,
      stroke.y * height,
      Math.max(1, stroke.radius * scale),
      stroke.erase ? 0 : KEEP,
      { hardness: stroke.hardness ?? 0.7, flow: stroke.flow ?? 1 },
    );
  }
  return mask;
}

/**
 * A checkerboard, as RGBA pixels.
 *
 * Drawn rather than tiled from an image so transparency reads correctly at any
 * zoom and the page fetches nothing. Two greys that stay distinguishable in
 * both light and dark themes.
 */
export function checkerboard(width, height, square = 8) {
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const light = (Math.floor(x / square) + Math.floor(y / square)) % 2 === 0;
      const value = light ? 255 : 219;
      const p = (y * width + x) * 4;
      rgba[p] = value;
      rgba[p + 1] = value;
      rgba[p + 2] = value;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

export { KEEP, borderIndices };
