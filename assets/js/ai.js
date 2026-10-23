/**
 * Optional AI segmentation.
 *
 * Everything in this file is opt-in and lazily loaded. Nothing here is
 * imported at page load — the module is only pulled in once a visitor
 * explicitly turns AI mode on, so the default path stays at zero bytes of
 * machine-learning anything.
 *
 * The important property is unchanged: the model travels to the browser, the
 * image never travels anywhere. Both files are served from this origin, so
 * enabling AI mode still makes no third-party request.
 *
 * Model: U^2-Net (small variant, "u2netp"), Apache-2.0, 4.36 MB.
 * Runtime: ONNX Runtime Web, MIT, 13.58 MB of WebAssembly.
 */

/** Where the vendored runtime and weights sit, relative to this module. */
const ORT_DIR = new URL('../vendor/ort/', import.meta.url);
const MODEL_URL = new URL('../model/u2netp.onnx', import.meta.url);

/**
 * Bumped whenever the model file changes, so a stale cached copy is never
 * paired with a newer build.
 */
const CACHE_NAME = 'csbr-model-v1';

/** u2netp takes a fixed 320x320 input; its output is the same grid. */
export const INPUT_SIZE = 320;

/** ImageNet statistics, which is what U^2-Net was trained against. */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise = null;

/**
 * Fetch the weights, reporting progress, and keep them in the Cache API.
 *
 * The HTTP cache would also hold them, but it is free to evict a 4 MB entry
 * whenever it likes. For a download this size that would be a nasty surprise
 * on a metered connection, so the copy is kept explicitly.
 */
async function loadModelBytes(onProgress) {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME).catch(() => null) : null;

  const cached = cache ? await cache.match(MODEL_URL).catch(() => null) : null;
  if (cached) {
    onProgress?.({ loaded: 1, total: 1, cached: true });
    return cached.arrayBuffer();
  }

  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`model ${response.status}`);

  // Clone before draining: the response body can only be read once, and the
  // cache needs its own copy.
  if (cache) await cache.put(MODEL_URL, response.clone()).catch(() => {});

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) {
    onProgress?.({ loaded: 1, total: 1, cached: false });
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ loaded, total, cached: false });
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}

/**
 * Load the runtime and build an inference session, once.
 *
 * Single-threaded on purpose. Threads need SharedArrayBuffer, which needs
 * cross-origin isolation, which would mean sending COEP and breaking the
 * analytics snippet for anyone who enables it. A one-shot 320x320 forward
 * pass takes a couple of seconds on one thread, which is an acceptable price
 * for not reshaping the whole site's headers around an optional feature.
 */
export function loadSession(onProgress) {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const ort = await import(/* @vite-ignore */ new URL('ort.min.mjs', ORT_DIR).href);

    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    // Serve the .wasm from our own origin rather than ORT's default CDN.
    ort.env.wasm.wasmPaths = ORT_DIR.href;

    const bytes = await loadModelBytes(onProgress);

    return {
      ort,
      session: await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
    };
  })().catch((error) => {
    // A failed load must not poison every later attempt.
    sessionPromise = null;
    throw error;
  });

  return sessionPromise;
}

/** True once the weights are on disk, so the UI can skip the download prompt. */
export async function isModelCached() {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    return Boolean(await cache.match(MODEL_URL));
  } catch {
    return false;
  }
}

/** Forget the downloaded weights. */
export async function clearModel() {
  sessionPromise = null;
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* nothing actionable */
  }
}

/**
 * Bilinear resample of an RGBA buffer.
 *
 * Written out rather than done on a canvas because this runs inside a worker
 * that may not have OffscreenCanvas, and because sampling from pixel centres
 * is what keeps the mask aligned with the image instead of creeping by half a
 * pixel at each end.
 */
function resample(rgba, sourceWidth, sourceHeight, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(sourceHeight - 1, Math.max(0, ((y + 0.5) * sourceHeight) / height - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.max(0, ((x + 0.5) * sourceWidth) / width - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = sx - x0;

      for (let c = 0; c < 4; c += 1) {
        const top = rgba[(y0 * sourceWidth + x0) * 4 + c] * (1 - fx) + rgba[(y0 * sourceWidth + x1) * 4 + c] * fx;
        const bottom = rgba[(y1 * sourceWidth + x0) * 4 + c] * (1 - fx) + rgba[(y1 * sourceWidth + x1) * 4 + c] * fx;
        out[(y * width + x) * 4 + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
}

/**
 * Run the model and return a full-resolution alpha mask.
 *
 * The network sees a fixed 320x320 square, so the mask it produces is upscaled
 * back to the image. That is the real limitation of this mode: it knows what a
 * subject *is*, which colour matching never will, but the boundary it draws is
 * interpolated from a small grid rather than measured against the pixels. On a
 * plain backdrop the colour modes still give a crisper edge.
 */
export async function segment(rgba, width, height, onProgress) {
  const { ort, session } = await loadSession(onProgress);

  const small = resample(rgba, width, height, INPUT_SIZE, INPUT_SIZE);
  const input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;

  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      input[c * plane + i] = (small[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }

  const outputs = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
  });

  // U^2-Net emits several side outputs for training; the first is the fused
  // prediction and the only one worth reading.
  const raw = outputs[session.outputNames[0]].data;

  // Normalise to the observed range. The network is not calibrated to 0-1, so
  // a fixed threshold would be wrong on any image whose subject is faint.
  let min = Infinity;
  let max = -Infinity;
  for (const value of raw) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;

  const maskSmall = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i += 1) {
    const alpha = Math.round(((raw[i] - min) / span) * 255);
    maskSmall[i * 4] = alpha;
    maskSmall[i * 4 + 1] = alpha;
    maskSmall[i * 4 + 2] = alpha;
    maskSmall[i * 4 + 3] = 255;
  }

  const scaled = resample(maskSmall, INPUT_SIZE, INPUT_SIZE, width, height);
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = scaled[i * 4];

  return mask;
}
