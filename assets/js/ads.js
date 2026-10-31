/**
 * Activates whatever AdSense slots the page shipped with.
 *
 * ## Why this is a file rather than an inline script
 *
 * Google's own snippet is `(adsbygoogle = window.adsbygoogle || []).push({})`
 * written inline next to each `<ins>`. Inline script is exactly what this
 * site's CSP forbids — no `'unsafe-inline'`, no hashes — so the push happens
 * here instead, from a file the CSP already trusts under `script-src 'self'`.
 *
 * ## Why it pushes once per slot and tracks which
 *
 * `push({})` fills the *next* unfilled `<ins>` on the page, so the count of
 * pushes must equal the count of slots. Pushing twice for one slot makes
 * AdSense log "All ins elements already have ads in them" and silently drop
 * the extra — harmless, but it hides real mistakes. The `data-filled` flag
 * makes a double-run (a re-render, a back/forward cache restore) a no-op.
 *
 * ## Why nothing here is conditional on consent
 *
 * Consent is handled before this runs: the loader script is only on the page
 * at all when ADSENSE_ID was set at build time, and Google's own consent
 * handling runs inside that loader. If you add a consent platform later, it
 * must gate the loader in the page `<head>`, not this file.
 */

function fillSlots() {
  const slots = document.querySelectorAll('ins.adsbygoogle:not([data-filled])');
  if (!slots.length) return;

  // If the loader was blocked — an ad blocker, an offline visitor, a network
  // failure — window.adsbygoogle never appears. Collapse the reserved space
  // rather than leaving a labelled empty box on the page.
  if (!window.adsbygoogle) {
    for (const slot of slots) slot.closest('[data-ad-slot]')?.setAttribute('hidden', '');
    return;
  }

  for (const slot of slots) {
    slot.setAttribute('data-filled', '');
    try {
      window.adsbygoogle.push({});
    } catch {
      // A push can throw if the slot has no width yet (display:none ancestor).
      // One dead slot must not stop the rest of the page working.
      slot.closest('[data-ad-slot]')?.setAttribute('hidden', '');
    }
  }
}

// The loader is `async`, so it may land before or after this file. Both orders
// have to work: run now for the late case, and again on load for the early one.
fillSlots();
window.addEventListener('load', () => {
  // Give a slow loader a moment past `load` before deciding it was blocked.
  setTimeout(fillSlots, 1200);
}, { once: true });
