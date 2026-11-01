#!/usr/bin/env node
/**
 * Builds Privacy, Terms, About and Contact in every locale.
 *
 * ## Why they go through the landing template
 *
 * `check` holds every built page to the same contract: the right `lang` and
 * `dir`, a canonical that matches its own URL, one hreflang per locale plus
 * x-default, a meta description, an og:image, structured data, no inline
 * script and no server-root references. Hand-rolling four pages would mean
 * re-satisfying all of that by hand and re-breaking it on the next change.
 * Reusing `landing.html` means the header, footer, language switcher and every
 * one of those tags come from the same machinery as the rest of the site.
 *
 * ## Why all seven locales, when the text is legal boilerplate
 *
 * Not a choice: `inferFromPath` in the sitemap groups `/privacy/` with
 * `/es/privacy/` and emits hreflang across the group, and `check` fails a page
 * whose hreflang count is not `LOCALES.length + 1`. A single English page
 * would fail the build.
 *
 * ## Why the slugs stay English
 *
 * `/es/privacy/` rather than `/es/privacidad/`. These four URLs are quoted in
 * policy documents, AdSense forms and legal correspondence, where a stable
 * ASCII path is worth more than a translated one.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  LOCALES,
  DEFAULT_LOCALE,
  SITE_URL,
  GA4_ID,
  ADSENSE_ID,
  absoluteUrl,
  USING_PLACEHOLDER_URL,
} from './site.config.js';

import { LEGAL, LEGAL_PAGES, PUBLISHER } from './legal-content.js';

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
  runtimeDict,
  LANDING_RUNTIME_PREFIXES,
} from './render-utils.js';

const SRC = path.join(ROOT, 'src');

/** `privacy` for English, `es/privacy` for the rest. */
function urlPathFor(slug, locale) {
  return locale.dir ? `${locale.dir}/${slug}` : slug;
}

/**
 * Substitutes the publisher's details and the site's own name.
 *
 * `{intro}` is the site's meta description, so About describes this tool
 * rather than "this website" — the one piece of per-site content these pages
 * carry, and the reason they are not identical across eighteen domains.
 */
function substitute(text, { dict, locale }) {
  const doc = LEGAL[locale.code];
  return text
    .replaceAll('{site}', dict['app.name'])
    .replaceAll('{publisher}', PUBLISHER.name)
    .replaceAll('{email}', PUBLISHER.email)
    .replaceAll('{location}', PUBLISHER.location)
    .replaceAll('{country}', PUBLISHER.country)
    .replaceAll('{forum}', PUBLISHER.forum)
    .replaceAll('{intro}', dict['meta.description'] ?? dict['app.name'])
    .replaceAll('{analytics}', GA4_ID ? doc.privacy.analyticsOn : doc.privacy.analyticsOff)
    .replaceAll('{advertising}', ADSENSE_ID ? doc.privacy.adsOn : doc.privacy.adsOff)
    .replaceAll('{funding}', ADSENSE_ID ? doc.about.fundingAds : doc.about.fundingFree);
}

/** Headings and paragraphs, escaped — these are prose, never markup. */
function renderSections(sections, context) {
  return sections
    .map(([heading, body]) => {
      const text = substitute(body, context);
      return [
        `        <h2>${escapeHtml(substitute(heading, context))}</h2>`,
        `        <p>${escapeHtml(text)}</p>`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * A policy page is a WebPage, not a SoftwareApplication, and carries no FAQ
 * block: inventing questions nobody asked to win a rich result is the kind of
 * thing that gets structured data ignored site-wide.
 */
function legalJsonLd({ canonical, name, description, dict, locale }) {
  return escapeJsonForScript(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: canonical,
    inLanguage: locale.code,
    isPartOf: { '@type': 'WebSite', name: dict['app.name'], url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Person',
      name: PUBLISHER.name,
      email: PUBLISHER.email,
      address: { '@type': 'PostalAddress', addressLocality: 'Trichy', addressRegion: 'Tamil Nadu', addressCountry: 'IN' },
    },
  }));
}

async function main() {
  if (USING_PLACEHOLDER_URL) {
    console.log('! SITE_URL is not set — legal pages will carry the placeholder host.');
  }

  const [template, header, footer, cssV] = await Promise.all([
    readFile(path.join(SRC, 'landing.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'header.html'), 'utf8'),
    readFile(path.join(SRC, 'partials', 'footer.html'), 'utf8'),
    cssVersion(),
  ]);

  const dicts = new Map();
  for (const locale of LOCALES) dicts.set(locale.code, await loadDictionary(locale.code));

  const today = new Date().toISOString().slice(0, 10);
  // Derived here rather than imported: not every project in the family
  // exports BUILD_YEAR, and this file has to drop into all of them.
  const year = today.slice(0, 4);
  let written = 0;
  let bytes = 0;

  for (const slug of LEGAL_PAGES) {
    // Every locale's copy of this page, so each can link to all the others.
    const group = LOCALES.map((locale) => ({ locale, urlPath: urlPathFor(slug, locale) }));

    for (const { locale, urlPath } of group) {
      const dict = dicts.get(locale.code);
      const doc = LEGAL[locale.code][slug];
      const ui = LEGAL[locale.code].ui;
      const context = { dict, locale };

      const depth = urlPath.split('/').filter(Boolean).length;
      const prefix = assetPrefix(depth);
      const canonical = absoluteUrl(urlPath);
      const title = substitute(doc.title, context);
      const description = substitute(doc.description, context);

      // check requires a description of at least 50 characters, and two of
      // these were short enough in Indonesian and Arabic to fail it. Catching
      // it here names the document and the locale; catching it in the audit
      // only names the URL, after every page has already been written.
      if (description.length < 55) {
        throw new Error(`${slug}.description in ${locale.code} is ${description.length} characters; the audit needs at least 50.`);
      }

      const targets = group.map((alt) => ({
        locale: alt.locale,
        href: `${prefix}${alt.urlPath}/`,
      }));

      let html = template
        .replace('{{HEADER}}', header.trimEnd())
        .replace('{{FOOTER}}', footer.trimEnd());

      html = applyTranslationTokens(html, dict, locale.code);

      const body = [
        slug === 'privacy'
          ? `        <p class="hint">${escapeHtml(fill(ui.updated, { date: today }))}</p>`
          : '',
        renderSections(doc.sections, context),
      ].filter(Boolean).join('\n');

      const replacements = {
        '{{LANG}}': locale.code,
        '{{DIR}}': locale.dir_attr,
        '{{CANONICAL}}': escapeHtml(canonical),
        '{{OG_IMAGE}}': escapeHtml(`${SITE_URL}/${OG_IMAGE_PATH}`),
        '{{OG_LOCALE}}': locale.ogLocale,
        '{{OG_ALTERNATES}}': ogAlternates(locale.code),
        '{{HREFLANG}}': hreflangTags(
          group.map((alt) => ({ code: alt.locale.code, url: absoluteUrl(alt.urlPath) })),
          absoluteUrl(group.find((alt) => alt.locale.code === DEFAULT_LOCALE).urlPath),
        ),
        '{{ASSET_PREFIX}}': prefix,
        '{{HOME_HREF}}': '../',
        '{{LEGAL_BASE}}': '../',
        '{{TOOL_HREF}}': '../',
        '{{CSS_VERSION}}': cssV,
        '{{PAGE_TITLE}}': escapeHtml(`${title} — ${dict['app.name']}`),
        '{{PAGE_DESCRIPTION}}': escapeHtml(description),
        '{{PAGE_H1}}': escapeHtml(title),
        '{{BREADCRUMB}}': escapeHtml(title),
        '{{PAGE_BODY}}': body,
        '{{JSONLD}}': legalJsonLd({ canonical, name: title, description, dict, locale }),
        '{{GA4}}': ga4Snippet(prefix),
        // No adverts on the legal pages. A privacy policy wrapped in the
        // advertising it describes reads badly, and these pages are what a
        // reviewer opens first.
        '{{ADS_HEAD}}': '',
        '{{AD_MID}}': '',
        '{{AD_END}}': '',
        '{{LANG_LINKS}}': langLinks(targets, locale.code),
        '{{LANG_OPTIONS}}': langOptions(targets, locale.code),
        '{{FOOTER_LANGS}}': footerLangs(targets, locale.code),
        '{{FOOTER_LINKS}}': LEGAL_PAGES.filter((other) => other !== slug)
          .map((other) => {
            const otherDoc = LEGAL[locale.code][other];
            const href = `${prefix}${urlPathFor(other, locale)}/`;
            return `              <li><a class="link" href="${escapeHtml(href)}">${escapeHtml(substitute(otherDoc.title, context))}</a></li>`;
          })
          .join('\n'),
        '{{RELATED_LINKS}}': `          <a class="chip" href="../">${escapeHtml(ui.back)}</a>`,
        '{{COPYRIGHT}}': fill(dict['foot.copyright'], { year, name: dict['app.name'] }),
        '{{I18N_DICT}}': escapeJsonForScript(JSON.stringify(runtimeDict(dict, LANDING_RUNTIME_PREFIXES))),
      };

      // Three template dialects grew up across these projects, naming the same
      // slots differently. Supplying both sets costs nothing — replaceAll on a
      // token the template does not contain is a no-op — and means one
      // generator drops into all of them. assertNoTokensLeft below is what
      // turns a missed dialect into a build failure rather than a page with
      // "{{BODY}}" printed on it.
      const aliases = {
        '{{TITLE}}': replacements['{{PAGE_TITLE}}'],
        '{{DESCRIPTION}}': replacements['{{PAGE_DESCRIPTION}}'],
        '{{H1}}': replacements['{{PAGE_H1}}'],
        '{{LEDE}}': replacements['{{PAGE_DESCRIPTION}}'],
        '{{BODY}}': replacements['{{PAGE_BODY}}'],
        '{{DICT}}': replacements['{{I18N_DICT}}'],
        '{{JSON_LD}}': replacements['{{JSONLD}}'],
        '{{HREFLANG_TAGS}}': replacements['{{HREFLANG}}'],
        '{{ASSET_BASE}}': `${prefix}assets`,
        // Legal pages ask no questions, so both FAQ slots render to nothing.
        '{{FAQ_HEADING}}': '',
        '{{FAQ}}': '',
        '{{FAQ_ITEMS}}': '',
      };
      Object.assign(replacements, aliases);

      for (const [token, value] of Object.entries(replacements)) {
        html = html.replaceAll(token, value);
      }
      assertNoTokensLeft(html, urlPath);

      const dir = path.join(ROOT, urlPath);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), html, 'utf8');
      written += 1;
      bytes += Buffer.byteLength(html);
    }
  }

  console.log(`build:legal — ${written} pages (${LEGAL_PAGES.length} documents x ${LOCALES.length} locales), ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
