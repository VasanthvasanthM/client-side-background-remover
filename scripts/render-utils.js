/** Rendering helpers shared by the page and landing-page builders. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  LOCALES,
  DEFAULT_LOCALE,
  SITE_URL,
  GA4_ID,
  ADSENSE_ID,
  OG_IMAGE_PATH,
  BUILD_YEAR,
  absoluteUrl,
} from './site.config.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DICT_DIR = path.join(ROOT, 'assets', 'i18n');

/**
 * Cache-busting query for the stylesheet.
 *
 * The filename is not hashed, so without this a returning visitor keeps a
 * year-old CSS after a deploy. The query changes whenever the bytes do, which
 * is what lets `_headers` cache it as immutable.
 */
export async function cssVersion() {
  try {
    const css = await readFile(path.join(ROOT, 'assets', 'css', 'app.css'));
    return `?v=${createHash('sha256').update(css).digest('hex').slice(0, 8)}`;
  } catch {
    // CSS not built yet (first run): ship an unversioned link rather than fail.
    return '';
  }
}

/** Escape for HTML text and double-quoted attributes. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Escape JSON for embedding in a <script> block.
 *
 * `<` is the only character that can terminate the element early; the line and
 * paragraph separators are escaped because they are valid in JSON but not in
 * a JavaScript string literal.
 */
export function escapeJsonForScript(json) {
  return json.replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

const dictCache = new Map();

export async function loadDictionary(code) {
  if (dictCache.has(code)) return dictCache.get(code);
  const dict = JSON.parse(await readFile(path.join(DICT_DIR, `${code}.json`), 'utf8'));
  dictCache.set(code, dict);
  return dict;
}

/**
 * Replace every {{t.some.key}} token with its escaped translation.
 *
 * Throws on a missing key, and on a plural key, which needs a count at runtime
 * and therefore cannot be baked into static markup.
 */
export function applyTranslationTokens(html, dict, localeCode) {
  const missing = new Set();
  const plural = new Set();

  const out = html.replace(/\{\{t\.([A-Za-z0-9_.]+)\}\}/g, (_match, key) => {
    if (!Object.hasOwn(dict, key)) {
      missing.add(key);
      return '';
    }
    if (typeof dict[key] !== 'string') {
      plural.add(key);
      return '';
    }
    return escapeHtml(dict[key]);
  });

  if (missing.size) throw new Error(`[${localeCode}] missing dictionary keys: ${[...missing].join(', ')}`);
  if (plural.size) throw new Error(`[${localeCode}] plural keys used in static markup: ${[...plural].join(', ')}`);
  return out;
}

/** Fill a translation string's {placeholders}; values are HTML-escaped. */
export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? escapeHtml(vars[name]) : match,
  );
}

/** Same as fill(), for values going into an attribute, a <title> or JSON. */
export function fillPlain(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Prefixes of dictionary keys the runtime needs.
 *
 * Only these are inlined into the page. Shipping the whole dictionary would
 * put every landing page's prose into every other page's HTML — the full
 * dictionary is several times the size of the subset the tools actually read
 * at runtime.
 */
export const APP_RUNTIME_PREFIXES = [
  'app.',
  'a11y.',
  'common.',
  'foot.',
  // Everything the running app looks up by key rather than having baked
  // into the markup: status lines, errors, the honesty warnings, the
  // model download progress.
  'out.',
  'err.',
  'warn.',
  'pick.',
  'info.',
  'ai.',
  // The compare toggle relabels itself, so its two states are read at
  // runtime. They live under their own prefix rather than 'tool.', which
  // also holds every landing page's prose.
  'compare.',
];

// Deliberately absent: 'tool.', 'color.', 'format.', 'use.', 'faq.' and
// 'landing.'. Those are landing-page prose, several times the size of the
// subset the app actually reads, and inlining them would put every landing
// page's text into every other page.

export const LANDING_RUNTIME_PREFIXES = ['app.', 'a11y.', 'common.', 'foot.'];

export function runtimeDict(dict, prefixes) {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) out[key] = value;
  }
  return out;
}

/** hreflang link tags. `entries` is [{ code, url }]. */
export function hreflangTags(entries, defaultUrl) {
  const lines = entries.map(
    (entry) => `    <link rel="alternate" hreflang="${entry.code}" href="${escapeHtml(entry.url)}" />`,
  );
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${escapeHtml(defaultUrl)}" />`);
  return lines.join('\n');
}

export function ogAlternates(currentCode) {
  return LOCALES.filter((locale) => locale.code !== currentCode)
    .map((locale) => `    <meta property="og:locale:alternate" content="${locale.ogLocale}" />`)
    .join('\n');
}

const CURRENT_LANG_CLASSES = 'rounded-lg px-2 py-1.5 text-xs font-semibold text-clock-700 dark:text-clock-300';
const OTHER_LANG_CLASSES =
  'rounded-lg px-2 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100';

/** Language switcher links. `targets` is [{ locale, href }]. */
export function langLinks(targets, currentCode) {
  return targets
    .map(({ locale, href }) => {
      const isCurrent = locale.code === currentCode;
      return [
        `            <a href="${escapeHtml(href)}"`,
        `hreflang="${locale.code}"`,
        `lang="${locale.code}"`,
        isCurrent ? 'aria-current="page"' : '',
        `class="${isCurrent ? CURRENT_LANG_CLASSES : OTHER_LANG_CLASSES}"`,
        `>${escapeHtml(locale.code.toUpperCase())}<span class="sr-only"> — ${escapeHtml(locale.label)}</span></a>`,
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

export function langOptions(targets, currentCode) {
  return targets
    .map(
      ({ locale }) =>
        `            <option value="${locale.code}"${locale.code === currentCode ? ' selected' : ''}>${escapeHtml(locale.label)}</option>`,
    )
    .join('\n');
}

export function footerLangs(targets, currentCode) {
  return targets
    .map(({ locale, href }) => {
      const current = locale.code === currentCode;
      return [
        `              <li><a class="${current ? 'font-semibold' : 'link'}"`,
        `href="${escapeHtml(href)}"`,
        `hreflang="${locale.code}"`,
        `lang="${locale.code}"`,
        current ? 'aria-current="page"' : '',
        `>${escapeHtml(locale.label)}</a></li>`,
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

/**
 * The GA4 script tags, or nothing at all.
 *
 * The measurement ID travels on a data attribute rather than being
 * interpolated into executable code, which is what lets the CSP stay at a
 * plain `script-src 'self'` with no hashes and no 'unsafe-inline'.
 */
export function ga4Snippet(assetPrefix) {
  if (!GA4_ID) return '';
  return [
    `    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>`,
    `    <script src="${assetPrefix}assets/js/analytics.js" data-ga4-id="${GA4_ID}" defer></script>`,
  ].join('\n');
}

/**
 * The AdSense loader, or nothing at all.
 *
 * Like `ga4Snippet`, the id rides on a data attribute and the logic lives in
 * `assets/js/ads.js`, so `script-src` needs no hash and no 'unsafe-inline'.
 */
export function adsenseSnippet(assetPrefix) {
  if (!ADSENSE_ID) return '';
  return [
    `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}" crossorigin="anonymous"></script>`,
    `    <script src="${assetPrefix}assets/js/ads.js" data-adsense-id="${ADSENSE_ID}" defer></script>`,
  ].join('\n');
}

/**
 * One ad slot, or nothing at all.
 *
 * The wrapper reserves height before the advert loads. Without that the page
 * jumps when it arrives, which Google itself penalises as layout shift — and
 * which is worse than usual here, because the thing that moves is the article
 * someone is in the middle of reading.
 */
export function adSlot(label) {
  if (!ADSENSE_ID) return '';
  return [
    `      <aside class="ad-slot" data-ad-slot="${label}" aria-label="Advertisement">`,
    `        <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_ID}" data-ad-format="auto" data-full-width-responsive="true"></ins>`,
    '      </aside>',
  ].join('\n');
}

/** Relative prefix back to the site root from a page `depth` folders deep. */
export function assetPrefix(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

/** Fail the build rather than ship a page with an unresolved token. */
export function assertNoTokensLeft(html, label) {
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`[${label}] unreplaced tokens: ${[...new Set(leftover)].join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

const FAQ_NUMBERS = [1, 2, 3, 4, 5, 6];

export function faqEntries(dict) {
  return FAQ_NUMBERS.filter((n) => dict[`faq.q${n}`] && dict[`faq.a${n}`]).map((n) => ({
    question: dict[`faq.q${n}`],
    answer: dict[`faq.a${n}`],
  }));
}

export function appJsonLd({ locale, dict, canonical }) {
  const faqs = faqEntries(dict);

  const app = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: dict['app.name'],
    alternateName: dict['meta.title'],
    url: canonical,
    description: dict['meta.description'],
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any browser',
    browserRequirements: 'Requires JavaScript',
    inLanguage: locale.code,
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    image: `${SITE_URL}/${OG_IMAGE_PATH}`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [dict['tab.age'], dict['tab.diff'], dict['tab.zones'], dict['tab.countdown']],
    permissions: 'none',
    storageRequirements: 'Local browser storage only',
  };

  const blocks = [app];

  if (faqs.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: locale.code,
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  return escapeJsonForScript(JSON.stringify(blocks));
}

export function landingJsonLd({ locale, dict, canonical, name, description, faqs = [] }) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: dict['app.name'],
        item: absoluteUrl(locale.dir),
      },
      { '@type': 'ListItem', position: 2, name, item: canonical },
    ],
  };

  const page = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: canonical,
    inLanguage: locale.code,
    isPartOf: { '@type': 'WebSite', name: dict['app.name'], url: absoluteUrl(locale.dir) },
  };

  const blocks = [breadcrumb, page];

  if (faqs.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: locale.code,
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  return escapeJsonForScript(JSON.stringify(blocks));
}

export { LOCALES, DEFAULT_LOCALE, SITE_URL, GA4_ID, OG_IMAGE_PATH, BUILD_YEAR, absoluteUrl };
