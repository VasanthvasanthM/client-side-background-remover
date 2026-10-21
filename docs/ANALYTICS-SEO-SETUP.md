# Analytics, Search Console and Core Web Vitals

Everything here is optional. The site works, ranks and respects visitors with
no analytics at all — omit `GA4_ID` and no tracking script is emitted, and the
generated CSP contains no analytics origins.

---

## 1. Google Analytics 4

### Create the property

1. [analytics.google.com](https://analytics.google.com) → **Admin** →
   **Create** → **Property**.
2. Name it, set the reporting time zone and currency.
3. **Data streams** → **Web** → enter the production URL → **Create stream**.
4. Copy the **Measurement ID**, which looks like `G-XXXXXXXXXX`.

### Wire it in

Set it as a build-time environment variable — in Cloudflare Pages under
**Settings → Environment variables**, or locally:

```bash
SITE_URL=https://yourdomain.com GA4_ID=G-XXXXXXXXXX npm run build
```

That is the whole integration. The build then emits, in `<head>`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script src="./assets/js/analytics.js" data-ga4-id="G-XXXXXXXXXX" defer></script>
```

Three things about that snippet are deliberate:

- **`async` on the loader** so it never blocks parsing or rendering. It is the
  only third-party request the site makes.
- **`defer` on the config** so it runs after the document is parsed but before
  `DOMContentLoaded`, which is early enough for the page-view hit.
- **No inline script.** The measurement ID travels on a `data-ga4-id`
  attribute instead of being interpolated into executable code. This is what
  keeps the CSP at a plain `script-src 'self'` with no hashes.

The build also adds `https://www.googletagmanager.com` to `script-src` and the
two analytics origins to `connect-src`, but **only when `GA4_ID` is set**.

### Verify

Deploy, then open the site and check **GA4 → Reports → Realtime**. You should
appear within about thirty seconds. If not:

- Check the page source for the `gtag/js` tag. Absent means `GA4_ID` was not
  set at build time — environment variables are read during the build, so
  adding one requires a **redeploy**, not just a save.
- Check the browser console for a CSP violation naming `googletagmanager.com`.
  That means the pages were built with an ID but `_headers` was not
  regenerated; rebuild fully rather than running one step.
- An ad blocker on your own machine will suppress the hit. Try a different
  browser profile.

### What is worth measuring, and what must never be

Measure which landing pages bring people in. Someone arriving at
`/remove-white-background/` found you through a different query than someone
arriving at `/remove-background-from-logo/`, and that difference tells you
which long-tail families deserve more pages. In GA4, create explorations
grouped by **Landing page** and segmented by **Language**.

**Never add event tracking that touches the image.** No filenames, no
dimensions, no colour values, no "image processed" events carrying anything
derived from the picture. The entire selling point is that nothing about the
image leaves the device, and the claim in the footer has to remain literally
true. A page-view count is fine; anything describing the user's file is not.

If you want to know whether people succeed, the honest proxy is a count of
download-button clicks with no parameters attached — and even that is worth
weighing against the simplicity of claiming nothing is collected at all.

---

## 2. Google Search Console

### Add the property

Use a **Domain** property, not a URL-prefix one — it covers `http`, `https`,
every subdomain and both `www` and apex in a single entry.

1. [search.google.com/search-console](https://search.google.com/search-console)
   → **Add property** → **Domain** → enter `yourdomain.com` (no scheme, no
   `www`).
2. Google shows a TXT record to add.

### Verify through Cloudflare DNS

1. Cloudflare dashboard → select the domain → **DNS** → **Records** →
   **Add record**.
2. Fill in:

   | Field | Value |
   | --- | --- |
   | Type | `TXT` |
   | Name | `@` |
   | Content | `google-site-verification=…` (paste exactly, including the prefix) |
   | TTL | Auto |

3. **Save**, then click **Verify** in Search Console.

Cloudflare propagates in seconds, so verification usually succeeds
immediately. If it does not, wait a minute and retry — and check you pasted
the whole string including `google-site-verification=`.

Keep the record. Removing it later un-verifies the property.

> If the domain is registered elsewhere and not on Cloudflare's nameservers,
> add the TXT record at that registrar instead. Moving nameservers to
> Cloudflare first is simpler and is required for Pages custom domains anyway.

### Submit the sitemap

**Search Console → Sitemaps →** enter `sitemap.xml` → **Submit.**

The sitemap holds 371 URLs in 53 `hreflang` groups. Each entry declares all
seven language alternates plus `x-default`, which is how Google learns that
`/remove-white-background/` and `/fr/supprimer-fond-blanc/` are the same page
rather than duplicates competing with each other.

Expect "Discovered" within a day and indexing to roll out over two to six
weeks. A new domain with 371 pages is not indexed at once, and that is normal
rather than a problem to fix.

### What to watch, and when

| When | Report | Looking for |
| --- | --- | --- |
| Day 1 | Sitemaps | Status *Success*, 371 discovered |
| Week 1 | Page indexing | Pages moving to *Indexed* |
| Week 2 | International targeting | No `hreflang` errors |
| Week 4 | Performance | Which queries and which languages landed |
| Ongoing | Core Web Vitals | All URL groups *Good* |

**`hreflang` errors are the ones to act on.** "No return tag" means page A
declares B as an alternate but B does not declare A. The build makes this
structurally impossible — alternates come from one generator and
`npm run check` verifies every declared alternate is a page that was actually
built — so an error here means a stale deploy, not a markup bug. Redeploy and
revalidate.

### Bing

Bing Webmaster Tools can import the whole Search Console property in one
click, which takes about a minute and is worth doing. Same sitemap URL.

---

## 3. Core Web Vitals

Field data appears in Search Console after roughly 28 days of real traffic.
Until then use [PageSpeed Insights](https://pagespeed.web.dev/) for lab data.

### Why this site should pass comfortably

| Metric | Target | Why it holds here |
| --- | --- | --- |
| **LCP** | < 2.5 s | The largest element is text, in the initial HTML. No hero image, no web font, no render-blocking JavaScript — the stylesheet is the only blocking resource and it is ~32 KB from the same origin |
| **INP** | < 200 ms | All segmentation runs in a worker, so the main thread is never blocked by it. Slider changes are coalesced to one recompute per animation frame |
| **CLS** | ~0 | The canvas area reserves its height before any image loads, so dropping a picture does not reflow the page. The theme is applied before first paint by a separate `theme.js`, so there is no flash and no late repaint |

**The worker is the Core Web Vitals story here.** A background remover that
segments on the main thread fails INP badly and intermittently — fine on a
small logo, catastrophic on a phone photo. Moving the loops off-thread is what
keeps interaction responsive regardless of image size.

### Checklist before launch

- [ ] PageSpeed Insights on the home page, mobile — all four green.
- [ ] PageSpeed Insights on a landing page too. They carry more text, and they
      are what search traffic lands on.
- [ ] Check `/ar/` separately. Right-to-left layout is the one place a
      shifting control panel would show up.
- [ ] DevTools → Performance → record while dragging the tolerance slider on a
      large photo. There should be no long task on the main thread.
- [ ] Drop in a ~20-megapixel photo on a mid-range phone and confirm the tab
      stays responsive while the preview computes.
- [ ] DevTools → Network → throttle to *Slow 4G* and reload. Confirm the page
      is readable and the drop zone is usable before everything finishes.
- [ ] Lighthouse → Accessibility and Best Practices, on both an `ltr` and the
      `rtl` locale.
- [ ] `curl -I` the home page and confirm the security headers arrive.

### Things that would break this

Adding a web font, a CDN script, an embedded widget or — above all — an ML
model would each cost more than everything currently on the page. A 5 MB
model download would move this from "instant" to "wait for it", which is the
category the tool deliberately avoids. If one is ever genuinely needed, load
it lazily behind an explicit opt-in and measure before and after on a
throttled connection.

---

## 4. Privacy

GA4 collects page views, referrers, approximate geography and device class. It
does **not** receive anything about the images people process — no filenames,
no dimensions, no pixel data. That information never leaves the device, and
there is no endpoint it could be sent to.

If you would rather ship no third-party script at all, leave `GA4_ID` unset.
Cloudflare's own Web Analytics gives page views with no client-side script and
no cookies, and the privacy claim stays absolute — which, for this tool
specifically, is worth more than demographic reporting.
