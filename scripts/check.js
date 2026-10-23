/**
 * Pre-deploy integrity check.
 *
 * Everything here is a rule the build itself cannot enforce: parity between
 * seven hand-written dictionaries, URL uniqueness across three programmatic
 * page families, and the invariants the deploy depends on — relative asset
 * paths, no inline script, a CSP that matches what the pages actually load.
 *
 *   npm run check          # sources, plus built output when it exists
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES, DEFAULT_LOCALE, GA4_ID, SITE_URL, absoluteUrl } from './site.config.js';
import {
  allLandingPages,
  alternatesFor,
  TOOL_PAGES,
  TOOL_MODE,
  COLORS,
  FORMATS,
  USE_CASES,
} from './landing-pages.js';
import { ROOT, APP_RUNTIME_PREFIXES } from './render-utils.js';
import { parseHex } from '../assets/js/color.js';
import { DEFAULT_SETTINGS } from '../assets/js/engine.js';

const failures = [];
const notes = [];

function fail(group, message) {
  failures.push(`${group}: ${message}`);
}

/** Print a section's summary line, or say how many problems it found. */
function done(before, message) {
  const found = failures.length - before;
  if (found === 0) console.log(`  ok   ${message}`);
  else console.log(`  FAIL ${found} problem${found === 1 ? '' : 's'} — listed below`);
}

function note(message) {
  notes.push(message);
  console.log(`  note ${message}`);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

// ---------------------------------------------------------------------------
// 1. Locale configuration
// ---------------------------------------------------------------------------

function checkLocales() {
  console.log('\nlocales');
  const before = failures.length;
  const codes = new Set();
  const dirs = new Set();

  for (const locale of LOCALES) {
    if (codes.has(locale.code)) fail('locales', `duplicate code "${locale.code}"`);
    codes.add(locale.code);

    if (dirs.has(locale.dir)) fail('locales', `duplicate subfolder "${locale.dir || '(root)'}"`);
    dirs.add(locale.dir);

    const isDefault = locale.code === DEFAULT_LOCALE;
    if (isDefault && locale.dir !== '') fail('locales', `default locale must live at the root, got "${locale.dir}"`);
    if (!isDefault && locale.dir !== locale.code) {
      fail('locales', `"${locale.code}" should use subfolder "${locale.code}", got "${locale.dir}"`);
    }
    if (locale.dir_attr !== 'ltr' && locale.dir_attr !== 'rtl') {
      fail('locales', `"${locale.code}" has dir_attr "${locale.dir_attr}"`);
    }
    if (!/^[a-z]{2}_[A-Z]{2}$/.test(locale.ogLocale)) {
      fail('locales', `"${locale.code}" has a malformed og:locale "${locale.ogLocale}"`);
    }
  }

  if (!codes.has(DEFAULT_LOCALE)) fail('locales', `default locale "${DEFAULT_LOCALE}" is not in the list`);
  done(before, `${LOCALES.length} locales, ${LOCALES.filter((l) => l.dir_attr === 'rtl').length} right-to-left`);
}

// ---------------------------------------------------------------------------
// 2. Dictionaries
// ---------------------------------------------------------------------------

async function checkDictionaries() {
  console.log('\ndictionaries');
  const before = failures.length;
  const dicts = new Map();

  for (const locale of LOCALES) {
    const file = path.join(ROOT, 'assets', 'i18n', `${locale.code}.json`);
    if (!(await exists(file))) {
      fail('i18n', `missing ${locale.code}.json`);
      continue;
    }
    try {
      dicts.set(locale.code, JSON.parse(await readFile(file, 'utf8')));
    } catch (err) {
      fail('i18n', `${locale.code}.json is not valid JSON — ${err.message}`);
    }
  }

  const base = dicts.get(DEFAULT_LOCALE);
  if (!base) {
    fail('i18n', `the base dictionary ${DEFAULT_LOCALE}.json could not be read`);
    return dicts;
  }

  const baseKeys = Object.keys(base);

  for (const [code, dict] of dicts) {
    if (code === DEFAULT_LOCALE) continue;

    const missing = baseKeys.filter((key) => !Object.hasOwn(dict, key));
    const extra = Object.keys(dict).filter((key) => !Object.hasOwn(base, key));
    const empty = Object.keys(dict).filter((key) => !String(dict[key]).trim());
    const drift = baseKeys.filter(
      (key) => Object.hasOwn(dict, key) && placeholders(base[key]).join() !== placeholders(dict[key]).join(),
    );

    if (missing.length) fail('i18n', `${code} is missing ${missing.length} keys: ${missing.slice(0, 5).join(', ')}`);
    if (extra.length) fail('i18n', `${code} has ${extra.length} keys English does not: ${extra.slice(0, 5).join(', ')}`);
    if (empty.length) fail('i18n', `${code} has empty values: ${empty.slice(0, 5).join(', ')}`);
    for (const key of drift.slice(0, 5)) {
      fail(
        'i18n',
        `${code}.${key} placeholders {${placeholders(dict[key]).join(',')}} do not match en {${placeholders(base[key]).join(',')}}`,
      );
    }
  }

  // A translation identical to English is legitimate for city names and some
  // proper nouns, but a high rate elsewhere means a file was copied and never
  // translated. Reported, never fatal.
  for (const [code, dict] of dicts) {
    if (code === DEFAULT_LOCALE) continue;
    const prose = baseKeys.filter((key) => !key.startsWith('city.') && typeof base[key] === 'string');
    const same = prose.filter((key) => dict[key] === base[key]);
    if (same.length > prose.length * 0.1) {
      note(`${code}: ${same.length}/${prose.length} prose strings are identical to English`);
    }
  }

  done(before, `${dicts.size} dictionaries, ${baseKeys.length} keys each`);
  return dicts;
}

// ---------------------------------------------------------------------------
// 3. Template tokens resolve in every locale
// ---------------------------------------------------------------------------

async function checkTemplateTokens(dicts) {
  console.log('\ntemplates');
  const before = failures.length;
  const files = [];

  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.html')) files.push(full);
    }
  }
  await walk(path.join(ROOT, 'src'));

  const used = new Set();
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/\{\{t\.([A-Za-z0-9_.]+)\}\}/g)) used.add(match[1]);
  }

  for (const [code, dict] of dicts) {
    const missing = [...used].filter((key) => !Object.hasOwn(dict, key));
    if (missing.length) fail('templates', `${code} cannot render ${missing.join(', ')}`);
  }

  done(before, `${files.length} templates reference ${used.size} dictionary keys, all present in all locales`);
}


/**
 * Every key the running app looks up must survive into the inlined subset.
 *
 * The page bakes most strings into its markup, but anything built at runtime —
 * an error, a status line, a warning — is fetched by key from a trimmed
 * dictionary. If a key falls outside the prefix list it silently renders as
 * the key itself, which looks like a missing translation rather than a bug and
 * is easy to ship. This caught exactly that: the prefix list had been copied
 * from a different project and covered four of the fifteen groups in use.
 */
async function checkRuntimeKeys(dicts) {
  console.log('\nruntime keys');
  const before = failures.length;

  const sources = await readdir(path.join(ROOT, 'assets', 'js'));
  const used = new Set();
  const dynamic = new Set();

  for (const file of sources) {
    if (!file.endsWith('.js')) continue;
    const code = await readFile(path.join(ROOT, 'assets', 'js', file), 'utf8');

    for (const match of code.matchAll(/\bt\(\s*'([A-Za-z0-9_.-]+)'/g)) used.add(match[1]);
    // Keys assembled at runtime, e.g. `warn.${name}`. These are usually
    // built into a variable before they reach t(), so the scan looks for
    // any template literal shaped like a dictionary key rather than only
    // direct arguments — the narrower version silently found nothing.
    for (const match of code.matchAll(/`([a-z][A-Za-z0-9_-]*\.)\$\{/g)) {
      dynamic.add(match[1]);
    }
  }

  const covered = (key) => APP_RUNTIME_PREFIXES.some((prefix) => key.startsWith(prefix));

  for (const key of used) {
    if (!covered(key)) fail('runtime', `t('${key}') is not covered by APP_RUNTIME_PREFIXES`);
  }
  for (const prefix of dynamic) {
    if (!APP_RUNTIME_PREFIXES.includes(prefix)) {
      fail('runtime', `keys built as t(\`${prefix}…\`) need "${prefix}" in APP_RUNTIME_PREFIXES`);
    }
  }

  // And the keys themselves must exist in every dictionary.
  for (const [code, dict] of dicts) {
    const missing = [...used].filter((key) => !Object.hasOwn(dict, key));
    if (missing.length) fail('runtime', `${code} lacks ${missing.slice(0, 5).join(', ')}`);
  }

  done(before, `${used.size} runtime keys across ${dynamic.size} dynamic groups, all shipped and translated`);
}

// ---------------------------------------------------------------------------
// 4. Zone data
// ---------------------------------------------------------------------------

function checkLandingData() {
  console.log('\nlanding data');
  const before = failures.length;

  const colourIds = new Set();
  for (const color of COLORS) {
    if (colourIds.has(color.id)) fail('data', `duplicate colour id "${color.id}"`);
    colourIds.add(color.id);

    if (!/^[a-z0-9-]+$/.test(color.id)) fail('data', `colour id "${color.id}" is not URL-safe`);
    if (!parseHex(color.hex)) fail('data', `colour "${color.id}" has an unparseable hex "${color.hex}"`);
    if (!Number.isInteger(color.tolerance) || color.tolerance < 1 || color.tolerance > 99) {
      fail('data', `colour "${color.id}" recommends an out-of-range tolerance ${color.tolerance}`);
    }
    if (!['neutral', 'near-neutral', 'saturated', 'muted', 'dark'].includes(color.trait)) {
      fail('data', `colour "${color.id}" has an unknown trait "${color.trait}"`);
    }
  }

  // Two colours with the same hex would be two pages making the same claim.
  const hexes = new Set();
  for (const color of COLORS) {
    const key = color.hex.toLowerCase();
    if (hexes.has(key)) fail('data', `two colours share the hex ${key}`);
    hexes.add(key);
  }

  const formatIds = new Set();
  for (const format of FORMATS) {
    if (formatIds.has(format.id)) fail('data', `duplicate format id "${format.id}"`);
    formatIds.add(format.id);
    if (!/^[a-z0-9]+$/.test(format.id)) fail('data', `format id "${format.id}" is not URL-safe`);
    if (![true, false, 'binary'].includes(format.alpha)) {
      fail('data', `format "${format.id}" has an invalid alpha flag`);
    }
  }

  const useIds = new Set();
  for (const useCase of USE_CASES) {
    if (useIds.has(useCase.id)) fail('data', `duplicate use-case id "${useCase.id}"`);
    useIds.add(useCase.id);

    if (!/^[a-z0-9-]+$/.test(useCase.id)) fail('data', `use-case id "${useCase.id}" is not URL-safe`);
    // A recommended mode the engine does not implement would send a reader to
    // a setting that silently does nothing.
    if (!['auto', 'color', 'chroma'].includes(useCase.mode)) {
      fail('data', `use case "${useCase.id}" recommends an unknown mode "${useCase.mode}"`);
    }
    if (!Number.isInteger(useCase.tolerance) || useCase.tolerance < 1 || useCase.tolerance > 99) {
      fail('data', `use case "${useCase.id}" recommends an out-of-range tolerance ${useCase.tolerance}`);
    }
    if (typeof useCase.contiguous !== 'boolean') {
      fail('data', `use case "${useCase.id}" has a non-boolean contiguity flag`);
    }
  }

  for (const tool of TOOL_PAGES) {
    if (!TOOL_MODE[tool]) fail('data', `tool page "${tool}" has no mode mapping`);
  }

  // The engine's own defaults must stay inside the ranges the UI offers, or a
  // fresh visitor starts outside the slider.
  if (DEFAULT_SETTINGS.tolerance < 0 || DEFAULT_SETTINGS.tolerance > 100) {
    fail('data', `the default tolerance ${DEFAULT_SETTINGS.tolerance} is outside the slider range`);
  }

  done(
    before,
    `${COLORS.length} colours, ${FORMATS.length} formats, ${USE_CASES.length} use cases, ${TOOL_PAGES.length} tools`,
  );
}

// ---------------------------------------------------------------------------
// 5. Landing page URLs
// ---------------------------------------------------------------------------

function checkLandingPages() {
  console.log('\nlanding pages');
  const before = failures.length;
  const pages = allLandingPages();
  const byPath = new Map();
  const groups = new Map();

  for (const page of pages) {
    if (byPath.has(page.urlPath)) {
      fail('landing', `two pages claim /${page.urlPath}/ (${byPath.get(page.urlPath).key} and ${page.key})`);
    }
    byPath.set(page.urlPath, page);

    if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(page.urlPath)) {
      fail('landing', `/${page.urlPath}/ is not a clean lowercase slug`);
    }
    if (page.urlPath !== encodeURI(page.urlPath)) {
      fail('landing', `/${page.urlPath}/ needs percent-encoding`);
    }

    if (!groups.has(page.key)) groups.set(page.key, []);
    groups.get(page.key).push(page);
  }

  for (const [key, group] of groups) {
    if (group.length !== LOCALES.length) {
      fail('landing', `"${key}" exists in ${group.length} locales, expected ${LOCALES.length}`);
    }
    if (new Set(group.map((p) => p.locale.code)).size !== group.length) {
      fail('landing', `"${key}" has two pages for one locale`);
    }
  }

  // alternatesFor() is what the hreflang tags are built from, so it has to
  // agree with the pages the build actually writes or a tag points at a 404.
  for (const page of pages) {
    for (const alt of alternatesFor(page)) {
      if (!byPath.has(alt.urlPath)) {
        fail('landing', `/${page.urlPath}/ declares an alternate /${alt.urlPath}/ that is never built`);
      }
    }
  }

  const expected = (TOOL_PAGES.length + COLORS.length + FORMATS.length + USE_CASES.length) * LOCALES.length;
  if (pages.length !== expected) {
    fail('landing', `expected ${expected} landing pages, the generator produced ${pages.length}`);
  }

  done(before, `${pages.length} landing pages in ${groups.size} hreflang groups, all unique`);
}

// ---------------------------------------------------------------------------
// 6. Built output
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', 'src', 'scripts', 'docs', 'marketing', 'assets', '.git', '.wrangler']);

async function findBuiltPages(dir = ROOT, prefix = '') {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === 'index.html')) found.push(prefix);
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    found.push(...(await findBuiltPages(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)));
  }
  return found;
}

/** Script types the browser executes; anything else is an inert data block. */
const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

function isDataBlock(attrs) {
  const type = attrs.match(/\btype\s*=\s*"([^"]*)"/)?.[1];
  if (type === undefined) return false; // no type attribute: a classic script
  return !EXECUTABLE_TYPES.has(type.trim().toLowerCase());
}

const LOCALE_BY_DIR = new Map(LOCALES.filter((l) => l.dir).map((l) => [l.dir, l]));
const DEFAULT = LOCALES.find((l) => l.code === DEFAULT_LOCALE);

async function checkBuiltOutput() {
  console.log('\nbuilt output');
  const before = failures.length;

  if (!(await exists(path.join(ROOT, 'index.html')))) {
    note('no build found — run npm run build, then check again for the deploy-time rules');
    return;
  }

  const pages = await findBuiltPages();
  const assetCache = new Map();
  let inlineScripts = 0;
  let absoluteRefs = 0;
  let brokenRefs = 0;

  for (const urlPath of pages) {
    const html = await readFile(path.join(ROOT, urlPath, 'index.html'), 'utf8');
    const label = `/${urlPath}${urlPath ? '/' : ''}`;

    // An inline script would force a CSP hash onto every page carrying it,
    // which is exactly the failure mode this build is designed to avoid. A
    // data block is not one: a <script> whose type is not a JavaScript MIME
    // type never executes, so script-src does not apply to it. That is what
    // carries the JSON-LD and the runtime dictionary.
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (isDataBlock(attrs)) continue;
      if (!/\bsrc\s*=/.test(attrs) && body.trim()) {
        inlineScripts += 1;
        if (inlineScripts <= 3) fail('build', `${label} has an inline <script${attrs}>`);
      }
    }

    // A root-relative asset path works on the production domain and nowhere
    // else: not in a preview deploy served under a prefix, and not when the
    // build is opened from disk.
    for (const [, ref] of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|data:|#)/.test(ref)) continue;

      if (ref.startsWith('/')) {
        absoluteRefs += 1;
        if (absoluteRefs <= 3) fail('build', `${label} references "${ref}" from the server root`);
        continue;
      }

      const clean = ref.split('?')[0].split('#')[0];
      if (!clean || !/\.[a-z0-9]+$/i.test(clean)) continue; // a page link, not an asset

      const resolved = path.resolve(path.join(ROOT, urlPath), clean);
      if (!assetCache.has(resolved)) assetCache.set(resolved, await exists(resolved));
      if (!assetCache.get(resolved)) {
        brokenRefs += 1;
        if (brokenRefs <= 5) fail('build', `${label} references "${ref}", which does not exist`);
      }
    }

    // lang and dir must match the folder the page was written into.
    const segments = urlPath ? urlPath.split('/') : [];
    const locale = LOCALE_BY_DIR.get(segments[0]) ?? DEFAULT;
    const lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1];
    const dir = html.match(/<html[^>]*\bdir="([^"]+)"/)?.[1];
    if (lang !== locale.code) fail('build', `${label} declares lang="${lang}", expected "${locale.code}"`);
    if (dir !== locale.dir_attr) fail('build', `${label} declares dir="${dir}", expected "${locale.dir_attr}"`);

    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
    if (canonical !== absoluteUrl(urlPath)) {
      fail('build', `${label} canonical is "${canonical}", expected "${absoluteUrl(urlPath)}"`);
    }

    const hreflangs = [...html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"/g)].map((m) => m[1]);
    if (hreflangs.length !== LOCALES.length + 1) {
      fail('build', `${label} has ${hreflangs.length} hreflang tags, expected ${LOCALES.length + 1}`);
    }
    if (!hreflangs.includes('x-default')) fail('build', `${label} has no x-default hreflang`);

    if (!/<meta[^>]+name="description"[^>]+content="[^"]{50,}"/.test(html)) {
      fail('build', `${label} has no usable meta description`);
    }
    if (!/<meta[^>]+property="og:image"/.test(html)) fail('build', `${label} has no og:image`);
    if (!/application\/ld\+json/.test(html)) fail('build', `${label} ships no structured data`);
  }

  done(before, `${pages.length} built pages: lang, canonical, hreflang, structured data and asset paths all verified`);
}

// ---------------------------------------------------------------------------
// 7. Sitemap, robots and headers
// ---------------------------------------------------------------------------

async function checkSitemapAndHeaders() {
  console.log('\nsitemap and headers');
  const before = failures.length;

  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (!(await exists(sitemapPath))) {
    note('no sitemap.xml yet — it is written by npm run build');
    return;
  }

  const xml = await readFile(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const built = await findBuiltPages();

  if (locs.length !== built.length) {
    fail('sitemap', `lists ${locs.length} URLs but ${built.length} pages were built`);
  }
  if (new Set(locs).size !== locs.length) fail('sitemap', 'contains duplicate <loc> entries');

  const expected = new Set(built.map((p) => absoluteUrl(p)));
  for (const loc of locs) {
    if (!expected.has(loc)) fail('sitemap', `lists ${loc}, which was not built`);
  }
  for (const [, lastmod] of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fail('sitemap', `malformed lastmod "${lastmod}"`);
  }
  if (!xml.includes('xmlns:xhtml')) fail('sitemap', 'declares hreflang alternates without the xhtml namespace');

  const robotsPath = path.join(ROOT, 'robots.txt');
  if (await exists(robotsPath)) {
    const robots = await readFile(robotsPath, 'utf8');
    if (!robots.includes(`${SITE_URL}/sitemap.xml`)) fail('robots', 'does not point at the sitemap');
  } else {
    fail('robots', 'robots.txt was not written');
  }

  const headersPath = path.join(ROOT, '_headers');
  if (await exists(headersPath)) {
    const headers = await readFile(headersPath, 'utf8');
    const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? '';

    if (/script-src[^;]*'unsafe-inline'/.test(csp)) fail('headers', "script-src allows 'unsafe-inline'");
    // 'wasm-unsafe-eval' is expected and narrow; plain 'unsafe-eval' is not,
    // and the two are easy to confuse when editing the policy by hand.
    if (/script-src[^;]*[^-]'unsafe-eval'/.test(csp)) fail('headers', "script-src allows 'unsafe-eval'");
    if (!/script-src[^;]*'wasm-unsafe-eval'/.test(csp)) {
      fail('headers', "script-src is missing 'wasm-unsafe-eval', which the AI mode needs");
    }
    if (/script-src[^;]*sha256-/.test(csp)) {
      fail('headers', 'script-src carries a hash, which means an inline script crept back in');
    }

    const allowsGa = csp.includes('googletagmanager.com');
    if (GA4_ID && !allowsGa) fail('headers', 'a GA4 ID is set but the CSP does not allow googletagmanager.com');
    if (!GA4_ID && allowsGa) fail('headers', 'the CSP allows googletagmanager.com with no GA4 ID configured');

    // worker-src is in this list because the segmentation engine runs in a
    // worker: without it the app silently does nothing on a strict browser.
    for (const directive of ['default-src', 'frame-ancestors', 'base-uri', 'object-src', 'form-action', 'worker-src']) {
      if (!csp.includes(directive)) fail('headers', `CSP is missing ${directive}`);
    }
  } else {
    fail('headers', '_headers was not written');
  }

  done(before, `${locs.length} sitemap URLs match the build; CSP has no hashes and no 'unsafe-inline'`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`check — ${LOCALES.length} locales, site ${SITE_URL}`);

  checkLocales();
  const dicts = await checkDictionaries();
  await checkTemplateTokens(dicts);
  await checkRuntimeKeys(dicts);
  checkLandingData();
  checkLandingPages();
  await checkBuiltOutput();
  await checkSitemapAndHeaders();

  console.log('');
  if (failures.length) {
    console.error(`FAILED — ${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check passed${notes.length ? ` with ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}.`);
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exitCode = 1;
});
