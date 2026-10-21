# Launch copy

Replace `https://yourdomain.com` with the real URL before posting.

A note on all three: **lead with the limitation.** This tool does not do what
an AI background remover does, and the audience for "background remover" has
seen a hundred posts promising magic. Saying plainly what it will and will not
do is both the honest thing and the thing that makes it credible — the people
who need a plain-backdrop cutout right now will self-select, and nobody
arrives expecting hair matting and leaves annoyed.

---

## Show HN

**Title** (80 char limit — the first is preferred):

> Show HN: A background remover with no ML model, no upload and no wait

Alternatives:

> Show HN: Background removal in the browser using colour maths instead of a neural net
>
> Show HN: I built a background remover that admits when it can't help

**Body:**

> Every browser-based background remover I tried downloads 5–45 MB of model
> weights before it will do anything. For the images I actually needed to cut
> out — product shots on white, logos, signatures, screenshots — that felt
> like a lot of machinery for a problem that is mostly colour matching.
>
> So this one does the colour matching properly instead, and tells you when
> that is not enough.
>
> **What it won't do:** segment a person from a cluttered room, or cut hair
> out of a busy photograph. That needs a neural network and I'm not shipping
> one. What it does instead is measure how uniform the border is before
> removing anything, and if the backdrop isn't close to one colour it says the
> cut will be rough rather than producing a bad one silently. A tool that
> knows its own boundary is more useful than one that pretends not to have
> one.
>
> **What it does well:** anything on a plain or near-plain backdrop. The parts
> that took the longest were the ones that separate a clean cutout from an
> obviously cut-out one:
>
> - **Perceptual distance.** Matching in RGB is why cheap tools leave halos:
>   a tolerance that cleanly removes white also eats light skin tones. Doing
>   it in CIE L\*a\*b\* means one slider position behaves the same on light and
>   dark backgrounds.
> - **Edge decontamination.** A boundary pixel is a genuine mix of subject and
>   background, so after keying it still carries the old background's colour —
>   the white halo. You can un-mix it by solving the compositing equation
>   backwards: `subject = (observed − (1−α)·background) / α`. In linear light,
>   which is the part most implementations skip.
> - **Enclosed gaps.** The hole in an O, the space inside a mug handle. All
>   background, none touching the border, so a connected flood fill can never
>   reach it. One switch turns connectivity off and clears them — the single
>   most useful control on a logo.
> - **Linear-light compositing.** Blending a half-covered edge pixel using
>   gamma-encoded values makes it darker than it should be. White over black
>   at 50% is 188, not 128. Getting this wrong is the dark outline you see
>   around cheap cutouts, and there's a test for it.
>
> Everything runs in a worker, because segmenting a megapixel on the main
> thread is a frozen tab. The image is handed to the worker once, so dragging
> a slider sends a few bytes rather than re-posting megabytes per frame.
>
> Two bugs worth the embarrassment. The worker caches the mask so that
> changing the output background doesn't re-segment — and I keyed that cache
> partly on `strokes.length`, which looks like a fingerprint right up until
> you undo a brush stroke and draw a different one. Same length, cache hit,
> stale mask. And the canvas draw used `createImageBitmap` to composite over
> the transparency checkerboard, which is async: two draws during a brush drag
> could resolve out of order, and there was a checkerboard flicker between the
> two paints every frame. A synchronous scratch canvas fixed both.
>
> No upload, because there's no server to upload to — open the network tab and
> remove a background, nothing is sent. No account, no watermark, no limit.
> 371 pages across seven languages, static files on Cloudflare Pages, costs me
> nothing to run.
>
> https://yourdomain.com
>
> Happy to go into the matting or the flood fill. And genuinely interested in
> images where it fails that I'd expect it to handle — those are the useful
> bug reports.

**Posting notes**

- Tuesday to Thursday, 08:00–10:00 ET.
- Be in the thread for the first two hours.
- **Expect "why not just use rembg/U²-Net".** Good answer: for a cluttered
  background you should, and I say so on the page. This is for the case where
  a 30 MB download to key a white backdrop is the wrong trade. Don't get
  defensive — the question is fair.
- Expect someone to test it on a hard photo and report it did badly. Thank
  them and point at the warning; that is the design working.
- Expect a question about Lab vs CIEDE2000. Honest answer: CIEDE2000 is more
  accurate near the blue axis but costs about fifteen times more per
  comparison, and against a user-adjustable slider the difference never
  reaches a visible pixel.

---

## Reddit

Post only where it's on-topic, and lead with the answer rather than the link.

### r/webdev — "Showoff Saturday"

**Title:** Background removal in the browser without an ML model — the colour
maths that makes it work

> No neural network, no WASM runtime, no model download. Static HTML and
> vanilla ES modules, everything in a worker.
>
> The interesting part isn't the flood fill, it's the edge. After you key out
> a background, the boundary pixels are still a mix of subject and
> background — that's the white halo everyone recognises. You can remove it
> arithmetically, because you know what the mix was:
>
> ```
> observed = α·subject + (1−α)·background
> subject  = (observed − (1−α)·background) / α
> ```
>
> Two gotchas. Do it in linear light, not on the stored sRGB values, because
> the mixing happened in linear light. And skip pixels below about 15% alpha —
> dividing by a very small number turns sensor noise into confetti.
>
> Same lesson applies to compositing onto a new background: blend in linear
> light or your half-covered edge pixels come out too dark, which reads as a
> dark outline. White over black at 50% should be 188, not 128.
>
> Also: write the flood fill iteratively. The recursive four-way version is
> what everyone writes first and it overflows the call stack somewhere past a
> megapixel — a 4000×3000 photo of a uniform sky would be twelve million
> frames deep.
>
> Happy to answer anything about the build. [link]

### r/SideProject

**Title:** Free background remover — no upload, no signup, no watermark, works
offline

> Drop in an image, the background comes off, download a transparent PNG.
>
> Everything runs in your browser. There's no server, so there's nothing to
> pay for and nothing to collect — your image never leaves your device. You
> can verify that in the network tab.
>
> Honest limitation: it matches colours rather than recognising objects, so
> it's great on plain backdrops (product photos, logos, signatures,
> screenshots, green screens) and not good on someone photographed in a messy
> room. It tells you which case you're in instead of guessing.
>
> Seven languages, 371 pages, hosted free. [link]

### Value-first comments

In r/Etsy, r/FulfillmentByAmazon, r/graphic_design and similar, **answer the
question first**. Link only if it genuinely adds something.

> Amazon wants the main image on pure white — #ffffff exactly, not off-white.
> That trips people up constantly, because "white background" in a photo is
> almost never 255,255,255; it's whatever your lighting made it. Worth
> checking the actual pixel values before you assume you're compliant.

> If your cutout has a faint white edge on a dark background, that's not a
> selection problem — the edge pixels genuinely contain some of the old
> background, because they were always a mix of the two. You need the tool to
> un-mix them, not a tighter selection. Most editors call it decontamination
> or defringe.

> A white product on a white background has no edge for any tool to find —
> that's a camera problem, not a software one. Shoot it on grey or a coloured
> sweep and the cutout becomes trivial. Nothing can recover an edge that was
> never captured.

---

## Product Hunt

**Name:** Cutout

**Tagline** (60 char limit):

> Remove image backgrounds in your browser. Nothing uploaded.

Alternatives:

> Background removal with no upload, no signup and no watermark
>
> Transparent PNGs in one drop — entirely on your own device

**Description:**

> Drop in an image and the background comes off. Download a transparent PNG,
> or put the subject on any colour you like.
>
> Everything runs in your browser. There is no server to upload to, no
> account, no watermark and no limit — and because nothing is queued anywhere,
> there is no waiting.
>
> It works by matching colours rather than recognising objects, which makes it
> excellent on plain backdrops: product photos, logos, signatures,
> screenshots, scanned pages and green screens. It will not cut a person out
> of a cluttered room — and rather than pretending otherwise, it checks how
> uniform the background is first and tells you when the result will be rough.
>
> Fine control when you want it: perceptual tolerance, edge softness and
> shift, fringe removal, spill suppression, and a brush for anything the
> automatic pass misses.
>
> Available in English, Spanish, Portuguese, French, Hindi, Indonesian and
> Arabic.

**First comment (maker):**

> Maker here. I built this because every in-browser background remover I tried
> wanted to download tens of megabytes of model weights before it would touch
> an image, and most of what I needed to cut out was a product on a white
> sheet.
>
> The deliberate choice is that there's no AI in it. That means it genuinely
> cannot handle hair against a busy background — and rather than hide that, it
> measures how uniform the backdrop is before removing anything and warns you
> when a colour-based cut won't be clean. I'd rather it be honest and fast
> than impressive and occasionally wrong.
>
> The work went into the parts you only notice when they're missing: matching
> colours perceptually so one tolerance setting behaves the same on light and
> dark backgrounds, un-mixing the old background out of semi-transparent edge
> pixels so there's no halo, and compositing in linear light so edges don't
> darken.
>
> Free, no account, nothing uploaded. Keen to hear about images where it
> underperforms — especially plain-background ones, since those are the cases
> it's supposed to nail.

**Launch notes**

- Launch 00:01 PT.
- Gallery: before/after on a product photo, the logo case with the letter
  counters cleared, the green-screen result, and **the warning state**. That
  last one is the screenshot that explains the whole positioning.
- Topics: Design Tools, Productivity, Privacy.
- Answer every comment on day one.

---

## Positioning, in one line each

| Audience | The line |
| --- | --- |
| Hacker News | Colour maths done properly, and an honest boundary, instead of a 30 MB model |
| r/webdev | Here is how edge decontamination and linear-light compositing actually work |
| r/SideProject | No upload, no signup, no watermark, works offline, seven languages |
| Product Hunt | A background remover that tells you when it can't help |
| Someone searching | A transparent PNG, in one drop, with nothing to sign up for |
