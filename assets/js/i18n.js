/**
 * Localization runtime.
 *
 * Each locale is a static page under its own subfolder (/, /es/, /pt/, …) with
 * the UI strings already rendered into the markup and its dictionary inlined as
 * JSON — so first paint needs no fetch and crawlers see real translated text.
 * This module covers what the static build cannot: strings for DOM built at
 * runtime, and plural forms that need a count.
 */

export const SUPPORTED = ['en', 'es', 'pt', 'fr', 'hi', 'id', 'ar'];
export const DEFAULT_LOCALE = 'en';

/** Right-to-left locales, for when the set grows beyond Arabic. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

const INTERPOLATION_RE = /\{(\w+)\}/g;

export function isRtl(locale) {
  return RTL.has(locale);
}

/** Locale from the URL subfolder: /es/… -> 'es', / -> 'en'. */
export function localeFromPath(pathname = window.location.pathname) {
  const first = pathname.split('/').filter(Boolean)[0];
  return first && SUPPORTED.includes(first) ? first : DEFAULT_LOCALE;
}

/** Path to the same page in another locale, preserving the trailing segment. */
export function pathForLocale(locale, pathname = window.location.pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length && SUPPORTED.includes(segments[0])) segments.shift();
  const rest = segments.join('/');
  const prefix = locale === DEFAULT_LOCALE ? '/' : `/${locale}/`;
  return rest ? `${prefix}${rest}` : prefix;
}

function readInlineDict() {
  const node = document.getElementById('i18n-dict');
  if (!node) return {};
  try {
    const parsed = JSON.parse(node.textContent);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const pageLocale = localeFromPath();

const dict = readInlineDict();

export function currentLocale() {
  return pageLocale;
}

/**
 * Translate a key, with plural selection and locale number formatting.
 *
 * A dictionary value may be a string, or an object of CLDR plural categories
 * ({ one, other, … }) chosen by `vars.count` — Arabic needs six of them,
 * English two, Indonesian one, and hardcoding "{count} days" gets all of them
 * wrong.
 *
 * A missing key returns the key itself, which makes an untranslated string
 * obvious on the page rather than rendering as a blank.
 */
export function t(key, vars) {
  let raw = Object.hasOwn(dict, key) ? dict[key] : key;

  if (raw !== null && typeof raw === 'object') {
    raw = raw[fmt.pluralCategory(vars?.count ?? 0, pageLocale)] ?? raw.other ?? Object.values(raw)[0] ?? '';
  }
  if (!vars) return raw;

  return String(raw).replace(INTERPOLATION_RE, (match, name) => {
    if (!Object.hasOwn(vars, name)) return match;
    const value = vars[name];
    return typeof value === 'number' ? formatNumber(value) : String(value);
  });
}

/** True when the dictionary actually carries this key. */
export function hasKey(key) {
  return Object.hasOwn(dict, key);
}

/**
 * Inject translations into a subtree.
 *
 * - `data-i18n`      -> element text
 * - `data-i18n-attr` -> comma-separated attributes, e.g. "placeholder:key,title:key"
 *
 * Text is written with textContent, never innerHTML, so a dictionary can never
 * inject markup.
 */
export function applyTranslations(root = document) {
  const scope = root instanceof Element || root instanceof DocumentFragment ? root : document;

  for (const el of scope.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  }

  for (const el of scope.querySelectorAll('[data-i18n-attr]')) {
    const spec = el.getAttribute('data-i18n-attr') || '';
    for (const pair of spec.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s && s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting bound to the page locale
// ---------------------------------------------------------------------------

const numberCache = new Map();

/** Locale-aware number formatting; the formatter is the expensive part, so cache it. */
export function formatNumber(value, options = {}) {
  const key = pageLocale + JSON.stringify(options);
  let formatter = numberCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(pageLocale, options);
    numberCache.set(key, formatter);
  }
  return formatter.format(value);
}

/**
 * A byte count in the largest unit that keeps it readable.
 *
 * Uses the decimal units browsers and operating systems show in download
 * dialogs, so the size quoted here matches the one the user sees next.
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${formatNumber(bytes)} B`;
  if (bytes < 1000 * 1000) return `${formatNumber(bytes / 1000, { maximumFractionDigits: 0 })} kB`;
  return `${formatNumber(bytes / 1000 / 1000, { maximumFractionDigits: 1 })} MB`;
}

/** "1920 x 1080", with the locale's own digits. */
export function formatDimensions(width, height) {
  return `${formatNumber(width)} × ${formatNumber(height)}`;
}
