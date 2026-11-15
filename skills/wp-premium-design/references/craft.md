# Craft: what makes a site look expensive (numbers and techniques)

What looks expensive is **restraint carried all the way through**: few decisions, each one chosen and held everywhere. What looks cheap is crowding, randomness, mixed styles, dead states and decoration with no job.

The numbers below are a starting point, not dogma. Once a value is chosen, hold it across the whole site.

---

## 1. Typography: the fastest "expensive" signal

**Choosing typefaces**
- One family with a strong scale, or two clearly different ones: e.g. a serif for headings and a grotesque for text, or a wide grotesque with a humanist one. **No more than 2 families** per site, 2–3 weights each.
- Search from the subject: signage, packaging, machinery, era, place. Only then browse catalogues:
  - Google Fonts (past the first page of popular ones);
  - Fontshare (ITF Free Font License, commercial use allowed);
  - Velvetyne, Collletttivo, Use & Modify (open source).
- The font must support the needed languages (Latin, Latin Ext, Cyrillic if needed) and have figures suitable for prices.
- Record in the project notes which font is used where. **Don't reuse a font from your last three projects.**

**Loading in WP**
- Self-hosted only: subsetted woff2, `@font-face` with `font-display: swap`.
- Preload 1–2 key files (hero heading font and body text). Google Fonts from the CDN is an external request and a GDPR question.
- Give the fallback font `size-adjust` / `ascent-override` so text doesn't jump on load (CLS).

**Scale**
- Body text 16–18 px (17–18 for "premium" and editorial), small text no less than 14 px.
- Scale ratio 1.2–1.333 for content levels. The display level may jump further: hero h1 56–96 px on desktop, 36–48 px on phones. Example: `clamp(2.5rem, 1.4rem + 4vw, 5.5rem)`.
- h1 at least 2.5–3× the body size. Build hierarchy with size and weight, not colour.

**Line height and tracking**
- Text: 1.5–1.7 (0.05–0.1 more for serifs).
- Headings: 1.0–1.2; the bigger, the tighter.
- Large headings: `letter-spacing` −0.01 to −0.03em. Text: 0. Caps (if really needed): +0.04…0.08em.

**Measure and wrapping**
- 55–75 characters per line: `max-width: 65ch` for text, 18–22ch for a big hero heading.
- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs. No orphans or lone words on the last line.

**Small things**
- Prices and tables: `font-variant-numeric: tabular-nums`. Currency and units sit next to the number with a non-breaking space: `19&nbsp;L`, `$12`.
- Real quotes and apostrophes (’ “ ”), en dashes for ranges (`9–18`).
- Link underline: `text-underline-offset: .2em; text-decoration-thickness: 1px` (links in body text must be underlined).

## 2. Colour

- **60/30/10**: dominant (background and large planes), secondary (surfaces, sections), accent only for actions and what matters. If the brand colour floods everything, it stops guiding the eye.
- A palette of 4–6 tokens with **roles**, not values: `--c-ground`, `--c-surface`, `--c-ink`, `--c-muted`, `--c-action`, `--c-accent`. Build shades in `oklch()` on one hue. Tint neutrals slightly toward the brand hue.
- Choose the text colour on purpose: pure black or a dark palette colour for a reason, not "#111 out of habit".
- On a coloured surface, tint secondary text, lines and shadows with that surface's hue, not a neutral grey: grey on colour looks dirty.
- Contrast: text 4.5:1, large text (24 px+, or 18.66 px+ bold) 3:1, field borders and icon buttons 3:1.
- Text on photos: darken only the text area with a gradient, never a 60% dark veil over the whole photo. Choose photos with a calm zone under the text.
- One colour family for photos and UI: warm photos and a cold UI fight.

## 3. Grid, spacing, rhythm

- **Spacing scale in steps of 4/8**: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160. Use only these.
- Vertical section padding: desktop 96–160 px, tablet 72–96, phone 56–72. **Sections that differ by importance** create rhythm. The same everywhere is a template.
- Proximity: heading → text 12–24 px; text → button 24–32; more space between groups than inside them.
- Container 1200–1320 px. Text column 640–720. Some sections full-bleed (photos), some narrow. Width is a tool, not a constant.
- 12 columns, asymmetric splits 5/7, 4/8, 7/5. Left and right content edges are equal and line up between sections.
- Side padding on phones 16–24 px. No horizontal scroll at any width from 360 to 1920.
- **One main thing per screen.** The first screen answers: what is it, for whom, what next. At 390 px the button is visible without scrolling.
- Radii by role, 2–3 values per site. For example: buttons 999 px or 6–10 px, cards 12–20, photos 0–16. Flat surfaces are a decision too.
- Shadows layered and soft, tinted with the background, only on things that truly float: sticky header, dropdown, modal, hovered card. Structure is held by space and thin lines.
- No cards inside cards. One level of nesting.

## 4. Photos and graphics

- The real subject: product, place, process, hands, material close up. People look at the product, not at the camera.
- Consistent ratios per role:
  - hero 16:9 / 21:9 on desktop and 4:5 on phones (own crop: `<picture>`, a separate ACF field or `object-position`);
  - cards 4:3 or 3:2;
  - portraits 4:5.
- `object-fit: cover` with an `object-position` chosen per photo (an ACF "focal point" field works).
- One colour grade for all photos: temperature, contrast, saturation. Stock photos "on white" can't be dropped into coloured sections.
- Quality: hero up to 2560 px wide, WebP/AVIF, quality 75–82. Your own `add_image_size` per role. A correct `sizes`.
- Logo in SVG, not stretched, with clear space. Site Icon set. Icons from one set, one stroke (1.5–2 px at 24 px), aligned to the x-height.
- Photo and font licences recorded in `CREDITS.md`.

## 5. Motion
Short version below; the full version (when to animate, GSAP, View Transitions, WebGL, testing) is in [motion-3d.md](motion-3d.md).

**Duration scale**
- Press and hover: 120–200 ms.
- Small UI (dropdown, accordion, panel): 200–300 ms.
- Reveals: 400–700 ms.
- Hero entrance on load: 1.2 s in total at most. Stagger 40–80 ms.
- Exit ~20% faster than entrance.

**Easing**
- `cubic-bezier(.2,.7,.2,1)` or `cubic-bezier(.16,1,.3,1)` (ease-out); on-screen movement ease-in-out; infinite motion linear.
- No springs or overshoot (`easeOutBack`, `bounce`) except for playful brands. Never `ease-in` in UI.

**How to animate**
- Animate only `transform` and `opacity`. Never `transition: all`, `width/height/top`, or looping `box-shadow`.
- No `filter` or `backdrop-filter` in animations (main-thread cost).

**Hovers** (mouse only: `@media (hover: hover) and (pointer: fine)`; on touch, hover sticks)
- Button: darkens or lifts 1–2 px; on press `scale(.97–.98)`.
- Photo: scales 1.03–1.05 inside an `overflow: hidden` frame over 600–800 ms.
- Link: the underline draws in.
- Lifting card: an invisible strip under it so it doesn't jitter at the edge.

**Reveals and "moments"**
- Scroll animation only for 1–2 key moments, 12–24 px of travel, once.
- **Content is visible without JS**: no `opacity: 0` in CSS waiting for JS to add a class.
- The page's "moment" comes from the subject. For a water brand it could be liquid physics in an icon, a tilting bottle, a pour. That is the signature, not a pile of random effects.

**Limits**
- Slider: a static hero is better. If a slider is needed: no autoplay or ≥6 s, pause on hover and focus, and a pause button (WCAG 2.2.2). Paused off-screen.
- No preloader: it delays LCP. If the client insists, 300–500 ms at most and only on the first visit.
- `prefers-reduced-motion: reduce` removes translation, scaling, parallax, pinning and autoplay; gentle opacity and colour changes may stay. **Nothing is left hidden** (check: `check.mjs --reduced-motion`). Infinite animations pause off-screen.

## 6. Details that read as "expensive"

- **Buttons**: 44–52 px tall (48+ on phones), 20–32 px horizontal padding, one primary button per screen, the secondary clearly weaker. States: hover, active, `:focus-visible` (2–3 px ring with offset, 3:1 contrast), disabled, loading.
- **Forms**: visible labels (not just placeholders), 48 px fields, field text **16 px or more** (otherwise iOS zooms the page on focus), `autocomplete`, `inputmode="tel"`, clear errors next to the field, focus moves to the first error on submit, "sending" and "success" states, spam protection (honeypot, Akismet, Turnstile). Don't disable the submit button in advance; disable it once the request is sent. Email texts in the project language too.
- **Navigation**: up to 6–7 items, the current item visible. A compact sticky header (64–72 px) with a solid background. Under a sticky header: `html { scroll-padding-top: <header height + 16px> }`, otherwise anchors and keyboard focus land under it. Mobile panel: large items, Esc and backdrop click close it, focus stays inside, page scroll locked (`overscroll-behavior: contain` inside the panel).
- **Optics**: nested radii are concentric (inner = outer − the gap between them); align an icon next to text by eye (±1 px), make a thin icon next to bold text a half-step heavier. Geometrically even ≠ visually even.
- **Empty and edge states**: 404 with search and links, empty archive, long post title, post without an image, 1 and 10 repeater rows.
- **Meta**: `<title>` and description on every page (SEO plugin), OG image, Site Icon, `lang`.
- **Selection colour** `::selection` in the brand colour. Caret and checkboxes via `accent-color`.
- **Footer**: only what really exists. Opening hours, contacts, legal links, required credits.

## 7. Copy
- Headline = what + for whom or where + proof: "Spring water delivered across Chelsea in 2 hours". Test: would the owner say it out loud?
- Button = verb + object, and the same verb later in the flow: button "Order delivery" → message "Delivery ordered".
- Numbers concrete and true (plausible in a demo). No triple slogans, no "Welcome to our website".
- Tone: simple verbs, sentence case, no filler. Errors explain how to fix and don't apologise.
- Every piece of text does one job. A label above the heading that repeats the heading is removed.

## 8. Hero: options from the subject (not a menu)
- 5/7 split: a large heading on the left, a tightly cropped real photo on the right, a button and one line of proof.
- Full-width photo, text in a calm zone of the frame, a gradient only under the text.
- Typographic hero: a huge heading, one supporting image or object.
- Product on a surface: real shadows, close up, price and size as part of the composition.
- Fact: one important true number, large (only if it really is the main thing).

Test the chosen option with the question from SKILL.md: *"Would I have arrived at this for any similar site?"*

## 9. Last pass: the "Chanel mirror"
Before delivery, take off one trinket: an extra shadow, an extra animation, an extra badge, an extra label above a heading. If the site lost nothing, it was not needed.
