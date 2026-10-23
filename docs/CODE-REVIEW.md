# Code review — Client-Side Background Remover

A Principal Engineer / web performance audit of the whole codebase, covering
performance, responsiveness and UI/UX, SEO and accessibility, state management
and security, and Cloudflare Pages compatibility.

Every issue in the first section was found during this build and is fixed in
the committed code. Each is recorded with the symptom, the cause and what now
prevents it, because the interesting part of a bug is what let it exist.

Verified by `npm test` (186 assertions) and `npm run check` (7 sections, 371
built pages), both passing.

---

## The architectural decision this project turns on

The default engine is algorithmic — perceptual colour matching, scanline flood
fill, chroma keying, morphology and alpha matting. It starts instantly, needs
no download, works offline and keeps the CSP small.

Its boundary is real: it matches colours, so it cannot segment a subject from
a cluttered room. That was mitigated first by honesty — the engine measures
border uniformity before removing anything and warns when colour matching is
the wrong tool — and the warnings remain, because they are what makes the fast
path trustworthy.

But honesty is not a substitute for working. A background remover that fails
on a photograph taken indoors fails at the job most people arrive with, and no
amount of well-worded warning changes that. So there is now a second engine.

**AI mode** runs U²-Net (small variant, Apache-2.0, 4.36 MB) through ONNX
Runtime Web (MIT, 13.58 MB of WebAssembly) — about 7.6 MB over the wire once
compressed. It is:

- **opt-in**, behind an explicit consent prompt stating the size
- **lazily imported**, so a visitor who never enables it downloads nothing;
  `ai.js` is reached only through a dynamic `import()` inside the worker
- **self-hosted**, so enabling it still makes no third-party request
- **cached** in the Cache API rather than left to an HTTP cache that may evict
  a 4 MB entry whenever it likes

The privacy claim is unchanged and worth restating precisely, because this is
the one place it could plausibly have broken: **the model travels to the
browser; the image still never leaves it.** There is no network call in the
image path in either mode.

The cost is `'wasm-unsafe-eval'` in `script-src`. Instantiating a WebAssembly
module counts as eval under CSP and there is no narrower token. It permits
WebAssembly only — not `eval()`, not `new Function()`, not inline script — and
`npm run check` now fails if plain `'unsafe-eval'` ever appears beside it.

Inference is single-threaded on purpose. Threads need SharedArrayBuffer, which
needs cross-origin isolation, which means sending COEP and breaking the
analytics snippet for anyone who enables it. A one-shot 320×320 forward pass
takes roughly two seconds on one thread, which is an acceptable price for not
reshaping the whole site's headers around an optional feature.

The two engines are complementary rather than ranked. The model knows *what* a
subject is; it draws the boundary on a 320-pixel grid that is then scaled up.
On a clean backdrop the colour modes still give a crisper edge.

---

## Critical issues / bugs

### 1. The runtime dictionary shipped four of the fifteen key groups in use — **fixed**

**Severity: high**, and invisible in casual testing, which is what makes it
worth putting first.

Most strings are baked into the markup at build time. Anything assembled at
runtime — an error, a status line, one of the honesty warnings — is looked up
by key from a trimmed dictionary inlined into the page. That subset is chosen
by a prefix list, and the list had been copied from a different project in
this series and never updated: it covered `app.`, `a11y.`, `common.` and
`foot.`, plus eight prefixes belonging to a date calculator.

So 17 keys were shipped where 50 were needed. Every error message, the saved
file confirmation, the picked-colour label, the image info line and — most
pointedly — the `mixed-background` warning added one commit earlier would
have rendered as the bare key.

Fixed, and `npm run check` now scans `assets/js` for `t('…')` literals and
for template-built keys like `` `warn.${name}` ``, then fails if any of them
falls outside the prefix list or is missing from a dictionary. Removing two
prefixes makes it report seven failures, so it is known to work rather than
assumed to.

**Why it survived so long:** a missing runtime key degrades to text that
looks like a translation placeholder, not like a crash. Nothing throws.

---

### 2. Auto mode seeded the flood fill from the four corners — **fixed**

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

### 3. The honesty warning had a gap exactly where it was needed most — **fixed**

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

### 4. The worker's mask cache could serve a stale result — **fixed**

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

### 5. The canvas draw raced itself and flickered — **fixed**

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

### 6. The CSP blocked the image decode fallback — **fixed**

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

### 7. `worker-src` was left to fall back — **fixed**

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

### 8. The default tolerance was below the noise floor — **fixed**

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

### 9. A French slug collision would have shipped two pages at one URL — **fixed**

**Severity: high for SEO.** The chroma-key tool page and the green colour page
both resolved to `/fr/supprimer-fond-vert/`. One would have overwritten the
other at build time, and the `hreflang` group for whichever lost would have
pointed at a page describing something else.

The two pages are genuinely different — one is "remove a green backdrop by
flood fill", the other is "key a green screen by hue" — so the fix was to use
the French term of art: `incrustation-fond-vert`. `npm run check` fails on any
duplicate landing URL, which is how it was caught before the first full build.

---

### 10. Two wasteful full-image passes per interaction — **fixed**

**Severity: medium (performance).**

`detectBackground` computed its own Lab buffer even when the caller had just
built one, and `renderResult` re-detected the background colour on every
re-composite although `buildMask` had already reported which colour it keyed
on. On a 1400 px preview that is two extra full-image conversions — roughly
25 ms per megapixel each — on every slider movement and every background
swatch click.

Both now accept the value the caller already has.

---

### 11. The audit tool reported false positives — **fixed**

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

**Added after user testing**

Both of these came out of someone actually trying to use the brush and not
being able to, which is the only reliable way to find them:

- **A brush ring that follows the pointer**, drawn at the brush's true
  on-screen size. The radius is stored in image pixels, so it is multiplied by
  the current zoom before being shown — at 25% a 40px brush covers 10 screen
  pixels, and a ring of the wrong size is worse than no ring. It is tinted
  differently for erase and restore, because those are the same tool and the
  checkbox that distinguishes them is in another panel.

- **Zoom and pan.** Fit, actual size, stepped buttons, Ctrl/Cmd + wheel about
  the pointer, keyboard `0`/`1`/`+`/`-`, and drag-to-pan when no painting tool
  owns the pointer. Implemented as plain CSS sizing on a scrolling viewport
  rather than a transform, which means `getBoundingClientRect` keeps mapping
  pointer coordinates to image pixels with no extra maths — the brush and the
  eyedropper needed no changes at all to work while zoomed.

  Zooming anchors to a point: the viewport centre for the buttons, the pointer
  for the wheel. Without that the scroll offsets stay put while the content
  grows, and whatever you were looking at slides off screen.

**Worth considering**

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
| Correctness | 11 issues found, all fixed; 186 assertions covering the engine |
| Performance | Worker-based, cached, coalesced; no main-thread segmentation |
| Responsiveness | Mobile-first, 44 px targets, CLS ~0, RTL verified |
| SEO | 371 pages, complete `hreflang`, computed long-tail content |
| Accessibility | `textContent` only, labelled controls — **canvas keyboard access is the open gap** |
| Security | No network in the image path, no XSS surface, validated storage, strict CSP |
| Cloudflare Pages | Fully static, relative paths, generated headers, verified locally |

`npm test` — 186 assertions passing.
`npm run check` — 7 sections, 371 pages, passing.
