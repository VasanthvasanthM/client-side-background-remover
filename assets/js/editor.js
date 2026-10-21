/**
 * The editor: loading an image, talking to the worker, drawing the canvas.
 *
 * Holds the only mutable image state in the app. The worker owns the pixels it
 * needs for computation; this module owns what is on screen.
 *
 * Nothing here uploads anything. The image is decoded by the browser, drawn to
 * a canvas, and the pixels are passed to a worker in the same origin. There is
 * no network call anywhere in this file, which is the property the whole tool
 * is built around.
 */

import { store } from './store.js';
import { t } from './i18n.js';
import { previewScale, checkerboard, PREVIEW_MAX_EDGE } from './engine.js';
import { toHex } from './color.js';

/** Refuse absurd inputs before they exhaust memory rather than after. */
export const MAX_PIXELS = 40_000_000; // ~40 MP, comfortably past a 61 MP raw export
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export class Editor {
  constructor({ canvas, onState }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { willReadFrequently: false });
    this.onState = onState ?? (() => {});

    /** Full-resolution source pixels, kept for export. */
    this.full = null;
    /** Downscaled copy the preview is computed from. */
    this.preview = null;
    /** Last composited preview, as ImageData. */
    this.rendered = null;
    /** Last mask, at preview resolution, for the eyedropper and brush. */
    this.mask = null;

    this.meta = { keyColor: [255, 255, 255], confidence: 1, coverage: 1, warning: '' };
    this.strokes = [];
    /**
     * Bumped on every brush change, and sent to the worker as part of its
     * cache key. A counter rather than `strokes.length`, because undoing one
     * stroke and painting another leaves the length unchanged and would hand
     * back the pre-undo mask.
     */
    this.strokeRevision = 0;
    this.fileName = '';
    this.busy = false;
    this.error = '';

    this.token = 0;
    this.pending = new Map();
    this.worker = null;
    this.checker = null;
    /** Scratch surface for compositing; see draw(). */
    this.scratch = null;
    this.scratchContext = null;
  }

  get hasImage() {
    return this.preview !== null;
  }

  // -------------------------------------------------------------------------
  // Worker
  // -------------------------------------------------------------------------

  #ensureWorker() {
    if (this.worker) return this.worker;

    // A module worker from the same origin, which is what keeps the CSP at a
    // plain script-src 'self' with no blob: and no inline bootstrap.
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    this.worker.onmessage = (event) => {
      const { token } = event.data;
      const resolver = this.pending.get(token);
      if (!resolver) return; // a superseded request; its result is stale
      this.pending.delete(token);

      if (event.data.type === 'error') resolver.reject(new Error(event.data.message));
      else resolver.resolve(event.data);
    };

    this.worker.onerror = (event) => {
      for (const { reject } of this.pending.values()) reject(new Error(event.message || 'worker failed'));
      this.pending.clear();
    };

    return this.worker;
  }

  #post(message, transfer = []) {
    const worker = this.#ensureWorker();
    const token = (this.token += 1);

    return new Promise((resolve, reject) => {
      this.pending.set(token, { resolve, reject });
      worker.postMessage({ ...message, token }, transfer);
    });
  }

  /**
   * Drop every in-flight request.
   *
   * Dragging a slider queues a request per frame. Without this, releasing the
   * slider leaves a backlog that renders stale results one after another —
   * the preview appears to lag seconds behind the control.
   */
  #abandonPending() {
    this.pending.clear();
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /** Validate and decode a file, then hand the pixels to the worker. */
  async load(file) {
    this.error = '';

    if (!file) return false;
    if (file.size > MAX_FILE_BYTES) {
      this.error = t('err.tooLarge');
      this.onState();
      return false;
    }
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      this.error = t('err.badType');
      this.onState();
      return false;
    }

    this.busy = true;
    this.onState();

    try {
      const bitmap = await decode(file);

      if (bitmap.width * bitmap.height > MAX_PIXELS) {
        bitmap.close?.();
        this.error = t('err.tooManyPixels');
        return false;
      }

      this.fileName = file.name || 'image';
      this.full = drawToImageData(bitmap, bitmap.width, bitmap.height);

      const scale = previewScale(bitmap.width, bitmap.height, PREVIEW_MAX_EDGE);
      this.preview =
        scale === 1
          ? this.full
          : drawToImageData(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));

      bitmap.close?.();

      this.strokes = [];
      this.strokeRevision = 0;
      this.mask = null;
      this.rendered = null;
      this.checker = null;

      // The preview buffer is copied because it is transferred away, and the
      // full-resolution one is only uploaded when an export actually happens —
      // most sessions never export, and that copy is the largest in the app.
      await this.#post(
        {
          type: 'load',
          scope: 'preview',
          rgba: copyBuffer(this.preview.data),
          width: this.preview.width,
          height: this.preview.height,
        },
        [],
      );

      this.fullUploaded = false;
      return true;
    } catch (error) {
      this.error = error?.message === 'decode' ? t('err.decode') : t('err.unknown');
      return false;
    } finally {
      this.busy = false;
      this.onState();
    }
  }

  /** Forget the image entirely, including inside the worker. */
  unload() {
    this.full = null;
    this.preview = null;
    this.rendered = null;
    this.mask = null;
    this.strokes = [];
    this.strokeRevision = 0;
    this.fileName = '';
    this.error = '';
    this.#abandonPending();
    this.worker?.postMessage({ type: 'release', token: -1 });
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onState();
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  /** Recompute and redraw. Safe to call on every input event. */
  async refresh(pickedColor) {
    if (!this.preview) return;

    this.#abandonPending();
    this.busy = true;
    this.onState();

    try {
      const result = await this.#post({
        type: 'preview',
        settings: store.engineSettings(pickedColor),
        strokes: this.strokes,
        strokeRevision: this.strokeRevision,
      });

      this.meta = {
        keyColor: result.keyColor,
        confidence: result.confidence,
        coverage: result.coverage,
        warning: result.warning,
      };
      this.mask = new Uint8ClampedArray(result.mask);
      this.rendered = new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height);
      this.draw();
    } catch (error) {
      this.error = error.message;
    } finally {
      this.busy = false;
      this.onState();
    }
  }

  /**
   * Paint the current preview onto the visible canvas.
   *
   * The checkerboard is drawn underneath so transparency is legible, and it is
   * generated once per size rather than per frame — regenerating it on every
   * brush stroke was measurably the slowest thing on the page.
   */
  draw() {
    const source = store.get('showOriginal') ? this.preview : this.rendered;
    if (!source) return;

    const { width, height } = source;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.checker = null;
    }

    if (!this.checker) {
      this.checker = new ImageData(checkerboard(width, height, 10), width, height);
    }

    // putImageData replaces pixels rather than compositing, so the image has
    // to arrive as a drawable surface for its alpha to blend over the
    // checkerboard. A scratch canvas does that synchronously.
    //
    // createImageBitmap would also work and is asynchronous, which is exactly
    // the problem: two draws in quick succession — a brush drag — can resolve
    // out of order and leave a stale frame on screen, and the gap between
    // painting the checkerboard and painting the image shows as a flicker.
    // Everything here happens in one task, so neither can occur.
    if (!this.scratch || this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch = document.createElement('canvas');
      this.scratch.width = width;
      this.scratch.height = height;
      this.scratchContext = this.scratch.getContext('2d');
    }

    this.scratchContext.putImageData(source, 0, 0);
    this.context.putImageData(this.checker, 0, 0);
    this.context.drawImage(this.scratch, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Picking and painting
  // -------------------------------------------------------------------------

  /** Canvas-relative CSS coordinates to preview pixel coordinates. */
  toPixel(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const x = Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height);

    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;
    return { x, y };
  }

  /** The original colour under a point, as hex. Reads the source, not the result. */
  pick(clientX, clientY) {
    const point = this.toPixel(clientX, clientY);
    if (!point || !this.preview) return null;

    const p = (point.y * this.preview.width + point.x) * 4;
    return toHex([this.preview.data[p], this.preview.data[p + 1], this.preview.data[p + 2]]);
  }

  /**
   * Record a brush dab in normalised coordinates.
   *
   * Normalised rather than pixel coordinates so the identical stroke list
   * replays correctly on the full-resolution export, which may be several
   * times larger than the preview it was drawn on.
   */
  paint(clientX, clientY) {
    const point = this.toPixel(clientX, clientY);
    if (!point) return false;

    const longest = Math.max(this.canvas.width, this.canvas.height);
    this.strokes.push({
      x: point.x / this.canvas.width,
      y: point.y / this.canvas.height,
      radius: store.get('brushSize') / 2 / longest,
      hardness: store.get('brushHardness') / 100,
      erase: store.get('brushErase'),
    });
    this.strokeRevision += 1;
    return true;
  }

  undoStroke() {
    if (this.strokes.pop() === undefined) return false;
    this.strokeRevision += 1;
    return true;
  }

  clearStrokes() {
    if (this.strokes.length === 0) return false;
    this.strokes = [];
    this.strokeRevision += 1;
    return true;
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  /**
   * Render at full resolution and return a Blob.
   *
   * The full-size pixels are uploaded to the worker lazily, on the first
   * export. Most visitors try settings and leave; paying that copy up front
   * would slow down every session to speed up a minority of them.
   */
  async exportBlob(pickedColor) {
    if (!this.full) return null;

    if (!this.fullUploaded) {
      await this.#post({
        type: 'load',
        scope: 'full',
        rgba: copyBuffer(this.full.data),
        width: this.full.width,
        height: this.full.height,
      });
      this.fullUploaded = true;
    }

    const result = await this.#post({
      type: 'export',
      settings: store.engineSettings(pickedColor),
      strokes: this.strokes,
    });

    const imageData = new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height);
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);

    const format = store.get('exportFormat');
    const type = format === 'webp' ? 'image/webp' : 'image/png';
    const quality = format === 'webp' ? store.get('exportQuality') / 100 : undefined;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));

    // A browser that cannot encode WebP returns a PNG from toBlob rather than
    // failing, so the extension is taken from what came back, not what was
    // asked for — otherwise the file is named .webp and is not one.
    return { blob, type: blob?.type || type, width: result.width, height: result.height };
  }

  /** "photo.jpg" becomes "photo-no-bg.png". */
  suggestedName(mimeType) {
    const base = (this.fileName || 'image').replace(/\.[^.]+$/, '') || 'image';
    const extension = mimeType === 'image/webp' ? 'webp' : 'png';
    return `${base}-no-bg.${extension}`;
  }
}

// ---------------------------------------------------------------------------

/** A detached copy of a typed array's bytes, safe to transfer. */
function copyBuffer(typed) {
  return typed.slice().buffer;
}

/**
 * Decode a file to an ImageBitmap.
 *
 * createImageBitmap decodes off the main thread where it is available, which
 * keeps the page responsive on a large photo. The <img> path is the fallback
 * for older Safari, and also the only one that handles SVG sensibly.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('decode'));
      element.src = url;
    });
    return image;
  } finally {
    // Revoked once decoding has finished either way; leaving it would hold the
    // whole file in memory for the lifetime of the document.
    URL.revokeObjectURL(url);
  }
}

function drawToImageData(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
