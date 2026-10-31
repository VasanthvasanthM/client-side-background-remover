/**
 * Page chrome: theme toggle, language picker, footer.
 *
 * Shared by the suite and the generated landing pages, which have the same
 * header and footer but otherwise nothing in common — the landing pages ship
 * this module plus a small live-values script, and never load the tools.
 */

import { store } from './store.js';
import { t, currentLocale, pathForLocale } from './i18n.js';

const $ = (selector, scope = document) => scope.querySelector(selector);

export function applyTheme(theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function initTheme() {
  applyTheme(store.get('theme'));

  // Keep following the OS for as long as the preference is "system".
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (store.get('theme') === 'system') applyTheme('system');
    });
  }

  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    store.set({ theme: next });
    applyTheme(next);
  });
}

function initLanguage() {
  const select = $('#lang-select');
  if (!select) return;
  select.value = currentLocale();
  select.addEventListener('change', () => {
    // Each language has its own crawlable URL, so switching navigates rather
    // than swapping strings in place.
    window.location.href = pathForLocale(select.value);
  });
}

/**
 * Re-render the copyright with the browser's current year.
 *
 * The build already wrote a correct year; this matters for a page served from
 * cache after New Year, when the baked year is a year behind.
 *
 * The year is passed as a **string**, and that is not incidental. `t()` runs
 * every numeric variable through `Intl.NumberFormat`, which is right for the
 * quantities it usually interpolates but wrong for a year: an identifier, not
 * a quantity. Passed as a number it rendered as "© 2,026" in English and
 * "© 2 026" in French — correct formatting of the wrong kind of value, on
 * every page, and invisible to the build because the build-time copyright
 * never goes through `t()`.
 */
export function renderCopyright() {
  const node = $('[data-copyright]');
  if (!node) return;
  node.textContent = t('foot.copyright', { year: String(new Date().getFullYear()), name: t('app.name') });
}

export function renderStorageState() {
  const node = $('[data-storage-state]');
  if (node) node.textContent = store.persistent ? t('common.saved') : t('common.notSaved');
}

function initReset() {
  $('[data-reset-storage]')?.addEventListener('click', () => {
    store.reset();
    renderStorageState();
    // A full reload is the honest way to show cleared state: every tool reads
    // the store at init, and re-deriving that by hand would be a second code
    // path that could disagree with the first.
    window.location.reload();
  });
}

export function initChrome() {
  initTheme();
  initLanguage();
  initReset();
  renderCopyright();
  renderStorageState();
}
