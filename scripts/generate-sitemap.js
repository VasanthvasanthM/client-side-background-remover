/**
 * Generates sitemap.xml, robots.txt and _headers.
 *
 * URLs are discovered by walking the built output for index.html files rather
 * than from a hardcoded list, so the sitemap is structurally incapable of
 * advertising a page that 404s. Translations are grouped by a logical key
 * because localized slugs differ — /age-calculator/ and
 * /es/calculadora-de-edad/ are the same page and must declare each other.
 *
 *   node scripts/generate-sitemap.js
 */

import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES, DEFAULT_LOCALE, SITE_URL, GA4_ID, USING_PLACEHOLDER_URL, absoluteUrl } from './site.config.js';
import { allLandingPages } from './landing-pages.js';
import { ROOT } from './render-utils.js';

/** Source and tooling directories, never deployed output. */
const SKIP_DIRS = new Set([
  'node_modules',
  'src',
  'scripts',
  'docs',
  'marketing',
  'assets',
  '.git',
  '.github',
  '.wrangler',
]);

const LOCALE_BY_DIR = new Map(LOCALES.filter((l) => l.dir).map((l) => [l.dir, l]));
const DEFAULT = LOCALES.find((l) => l.code === DEFAULT_LOCALE);

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Every directory containing an index.html, as a '/'-joined relative path. */
async function findPages(dir = ROOT, prefix = '') {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === 'index.html')) found.push(prefix);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    found.push(...(await findPages(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)));
  }
  return found;
}

async function lastModified(urlPath) {
  const info = await stat(path.join(ROOT, urlPath, 'index.html'));
  return info.mtime.toISOString().slice(0, 10);
}

/** urlPath -> { key, locale, priority }, from the generators that own them. */
function buildPageIndex() {
  const index = new Map();

  for (const locale of LOCALES) {
    index.set(locale.dir, { key: 'home', locale, priority: '1.0' });
  }
  for (const page of allLandingPages()) {
    index.set(page.urlPath, {
      key: page.key,
      locale: page.locale,
      // Tool pages describe the product; the generated families are long tail.
      priority: page.kind === 'tool' ? '0.8' : '0.6',
    });
  }
  return index;
}

function inferFromPath(urlPath) {
  const segments = urlPath ? urlPath.split('/') : [];
  const locale = LOCALE_BY_DIR.get(segments[0]);
  if (locale) return { key: `path:${segments.slice(1).join('/')}`, locale, priority: '0.5' };
  return { key: `path:${segments.join('/')}`, locale: DEFAULT, priority: '0.5' };
}

function urlEntry(entry, group) {
  const lines = [
    '  <url>',
    `    <loc>${escapeXml(absoluteUrl(entry.urlPath))}</loc>`,
    `    <lastmod>${entry.lastmod}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    `    <priority>${entry.priority}</priority>`,
  ];

  for (const alt of group) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${alt.locale.code}" href="${escapeXml(absoluteUrl(alt.urlPath))}" />`,
    );
  }
  const fallback = group.find((alt) => alt.locale.code === DEFAULT_LOCALE);
  if (fallback) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(fallback.urlPath))}" />`,
    );
  }

  lines.push('  </url>');
  return lines.join('\n');
}

/**
 * Cloudflare Pages headers.
 *
 * The CSP is a plain `script-src 'self'` with no hashes and no
 * 'unsafe-inline', which is possible because the page ships no inline script
 * at all — the pre-paint theme setter and the analytics config are both files,
 * and the measurement ID reaches its script on a data attribute. Analytics
 * origins appear only when a measurement ID was supplied at build time.
 */
function headersFile() {
  // 'wasm-unsafe-eval' is required by the optional AI mode: instantiating a
  // WebAssembly module counts as eval under CSP, and there is no narrower
  // token for it. It permits WebAssembly only — not eval(), not
  // new Function(), not inline script — so it is a far smaller concession
  // than 'unsafe-eval', which this policy still refuses.
  const scriptSrc = ["'self'", "'wasm-unsafe-eval'", GA4_ID ? 'https://www.googletagmanager.com' : '']
    .filter(Boolean)
    .join(' ');
  const connectSrc = [
    "'self'",
    GA4_ID ? 'https://www.google-analytics.com' : '',
    GA4_ID ? 'https://*.analytics.google.com' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Style attributes are set from JS on the progress and grid elements.
    "style-src 'self' 'unsafe-inline'",
    // blob: is required, not optional: the <img> decode fallback loads the
    // chosen file through URL.createObjectURL, and browsers do not treat a
    // blob: URL as matching 'self'. Without it, image loading fails on every
    // browser that takes that path.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    // The segmentation runs in a module worker. worker-src would otherwise
    // fall back through child-src to script-src, which browsers have not
    // always agreed on — stating it removes the ambiguity.
    "worker-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  return `# Generated by scripts/generate-sitemap.js — edit that, not this file.

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${csp}

# Versioned by a ?v= query that changes whenever the bytes do.
/assets/css/*
  Cache-Control: public, max-age=31536000, immutable

# Not content-hashed — ES module specifiers are plain relative paths — so these
# revalidate instead. A 304 costs one round trip and keeps deploys instant.
/assets/js/*
  Cache-Control: public, max-age=300, must-revalidate

# The model and the WASM runtime are large and versioned by filename, so
# they are cached as hard as the stylesheet. A visitor pays for them once.
/assets/model/*
  Cache-Control: public, max-age=31536000, immutable

/assets/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/assets/i18n/*
  Cache-Control: public, max-age=3600, must-revalidate

/assets/og/*
  Cache-Control: public, max-age=604800

/assets/icon/*
  Cache-Control: public, max-age=604800

# HTML always revalidates, so a fix reaches visitors on their next navigation.
/*.html
  Cache-Control: public, max-age=0, must-revalidate

/
  Cache-Control: public, max-age=0, must-revalidate
`;
}

async function main() {
  if (USING_PLACEHOLDER_URL) {
    console.warn(
      `! SITE_URL is not set — the sitemap will list ${SITE_URL} URLs.\n` +
        '  Set SITE_URL to your real domain before submitting to Search Console.',
    );
  }

  const index = buildPageIndex();
  const found = await findPages();

  const groups = new Map();
  for (const urlPath of found) {
    const meta = index.get(urlPath) ?? inferFromPath(urlPath);
    const lastmod = await lastModified(urlPath);
    if (!groups.has(meta.key)) groups.set(meta.key, []);
    groups.get(meta.key).push({ urlPath, locale: meta.locale, lastmod, priority: meta.priority });
  }

  // Home first, then the tool pages, then each generated family alphabetically.
  const ORDER = ['tool:', 'color:', 'format:', 'use:'];
  const rank = (key) => {
    if (key === 'home') return 0;
    const index = ORDER.findIndex((prefix) => key.startsWith(prefix));
    return index === -1 ? ORDER.length + 1 : index + 1;
  };
  const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const entries = [];
  for (const key of keys) {
    const group = groups.get(key).sort((a, b) => LOCALES.indexOf(a.locale) - LOCALES.indexOf(b.locale));
    for (const entry of group) entries.push(urlEntry(entry, group));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Dictionaries hold no crawlable content; the pages already carry the text.',
    'Disallow: /assets/i18n/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
  await writeFile(path.join(ROOT, 'robots.txt'), robots, 'utf8');

  await writeFile(path.join(ROOT, '_headers'), headersFile(), 'utf8');

  const orphans = keys.filter((key) => key.startsWith('path:') && key !== 'path:');
  console.log(`build:sitemap — ${entries.length} URLs across ${groups.size} page groups`);
  const family = (prefix) => keys.filter((key) => key.startsWith(prefix)).length;
  console.log(
    `  home ${groups.get('home')?.length ?? 0} · tools ${family('tool:')} · colours ${family('color:')}` +
      ` · formats ${family('format:')} · use cases ${family('use:')}`,
  );
  console.log(`  _headers written${GA4_ID ? ' with analytics origins' : ' (no analytics)'}`);
  if (orphans.length) console.log(`  ungrouped paths: ${orphans.join(', ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
