/**
 * Engine tests.
 *
 * The removal pipeline is the product; everything else is UI around it. It is
 * deliberately pure — typed arrays in, typed arrays out, no canvas — so it
 * runs under plain node with no DOM and no test framework.
 *
 * Images are synthesised rather than loaded, which means every test states
 * exactly which pixels should survive and the assertions are about geometry
 * rather than about "looks right".
 *
 *   npm test
 */

import {
  srgbToLinear,
  linearToSrgb,
  rgbToLab,
  deltaEToColor,
  toLabBuffer,
  toleranceToDistance,
  parseHex,
  toHex,
  rgbToHsv,
  hueDistance,
  averageColor,
  luminance,
} from '../assets/js/color.js';

import {
  KEEP,
  DROP,
  borderIndices,
  detectBackground,
  floodFill,
  chromaKey,
  erode,
  dilate,
  feather,
  dropSpeckles,
  fillHoles,
  invert,
  coverage,
} from '../assets/js/mask.js';

import {
  applyMask,
  decontaminate,
  despill,
  flattenOnto,
  boundingBox,
  cropRgba,
  paintBrush,
  resizeMask,
} from '../assets/js/composite.js';

import {
  DEFAULT_SETTINGS,
  previewScale,
  buildMask,
  renderResult,
  applyStrokes,
  checkerboard,
  PREVIEW_MAX_EDGE,
} from '../assets/js/engine.js';

let passed = 0;
const failures = [];
let group = '';

function describe(name) {
  group = name;
  console.log(`\n${name}`);
}

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${group} — ${message}`);
}

function equal(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`,
  );
}

function close(actual, expected, tolerance, message) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}\n      expected ${expected} ±${tolerance}\n      actual   ${actual}`,
  );
}

// ---------------------------------------------------------------------------
// Synthetic images
// ---------------------------------------------------------------------------

function blank(width, height, rgb) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < rgba.length; p += 4) {
    rgba[p] = rgb[0];
    rgba[p + 1] = rgb[1];
    rgba[p + 2] = rgb[2];
    rgba[p + 3] = 255;
  }
  return rgba;
}

function fillRect(rgba, width, box, rgb) {
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const p = (y * width + x) * 4;
      rgba[p] = rgb[0];
      rgba[p + 1] = rgb[1];
      rgba[p + 2] = rgb[2];
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

/** A dark square centred on a light background — the canonical easy case. */
function squareOnBackground(size, bg, fg, inset) {
  const rgba = blank(size, size, bg);
  const box = { x: inset, y: inset, width: size - inset * 2, height: size - inset * 2 };
  fillRect(rgba, size, box, fg);
  return { rgba, width: size, height: size, box };
}

/** Add per-pixel noise, deterministically, to stand in for sensor grain. */
function addNoise(rgba, amplitude, seed = 1) {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let p = 0; p < rgba.length; p += 4) {
    const jitter = Math.round((random() - 0.5) * 2 * amplitude);
    rgba[p] = Math.max(0, Math.min(255, rgba[p] + jitter));
    rgba[p + 1] = Math.max(0, Math.min(255, rgba[p + 1] + jitter));
    rgba[p + 2] = Math.max(0, Math.min(255, rgba[p + 2] + jitter));
  }
  return rgba;
}

const at = (mask, width, x, y) => mask[y * width + x];

// ---------------------------------------------------------------------------

describe('colour conversion');
{
  close(srgbToLinear(0), 0, 1e-9, 'black is zero in linear light');
  close(srgbToLinear(255), 1, 1e-9, 'white is one');
  close(srgbToLinear(128), 0.2158, 0.001, 'mid sRGB is about 22% linear, not 50%');
  equal(linearToSrgb(srgbToLinear(137)), 137, 'sRGB survives a round trip through linear');
  equal(linearToSrgb(-5), 0, 'linearToSrgb clamps below zero');
  equal(linearToSrgb(9), 255, 'and above one');

  const white = rgbToLab(255, 255, 255);
  close(white[0], 100, 0.01, 'white is L*=100');
  close(white[1], 0, 0.01, 'with no a*');
  close(white[2], 0, 0.01, 'and no b*');

  const black = rgbToLab(0, 0, 0);
  close(black[0], 0, 0.01, 'black is L*=0');

  const grey = rgbToLab(128, 128, 128);
  close(grey[0], 53.59, 0.1, 'mid grey is L*≈53.6');
  close(grey[1], 0, 0.01, 'and is neutral in a*');

  const red = rgbToLab(255, 0, 0);
  close(red[0], 53.24, 0.1, 'pure red is L*≈53.2');
  close(red[1], 80.09, 0.1, 'with a strong positive a*');

  // The reason Lab is used at all: in RGB these two pairs are the same
  // distance apart, and to an eye they are nothing alike.
  const labWhiteGrey = rgbToLab(255, 255, 255);
  const labNearWhite = rgbToLab(235, 235, 235);
  const labMid = rgbToLab(128, 128, 128);
  const labMidShift = rgbToLab(108, 108, 108);

  const nearWhiteGap = Math.hypot(...labWhiteGrey.map((v, i) => v - labNearWhite[i]));
  const midGap = Math.hypot(...labMid.map((v, i) => v - labMidShift[i]));
  assert(nearWhiteGap < midGap, 'equal RGB steps are perceptually smaller near white than in the mid-tones');

  equal(JSON.stringify(parseHex('#ff8800')), '[255,136,0]', 'parseHex reads a six-digit hex');
  equal(JSON.stringify(parseHex('f80')), '[255,136,0]', 'and expands a three-digit one');
  equal(parseHex('#ggg'), null, 'non-hex is rejected');
  equal(parseHex('transparent'), null, 'so is a keyword');
  equal(parseHex(''), null, 'and an empty string');
  equal(parseHex(null), null, 'and a non-string');
  equal(toHex([255, 136, 0]), '#ff8800', 'toHex pads and lowercases');
  equal(toHex([-20, 300, 7]), '#00ff07', 'and clamps out-of-range channels');

  const [hue, saturation, value] = rgbToHsv(0, 255, 0);
  close(hue, 120, 0.01, 'pure green is hue 120');
  close(saturation, 1, 0.01, 'fully saturated');
  close(value, 1, 0.01, 'at full value');
  close(rgbToHsv(255, 0, 0)[0], 0, 0.01, 'red is hue 0');
  close(rgbToHsv(0, 0, 255)[0], 240, 0.01, 'blue is hue 240');
  equal(rgbToHsv(128, 128, 128)[1], 0, 'grey has no saturation');
  equal(rgbToHsv(0, 0, 0)[1], 0, 'and black does not divide by zero');

  close(hueDistance(10, 350), 20, 0.01, 'hue distance wraps across zero');
  close(hueDistance(350, 10), 20, 0.01, 'symmetrically');
  close(hueDistance(0, 180), 180, 0.01, 'opposite hues are 180 apart');

  // Averaged in linear light: the sRGB mean of black and white is 128, which
  // is visibly darker than the real average of the two.
  const mean = averageColor(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), [0, 1]);
  close(mean[0], 188, 1, 'black and white average to ~188, not 128');
  equal(JSON.stringify(averageColor(new Uint8ClampedArray(4), [])), '[0,0,0]', 'an empty average is black, not NaN');

  close(luminance(255, 255, 255), 1, 0.001, 'white has luminance 1');
  close(luminance(0, 0, 0), 0, 0.001, 'black has luminance 0');
  assert(luminance(0, 255, 0) > luminance(0, 0, 255), 'green reads brighter than blue');

  equal(toleranceToDistance(0), 0, 'zero tolerance is zero distance');
  close(toleranceToDistance(100), 60, 0.01, 'full tolerance is the maximum distance');
  assert(toleranceToDistance(50) < 30, 'the curve is weighted towards fine control at the low end');
  equal(toleranceToDistance(-10), 0, 'negative tolerance clamps');
  close(toleranceToDistance(999), 60, 0.01, 'and so does an absurd one');
}

describe('border sampling and detection');
{
  equal(borderIndices(4, 4, 1).length, 12, 'a 4x4 image has 12 border pixels at depth 1');
  equal(borderIndices(10, 10, 1).length, 36, 'a 10x10 image has 36');
  equal(borderIndices(4, 4, 2).length, 16, 'at depth 2 a 4x4 is entirely border');
  assert(borderIndices(2, 2, 9).length === 4, 'the ring depth cannot exceed half the image');
  equal(new Set(borderIndices(10, 10, 3)).size, borderIndices(10, 10, 3).length, 'no index is listed twice');

  const easy = squareOnBackground(60, [255, 255, 255], [20, 20, 20], 15);
  const detected = detectBackground(easy.rgba, easy.width, easy.height);
  close(detected.color[0], 255, 2, 'a white backdrop is detected as white');
  equal(detected.confidence, 1, 'with full confidence when the border is uniform');

  // Half the border one colour, half another: confidence must drop.
  const split = blank(40, 40, [255, 255, 255]);
  fillRect(split, 40, { x: 0, y: 0, width: 40, height: 20 }, [10, 10, 200]);
  const splitDetection = detectBackground(split, 40, 40);
  assert(splitDetection.confidence < 0.75, `a two-tone border lowers confidence (got ${splitDetection.confidence.toFixed(2)})`);
  assert(splitDetection.clusters >= 2, 'and reports more than one cluster');

  // Noise must not fragment the detection into dozens of clusters.
  const noisy = addNoise(blank(40, 40, [240, 240, 240]), 6);
  const noisyDetection = detectBackground(noisy, 40, 40);
  assert(noisyDetection.confidence > 0.9, 'sensor noise does not break detection');
  close(noisyDetection.color[0], 240, 6, 'and the detected colour is still about right');
}

describe('flood fill');
{
  const size = 60;
  const inset = 15;
  const { rgba, width, height, box } = squareOnBackground(size, [255, 255, 255], [20, 20, 20], inset);
  const mask = floodFill(rgba, width, height, [0], { tolerance: 20 });

  equal(at(mask, width, 0, 0), DROP, 'the seeded corner is removed');
  equal(at(mask, width, size - 1, size - 1), DROP, 'the opposite corner is removed too');
  equal(at(mask, width, size / 2, size / 2), KEEP, 'the centre of the subject is kept');
  equal(at(mask, width, inset + 2, inset + 2), KEEP, 'and so is just inside its corner');
  equal(at(mask, width, inset - 2, inset - 2), DROP, 'while just outside is removed');

  const kept = coverage(mask);
  const expected = (box.width * box.height) / (size * size);
  close(kept, expected, 0.02, 'the kept area matches the square');

  // Contiguity: an enclosed region of background colour must survive a
  // contiguous fill and vanish from a global one.
  const donut = blank(40, 40, [255, 255, 255]);
  fillRect(donut, 40, { x: 8, y: 8, width: 24, height: 24 }, [20, 20, 20]);
  fillRect(donut, 40, { x: 16, y: 16, width: 8, height: 8 }, [255, 255, 255]);

  const contiguous = floodFill(donut, 40, 40, [0], { tolerance: 20, contiguous: true });
  equal(at(contiguous, 40, 20, 20), KEEP, 'a contiguous fill cannot reach an enclosed hole');

  const global = floodFill(donut, 40, 40, [0], { tolerance: 20, contiguous: false });
  equal(at(global, 40, 20, 20), DROP, 'a global match removes it');
  equal(at(global, 40, 10, 10), KEEP, 'without touching the subject');

  // Tolerance must actually do something monotonic.
  const gentle = coverage(floodFill(rgba, width, height, [0], { tolerance: 5 }));
  const aggressive = coverage(floodFill(rgba, width, height, [0], { tolerance: 95 }));
  assert(aggressive <= gentle, 'more tolerance never keeps more pixels');
  equal(coverage(floodFill(rgba, width, height, [], { tolerance: 50 })), 1, 'no seeds removes nothing');

  // A soft edge means some pixels are partially transparent on a gentle
  // border. The gradient has to be shallower than the alpha ramp is wide, or
  // it steps straight over the ramp and nothing lands inside it.
  const blurry = blank(40, 40, [255, 255, 255]);
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 40; x += 1) {
      const v = 255 - x; // ~0.35 ΔE per pixel, against a ramp ~4.8 ΔE wide
      const p = (y * 40 + x) * 4;
      blurry[p] = v;
      blurry[p + 1] = v;
      blurry[p + 2] = v;
      blurry[p + 3] = 255;
    }
  }
  const soft = floodFill(blurry, 40, 40, [0], { tolerance: 40, softness: 1 });
  let partials = 0;
  for (let i = 0; i < soft.length; i += 1) {
    if (soft[i] > DROP && soft[i] < KEEP) partials += 1;
  }
  assert(partials > 0, `a gradient edge produces partial alpha (${partials} pixels)`);

  // The reason the fill is iterative: a recursive one dies here.
  const big = blank(1200, 1200, [255, 255, 255]);
  const bigMask = floodFill(big, 1200, 1200, [0], { tolerance: 20 });
  equal(coverage(bigMask), 0, 'a 1.44-megapixel uniform fill completes without overflowing the stack');
}

describe('chroma key');
{
  const green = blank(40, 40, [0, 200, 0]);
  fillRect(green, 40, { x: 12, y: 12, width: 16, height: 16 }, [200, 60, 60]);

  const mask = chromaKey(green, 40, 40, [0, 255, 0], { hueTolerance: 30 });
  equal(at(mask, 40, 0, 0), DROP, 'the green screen is keyed out');
  equal(at(mask, 40, 20, 20), KEEP, 'the red subject is kept');

  // Lit and shadowed green differ hugely in Lab and barely in hue; a key that
  // works on one must work on both.
  const lit = blank(20, 20, [120, 255, 120]);
  const shadowed = blank(20, 20, [0, 70, 0]);
  equal(coverage(chromaKey(lit, 20, 20, [0, 255, 0], { hueTolerance: 30 })), 0, 'brightly lit green keys out');
  equal(coverage(chromaKey(shadowed, 20, 20, [0, 255, 0], { hueTolerance: 30 })), 0, 'and so does green in shadow');

  // The floors are what protect dark hair and grey clothing.
  const nearBlack = blank(20, 20, [4, 6, 4]);
  equal(coverage(chromaKey(nearBlack, 20, 20, [0, 255, 0], { hueTolerance: 60 })), 1, 'near-black is below the value floor and survives');
  const greyish = blank(20, 20, [130, 134, 130]);
  equal(coverage(chromaKey(greyish, 20, 20, [0, 255, 0], { hueTolerance: 60 })), 1, 'desaturated grey is below the saturation floor and survives');
}

describe('morphology');
{
  const width = 20;
  const height = 20;
  const solid = new Uint8ClampedArray(width * height).fill(KEEP);

  const eroded = erode(solid, width, height, 2);
  equal(at(eroded, width, 0, 0), KEEP, 'eroding a fully kept mask changes nothing at the corner');

  const square = new Uint8ClampedArray(width * height);
  for (let y = 5; y < 15; y += 1) {
    for (let x = 5; x < 15; x += 1) square[y * width + x] = KEEP;
  }

  const shrunk = erode(square, width, height, 1);
  equal(at(shrunk, width, 5, 5), DROP, 'erosion pulls the edge in by one pixel');
  equal(at(shrunk, width, 6, 6), KEEP, 'but leaves the interior');

  const grown = dilate(square, width, height, 1);
  equal(at(grown, width, 4, 4), KEEP, 'dilation pushes it out by one');
  equal(at(grown, width, 3, 3), DROP, 'and no further');

  equal(at(erode(square, width, height, 0), width, 5, 5), KEEP, 'radius zero is a no-op');

  // Erode then dilate must land back where it started for a shape with no
  // features smaller than the radius.
  const reopened = dilate(erode(square, width, height, 1), width, height, 1);
  let differences = 0;
  for (let i = 0; i < square.length; i += 1) {
    if (square[i] !== reopened[i]) differences += 1;
  }
  equal(differences, 0, 'erode then dilate restores a square larger than the radius');

  // Feathered on its own canvas: three box passes at radius r reach about 3r,
  // so the shape has to be comfortably larger than that for "the middle stays
  // opaque" to be a meaningful claim rather than a statement about this size.
  const big = 40;
  const wide = new Uint8ClampedArray(big * big);
  for (let y = 10; y < 30; y += 1) {
    for (let x = 10; x < 30; x += 1) wide[y * big + x] = KEEP;
  }

  const feathered = feather(wide, big, big, 2);
  let partials = 0;
  for (let i = 0; i < feathered.length; i += 1) {
    if (feathered[i] > DROP && feathered[i] < KEEP) partials += 1;
  }
  assert(partials > 0, `feathering creates a soft edge (${partials} partial pixels)`);
  assert(at(feathered, big, 20, 20) > 240, 'while leaving the middle opaque');

  // Feathering must not shift the centre of mass.
  const before = centroid(wide, big, big);
  const after = centroid(feathered, big, big);
  close(after.x, before.x, 0.2, 'feathering does not move the shape horizontally');
  close(after.y, before.y, 0.2, 'or vertically');

  const speckled = square.slice();
  speckled[0] = KEEP;
  speckled[width * 19 + 19] = KEEP;
  const cleaned = dropSpeckles(speckled, width, height);
  equal(at(cleaned, width, 0, 0), DROP, 'an isolated speckle is dropped');
  equal(at(cleaned, width, 10, 10), KEEP, 'and the main subject is kept');
  equal(coverage(dropSpeckles(solid, width, height)), 1, 'a single component is returned unchanged');

  // The bug this replaced: keeping only the single largest region deletes a
  // subject's detached parts — a head separated from a torso, a handle that
  // does not quite touch its mug.
  const twoParts = new Uint8ClampedArray(width * height);
  for (let y = 2; y < 8; y += 1) for (let x = 2; x < 9; x += 1) twoParts[y * width + x] = KEEP;
  for (let y = 12; y < 18; y += 1) for (let x = 2; x < 8; x += 1) twoParts[y * width + x] = KEEP;
  const bothKept = dropSpeckles(twoParts, width, height);
  equal(at(bothKept, width, 4, 4), KEEP, 'the larger of two detached parts survives');
  equal(at(bothKept, width, 4, 14), KEEP, 'and so does the smaller one');

  const partPlusSpeck = twoParts.slice();
  partPlusSpeck[19 * width + 19] = KEEP;
  const despeckled = dropSpeckles(partPlusSpeck, width, height);
  equal(at(despeckled, width, 19, 19), DROP, 'while a single-pixel speck is still dropped');

  const holed = square.slice();
  holed[10 * width + 10] = DROP;
  const filled = fillHoles(holed, width, height);
  equal(at(filled, width, 10, 10), KEEP, 'an enclosed hole is filled');
  equal(at(filled, width, 0, 0), DROP, 'and the real background is not');

  const inverted = invert(square);
  equal(at(inverted, width, 0, 0), KEEP, 'inverting swaps background for subject');
  equal(at(inverted, width, 10, 10), DROP, 'and subject for background');
  close(coverage(inverted) + coverage(square), 1, 1e-6, 'coverage of a mask and its inverse sums to one');
}

function centroid(mask, width, height) {
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = mask[y * width + x];
      sum += v;
      sx += v * x;
      sy += v * y;
    }
  }
  return { x: sx / sum, y: sy / sum };
}

describe('compositing');
{
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  const mask = new Uint8ClampedArray([KEEP, DROP]);
  applyMask(rgba, mask);
  equal(rgba[3], 255, 'a kept pixel stays opaque');
  equal(rgba[7], 0, 'a dropped pixel becomes transparent');

  // Compositing white over black at 50% must give ~188 in sRGB, because the
  // blend happens in linear light. Doing it on gamma values gives 128.
  const blend = new Uint8ClampedArray([255, 255, 255, 128]);
  flattenOnto(blend, [0, 0, 0]);
  close(blend[0], 188, 2, 'half-covered white over black is ~188, not 128');
  equal(blend[3], 255, 'and the result is opaque');

  const opaque = new Uint8ClampedArray([77, 88, 99, 255]);
  flattenOnto(opaque, [255, 0, 0]);
  equal(opaque[0], 77, 'a fully opaque pixel is untouched by compositing');

  // Decontamination: a pixel that is half white background and half pure red
  // subject should come back close to pure red.
  const mixed = new Uint8ClampedArray([255, 188, 188, 255]);
  const half = new Uint8ClampedArray([128]);
  decontaminate(mixed, half, [255, 255, 255]);
  assert(mixed[1] < 150, `the white contribution is removed from the green channel (got ${mixed[1]})`);
  assert(mixed[0] > 200, 'while the red channel stays strong');

  const lowAlpha = new Uint8ClampedArray([200, 200, 200, 255]);
  const faint = new Uint8ClampedArray([8]);
  const beforeLow = lowAlpha[0];
  decontaminate(lowAlpha, faint, [255, 255, 255]);
  equal(lowAlpha[0], beforeLow, 'very low alpha is left alone rather than amplified into noise');

  const spilled = new Uint8ClampedArray([100, 200, 110, 255]);
  despill(spilled, new Uint8ClampedArray([KEEP]), 'g');
  equal(spilled[1], 105, 'green spill is capped at the average of red and blue');
  const noSpill = new Uint8ClampedArray([100, 90, 110, 255]);
  despill(noSpill, new Uint8ClampedArray([KEEP]), 'g');
  equal(noSpill[1], 90, 'a pixel that is not green-dominant is untouched');

  const boxMask = new Uint8ClampedArray(16);
  boxMask[5] = KEEP;
  boxMask[6] = KEEP;
  boxMask[9] = KEEP;
  const box = boundingBox(boxMask, 4, 4);
  equal(JSON.stringify(box), JSON.stringify({ x: 1, y: 1, width: 2, height: 2 }), 'the bounding box is tight');
  equal(boundingBox(new Uint8ClampedArray(16), 4, 4), null, 'an empty mask has no bounding box');

  const source = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) source[i * 4] = i;
  const cropped = cropRgba(source, 4, { x: 1, y: 1, width: 2, height: 2 });
  equal(cropped[0], 5, 'cropping reads from the right offset');
  equal(cropped[4], 6, 'and the right row stride');
  equal(cropped[8], 9, 'across rows');
}

describe('brush');
{
  const width = 40;
  const mask = new Uint8ClampedArray(width * width).fill(DROP);
  paintBrush(mask, width, width, 20, 20, 6, KEEP, { hardness: 1 });

  equal(at(mask, width, 20, 20), KEEP, 'the brush centre is painted');
  equal(at(mask, width, 30, 20), DROP, 'well outside the radius is untouched');
  equal(at(mask, width, 0, 0), DROP, 'and so is the far corner');

  const soft = new Uint8ClampedArray(width * width).fill(DROP);
  paintBrush(soft, width, width, 20, 20, 8, KEEP, { hardness: 0.2 });
  const centre = at(soft, width, 20, 20);
  const rim = at(soft, width, 27, 20);
  assert(centre > rim, 'a soft brush fades towards the rim');
  assert(rim > DROP, 'but still paints there');

  // A brush at the edge must clip rather than wrap onto the opposite side.
  const edge = new Uint8ClampedArray(width * width).fill(DROP);
  paintBrush(edge, width, width, 1, 1, 6, KEEP, { hardness: 1 });
  equal(at(edge, width, width - 1, 1), DROP, 'painting near the left edge does not wrap to the right');

  const erasing = new Uint8ClampedArray(width * width).fill(KEEP);
  paintBrush(erasing, width, width, 20, 20, 5, DROP, { hardness: 1 });
  equal(at(erasing, width, 20, 20), DROP, 'the same brush erases when given DROP');
}

describe('mask resizing');
{
  const small = new Uint8ClampedArray([0, 255, 255, 0]);
  const up = resizeMask(small, 2, 2, 4, 4);
  equal(up.length, 16, 'the resized mask has the right length');
  assert(up[0] < 64, 'a dark corner stays dark');
  assert(up[3] > 190, 'a light corner stays light');

  const identity = resizeMask(small, 2, 2, 2, 2);
  equal(JSON.stringify([...identity]), JSON.stringify([...small]), 'resizing to the same size is a copy');
  assert(identity !== small, 'and is not the same object');

  // Interpolation, not nearest neighbour: an upscaled edge must produce
  // intermediate values rather than a hard step.
  const edgeMask = new Uint8ClampedArray(8 * 8);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 4; x < 8; x += 1) edgeMask[y * 8 + x] = KEEP;
  }
  const scaled = resizeMask(edgeMask, 8, 8, 32, 32);
  let intermediate = 0;
  for (let i = 0; i < scaled.length; i += 1) {
    if (scaled[i] > 20 && scaled[i] < 235) intermediate += 1;
  }
  assert(intermediate > 0, `upscaling interpolates rather than stepping (${intermediate} pixels)`);

  // Downscaling a big uniform mask must stay uniform, with no drift.
  const uniform = new Uint8ClampedArray(100 * 100).fill(200);
  const downscaled = resizeMask(uniform, 100, 100, 25, 25);
  let drifted = 0;
  for (let i = 0; i < downscaled.length; i += 1) {
    if (downscaled[i] !== 200) drifted += 1;
  }
  equal(drifted, 0, 'a uniform mask survives downscaling unchanged');
}

describe('engine');
{
  equal(previewScale(800, 600), 1, 'a small image is not scaled');
  equal(previewScale(PREVIEW_MAX_EDGE, 10), 1, 'nor is one exactly at the cap');
  close(previewScale(2800, 1400), 0.5, 1e-9, 'a wide image is halved');
  close(previewScale(1400, 2800), 0.5, 1e-9, 'and so is a tall one');

  const { rgba, width, height } = squareOnBackground(80, [250, 250, 250], [30, 60, 120], 20);

  const auto = buildMask(rgba, width, height);
  equal(at(auto.mask, width, 0, 0), DROP, 'auto mode removes the detected backdrop');
  equal(at(auto.mask, width, 40, 40), KEEP, 'and keeps the subject');
  close(auto.keyColor[0], 250, 3, 'reporting the colour it keyed on');
  equal(auto.confidence, 1, 'with full confidence on a clean border');
  equal(auto.warning, '', 'and no warning');

  const picked = buildMask(rgba, width, height, { mode: 'color', pickedColor: '#fafafa' });
  equal(at(picked.mask, width, 0, 0), DROP, 'colour mode keys on the chosen colour');
  equal(at(picked.mask, width, 40, 40), KEEP, 'and spares the subject');

  // Honest diagnostics are a feature, not decoration.
  const uniform = blank(40, 40, [128, 128, 128]);
  equal(buildMask(uniform, 40, 40).warning, 'everything-removed', 'an image that is all background says so');

  const tiny = buildMask(rgba, width, height, { tolerance: 0 });
  equal(tiny.warning, 'nothing-removed', 'a tolerance that removes nothing says so');

  const busy = blank(60, 60, [255, 255, 255]);
  fillRect(busy, 60, { x: 0, y: 0, width: 60, height: 20 }, [10, 10, 200]);
  fillRect(busy, 60, { x: 0, y: 40, width: 60, height: 20 }, [200, 120, 10]);
  equal(buildMask(busy, 60, 60).warning, 'busy-background', 'a multicoloured border warns rather than guessing');

  equal(buildMask(new Uint8ClampedArray(0), 0, 0).warning, 'empty', 'a zero-pixel image does not crash');

  // Render: transparent output.
  const transparent = renderResult(rgba.slice(), auto.mask, width, height, { keyColor: auto.keyColor });
  equal(transparent.rgba[3], 0, 'the background becomes transparent');
  equal(transparent.rgba[(40 * width + 40) * 4 + 3], 255, 'and the subject stays opaque');
  equal(transparent.width, width, 'dimensions are unchanged without trim');

  // Render: flattened onto a colour.
  const flattened = renderResult(rgba.slice(), auto.mask, width, height, {
    background: '#ff0000',
    keyColor: auto.keyColor,
  });
  equal(flattened.rgba[3], 255, 'a flattened result is fully opaque');
  equal(flattened.rgba[0], 255, 'and the background is the chosen colour');
  equal(flattened.rgba[1], 0, 'exactly');

  // Render: trimmed to the subject.
  const trimmed = renderResult(rgba.slice(), auto.mask, width, height, { trim: true, keyColor: auto.keyColor });
  assert(trimmed.width < width, `trimming crops to the subject (${trimmed.width} < ${width})`);
  // The square is 40px, and the trim deliberately keeps the feathered halo
  // around it — cropping to the hard edge would slice off the soft edge that
  // the feather exists to create.
  assert(trimmed.width >= 40 && trimmed.width <= 50, `the crop keeps the square plus its feather (${trimmed.width}px)`);
  equal(trimmed.rgba.length, trimmed.width * trimmed.height * 4, 'and the buffer matches the new dimensions');

  // The settings object must not be mutated by a render.
  const settings = { background: '#00ff00' };
  renderResult(rgba.slice(), auto.mask, width, height, settings);
  equal(JSON.stringify(settings), '{"background":"#00ff00"}', 'renderResult does not mutate the settings it is given');
  equal(DEFAULT_SETTINGS.tolerance, 32, 'and the defaults are not mutated either');

  const board = checkerboard(16, 16, 8);
  equal(board.length, 16 * 16 * 4, 'the checkerboard is the right size');
  assert(board[0] !== board[8 * 4], 'with alternating squares');
  equal(board[3], 255, 'and is fully opaque');
}

describe('brush strokes');
{
  // The UI records strokes in normalised 0-1 coordinates so that the same
  // list replays correctly on the downscaled preview and on the full-size
  // export. Pixel coordinates would put the export's strokes in the wrong
  // place on every image large enough to be downscaled.
  const w = 200;
  const h = 200;
  const stroke = { x: 0.5, y: 0.5, radius: 12 / 200, hardness: 1, erase: true };

  const erased = applyStrokes(new Uint8ClampedArray(w * h).fill(KEEP), w, h, [stroke]);
  equal(at(erased, w, 100, 100), DROP, 'an erase stroke removes the pixels under it');
  equal(at(erased, w, 140, 100), KEEP, 'and leaves pixels well outside the radius');

  const restored = applyStrokes(new Uint8ClampedArray(w * h).fill(DROP), w, h, [{ ...stroke, erase: false }]);
  equal(at(restored, w, 100, 100), KEEP, 'the same stroke restores when erase is off');

  // The property that matters: identical strokes, different resolutions, same
  // position and the same proportional size.
  const big = 800;
  const replayed = applyStrokes(new Uint8ClampedArray(big * big).fill(KEEP), big, big, [stroke]);
  equal(at(replayed, big, 400, 400), DROP, 'a stroke replays at the same relative position when scaled up');
  equal(at(replayed, big, 560, 400), KEEP, 'and keeps its proportional radius');

  equal(
    applyStrokes(new Uint8ClampedArray(w * h).fill(KEEP), w, h, [])[100 * w + 100],
    KEEP,
    'an empty stroke list changes nothing',
  );
}

describe('portrait framing');
{
  // The bug this covers shipped and was bad: auto mode seeded the flood fill
  // from the four corners, and in any head-and-shoulders portrait the lower
  // corners are the subject's shoulders, not the backdrop. The fill then
  // spread through the subject and ate it.
  const w = 200;
  const h = 240;
  const photo = blank(w, h, [108, 141, 175]); // blue-grey wall

  // Shoulders run off the bottom edge and into both lower corners, which is
  // how essentially every portrait is framed.
  fillRect(photo, w, { x: 20, y: 170, width: 160, height: 70 }, [136, 74, 61 ]);
  // Head above them.
  for (let y = 60; y < 175; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((x - 100) ** 2 / 2000 + (y - 115) ** 2 / 3200 <= 1) {
        const p = (y * w + x) * 4;
        photo[p] = 226;
        photo[p + 1] = 190;
        photo[p + 2] = 170;
      }
    }
  }
  addNoise(photo, 4, 3);

  const result = buildMask(photo, w, h, {});

  equal(at(result.mask, w, 5, 5), DROP, 'the wall above the subject is removed');
  equal(at(result.mask, w, 100, 220), KEEP, 'the shirt at the bottom edge is kept');
  equal(at(result.mask, w, 25, 230), KEEP, 'including where it reaches the bottom-left corner');
  equal(at(result.mask, w, 175, 230), KEEP, 'and the bottom-right corner');
  equal(at(result.mask, w, 100, 115), KEEP, 'the face is kept');
  assert(result.coverage > 0.35, `most of the subject survives (kept ${(result.coverage * 100).toFixed(1)}%)`);

  // Seeds must come from the backdrop, never from whatever happens to sit in
  // a corner.
  const detected = detectBackground(photo, w, h);
  const fromBackdrop = detected.seeds.every((index) => {
    const p = index * 4;
    return Math.abs(photo[p] - 108) < 40 && Math.abs(photo[p + 2] - 175) < 40;
  });
  assert(fromBackdrop, 'every seed is a backdrop pixel, not a subject pixel');
  assert(detected.seeds.length > 0, `seeds are reported (${detected.seeds.length})`);
}

describe('realistic cases');
{
  // A noisy near-white backdrop, which is what a phone photo of a product on
  // paper actually looks like.
  const size = 100;
  const photo = addNoise(blank(size, size, [246, 246, 244]), 7, 99);
  fillRect(photo, size, { x: 30, y: 30, width: 40, height: 40 }, [60, 40, 30]);
  addNoise(photo, 4, 7);

  const result = buildMask(photo, size, size, { tolerance: 25 });
  equal(at(result.mask, size, 2, 2), DROP, 'a noisy paper backdrop is still removed');
  equal(at(result.mask, size, 50, 50), KEEP, 'and the product survives');
  close(result.coverage, 0.16, 0.06, 'roughly the area of the product is kept');

  // A logo on white with an enclosed counter, the classic "remove white
  // background from a logo" case. The counter must become transparent too.
  const logo = blank(60, 60, [255, 255, 255]);
  fillRect(logo, 60, { x: 10, y: 10, width: 40, height: 40 }, [0, 90, 200]);
  fillRect(logo, 60, { x: 25, y: 25, width: 10, height: 10 }, [255, 255, 255]);

  const contiguousLogo = buildMask(logo, 60, 60, { mode: 'color', pickedColor: '#ffffff', contiguous: true });
  equal(at(contiguousLogo.mask, 60, 30, 30), KEEP, 'a contiguous fill leaves the counter filled');

  const globalLogo = buildMask(logo, 60, 60, { mode: 'color', pickedColor: '#ffffff', contiguous: false });
  equal(at(globalLogo.mask, 60, 30, 30), DROP, 'turning contiguity off clears the counter');
  equal(at(globalLogo.mask, 60, 15, 15), KEEP, 'without eating the logo itself');

  // A green screen with spill on the subject.
  const screen = blank(60, 60, [20, 190, 40]);
  fillRect(screen, 60, { x: 20, y: 20, width: 20, height: 20 }, [210, 180, 170]);
  const keyed = buildMask(screen, 60, 60, { mode: 'chroma', pickedColor: '#00ff00', tolerance: 60 });
  equal(at(keyed.mask, 60, 2, 2), DROP, 'the screen is keyed out');
  equal(at(keyed.mask, 60, 30, 30), KEEP, 'and the subject is kept');
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  console.error(`FAILED — ${failures.length} of ${passed + failures.length} assertions:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`${passed} assertions passed.`);
}
