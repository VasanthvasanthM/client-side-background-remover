/**
 * Programmatic landing pages.
 *
 * Four families, each chosen because it answers a question people actually
 * type and each has genuinely different content to show:
 *
 * - **Tool pages** describe one mode of the remover, with the edge cases that
 *   mode handles. Six pages, one per real feature — not six rewordings of the
 *   same one.
 *
 * - **Colour pages** answer "remove white background". Each carries the real
 *   hex, RGB and Lab values of that colour, the tolerance that suits it, and
 *   an honest note on why that particular colour is easy or awkward. All of
 *   that is computed from the same colour module the app runs on, so the
 *   numbers cannot drift from the tool's behaviour.
 *
 * - **Format pages** answer "jpg to transparent png". Each states whether the
 *   source format can carry transparency at all, which is the actual reason
 *   people arrive: a JPEG cannot, so the answer is always "convert to PNG".
 *
 * - **Use-case pages** answer "remove background from a logo/signature/
 *   product photo", with the settings that suit that subject.
 *
 * Slugs are localized in the Latin-script locales. Hindi and Arabic keep
 * English slugs: a percent-encoded Devanagari or Arabic URL survives neither a
 * paste into a chat nor being read aloud over a call.
 */

import { LOCALES } from './site.config.js';

/** The tools that get a page of their own, in internal-link order. */
export const TOOL_PAGES = Object.freeze(['auto', 'color', 'chroma', 'replace', 'brush', 'png']);

/** Which mode each tool page should open the app in. */
export const TOOL_MODE = Object.freeze({
  auto: 'auto',
  color: 'color',
  chroma: 'chroma',
  replace: 'auto',
  brush: 'auto',
  png: 'auto',
});

const TOOL_SLUGS = Object.freeze({
  auto: {
    en: 'background-remover',
    es: 'quitar-fondo-imagen',
    pt: 'removedor-de-fundo',
    fr: 'supprimer-arriere-plan',
    hi: 'background-remover',
    id: 'penghapus-latar-belakang',
    ar: 'background-remover',
  },
  color: {
    en: 'color-background-remover',
    es: 'quitar-fondo-por-color',
    pt: 'remover-fundo-por-cor',
    fr: 'supprimer-fond-par-couleur',
    hi: 'color-background-remover',
    id: 'hapus-latar-berdasarkan-warna',
    ar: 'color-background-remover',
  },
  chroma: {
    en: 'green-screen-remover',
    es: 'quitar-pantalla-verde',
    pt: 'remover-chroma-key',
    // "incrustation" is the French term of art for chroma keying. It also
    // keeps this distinct from the green colour page, which would otherwise
    // claim the same slug.
    fr: 'incrustation-fond-vert',
    hi: 'green-screen-remover',
    id: 'hapus-layar-hijau',
    ar: 'green-screen-remover',
  },
  replace: {
    en: 'background-color-changer',
    es: 'cambiar-color-de-fondo',
    pt: 'trocar-cor-de-fundo',
    fr: 'changer-couleur-arriere-plan',
    hi: 'background-color-changer',
    id: 'ganti-warna-latar',
    ar: 'background-color-changer',
  },
  brush: {
    en: 'background-eraser-brush',
    es: 'borrador-de-fondo',
    pt: 'borracha-de-fundo',
    fr: 'gomme-arriere-plan',
    hi: 'background-eraser-brush',
    id: 'penghapus-latar-manual',
    ar: 'background-eraser-brush',
  },
  png: {
    en: 'transparent-png-maker',
    es: 'crear-png-transparente',
    pt: 'criar-png-transparente',
    fr: 'creer-png-transparent',
    hi: 'transparent-png-maker',
    id: 'buat-png-transparan',
    ar: 'transparent-png-maker',
  },
});

/**
 * Background colours worth a page, with the data each page is built from.
 *
 * `tolerance` is the slider position that suits that colour, and it is a real
 * recommendation rather than decoration: near-neutral colours sit close to
 * everything else in Lab and need a tighter setting than a saturated one.
 */
export const COLORS = Object.freeze([
  { id: 'white', hex: '#ffffff', tolerance: 28, trait: 'neutral' },
  { id: 'black', hex: '#000000', tolerance: 30, trait: 'neutral' },
  { id: 'grey', hex: '#808080', tolerance: 26, trait: 'neutral' },
  { id: 'green', hex: '#00b140', tolerance: 42, trait: 'saturated' },
  { id: 'blue', hex: '#0047ab', tolerance: 42, trait: 'saturated' },
  { id: 'red', hex: '#d22b2b', tolerance: 42, trait: 'saturated' },
  { id: 'yellow', hex: '#ffd700', tolerance: 40, trait: 'saturated' },
  { id: 'orange', hex: '#ff7f24', tolerance: 40, trait: 'saturated' },
  { id: 'purple', hex: '#7b3ff2', tolerance: 42, trait: 'saturated' },
  { id: 'pink', hex: '#ff69b4', tolerance: 38, trait: 'saturated' },
  { id: 'brown', hex: '#8b5a2b', tolerance: 32, trait: 'muted' },
  { id: 'beige', hex: '#f5f5dc', tolerance: 26, trait: 'near-neutral' },
  { id: 'navy', hex: '#001f54', tolerance: 34, trait: 'dark' },
  { id: 'teal', hex: '#008080', tolerance: 40, trait: 'saturated' },
  { id: 'cyan', hex: '#00bcd4', tolerance: 42, trait: 'saturated' },
  { id: 'magenta', hex: '#d8008f', tolerance: 42, trait: 'saturated' },
  { id: 'gold', hex: '#d4af37', tolerance: 34, trait: 'muted' },
  { id: 'silver', hex: '#c0c0c0', tolerance: 26, trait: 'near-neutral' },
]);

/** Colour names used in slugs. Latin-script locales only; hi and ar use en. */
const COLOR_SLUGS = Object.freeze({
  white: { en: 'white', es: 'blanco', pt: 'branco', fr: 'blanc', id: 'putih' },
  black: { en: 'black', es: 'negro', pt: 'preto', fr: 'noir', id: 'hitam' },
  grey: { en: 'grey', es: 'gris', pt: 'cinza', fr: 'gris', id: 'abu-abu' },
  green: { en: 'green', es: 'verde', pt: 'verde', fr: 'vert', id: 'hijau' },
  blue: { en: 'blue', es: 'azul', pt: 'azul', fr: 'bleu', id: 'biru' },
  red: { en: 'red', es: 'rojo', pt: 'vermelho', fr: 'rouge', id: 'merah' },
  yellow: { en: 'yellow', es: 'amarillo', pt: 'amarelo', fr: 'jaune', id: 'kuning' },
  orange: { en: 'orange', es: 'naranja', pt: 'laranja', fr: 'orange', id: 'oranye' },
  purple: { en: 'purple', es: 'morado', pt: 'roxo', fr: 'violet', id: 'ungu' },
  pink: { en: 'pink', es: 'rosa', pt: 'rosa', fr: 'rose', id: 'merah-muda' },
  brown: { en: 'brown', es: 'marron', pt: 'marrom', fr: 'marron', id: 'cokelat' },
  beige: { en: 'beige', es: 'beige', pt: 'bege', fr: 'beige', id: 'krem' },
  navy: { en: 'navy', es: 'azul-marino', pt: 'azul-marinho', fr: 'bleu-marine', id: 'biru-navy' },
  teal: { en: 'teal', es: 'verde-azulado', pt: 'verde-azulado', fr: 'bleu-canard', id: 'biru-kehijauan' },
  cyan: { en: 'cyan', es: 'cian', pt: 'ciano', fr: 'cyan', id: 'sian' },
  magenta: { en: 'magenta', es: 'magenta', pt: 'magenta', fr: 'magenta', id: 'magenta' },
  gold: { en: 'gold', es: 'dorado', pt: 'dourado', fr: 'dore', id: 'emas' },
  silver: { en: 'silver', es: 'plateado', pt: 'prateado', fr: 'argente', id: 'perak' },
});

/**
 * Source formats worth a page.
 *
 * `alpha` is the one fact that matters: a format that cannot store
 * transparency can only ever be *converted*, never edited in place, which is
 * exactly what someone searching "jpg transparent background" needs told.
 */
export const FORMATS = Object.freeze([
  { id: 'jpg', label: 'JPG', alpha: false, lossy: true },
  { id: 'jpeg', label: 'JPEG', alpha: false, lossy: true },
  { id: 'png', label: 'PNG', alpha: true, lossy: false },
  { id: 'webp', label: 'WebP', alpha: true, lossy: true },
  { id: 'gif', label: 'GIF', alpha: 'binary', lossy: false },
  { id: 'bmp', label: 'BMP', alpha: false, lossy: false },
  { id: 'avif', label: 'AVIF', alpha: true, lossy: true },
  { id: 'ico', label: 'ICO', alpha: true, lossy: false },
]);

/** Subjects people actually cut out, with the settings that suit each. */
export const USE_CASES = Object.freeze([
  { id: 'logo', mode: 'color', tolerance: 24, contiguous: false },
  { id: 'signature', mode: 'color', tolerance: 34, contiguous: false },
  { id: 'product-photo', mode: 'auto', tolerance: 32, contiguous: true },
  { id: 'headshot', mode: 'auto', tolerance: 30, contiguous: true },
  { id: 'screenshot', mode: 'color', tolerance: 16, contiguous: false },
  { id: 'sticker', mode: 'auto', tolerance: 34, contiguous: true },
  { id: 'stamp', mode: 'color', tolerance: 30, contiguous: false },
  { id: 'qr-code', mode: 'color', tolerance: 14, contiguous: false },
  { id: 'drawing', mode: 'color', tolerance: 30, contiguous: false },
  { id: 'sketch', mode: 'color', tolerance: 34, contiguous: false },
  { id: 'scanned-document', mode: 'auto', tolerance: 30, contiguous: true },
  { id: 'passport-photo', mode: 'auto', tolerance: 28, contiguous: true },
  { id: 'profile-picture', mode: 'auto', tolerance: 32, contiguous: true },
  { id: 'ebay-listing', mode: 'auto', tolerance: 32, contiguous: true },
  { id: 'amazon-product', mode: 'auto', tolerance: 30, contiguous: true },
  { id: 'etsy-listing', mode: 'auto', tolerance: 32, contiguous: true },
  { id: 'thumbnail', mode: 'auto', tolerance: 34, contiguous: true },
  { id: 'tshirt-design', mode: 'color', tolerance: 26, contiguous: false },
  { id: 'clipart', mode: 'color', tolerance: 22, contiguous: false },
  { id: 'icon', mode: 'color', tolerance: 18, contiguous: false },
]);

const COLOR_PREFIX = Object.freeze({
  en: 'remove',
  es: 'quitar-fondo',
  pt: 'remover-fundo',
  fr: 'supprimer-fond',
  hi: 'remove',
  id: 'hapus-latar',
  ar: 'remove',
});

const USE_CASE_PREFIX = Object.freeze({
  en: 'remove-background-from',
  es: 'quitar-fondo-de',
  pt: 'remover-fundo-de',
  fr: 'supprimer-arriere-plan',
  hi: 'remove-background-from',
  id: 'hapus-latar-dari',
  ar: 'remove-background-from',
});

const FORMAT_SUFFIX = Object.freeze({
  en: 'to-transparent-png',
  es: 'a-png-transparente',
  pt: 'para-png-transparente',
  fr: 'en-png-transparent',
  hi: 'to-transparent-png',
  id: 'ke-png-transparan',
  ar: 'to-transparent-png',
});

export function toolSlug(tool, localeCode) {
  const entry = TOOL_SLUGS[tool];
  if (!entry) throw new Error(`No slug map for tool "${tool}"`);
  return entry[localeCode] ?? entry.en;
}

export function colorSlug(color, localeCode) {
  const names = COLOR_SLUGS[color.id];
  const name = names[localeCode] ?? names.en;
  const prefix = COLOR_PREFIX[localeCode] ?? COLOR_PREFIX.en;
  // English reads "remove-white-background"; the others already carry the
  // word for background in their prefix, so the colour simply follows.
  return localeCode === 'en' || localeCode === 'hi' || localeCode === 'ar'
    ? `${prefix}-${name}-background`
    : `${prefix}-${name}`;
}

export function formatSlug(format, localeCode) {
  const suffix = FORMAT_SUFFIX[localeCode] ?? FORMAT_SUFFIX.en;
  return `${format.id}-${suffix}`;
}

export function useCaseSlug(useCase, localeCode) {
  const prefix = USE_CASE_PREFIX[localeCode] ?? USE_CASE_PREFIX.en;
  return `${prefix}-${useCase.id}`;
}

function join(...segments) {
  return segments.filter(Boolean).join('/');
}

/**
 * Every landing page, across every locale.
 *
 * `key` groups a page with its translations so the sitemap can declare them as
 * hreflang alternates even though their paths differ.
 */
export function allLandingPages() {
  const pages = [];

  for (const locale of LOCALES) {
    for (const tool of TOOL_PAGES) {
      pages.push({
        kind: 'tool',
        key: `tool:${tool}`,
        tool,
        locale,
        slug: toolSlug(tool, locale.code),
        urlPath: join(locale.dir, toolSlug(tool, locale.code)),
      });
    }

    for (const color of COLORS) {
      pages.push({
        kind: 'color',
        key: `color:${color.id}`,
        color,
        locale,
        slug: colorSlug(color, locale.code),
        urlPath: join(locale.dir, colorSlug(color, locale.code)),
      });
    }

    for (const format of FORMATS) {
      pages.push({
        kind: 'format',
        key: `format:${format.id}`,
        format,
        locale,
        slug: formatSlug(format, locale.code),
        urlPath: join(locale.dir, formatSlug(format, locale.code)),
      });
    }

    for (const useCase of USE_CASES) {
      pages.push({
        kind: 'useCase',
        key: `use:${useCase.id}`,
        useCase,
        locale,
        slug: useCaseSlug(useCase, locale.code),
        urlPath: join(locale.dir, useCaseSlug(useCase, locale.code)),
      });
    }
  }

  return pages;
}

/** The same page in every locale, for hreflang and the language switcher. */
export function alternatesFor(page) {
  return LOCALES.map((locale) => {
    let slug;
    if (page.kind === 'tool') slug = toolSlug(page.tool, locale.code);
    else if (page.kind === 'color') slug = colorSlug(page.color, locale.code);
    else if (page.kind === 'format') slug = formatSlug(page.format, locale.code);
    else slug = useCaseSlug(page.useCase, locale.code);
    return { locale, urlPath: join(locale.dir, slug) };
  });
}
