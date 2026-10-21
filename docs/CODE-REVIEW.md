# Code review — Client-Side Background Remover

A Principal Engineer / web performance audit of the whole codebase, covering
performance, responsiveness and UI/UX, SEO and accessibility, state management
and security, and Cloudflare Pages compatibility.

Every issue in the first section was found during this build and is fixed in
the committed code. Each is recorded with the symptom, the cause and what now
prevents it, because the interesting part of a bug is what let it exist.

Verified by `npm test` (169 assertions) and `npm run check` (7 sections, 371
built pages), both passing.

---

## The architectural decision this project turns on

A background remover is usually an ML product: U²-Net or RMBG behind ONNX
Runtime Web, 5–45 MB of model weights, a WASM runtime, and
`'wasm-unsafe-eval'` in the Content-Security-Policy.

This one is algorithmic instead — perceptual colour matching, scanline flood
fill, chroma keying, morphology and alpha matting. That is a real trade, and
it is worth stating plainly rather than burying:

**What it buys.** Instant start with nothing to download, genuine offline
operation, a CSP that stays a plain `script-src 'self'`, a repository with no
binary model in it, and a tool that cannot be slow on a weak connection.

**What it costs.** It cannot segment a subject from a cluttered background,
and it will not cut hair out of a photograph taken in a room. That is not a
tuning problem; it is the method's boundary.

The mitigation is honesty, implemented rather than written down: the engine
measures how uniform the border is before removing anything and returns a
`busy-background` warning when the backdrop is not close to one colour, so the
UI says the cut will be rough instead of silently producing a bad one. A
colour-matching tool that admits its limits is more useful than one that
pretends not to have them.

If an ML mode is ever added, it should be a lazily loaded opt-in with a
self-hosted model, so the default path keeps every property above.

---

## Critical issues / bugs

### 1. Auto mode seeded the flood fill from the four corners — **fixed**

**Severity: critical.** This was the worst bug in the project: it destroyed
the subject on the single most common photograph anyone would bring to a
background remover, and it did so without warning.

`buildMask` seeded the fill from the four corner pixels. In any
head-and-shoulders portrait — a passport photo, a headshot, a profile
picture — the subject's shoulders run off the bottom of the frame, so **the
two lower corners are shirt, not backdrop**. The fill then started inside the
subject and spread through it.

Found by running the engine over a real passport photo rather than a
synthetic test image:

```
corner seeds: TL #6b8db2  TR #7698bd  BL #521d17  BR #864333
                 blue wall   blue wall    SHIRT      SHIRT
kept 34.8%      ← most of the shirt and part of the hair removed
```

Worse, the honesty mechanism did not save it: the border was 57% one colour
against a 55% threshold, so the `busy-background` warning missed by two
points and the bad result was presented as a confident one.

The fix stops guessing where the background is. `detectBackground` already
clusters the border by colour; it now also returns the member pixels of the
dominant cluster, and the fill seeds from those. The seeds are background by
construction, wherever in the frame it happens to sit. Same photo, same
settings, after the change:

```
kept 65.1%      ← subject fully intact
```

**Why the tests missed it:** every synthetic fixture centred its subject with
clear margins on all four sides, so the corners were always background. The
test suite now includes a portrait fixture whose shoulders reach both bottom
corners, and asserts that every seed is a backdrop pixel.

---

### 2. The honesty warning had a gap exactly where it was needed most — **fixed**

**Severity: high.** Related to the above, and worth separating because the
threshold was wrong on its own terms.

`busy-background` fired below 55% border uniformity and nothing fired above
it, so an image with one dominant backdrop plus a second background colour —
a wall and a door frame, a sweep and the table under it — got no guidance at
all. The cut was good but incomplete, and the user was left to work out why.

Split into two diagnoses:

- below 45%: `busy-background` — the border is genuinely chaotic and colour
  matching is the wrong tool
- 45–78%: `mixed-background` — one backdrop colour was removed cleanly and
  another remains; pick it with the eyedropper or brush it away

The second message names the action that finishes the job rather than telling
the user their image is difficult, which is the difference between a tool
that feels broken and one that feels like it is helping.

---

### 3. The worker's mask cache could serve a stale result — **fixed**

**Severity: high.** A silent wrong-output bug, the worst kind in an image
editor because the user sees a plausible result and does not know it is wrong.

The worker caches the computed mask and reuses it when only output settings
change. The cache key included `strokes.length`:

```js
maskKey(settings, strokes) { return JSON.stringify([…, strokes.length]); }
```

Undo one brush stroke, then paint a different one: the array is the same
length, the key is unchanged, and the cache hands back the **pre-undo** mask.
The undo appears to do nothing, and the new stroke appears not to register.

Fixed with an explicit revision counter that the editor increments on every
brush mutation — paint, undo, clear — and that is reset when a new image
loads. A counter rather than a hash because it is O(1) per frame, and a hash
of the stroke list would be recomputed on every frame of a slider drag.

**Why it was easy to write:** `strokes.length` looks like a fingerprint and
behaves like one for append-only arrays. Undo is what breaks the assumption.

---

### 4. The canvas draw raced itself and flickered — **fixed**

**Severity: high.** Visible on the single most common interaction.

`putImageData` replaces pixels instead of compositing them, so the rendered
image had to arrive as a drawable surface for its alpha to blend over the
transparency checkerboard. The first implementation reached for
`createImageBitmap`:

```js
this.context.putImageData(this.checker, 0, 0);
createImageBitmap(source).then((bitmap) => this.context.drawImage(bitmap, 0, 0));
```

Two defects, both from that promise:

- **A flicker on every frame.** The checkerboard is painted immediately and
  the image a task later, so a brush drag strobes the checkerboard.
- **Out-of-order frames.** Two draws in quick succession can resolve in either
  order, leaving a stale frame on screen until the next redraw.

Fixed by compositing through a reusable scratch canvas, which is synchronous:
`putImageData` the source onto the scratch surface, `putImageData` the
checkerboard onto the visible canvas, `drawImage` the scratch over it. All in
one task, so neither defect is possible.

---

### 5. The CSP blocked the image decode fallback — **fixed**

**Severity: high on affected browsers**, and invisible on the development
machine, which is what makes it dangerous.

`img-src 'self' data:` does not cover `blob:`. Browsers do not treat a
`blob:` URL as matching `'self'`. The primary decode path is
`createImageBitmap(file)`, which needs no URL — but the fallback path for
older Safari builds does:

```js
const url = URL.createObjectURL(file);
element.src = url;   // blocked by img-src
```

So the tool worked everywhere it was tested and silently failed to open any
image on the browsers that take the fallback. Fixed by adding `blob:` to
`img-src`, with a comment saying why it is load-bearing rather than
decorative.

---

### 6. `worker-src` was left to fall back — **fixed**

**Severity: medium**, and entirely avoidable.

The entire engine runs in a module worker. The CSP declared `default-src` and
`script-src` but not `worker-src`, relying on the specified fallback chain
(`worker-src` → `child-src` → `script-src` → `default-src`). Every value in
that chain was `'self'`, so it worked — but browsers have historically
disagreed about that chain, and a tool whose only function runs in a worker
should not depend on resolving it correctly.

Added `worker-src 'self'` explicitly, and `npm run check` now fails if it goes
missing, alongside the other directives this app depends on.

---

### 7. The default tolerance was below the noise floor — **fixed**

**Severity: medium.** It made the tool look worse than it is on exactly the
images people bring to it.

The slider maps to a Lab distance as `t² × 60`. The original default of 22
works out to **ΔE 2.9**. Typical JPEG and sensor noise on a plain photographic
backdrop spans ΔE 2–6, so the default sat *below* the variation in a normal
photo: a synthetic flat colour cut perfectly, and a real photograph of a
product on white left speckles everywhere.

Raised to 32, which is ΔE 6.1 — above the noise floor, still far below
anything that threatens a subject. Found by printing the curve rather than by
looking at the code, which is the only way this kind of mis-calibration shows
up.

---

### 8. A French slug collision would have shipped two pages at one URL — **fixed**

**Severity: high for SEO.** The chroma-key tool page and the green colour page
both resolved to `/fr/supprimer-fond-vert/`. One would have overwritten the
other at build time, and the `hreflang` group for whichever lost would have
pointed at a page describing something else.

The two pages are genuinely different — one is "remove a green backdrop by
flood fill", the other is "key a green screen by hue" — so the fix was to use
the French term of art: `incrustation-fond-vert`. `npm run check` fails on any
duplicate landing URL, which is how it was caught before the first full build.

---

### 9. Two wasteful full-image passes per interaction — **fixed**

**Severity: medium (performance).**

`detectBackground` computed its own Lab buffer even when the caller had just
built one, and `renderResult` re-detected the background colour on every
re-composite although `buildMask` had already reported which colour it keyed
on. On a 1400 px preview that is two extra full-image conversions — roughly
25 ms per megapixel each — on every slider movement and every background
swatch click.

Both now accept the value the caller already has.

---

### 10. The audit tool reported false positives — **fixed**

**Severity: low, but worth recording.** The first `npm run check` flagged an
inline `<script>` on all 371 pages. The element was
`<script type="application/json" id="i18n-dict">`, which carries the runtime
dictionary.

A `<script>` whose type is not a JavaScript MIME type is an inert data block:
the browser never executes it, and `script-src` does not apply. The check
exempted `application/ld+json` but not the general case. Generalised to test
the type attribute against the set of executable types.

Recorded because a checker that cries wolf gets ignored, which is worse than
not having one.

---

### Not bugs: three cases where the code was right and the test was wrong

All three surfaced as test failures and were resolved in favour of the
implementation.

- **`splitSpan`-style off-by-one in the trim box.** The test expected trimming
  to produce a 40 px crop of a 40 px square; it produces 46 px. Correct: the
  bounding box deliberately includes the feathered halo, because cropping to
  the last fully opaque pixel would slice off the soft edge the feather exists
  to create.
- **A feathered 10 px square is not opaque in the middle.** Three box passes at
  radius 2 reach about 6 px, so on a 10 px shape they meet in the centre. The
  assertion was meaningful only on a shape comfortably larger than the kernel;
  the test now uses one.
- **A gradient that steps over the alpha ramp produces no partial alpha.** The
  test's gradient was steeper per pixel than the ramp was wide, so it jumped
  from opaque to transparent with nothing in between. The ramp was correct;
  the test image was unrealistic.

---

## Optimizations & best practices

### Performance & efficiency

**Already in place**

- **All segmentation runs in a worker.** Hundreds of milliseconds of tight
  loops per megapixel would otherwise freeze the tab — fine on a small logo,
  catastrophic on a phone photo. This is the single most important performance
  decision in the project.
- **The image is uploaded to the worker once.** Dragging a slider sends a few
  bytes of settings, not megabytes of pixels per frame.
- **Mask and composite are separate stages**, with the mask cached. Changing
  the output background re-runs one linear pass instead of re-segmenting.
- **Requests coalesce to one per animation frame.** A range input fires on
  every pixel of travel; without this, releasing the slider leaves a backlog
  of stale results rendering one after another.
- **In-flight requests are abandoned** when a newer one supersedes them.
- **Lab conversion happens once per image**, into a flat `Float32Array`.
  Recomputing per comparison would make the flood fill roughly forty times
  slower.
- **Scanline flood fill with an explicit stack.** The recursive four-way
  version everyone writes first overflows the call stack somewhere past a
  megapixel — a 4000×3000 sky would be twelve million frames deep. There is a
  test that fails if anyone reintroduces it.
- **Separable morphology.** Erode, dilate and blur run as a horizontal pass
  then a vertical one: O(2r) per pixel instead of O(r²). The box blur slides a
  running sum, so cost is constant in the radius.
- **Full-resolution pixels are uploaded lazily**, on the first export. Most
  visitors try settings and leave; paying the largest copy in the app up front
  would slow every session to speed up a minority.
- **The preview is capped at 1400 px** on the long edge, with export
  recomputing at full size rather than upscaling the preview mask.

**Worth considering**

- **Tile the flood fill across several workers** for very large exports. At 40
  megapixels an export takes a few seconds; splitting by rows with a merge
  pass would cut that roughly linearly. Not worth the complexity until someone
  complains.
- **Reuse the Lab buffer between preview requests.** It is rebuilt on each
  `buildMask`, though the pixels have not changed. Caching it in the worker
  alongside the image would remove one full pass per interaction.
- **`OffscreenCanvas` in the worker** would let export encode the PNG without
  returning pixels to the main thread at all.

### Responsiveness & UI/UX

**Already in place**

- Mobile-first throughout; the editor is a single column on a phone and gains
  a control sidebar at `lg`.
- Every interactive control is at least 44 px tall — the WCAG target size and
  the practical floor for a thumb.
- The canvas area reserves its height before any image loads, so dropping a
  picture does not reflow the page.
- `touch-none` on the canvas, so a brush stroke does not drag the page.
- Three ways in — drop, paste, file picker. Paste is the fastest path for a
  screenshot and costs nothing to support.
- Pointer capture on brush strokes, so dragging outside the canvas and back
  does not break the stroke.
- Hold-to-compare works with a pointer **and** with the keyboard: a keyboard
  activation toggles instead of requiring a hold, which "hold a key" would
  make unusable for anyone who cannot hold two at once.
- Every state is driven by `data-has-image` and `data-pointer-mode` on one
  element, so CSS handles disabled states and cursors and there is no
  class-juggling in JavaScript.
- The copyright year is written at runtime, so a page cached across New Year
  never shows a stale year.

**Worth considering**

- **No zoom or pan.** Checking a cutout's edges on a large image means
  trusting a downscaled view. This is the most significant missing feature.
- **No visible brush cursor.** The pointer changes shape but does not show the
  brush radius, so size has to be judged from the slider.
- **Export has no progress indication** beyond a status line. A full-size
  recompute on a 40-megapixel image takes seconds with no bar.
- **No batch mode.** Several of the use-case pages — marketplace listings
  especially — describe workflows where someone has twenty photographs.

### SEO & accessibility

**Already in place**

- 371 pages across four families, each carrying content the others cannot: a
  colour page has that colour's real Lab coordinates and the tolerance those
  coordinates imply, computed by the same module the engine runs; a format
  page states whether that format can store an alpha channel at all.
- Complete `hreflang` groups — every page declares all seven locales plus
  `x-default`, verified against pages that were actually built, so a
  "no return tag" error is structurally impossible.
- `WebApplication`, `FAQPage`, `BreadcrumbList` and `WebPage` JSON-LD, with
  FAQ entries generated from the same dictionary keys the visible FAQ renders,
  so the two cannot drift.
- Text is written with `textContent` everywhere; `innerHTML` appears nowhere
  in the codebase.
- The canvas carries `role="img"` and a translated `aria-label`, and the
  status line is an `aria-live="polite"` region.
- The sitemap is produced by walking the built output, so it cannot advertise
  a URL that 404s.

**Worth considering**

- **The canvas is not reachable by keyboard.** Picking a colour and brushing
  both require a pointer. A keyboard path — arrow keys to move a cursor,
  Enter to act — would make the core function operable without a mouse. This
  is the clearest accessibility gap in the project.
- **Warnings appear in a styled box but are not announced.** Adding
  `aria-live` to the warning element would tell a screen-reader user that the
  background looks too busy.
- **Colour-pair contrast on the amber warning box** should be re-checked in
  dark mode with a contrast tool rather than by eye.

### State management & security

**Already in place**

- **Images are never persisted.** They would blow the ~5 MB localStorage quota
  on the first photo, and keeping someone's picture on disk after they close
  the tab would contradict the product's one promise. Only settings are saved.
- **Per-field validation on read.** Every key has a shape guard; a corrupted
  or hand-edited record degrades field by field to defaults, and an
  unparseable one is removed outright.
- **Storage is probed once** at construction — Safari private mode throws on
  access, not on write — and a failure switches to in-memory state with a
  visible notice rather than throwing on every interaction.
- **Quota handling** drops the only field that grows (recent colours) and
  retries once before giving up on persistence.
- **No XSS surface.** No `innerHTML`, no `insertAdjacentHTML`, no
  `document.write`, no `eval`. The only user-supplied text is a filename,
  rendered with `textContent`.
- **No network code in the image path at all.** This is verifiable by the user
  in the network tab, and it is the claim everything else rests on.
- **Object URLs are revoked** — immediately after decode, and on a timer after
  a download, because revoking synchronously races the download in Safari and
  silently produces an empty file.
- **No inline scripts anywhere**, which is what lets the CSP stay a plain
  `script-src 'self'` with no hashes.

**Worth considering**

- **`set()` silently ignores a patch that fails validation.** Correct for data
  arriving from storage, but a programming error in a UI handler fails
  quietly. A `console.warn` in development would cost nothing.
- **`MAX_PIXELS` is checked after decode**, by which point the bitmap is
  already allocated. Unavoidable without parsing headers by hand, but worth
  knowing that a hostile 100-megapixel file costs memory before it is
  rejected.
- **No schema migration path.** `SCHEMA_VERSION` is stored but only compared.
  The first breaking change to the record shape should add a real migration.

### Cloudflare Pages compatibility

**Already in place**

- 100% static output written in place at the repository root. No server, no
  functions, no KV, no build-time secrets beyond two environment variables.
- **All asset paths are relative**, computed from each page's depth, and
  verified by resolving every `src` and `href` against the filesystem. A
  root-relative path works on the production domain and nowhere else.
- The worker URL is resolved as `new URL('./worker.js', import.meta.url)`, so
  it is correct from any page depth without knowing the deploy prefix.
- `_headers` is generated alongside the sitemap, so the CSP cannot drift from
  what the pages actually load, and analytics origins appear only when a
  measurement ID is set.
- Caching is tiered by directory: CSS immutable for a year behind a content
  hash, JS and dictionaries revalidating, HTML always revalidating.
- `npm run serve` parses the generated `_headers` and applies the same CSP
  locally, which is how issues 3 and 4 above would have surfaced.
- `npm run clean` tests for an `index.html` rather than trusting directory
  names, so a hand-added directory is never deleted.

**Worth considering**

- **A `_redirects` rule** if both apex and `www` are ever served.
- **Cloudflare Web Analytics** as a zero-script alternative to GA4. For this
  tool specifically, an absolute privacy claim is probably worth more than
  demographic reporting.

---

## Summary

| Area | Status |
| --- | --- |
| Correctness | 10 issues found, all fixed; 169 assertions covering the engine |
| Performance | Worker-based, cached, coalesced; no main-thread segmentation |
| Responsiveness | Mobile-first, 44 px targets, CLS ~0, RTL verified |
| SEO | 371 pages, complete `hreflang`, computed long-tail content |
| Accessibility | `textContent` only, labelled controls — **canvas keyboard access is the open gap** |
| Security | No network in the image path, no XSS surface, validated storage, strict CSP |
| Cloudflare Pages | Fully static, relative paths, generated headers, verified locally |

`npm test` — 169 assertions passing.
`npm run check` — 7 sections, 371 pages, passing.
