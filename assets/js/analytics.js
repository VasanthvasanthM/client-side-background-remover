/**
 * Google Analytics 4 initialisation.
 *
 * Only emitted into the page when GA4_ID is set at build time, so a site built
 * without it ships no analytics at all — no script tag, and no third-party
 * origin in the Content-Security-Policy.
 *
 * A file rather than an inline script, because the CSP forbids inline script
 * entirely; the measurement ID arrives on this tag's own data attribute, which
 * is why the build never has to interpolate anything into executable code.
 *
 * Nothing the visitor enters is ever sent here. Birth dates, event names and
 * saved countdowns stay in the page; only page views and the handful of
 * events below are recorded, and none of them carry user content.
 */
(function () {
  'use strict';

  var tag = document.currentScript;
  var id = tag && tag.getAttribute('data-ga4-id');
  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', id, {
    // The tool's whole promise is that nothing leaves the browser; collecting
    // less is the consistent position, and it keeps the deployment clear of
    // consent-banner territory in most jurisdictions.
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  /**
   * Count which tool was used, never what was entered.
   *
   * These fire on the actions that indicate the tool did its job, which is the
   * only signal needed to tell which locales and landing pages deserve more
   * content. No date, label or time zone is included.
   */
  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-track]');
    if (!target) return;
    gtag('event', target.getAttribute('data-track'), {
      page_language: document.documentElement.lang || 'en',
    });
  });
})();
