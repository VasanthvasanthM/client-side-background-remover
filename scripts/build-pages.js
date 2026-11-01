/**
 * Renders src/page.html into one static suite page per locale.
 *
 * Each page ships its translations already in the markup, so crawlers and
 * no-JS visitors see real text, with the runtime subset of the dictionary
 * inlined as JSON so the tools can label DOM they build themselves without a
 * second request.
 *
 *   node scripts/build-pages.js
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES, DEFAULT_LOCALE, BUILD_YEAR, absoluteUrl, USING_PLACEHOLDER_URL, SITE_URL } from './site.config.js';
import {
  TOOL_PAGES,
  COLORS,
  FORMATS,
  USE_CASES,
  toolSlug,
  colorSlug,
  formatSlug,
  useCaseSlug,
} from './landing-pages.js';
import {
  ROOT,
  OG_IMAGE_PATH,
  cssVersion,
  escapeHtml,
  escapeJsonForScript,
  loadDictionary,
  applyTranslationTokens,
  fill,
  hreflangTags,
  ogAlternates,
  langLinks,
  langOptions,
  footerLangs,
  ga4Snippet,
  assetPrefix,
  assertNoTokensLeft,
  appJsonLd,
  runtimeDict,
  APP_RUNTIME_PREFIXES,
  faqEntries,
} from './render-utils.js';

const SRC = path.join(ROOT, 'src');

/** Links from the suite page into each tool's own landing page. */
function toolLinks(locale, dict) {
  return TOOL_PAGES.map(
    (tool) =>
      `          <a class="badge" href="./${escapeHtml(toolSlug(tool, locale.code))}/">${escapeHtml(dict[`tool.${tool}.name`])}</a>`,
  ).join('\n');
}

/**
 * Links into the colour pages.
 *
 * Every colour gets one: there are only eighteen, and "remove white
 * background" is the single highest-intent query the tool serves.
 */
function colorLinks(locale, dict) {
  return COLORS.map(
    (color) =>
      `          <a class="badge" href="./${escapeHtml(colorSlug(color, locale.code))}/">` +
      `<span class="h-3 w-3 rounded-full ring-1 ring-ink-300 dark:ring-ink-600" style="background:${color.hex}" aria-hidden="true"></span>` +
      `${escapeHtml(dict[`color.${color.id}`])}</a>`,
  ).join('\n');
}

function formatLinks(locale) {
  return FORMATS.map(
    (format) =>
      `          <a class="badge" href="./${escapeHtml(formatSlug(format, locale.code))}/">${escapeHtml(format.label)} &rarr; PNG</a>`,
  ).join('\n');
}

/**
 * Use-case links, capped at twelve.
 *
 * The home page is an index, not a sitemap: listing all twenty-four dilutes
 * the ones that matter and pushes the tool itself below the fold.
 */
function useCaseLinks(locale, dict) {
  return USE_CASES.slice(0, 12)
    .map(
      (useCase) =>
        `          <a class="badge" href="./${escapeHtml(useCaseSlug(useCase, locale.code))}/">${escapeHtml(dict[`use.${useCase.id}.name`])}</a>`,
    )
    .join('\n');
}

function footerToolLinks(locale, dict) {
  return TOOL_PAGES.map(
    (tool) =>
      `              <li><a class="link" href="./${escapeHtml(toolSlug(tool, locale.code))}/">${escapeHtml(dict[`tool.${tool}.name`])}</a></li>`,
  ).join('\n');
}

function faqItems(dict) {
  return faqEntries(dict)
    .map((faq) =>
      [
        '          <details class="card">',
        '            <summary class="cursor-pointer px-4 py-3 text-sm font-semibold">',
        `              ${escapeHtml(faq.question)}`,
        '            </summary>',
        `            <p class="border-t border-ink-200 px-4 py-3 text-sm leading-relaxed text-ink-600 dark:border-ink-800 dark:text-ink-300">${escapeHtml(faq.answer)}</p>`,
        '          </details>',
      ].join('\n'),
    )
    .join('\n');
}

async function buildLocale({ page, header, footer, cssV }) {
  const results = [];

  for (const locale of LOCALES) {
    const dict = await loadDictionary(locale.code);
    const prefix = assetPrefix(locale.dir ? 1 : 0);
    const canonical = absoluteUrl(locale.dir);

    const targets = LOCALES.map((target) => ({
      locale: target,
      href: target.dir ? `${prefix}${target.dir}/` : prefix,
    }));

    let html = page
      .replace('{{HEADER}}', header.trimEnd())
      .replace('{{FOOTER}}', footer.trimEnd());

    html = applyTranslationTokens(html, dict, locale.code);

    const replacements = {
      '{{LANG}}': locale.code,
      '{{DIR}}': locale.dir_attr,
      '{{CANONICAL}}': escapeHtml(canonical),
      '{{OG_IMAGE}}': escapeHtml(`${SITE_URL}/${OG_IMAGE_PATH}`),
      '{{OG_LOCALE}}': locale.ogLocale,
      '{{OG_ALTERNATES}}': ogAlternates(locale.code),
      '{{HREFLANG}}': hreflangTags(
        LOCALES.map((target) => ({ code: target.code, url: absoluteUrl(target.dir) })),
        absoluteUrl(LOCALES.find((l) => l.code === DEFAULT_LOCALE).dir),
      ),
      '{{ASSET_PREFIX}}': prefix,
      '{{HOME_HREF}}': prefix,
      '{{LEGAL_BASE}}': './',
      '{{CSS_VERSION}}': cssV,
      '{{JSONLD}}': appJsonLd({ locale, dict, canonical }),
      '{{GA4}}': ga4Snippet(prefix),
      '{{LANG_LINKS}}': langLinks(targets, locale.code),
      '{{LANG_OPTIONS}}': langOptions(targets, locale.code),
      '{{FOOTER_LANGS}}': footerLangs(targets, locale.code),
      '{{FOOTER_LINKS}}': footerToolLinks(locale, dict),
      '{{FAQ_ITEMS}}': faqItems(dict),
      '{{TOOL_LINKS}}': toolLinks(locale, dict),
      '{{COLOR_LINKS}}': colorLinks(locale, dict),
      '{{FORMAT_LINKS}}': formatLinks(locale),
      '{{USE_LINKS}}': useCaseLinks(locale, dict),
      '{{COPYRIGHT}}': fill(dict['foot.copyright'], { year: BUILD_YEAR, name: dict['app.name'] }),
      '{{I18N_DICT}}': escapeJsonForScript(JSON.stringify(runtimeDict(dict, APP_RUNTIME_PREFIXES))),
    };

    for (const [token, value] of Object.entries(replacements)) {
      html = html.replaceAll(token, value);
    }

    assertNoTokensLeft(html, locale.code);

    const outDir = locale.dir ? path.join(ROOT, locale.dir) : ROOT;
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), html, 'utf8');

    results.push({ locale, bytes: Buffer.byteLength(html), keys: Object.keys(dict).length });
  }

  return results;
}

async function main() {
  if (USING_PLACEHOLDER_URL) {
    console.warn(
      `! SITE_URL is not set — canonical and hreflang tags will point at ${SITE_URL}.\n` +
        '  Set SITE_URL to your real domain before deploying.',
    );
  }

  const [page, header, footer, cssV] = await Promise.all([
    readFile(path.join(SRC, 'page.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'header.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'footer.html'), 'utf8'),
    cssVersion(),
  ]);

  const results = await buildLocale({ page, header, footer, cssV });

  console.log(`build:pages — ${results.length} locales`);
  for (const result of results) {
    console.log(
      `  ${(result.locale.dir || '/').padEnd(4)} ${String(result.keys).padStart(4)} strings  ${(result.bytes / 1024).toFixed(1)} KB`,
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
