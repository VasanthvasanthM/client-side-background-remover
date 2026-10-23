/**
 * Background-removal worker.
 *
 * Segmenting a megapixel image is hundreds of milliseconds of tight loops. On
 * the main thread that is a frozen tab: no scrolling, no slider feedback, and
 * on a large photo the browser's "page unresponsive" dialog. All of it runs
 * here instead.
 *
 * The image is uploaded once and kept, so dragging a slider sends a few bytes
 * of settings rather than re-posting megabytes of pixels on every frame.
 *
 * Loaded as a module worker, so it imports the same engine the tests exercise
 * — there is no second implementation to drift.
 */

import { buildMask, renderResult, applyStrokes, refineExternalMask } from './engine.js';

/** Held between messages: the whole point of the load/compute split. */
const images = {
  preview: null, // { rgba, width, height }
  full: null,
};

/** The last mask computed for the preview, reused when only output changes. */
let cachedMask = null;
let cachedKey = '';
let cachedMeta = null;

/**
 * The raw AI mask for the loaded image, before any refinement.
 *
 * Kept apart from cachedMask because it costs seconds rather than
 * milliseconds and depends only on the pixels: changing the feather or the
 * edge shift must not trigger another forward pass.
 */
let aiMask = null;
let aiScope = '';

/**
 * Settings that change the mask, as a cache key.
 *
 * Output settings — background colour, trim — are deliberately absent, which
 * is what lets a colour change re-composite without re-segmenting. That is the
 * difference between instant and a visible pause on every swatch click.
 *
 * `strokeRevision` is a counter the editor bumps on every brush change, and it
 * has to be a counter rather than the stroke count: undoing one stroke and
 * painting a different one leaves the array the same length, so a
 * length-based key would serve the pre-undo mask back from cache.
 */
function maskKey(settings, strokeRevision) {
  return JSON.stringify([
    settings.mode,
    settings.tolerance,
    settings.softness,
    settings.contiguous,
    settings.edgeShift,
    settings.featherRadius,
    settings.removeSpeckles,
    settings.fillHoles,
    settings.pickedColor,
    strokeRevision,
  ]);
}

self.onmessage = async (event) => {
  const { type, token } = event.data;

  try {
    switch (type) {
      case 'load':
        handleLoad(event.data);
        break;
      case 'preview':
        await handlePreview(event.data);
        break;
      case 'export':
        await handleExport(event.data);
        break;
      case 'warmup':
        await handleWarmup(event.data);
        break;
      case 'release':
        images.preview = null;
        images.full = null;
        cachedMask = null;
        cachedKey = '';
        aiMask = null;
        aiScope = '';
        break;
      default:
        self.postMessage({ type: 'error', token, message: `unknown message "${type}"` });
    }
  } catch (error) {
    // A worker that dies silently looks to the user like a tool that does
    // nothing. Report, and let the page fall back or show a message.
    self.postMessage({ type: 'error', token, message: error?.message ?? String(error) });
  }
};

function handleLoad({ scope, rgba, width, height, token }) {
  images[scope] = { rgba: new Uint8ClampedArray(rgba), width, height };
  if (scope === 'preview') {
    cachedMask = null;
    cachedKey = '';
  }
  // A new image invalidates the AI mask for that scope.
  if (aiScope === scope) {
    aiMask = null;
    aiScope = '';
  }
  self.postMessage({ type: 'loaded', scope, token, width, height });
}


/**
 * The AI mask for one scope, computed at most once per image.
 *
 * Progress is forwarded to the page as it downloads, because the first run
 * fetches several megabytes and a silent multi-second wait reads as a hang.
 */
async function ensureAiMask(scope, image, token) {
  if (aiMask && aiScope === scope) return aiMask;

  const { segment } = await import('./ai.js');
  self.postMessage({ type: 'progress', token, stage: 'running' });

  aiMask = await segment(image.rgba, image.width, image.height, (progress) => {
    self.postMessage({ type: 'progress', token, stage: 'model', ...progress });
  });
  self.postMessage({ type: 'progress', token, stage: 'done' });
  aiScope = scope;
  return aiMask;
}

/**
 * Download the model and build the session, with no image involved.
 *
 * This exists because accepting the download used to go through the
 * normal preview path, which returns immediately when nothing is loaded —
 * so pressing the button with no photo open did nothing at all, silently.
 * Fetching on its own terms means the consent button always does what it
 * says, and the weights are ready before the first image arrives.
 */
async function handleWarmup({ token }) {
  const { loadSession } = await import('./ai.js');
  await loadSession((progress) => {
    self.postMessage({ type: 'progress', token, stage: 'model', ...progress });
  });
  self.postMessage({ type: 'warmup', token, ready: true });
}

async function handlePreview({ token, settings, strokes = [], strokeRevision = 0 }) {
  const image = images.preview;
  if (!image) {
    self.postMessage({ type: 'error', token, message: 'no image loaded' });
    return;
  }

  const key = maskKey(settings, strokeRevision);
  if (key !== cachedKey || !cachedMask) {
    const result =
      settings.mode === 'ai'
        ? refineExternalMask(
            image.rgba,
            (await ensureAiMask('preview', image, token)).slice(),
            image.width,
            image.height,
            settings,
          )
        : buildMask(image.rgba, image.width, image.height, settings);
    cachedMeta = {
      keyColor: result.keyColor,
      confidence: result.confidence,
      coverage: result.coverage,
      warning: result.warning,
    };
    cachedMask = applyStrokes(result.mask, image.width, image.height, strokes);
    cachedKey = key;
  }

  // renderResult mutates, so it gets a copy — the original is needed again on
  // the next settings change.
  const pixels = renderResult(image.rgba.slice(), cachedMask, image.width, image.height, {
    ...settings,
    keyColor: cachedMeta.keyColor,
    trim: false, // the preview always shows the full frame; trim is export-only
  });

  self.postMessage(
    {
      type: 'preview',
      token,
      rgba: pixels.rgba.buffer,
      mask: cachedMask.slice().buffer,
      width: pixels.width,
      height: pixels.height,
      ...cachedMeta,
    },
    [pixels.rgba.buffer],
  );
}

/**
 * Full-resolution export.
 *
 * The mask is recomputed at full size rather than upscaled from the preview.
 * Upscaling would be faster but visibly softer on a large image, and export is
 * the one moment where quality matters more than latency.
 */
async function handleExport({ token, settings, strokes = [] }) {
  const image = images.full ?? images.preview;
  if (!image) {
    self.postMessage({ type: 'error', token, message: 'no image loaded' });
    return;
  }

  const result =
    settings.mode === 'ai'
      ? refineExternalMask(
          image.rgba,
          (await ensureAiMask('full', image, token)).slice(),
          image.width,
          image.height,
          settings,
        )
      : buildMask(image.rgba, image.width, image.height, settings);
  const mask = applyStrokes(result.mask, image.width, image.height, strokes);

  const pixels = renderResult(image.rgba.slice(), mask, image.width, image.height, {
    ...settings,
    keyColor: result.keyColor,
  });

  self.postMessage(
    {
      type: 'export',
      token,
      rgba: pixels.rgba.buffer,
      width: pixels.width,
      height: pixels.height,
    },
    [pixels.rgba.buffer],
  );
}
