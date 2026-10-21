/**
 * Pre-paint theme application.
 *
 * Loaded synchronously in <head> and deliberately kept outside the module
 * graph: it has to run before the first paint, and a module is always
 * deferred. Reading the stored preference here is what stops a dark-mode
 * visitor seeing a white flash on every navigation.
 *
 * It duplicates one field of store.js's record on purpose — importing the
 * store would mean waiting for the module graph, which is the very thing being
 * avoided. The storage key is the single point of coupling.
 */
(function () {
  'use strict';
  var theme = 'system';

  try {
    var raw = window.localStorage.getItem('tdas.state.v1');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system')) {
        theme = parsed.theme;
      }
    }
  } catch (err) {
    /* Private mode, blocked cookies, or a corrupt record: fall back to system. */
  }

  var dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (dark) document.documentElement.classList.add('dark');
})();
