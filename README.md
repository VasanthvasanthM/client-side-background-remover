# Client-Side Background Remover

Remove the background from an image and download a transparent PNG. Static
HTML, Tailwind CSS and vanilla ES modules — no framework, no backend, no
upload, no watermark.

Every pixel is processed in the visitor's own browser. There is no server to
send an image to, which is a property of the architecture rather than a
promise in a privacy policy.

**371 pages across 7 languages**, all generated at build time and deployable
to Cloudflare Pages for nothing.

---

## What it does

| Mode | For |
| --- | --- |
| **Automatic** | Detects the backdrop from a ring of border pixels and removes everything connected to the edges that matches it |
| **By colour** | Eyedropper one colour and remove it — either only where it touches the edges, or everywhere, which is what clears the gaps inside letters |
| **Green screen** | Keys on hue, so a lit screen and its shadows go together, with saturation and brightness floors that protect dark hair and grey clothing |
| **Brush** | Paint away what the automatic pass missed, or paint back what it took |

Output is a transparent PNG or WebP, or the subject composited onto a flat
colour, optionally trimmed tight to the subject.

### What it is not

This matches colours. **It does not recognise objects.** It is excellent on a
plain or near-plain backdrop — product shots, logos, signatures, screenshots,
scanned pages, green screens — and poor on a subject photographed against a
cluttered scene. It will not cut hair out of a busy photograph.

Tools that manage that case run a neural network and need tens of megabytes of
model weights downloaded first. This one needs nothing, starts instantly and
works offline. That is the trade, and the UI states it: when the border is
several unrelated colours, the page says the cut will be rough instead of
silently producing a bad one.

### The parts most tools get wrong

- **Perceptual colour matching.** Distance is measured in CIE L\*a\*b\*, not
  RGB. An RGB tolerance that cleanly removes a white background also eats
  light skin tones; one that spares them leaves grey fringing.
- **Edge decontamination.** A boundary pixel is a genuine mix of subject and
  background, so after keying it still carries the old background's colour.
  The compositing equation is solved backwards to un-mix it — in linear light,
  which is why no white halo or green rim survives.
- **Enclosed gaps.** The hole in an O, the space inside a mug handle. All
  background, none of it touching the border, so a connected fill can never
  reach it. One switch clears them.
- **Linear-light compositing.** Blending a half-covered edge pixel using
  gamma-encoded values makes it darker than it should be — the dark outline
  you see around cheap cutouts. Converting to linear first fixes it.
- **Soft alpha.** The mask ramps between two thresholds rather than snapping
  at one, so edges are anti-aliased rather than stair-stepped.

---

## Languages

English (root), Spanish, Portuguese, French, Hindi, Indonesian and Arabic,
each at its own subfolder URL with full `hreflang` alternates. Arabic renders
right-to-left. Every dictionary holds the same 368 keys, enforced by
`npm run check`.

```
/            /es/          /pt/          /fr/
/hi/         /id/          /ar/
```

Landing-page slugs are localized in the Latin-script locales; Hindi and Arabic
keep English slugs, because a percent-encoded Devanagari or Arabic URL
survives neither a paste into a chat nor being read aloud over a call.

```
/remove-white-background/
/fr/supprimer-fond-blanc/
/id/hapus-latar-dari-logo/
```

---

## Getting started

```bash
npm install          # tailwindcss, the only dependency, and dev-only
npm run build        # 371 pages, sitemap, robots.txt and _headers
npm run serve        # http://localhost:4173
```

`npm run dev` does both. The local server parses `_headers` and applies the
same CSP and caching rules Cloudflare will, so a policy that would break the
app in production breaks it here first.

### Scripts

| Script | Does |
| --- | --- |
| `npm run build` | Clean, compile CSS, generate images, render every page, write the sitemap |
| `npm run serve` | Static server at `:4173` that mirrors Cloudflare Pages |
| `npm test` | 158 assertions over the colour, mask and compositing maths |
| `npm run check` | Dictionary parity, URL uniqueness, built-output and CSP audit |
| `npm run clean` | Remove generated output, leaving sources |

### Build configuration

Both are environment variables, so neither the domain nor the analytics ID is
committed:

```bash
SITE_URL=https://yourdomain.com GA4_ID=G-XXXXXXXXXX npm run build
```

Without `SITE_URL` the build warns loudly and falls back to a placeholder
domain. Without `GA4_ID` no analytics script is emitted at all, and the
generated CSP contains no analytics origins.

---

## How it is built

```
assets/js/      color.js      sRGB, linear light, CIE L*a*b*, HSV — pure
                mask.js       flood fill, chroma key, morphology — pure
                composite.js  alpha, decontamination, despill, brush — pure
                engine.js     the pipeline that joins them — pure
                worker.js     runs the engine off the main thread
                editor.js     image loading, worker messaging, canvas
                app.js        control wiring
                store.js      validated localStorage, settings only
assets/i18n/    seven dictionaries, 368 keys each
src/            page and landing templates, plus header/footer partials
scripts/        the build, the sitemap generator, the checks and the tests
```

**The engine is pure and DOM-free.** Typed arrays in, typed arrays out. That
is what lets the worker, the main-thread fallback and the test suite all run
the identical code — there is no second implementation to drift.

**All the heavy work is in a worker.** Segmenting a megapixel image is
hundreds of milliseconds of tight loops; on the main thread that is a frozen
tab. The image is uploaded to the worker once and kept there, so dragging a
slider sends a few bytes of settings rather than re-posting megabytes of
pixels every frame.

**Mask and composite are separate stages.** Changing the output background
re-runs only the second, which is a single pass, so swatch clicks are instant
while the expensive segmentation is reused.

**Requests are coalesced per frame.** A range input fires on every pixel of
travel; without coalescing, dragging the tolerance slider queues a hundred
segmentations and the preview trails the handle by seconds.

**Brush strokes are stored in normalised coordinates**, not pixels. The
preview is a downscaled copy, so a stroke recorded in preview pixels would
land in the wrong place on a full-size export.

**No inline scripts anywhere.** The pre-paint theme setter and the analytics
config are both real files, and the GA4 measurement ID reaches its script on a
`data-ga4-id` attribute. That is what lets the CSP stay a plain
`script-src 'self'` with no hashes and no `'unsafe-inline'`.

### Page weight

A page loads ~40 KB of HTML, 32 KB of minified CSS and ~117 KB of ES modules —
of which the landing pages load only about 4 KB, since they never touch the
editor. No fonts are fetched, no CDN is contacted, and the social image is a
12 KB PNG generated at build time by a dependency-free encoder.

### Limits

| | |
| --- | --- |
| Maximum file size | 50 MB |
| Maximum pixels | ~40 megapixels |
| Preview resolution | capped at 1400 px on the long edge; export recomputes at full size |
| Accepted input | PNG, JPG, WebP, GIF, BMP, AVIF, ICO |
| Output | PNG or WebP, both with a real alpha channel |

---

## Testing

`npm test` runs 158 assertions with no framework, over synthesised images
whose correct answer is known by construction — the assertions are about
geometry, not about "looks right".

- A dark square on a light background: the seeded corner is removed, the
  centre survives, and the kept area matches the square's area.
- An enclosed hole: a contiguous fill cannot reach it, a global match clears
  it, and neither touches the subject.
- A 1.44-megapixel uniform fill completes — the recursive flood fill everyone
  writes first overflows the call stack here.
- Lit green and shadowed green both key out; near-black and desaturated grey
  both survive the saturation and brightness floors.
- Erode then dilate restores a shape larger than the radius, and feathering
  does not move its centre of mass.
- Half-covered white over black composites to ~188, not 128 — the linear-light
  check that catches the most common compositing bug there is.

`npm run check` enforces what the build cannot: dictionary parity and
placeholder preservation across seven languages, 364 unique landing URLs in
complete `hreflang` groups, recommended settings that name modes the engine
actually implements, relative asset paths that resolve on disk, no executable
inline script on any of 371 pages, and a CSP carrying every directive this app
depends on.

---

## Privacy

There is no network code in the image path. The file is decoded by the
browser, processed by a same-origin worker, and discarded when the tab closes.
Only settings are persisted — never image data, which would both blow the
~5 MB localStorage quota and contradict the one promise this tool makes.

You can verify it: open the network tab and remove a background. Nothing is
sent.

---

## Deploying

See [docs/DEPLOY.md](docs/DEPLOY.md) for Cloudflare Pages, and
[docs/ANALYTICS-SEO-SETUP.md](docs/ANALYTICS-SEO-SETUP.md) for GA4, domain
verification, sitemap submission and the Core Web Vitals checklist.
[docs/CODE-REVIEW.md](docs/CODE-REVIEW.md) is the engineering audit.

The whole site is static files. There is no server to run and no state to
migrate.

---

## Licence

MIT. Results depend on how distinct your subject is from its background.
