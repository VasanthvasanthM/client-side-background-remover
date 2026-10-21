# Deploying to Cloudflare Pages

The whole site is static files. There is no server, no database, no image
processing backend and no build step that needs secrets at runtime — only two
environment variables consumed at build time.

---

## 1. Before the first deploy

Decide the production domain. It is baked into canonical tags, `hreflang`
alternates, Open Graph URLs, the sitemap and `robots.txt`, so changing it
later means a rebuild.

```bash
SITE_URL=https://yourdomain.com npm run build
npm run check
npm test
```

All three must pass before you deploy. If `SITE_URL` is unset the build still
succeeds but warns on every step and writes placeholder URLs — useful locally,
wrong in production.

---

## 2. Connect the repository

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick the repository and the `main` branch.
3. Build settings:

   | Field | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `/` |
   | Root directory | *(leave blank)* |
   | Node version | 20 or newer |

   The output directory is the repository root because the build writes pages
   in place — `/index.html`, `/es/index.html`,
   `/remove-white-background/index.html` and so on. There is no `dist`.

4. **Environment variables** → add for *Production*:

   | Name | Value |
   | --- | --- |
   | `SITE_URL` | `https://yourdomain.com` |
   | `GA4_ID` | `G-XXXXXXXXXX` *(optional — omit to ship no analytics)* |
   | `NODE_VERSION` | `20` |

   Add `SITE_URL` to the *Preview* environment too, pointing at the
   `*.pages.dev` URL, so preview builds do not advertise production
   canonicals.

5. **Save and Deploy.**

The first build takes a couple of minutes, most of it `npm install`
downloading Tailwind. Later builds are faster.

---

## 3. Custom domain

**Pages project → Custom domains → Set up a domain.**

If the domain is already on Cloudflare, the `CNAME` is created automatically
and TLS is issued within a few minutes. If it is registered elsewhere, move
the nameservers to Cloudflare first — that is also what makes the TXT
verification in [ANALYTICS-SEO-SETUP.md](ANALYTICS-SEO-SETUP.md) a one-click
job.

Serve a single canonical hostname. If you add both the apex and `www`, set a
bulk redirect from one to the other so the two do not compete in search
results; the canonical tags already point at whichever `SITE_URL` you built
with.

---

## 4. What the build writes

| Path | Purpose |
| --- | --- |
| `index.html` plus `/es/`, `/pt/`, `/fr/`, `/hi/`, `/id/`, `/ar/` | The app, one page per language |
| 364 landing directories | Tool, colour, format and use-case pages |
| `sitemap.xml` | 371 URLs with `hreflang` alternates and `lastmod` |
| `robots.txt` | Allows everything except `/assets/i18n/`, points at the sitemap |
| `_headers` | Security headers, the CSP and per-directory caching |
| `assets/css/app.css` | Minified Tailwind output, cache-busted by a `?v=` hash |
| `assets/og/cover.png`, `assets/icon/*` | Generated at build time, no binaries in git |

`_headers` is generated, not hand-written. Edit
`scripts/generate-sitemap.js` and rebuild.

### The CSP this app needs

Three directives matter more here than on a typical static site, and
`npm run check` fails the build if any of them goes missing:

- **`worker-src 'self'`** — the segmentation engine runs in a module worker.
  Without it the app looks loaded and then does nothing.
- **`img-src … blob:`** — the `<img>` decode fallback loads the chosen file
  through `URL.createObjectURL`, and browsers do not treat a `blob:` URL as
  matching `'self'`.
- **`script-src 'self'`** with no hashes — possible because the page ships no
  inline script at all. If a hash ever appears in the generated policy, an
  inline script has crept back in.

---

## 5. Verifying a deploy

```bash
npm run build && npm run check && npm run serve
```

The local server applies the generated `_headers`, so the CSP and caching you
see at `localhost:4173` are the ones Cloudflare will send.

Then, against the live site:

- Load the home page, drop in a photo on a plain background, and confirm the
  cutout appears. **Open the console first** — a missing `worker-src` shows up
  only as a CSP violation there.
- Open DevTools → Network, then remove a background. **Nothing should be
  sent.** This is the product's central claim; check it on every deploy.
- Download a PNG and open it over a dark background to confirm the
  transparency is real and there is no white fringe.
- `https://yourdomain.com/sitemap.xml` — 371 `<loc>` entries, each with seven
  `xhtml:link` alternates plus `x-default`.
- `https://yourdomain.com/robots.txt` — the `Sitemap:` line shows the real
  domain, not the placeholder.
- `curl -I https://yourdomain.com/` — confirm `Content-Security-Policy`,
  `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options`.
- Visit `/ar/` and confirm the page renders right-to-left.
- Toggle the theme, reload, and confirm it persists without a flash of the
  wrong colours.

---

## 6. Rollback

**Pages project → Deployments →** pick a previous deployment → **Rollback.**
It is instant, because every deployment is an immutable set of static files.

---

## Troubleshooting

**The app loads but nothing happens when I drop an image.**
Almost always the CSP. Check the console for a violation naming
`worker-src` or `blob:`. Both are in the generated policy, so this means
`_headers` is stale — rebuild fully rather than running one step.

**The build fails with `GA4_ID "..." is not a valid measurement ID`.**
The ID must look like `G-XXXXXXXXXX`. A Universal Analytics `UA-` ID or a
Google Tag Manager `GTM-` ID will not work. Delete the variable to ship no
analytics at all.

**Pages deploys but every URL 404s.**
The build output directory is probably set to `dist` or `public`. It must be
`/`.

**Styling is missing after a deploy.**
`assets/css/app.css` is generated by `npm run build` and is not committed. If
the build command was changed to something that skips `build:css`, the
stylesheet will not exist.

**A landing page 404s but is in the sitemap.**
This should be impossible — the sitemap is produced by walking the built
output for `index.html` files, so it cannot list a page that was not written.
If it happens, the deploy uploaded a partial build. Redeploy.

**Exports are slow on large images.**
Expected, and deliberate. The preview is computed at reduced resolution for
responsiveness, but export recomputes the mask at full size rather than
upscaling it, because that is the one moment where quality beats latency. A
40-megapixel image takes a few seconds.

**Old pages linger after renaming a locale or slug.**
`npm run clean` removes generated output; the build runs it first. A stale
directory can only survive if it was committed to git by hand.
