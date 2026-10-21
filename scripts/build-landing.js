/**
 * Renders src/landing.html into every programmatic landing page.
 *
 * Each page's body comes from landing-content.js, which computes its facts
 * from the same modules the app uses. The template only supplies the chrome,
 * the metadata and the internal links.
 *
 *   node scripts/build-landing.js
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { LOCALES, DEFAULT_LOCALE, BUILD_YEAR, absoluteUrl, USING_PLACEHOLDER_URL, SITE_URL } from './site.config.js';
import {
  allLandingPages,
  alternatesFor,
  TOOL_PAGES,
  COLORS,
  FORMATS,
  USE_CASES,
  toolSlug,
  colorSlug,
  formatSlug,
  useCaseSlug,
} from './landing-pages.js';
import { contentFor } from './landing-content.js';
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
  landingJsonLd,
  runtimeDict,
  LANDING_RUNTIME_PREFIXES,
} from './render-utils.js';

const SRC = path.join(ROOT, 'src');

/**
 * Related links for one page.
 *
 * Sibling pages of the same family, plus the tool pages, so every landing page
 * is two clicks from every other. Capped so the block stays a navigation aid
 * rather than a link dump.
 */
function relatedLinks(page, dict) {
  const links = [];
  const locale = page.locale.code;

  // Siblings first: someone on "remove white background" is far more likely
  // to want another colour than a different family entirely.
  if (page.kind === 'color') {
    for (const color of COLORS.filter((entry) => entry.id !== page.color.id).slice(0, 7)) {
      links.push([colorSlug(color, locale), dict[`color.${color.id}`]]);
    }
  }

  if (page.kind === 'format') {
    for (const format of FORMATS.filter((entry) => entry.id !== page.format.id).slice(0, 5)) {
      links.push([formatSlug(format, locale), `${format.label} → PNG`]);
    }
  }

  if (page.kind === 'useCase') {
    for (const useCase of USE_CASES.filter((entry) => entry.id !== page.useCase.id).slice(0, 7)) {
      links.push([useCaseSlug(useCase, locale), dict[`use.${useCase.id}.name`]]);
    }
  }

  for (const tool of TOOL_PAGES) {
    if (page.kind === 'tool' && tool === page.tool) continue;
    links.push([toolSlug(tool, locale), dict[`tool.${tool}.name`]]);
  }

  return links
    .slice(0, 12)
    .map(([slug, label]) => `          <a class="badge" href="../${escapeHtml(slug)}/">${escapeHtml(label)}</a>`)
    .join('\n');
}


async function main() {
  if (USING_PLACEHOLDER_URL) {
    console.warn(`! SITE_URL is not set — landing pages will point at ${SITE_URL}.`);
  }

  const [template, header, footer, cssV] = await Promise.all([
    readFile(path.join(SRC, 'landing.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'header.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'footer.html'), 'utf8'),
    cssVersion(),
  ]);

  const pages = allLandingPages();

  const dicts = new Map();
  for (const locale of LOCALES) dicts.set(locale.code, await loadDictionary(locale.code));

  let bytes = 0;
  const counts = {};

  for (const page of pages) {
    const dict = dicts.get(page.locale.code);
    const content = contentFor(page, dict);

    // Every landing page sits one segment below its locale root, so the
    // relative depth is the locale folder plus the page folder.
    const depth = page.urlPath.split('/').filter(Boolean).length;
    const prefix = assetPrefix(depth);
    const canonical = absoluteUrl(page.urlPath);
    const alternates = alternatesFor(page);

    const targets = alternates.map((alt) => ({
      locale: alt.locale,
      href: `${prefix}${alt.urlPath}/`,
    }));

    let html = template
      .replace('{{HEADER}}', header.trimEnd())
      .replace('{{FOOTER}}', footer.trimEnd());

    html = applyTranslationTokens(html, dict, page.locale.code);

    const replacements = {
      '{{LANG}}': page.locale.code,
      '{{DIR}}': page.locale.dir_attr,
      '{{CANONICAL}}': escapeHtml(canonical),
      '{{OG_IMAGE}}': escapeHtml(`${SITE_URL}/${OG_IMAGE_PATH}`),
      '{{OG_LOCALE}}': page.locale.ogLocale,
      '{{OG_ALTERNATES}}': ogAlternates(page.locale.code),
      '{{HREFLANG}}': hreflangTags(
        alternates.map((alt) => ({ code: alt.locale.code, url: absoluteUrl(alt.urlPath) })),
        absoluteUrl(alternates.find((alt) => alt.locale.code === DEFAULT_LOCALE).urlPath),
      ),
      '{{ASSET_PREFIX}}': prefix,
      // One level up from a landing page is its locale's home.
      '{{HOME_HREF}}': '../',
      '{{TOOL_HREF}}': `../${content.toolQuery}`,
      '{{CSS_VERSION}}': cssV,
      '{{PAGE_TITLE}}': escapeHtml(content.title),
      '{{PAGE_DESCRIPTION}}': escapeHtml(content.description),
      '{{PAGE_H1}}': escapeHtml(content.h1),
      '{{BREADCRUMB}}': escapeHtml(content.h1),
      '{{PAGE_BODY}}': content.body,
      '{{JSONLD}}': landingJsonLd({
        locale: page.locale,
        dict,
        canonical,
        name: content.h1,
        description: content.description,
        faqs: content.faqs,
      }),
      '{{GA4}}': ga4Snippet(prefix),
      '{{LANG_LINKS}}': langLinks(targets, page.locale.code),
      '{{LANG_OPTIONS}}': langOptions(targets, page.locale.code),
      '{{FOOTER_LANGS}}': footerLangs(targets, page.locale.code),
      '{{FOOTER_LINKS}}': TOOL_PAGES.map(
        (tool) =>
          `              <li><a class="link" href="../${escapeHtml(toolSlug(tool, page.locale.code))}/">${escapeHtml(dict[`tool.${tool}.name`])}</a></li>`,
      ).join('\n'),
      '{{RELATED_LINKS}}': relatedLinks(page, dict),
      '{{COPYRIGHT}}': fill(dict['foot.copyright'], { year: BUILD_YEAR, name: dict['app.name'] }),
      '{{I18N_DICT}}': escapeJsonForScript(JSON.stringify(runtimeDict(dict, LANDING_RUNTIME_PREFIXES))),
    };

    for (const [token, value] of Object.entries(replacements)) {
      html = html.replaceAll(token, value);
    }

    assertNoTokensLeft(html, page.urlPath);

    const outDir = path.join(ROOT, ...page.urlPath.split('/'));
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), html, 'utf8');

    bytes += Buffer.byteLength(html);
    counts[page.kind] = (counts[page.kind] ?? 0) + 1;
  }

  const summary = Object.entries(counts)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
  console.log(`build:landing — ${pages.length} pages (${summary}) — ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
