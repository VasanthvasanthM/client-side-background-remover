/**
 * Build-wide configuration.
 *
 * SITE_URL drives canonical tags, hreflang, Open Graph and the sitemap, so it
 * has to be the real production origin. It is read from the environment to
 * keep the domain out of version control, with a loud placeholder fallback so
 * a misconfigured build is obvious rather than silently shipping bad
 * canonicals.
 *
 *   SITE_URL=https://yourdomain.pages.dev npm run build
 */

const PLACEHOLDER_URL = 'https://client-side-background-remover.pages.dev';

const raw = (process.env.SITE_URL || '').trim();

export const USING_PLACEHOLDER_URL = raw === '';

/** No trailing slash: every consumer appends its own. */
export const SITE_URL = (raw || PLACEHOLDER_URL).replace(/\/+$/, '');

/**
 * Google Analytics 4 measurement ID. Empty means no analytics is shipped at
 * all — no script tag, and no analytics origins in the generated CSP.
 *
 *   GA4_ID=G-XXXXXXXXXX npm run build
 */
export const GA4_ID = (process.env.GA4_ID || '').trim();

/**
 * AdSense publisher id, e.g. `ca-pub-1234567890123456`.
 *
 * Unset is the default and means the built site carries no ad markup, no
 * third-party ad script and no widened CSP — byte-identical to a build from
 * before ads existed. Set it and the landing pages gain two slots each; the
 * tool pages never do, because an advert beside the tool costs the visit that
 * would otherwise bring someone back.
 */
export const ADSENSE_ID = (process.env.ADSENSE_ID || '').trim();

const ADSENSE_ID_RE = /^ca-pub-\d{16}$/;

if (ADSENSE_ID && !ADSENSE_ID_RE.test(ADSENSE_ID)) {
  throw new Error(`ADSENSE_ID "${ADSENSE_ID}" is not a valid publisher id (expected ca-pub- followed by 16 digits).`);
}

const GA4_ID_RE = /^G-[A-Z0-9]{6,}$/;

if (GA4_ID && !GA4_ID_RE.test(GA4_ID)) {
  throw new Error(`GA4_ID "${GA4_ID}" is not a valid measurement ID (expected G-XXXXXXXXXX).`);
}

/**
 * Locales, in display order.
 *
 * `dir` is the URL subfolder — empty for the default locale, which lives at
 * the root so the bare domain is a real page and not a redirect.
 * `label` is the language's own endonym, which is what a speaker scanning a
 * language picker actually looks for.
 */
export const LOCALES = [
  { code: 'en', dir: '', label: 'English', dir_attr: 'ltr', ogLocale: 'en_US' },
  { code: 'es', dir: 'es', label: 'Español', dir_attr: 'ltr', ogLocale: 'es_ES' },
  { code: 'pt', dir: 'pt', label: 'Português', dir_attr: 'ltr', ogLocale: 'pt_BR' },
  { code: 'fr', dir: 'fr', label: 'Français', dir_attr: 'ltr', ogLocale: 'fr_FR' },
  { code: 'hi', dir: 'hi', label: 'हिन्दी', dir_attr: 'ltr', ogLocale: 'hi_IN' },
  { code: 'id', dir: 'id', label: 'Bahasa Indonesia', dir_attr: 'ltr', ogLocale: 'id_ID' },
  { code: 'ar', dir: 'ar', label: 'العربية', dir_attr: 'rtl', ogLocale: 'ar_AR' },
];

export const DEFAULT_LOCALE = 'en';

export const LOCALE_CODES = LOCALES.map((l) => l.code);

/** Absolute URL for a '/'-joined relative path ('' = home). */
export function absoluteUrl(urlPath) {
  return urlPath ? `${SITE_URL}/${urlPath}/` : `${SITE_URL}/`;
}

/** The social sharing image, generated into assets/og by the build. */
export const OG_IMAGE_PATH = 'assets/og/cover.png';

/**
 * The build's reference date.
 *
 * Landing pages bake in values that depend on "today" — ages, offsets, days
 * remaining. Taking the date once means every page in a build agrees, instead
 * of a 500-page run straddling midnight and shipping two different answers.
 */
export const BUILD_DATE = new Date();
export const BUILD_YEAR = BUILD_DATE.getUTCFullYear();
export const BUILD_ISO = BUILD_DATE.toISOString().slice(0, 10);
