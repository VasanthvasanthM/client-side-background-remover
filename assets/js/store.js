/**
 * Device-local settings.
 *
 * Images are deliberately *not* stored. They would blow the roughly 5 MB
 * localStorage quota on the first photo, and keeping someone's picture on
 * disk after they close the tab would contradict the one promise this tool
 * makes. Only the knobs are remembered, so a returning visitor keeps their
 * preferred tolerance and output format and nothing else.
 *
 * Every field is validated on read: a corrupted, stale or hand-edited record
 * can only degrade to defaults, never poison the UI.
 */

import { parseHex } from './color.js';
import { DEFAULT_SETTINGS } from './engine.js';

const STORAGE_KEY = 'csbr.state.v1';
const SCHEMA_VERSION = 1;
const WRITE_DEBOUNCE_MS = 400;

/** Swatches offered for one-click reuse. */
export const MAX_RECENT_COLORS = 8;

export const DEFAULTS = Object.freeze({
  schema: SCHEMA_VERSION,
  theme: 'system', // 'system' | 'light' | 'dark'
  lang: '', // '' = follow the URL subfolder

  // Removal settings, mirroring the engine's own defaults so there is one
  // source of truth for what "default" means.
  mode: DEFAULT_SETTINGS.mode,
  tolerance: DEFAULT_SETTINGS.tolerance,
  softness: DEFAULT_SETTINGS.softness,
  contiguous: DEFAULT_SETTINGS.contiguous,
  edgeShift: DEFAULT_SETTINGS.edgeShift,
  featherRadius: DEFAULT_SETTINGS.featherRadius,
  removeSpeckles: DEFAULT_SETTINGS.removeSpeckles,
  fillHoles: DEFAULT_SETTINGS.fillHoles,
  decontaminate: DEFAULT_SETTINGS.decontaminate,
  despillChannel: DEFAULT_SETTINGS.despillChannel,
  background: DEFAULT_SETTINGS.background,
  trim: DEFAULT_SETTINGS.trim,

  // Export
  exportFormat: 'png', // 'png' | 'webp'
  exportQuality: 92, // WebP only; PNG is lossless

  /**
   * Whether the visitor has accepted the AI model download.
   *
   * Remembered so the consent prompt appears once rather than on every
   * visit; the weights themselves live in the Cache API, not here.
   */
  aiAccepted: false,

  // Brush
  brushSize: 24,
  brushHardness: 70,
  brushErase: true,

  // UI
  showOriginal: false,
  recentColors: Object.freeze([]),
});

const isPercent = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
const isBool = (v) => typeof v === 'boolean';
const isHexOrEmpty = (v) => typeof v === 'string' && (v === '' || parseHex(v) !== null);

/** Shape guards. A value that fails its guard falls back to the default. */
const VALIDATORS = {
  schema: (v) => Number.isInteger(v),
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  lang: (v) => typeof v === 'string' && v.length <= 5,

  mode: (v) => ['auto', 'color', 'chroma', 'ai'].includes(v),
  tolerance: isPercent,
  softness: isPercent,
  contiguous: isBool,
  edgeShift: (v) => Number.isInteger(v) && v >= -5 && v <= 5,
  featherRadius: (v) => Number.isInteger(v) && v >= 0 && v <= 8,
  removeSpeckles: isBool,
  fillHoles: isBool,
  decontaminate: isBool,
  despillChannel: (v) => ['', 'r', 'g', 'b'].includes(v),
  // 'transparent' or a hex colour — the one field where a keyword is valid.
  background: (v) => v === 'transparent' || isHexOrEmpty(v),
  trim: isBool,

  exportFormat: (v) => ['png', 'webp'].includes(v),
  exportQuality: (v) => Number.isFinite(v) && v >= 40 && v <= 100,

  aiAccepted: isBool,
  brushSize: (v) => Number.isFinite(v) && v >= 2 && v <= 200,
  brushHardness: isPercent,
  brushErase: isBool,

  showOriginal: isBool,
  recentColors: (v) =>
    Array.isArray(v) && v.length <= MAX_RECENT_COLORS && v.every((hex) => typeof hex === 'string' && parseHex(hex)),
};

/** Probe once: Safari private mode and blocked-cookie settings throw on access. */
function probeStorage() {
  try {
    const probe = '__csbr_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function fresh() {
  return { ...DEFAULTS, recentColors: [] };
}

function equal(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

class Store {
  constructor() {
    this.backend = probeStorage();
    this.persistent = this.backend !== null;
    this.state = this.#read();
    this.listeners = new Set();
    this.timer = 0;
    /** Set by the app to surface a "could not save" notice. */
    this.onPersistFailure = null;

    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  #read() {
    if (!this.backend) return fresh();

    let raw;
    try {
      raw = this.backend.getItem(STORAGE_KEY);
    } catch {
      return fresh();
    }
    if (!raw) return fresh();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.#remove();
      return fresh();
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.#remove();
      return fresh();
    }

    const next = fresh();
    for (const key of Object.keys(DEFAULTS)) {
      if (!Object.hasOwn(parsed, key)) continue;
      const value = parsed[key];
      if (!VALIDATORS[key](value)) continue;
      next[key] = Array.isArray(value) ? [...value] : value;
    }
    next.schema = SCHEMA_VERSION;

    // Chroma mode without a key colour would silently key on pure green; make
    // that explicit rather than surprising.
    if (next.mode === 'chroma' && !next.pickedColor) next.pickedColor = '#00b140';
    // Never restore straight into AI mode without consent: a reload would
    // otherwise start a multi-megabyte download unannounced.
    if (next.mode === 'ai' && !next.aiAccepted) next.mode = 'auto';

    return next;
  }

  #remove() {
    try {
      this.backend?.removeItem(STORAGE_KEY);
    } catch {
      /* nothing actionable */
    }
  }

  get(key) {
    return this.state[key];
  }

  snapshot() {
    return { ...this.state };
  }

  /** The subset the engine understands, ready to hand to the worker. */
  engineSettings(pickedColor) {
    return {
      mode: this.state.mode,
      tolerance: this.state.tolerance,
      softness: this.state.softness,
      contiguous: this.state.contiguous,
      edgeShift: this.state.edgeShift,
      featherRadius: this.state.featherRadius,
      removeSpeckles: this.state.removeSpeckles,
      fillHoles: this.state.fillHoles,
      decontaminate: this.state.decontaminate,
      despillChannel: this.state.despillChannel,
      pickedColor: pickedColor ?? '',
      background: this.state.background,
      trim: this.state.trim,
    };
  }

  /** Merge a patch, notify listeners synchronously, persist on a debounce. */
  set(patch) {
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(DEFAULTS, key)) continue;
      if (!VALIDATORS[key](value)) continue;
      if (equal(this.state[key], value)) continue;
      this.state[key] = Array.isArray(value) ? [...value] : value;
      changed = true;
    }
    if (!changed) return;

    for (const fn of this.listeners) fn(this.state);
    this.#schedule();
  }

  /** Remember a picked colour, most recent first, no duplicates. */
  rememberColor(hex) {
    if (!parseHex(hex)) return;
    const normalised = hex.toLowerCase();
    const rest = this.state.recentColors.filter((value) => value.toLowerCase() !== normalised);
    this.set({ recentColors: [normalised, ...rest].slice(0, MAX_RECENT_COLORS) });
  }

  /** Back to factory settings, keeping theme and language. */
  resetSettings() {
    const { theme, lang } = this.state;
    this.state = { ...fresh(), theme, lang };
    for (const fn of this.listeners) fn(this.state);
    this.#schedule();
  }

  /** Forget everything, including the key itself. */
  reset() {
    this.state = fresh();
    this.#remove();
    for (const fn of this.listeners) fn(this.state);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #schedule() {
    if (!this.persistent) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), WRITE_DEBOUNCE_MS);
  }

  flush() {
    if (!this.persistent) return;
    clearTimeout(this.timer);
    this.timer = 0;

    try {
      this.backend.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota exceeded. recentColors is the only field that grows, so drop it
      // and retry once before giving up on persistence entirely.
      try {
        this.backend.setItem(STORAGE_KEY, JSON.stringify({ ...this.state, recentColors: [] }));
      } catch {
        this.persistent = false;
        this.onPersistFailure?.();
      }
    }
  }
}

export const store = new Store();
