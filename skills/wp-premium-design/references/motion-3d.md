# Motion, effects and 3D: rules with numbers

Read this when the project has scroll animations, GSAP/Lenis, pinned scenes, page transitions, WebGL/Three.js/OGL,
a video background or a "wow effect". The short version of motion is in [craft.md](craft.md) §5. Testing: `scripts/motion.mjs`.

The core idea: **motion comes from the subject and answers an action**. One signature scene per site, everything else quiet and fast.
Optimizing motion **never changes the look or behaviour**: screenshots or pixels before and after, otherwise it is not an optimization
but an unrequested redesign.

---

## 1. Should it animate at all?
Frequency decides: the more often someone sees an element, the less it should move.
| How often | Example | Motion |
|---|---|---|
| Hundreds of times | keyboard actions, search, switching tabs by keyboard | none |
| Dozens of times | hovers, menu items, accordion | minimal: colour, 1–2 px, ≤150 ms |
| Sometimes | modal, mobile menu, dropdown, notification | standard (table below) |
| Rarely, first time | hero entrance, signature scene, form success | can be expressive |

Every animation has a job:
- show where an element came from and where it went (spatial link);
- show state (open/closed, loading);
- explain how something works (how a filter works, how water passes through stages);
- give feedback on a press;
- soften an abrupt appearance.

"It looks nice" is not a job.

## 2. Curves and durations
| Situation | Easing | Duration |
|---|---|---|
| Press (`:active`) | ease-out | 100–160 ms, `scale(.97–.98)` |
| Hover, colour change | `ease` | 150–200 ms |
| Tooltip, small popover | ease-out | 125–200 ms |
| Dropdown, select | ease-out | 150–250 ms |
| Modal, side panel, mobile menu | ease-out (enter) / ease-in-out (movement) | 200–500 ms |
| Reveal on scroll | ease-out | 400–700 ms, 12–24 px of travel |
| Whole hero entrance | ease-out | ≤ 1.2 s, stagger 30–80 ms |
| Movement across the screen, morphing | ease-in-out | by distance |
| Infinite (marquee, progress) | `linear` | — |

Curves:
- strong ease-out: `cubic-bezier(.23, 1, .32, 1)` or `cubic-bezier(.16, 1, .3, 1)`;
- strong ease-in-out: `cubic-bezier(.77, 0, .175, 1)`;
- iOS-like for panels: `cubic-bezier(.32, .72, 0, 1)`.

Rules:
- The built-in `ease-out` / `ease-in-out` are weak; use your own tokens. Never `ease-in` in UI: the slow start makes the interface feel sluggish.
- **Exit ~20% faster than entrance** (enter 250 ms, exit 200 ms). What arrived slowly should leave quickly.
- Big things move longer than small ones; duration grows with distance.
- Springs (`bounce`, `easeOutBack`) only for dragging, gestures and playful brands, bounce ≤ 0.2.
- Curves and durations are tokens (`--ease-out`, `--dur-ui`, …) in DESIGN.md; no random numbers in components.

## 3. Techniques that make motion look expensive
- **Don't appear from nothing**: `scale(.95) + opacity 0`, not `scale(0)`. Nothing in the real world grows out of a point.
- **`transform-origin` at the trigger**: a dropdown grows from its button, a popover from its arrow. A modal from the centre.
- **Hovers for the mouse only**:
  ```css
  @media (hover: hover) and (pointer: fine) { .card:hover .card__media { transform: scale(1.03); } }
  ```
  On touch, `:hover` sticks after a tap.
- **The hovered element stays put; its child moves**: `.card:hover .card__surface { translate: 0 -2px }`. If the card itself lifts,
  the cursor falls off its edge and the card jitters. The alternative is an invisible strip under it (`::after` with top: 100%).
- **Interruptibility**: states (open/close, hover) use CSS **transitions**, not `@keyframes`. A transition reverses from where it is;
  keyframes restart from zero and jerk on quick repeats.
- **Entrances with `@starting-style`**: animate an element in from `display: none` without JS:
  ```css
  .panel { transition: opacity .2s, translate .2s, display .2s allow-discrete; }
  .panel[hidden] { opacity: 0; translate: 0 8px; }
  @starting-style { .panel:not([hidden]) { opacity: 0; translate: 0 8px; } }
  ```
- **Stagger** 30–80 ms between items, 400 ms in total at most. It is decorative and never blocks clicks.
- **Line masks on headings** (SplitText and similar): give the mask room at the bottom (`padding-bottom` ≈ 0.2em offset by
  `margin-bottom`), otherwise the descenders of g, y, p get clipped.
- **Asymmetry**: slow while the person decides (press and hold), fast when the system answers.
- **Images**: a `clip-path: inset(0 0 100% 0) → inset(0)` reveal looks richer than a fade, but clip-path repaints every frame.
  On heavy pages use a mask wrapper with `transform` instead.

## 4. Reduced motion: "less and gentler", not "nothing"
- With `prefers-reduced-motion: reduce`, remove **translation, scaling, parallax, pinned scenes, autoplay and smooth scrolling**.
  **Opacity fades and colour changes may stay**: they don't cause motion sickness.
- **Nothing is left hidden**: if a reveal is switched off, the element is visible immediately. Check with `check.mjs --reduced-motion`
  (rule HIDDEN-TEXT) and `motion.mjs --reduced-motion --shots 8`.
- In reduced motion, pinned scenes become a plain list or a static image with the same content.
- Anything moving longer than 5 s next to content (marquee, video background, slider) gets a pause button (WCAG 2.2.2).
- In GSAP use `gsap.matchMedia()` (section 7); in CSS write animations inside `@media (prefers-reduced-motion: no-preference)`.

## 5. Motion performance
**What to animate**
- Only `transform` (`translate`, `scale`, `rotate`) and `opacity`, including the individual `translate`/`scale` properties.
- Never `top/left/width/height/margin/padding` (layout) or a looping `box-shadow` (repaint). For a hover shadow use a separate
  `::after` layer with the shadow and change its `opacity`.
- `filter: blur()` ≤ 20 px and not on large areas. `backdrop-filter` (glass) can cost up to 30 fps while scrolling without a GPU.
  The first time it shows, the GPU builds the blur with a delay (a hitch on the first scroll): an invisible warm-up layer with
  the same filter at load helps, on hardware rendering only.

**How to write the loop**
- **One rAF loop per page** (a shared ticker; in GSAP, `gsap.ticker`). Every module subscribes instead of starting its own `requestAnimationFrame`.
- Don't read layout after writing in a frame (`getBoundingClientRect`, `offsetTop`, `getComputedStyle` after a style change):
  all reads first, then all writes. `getComputedStyle` every frame = a forced style recalculation.
- **A CSS variable on a parent every frame** (`--progress` on a `<section>`) recalculates styles for all its descendants. Write
  `el.style.transform` on the element itself, or the variable on the animated element.
- Infinite animations and loops sleep off-screen (IntersectionObserver) and in background tabs (`visibilitychange`).
  A loop with nothing left to animate stops itself.
- `will-change` only for the duration of an animation, or on 1–3 permanently moving layers; on dozens of elements it eats GPU memory.
- No `content-visibility: auto` on sections with scroll animations or on ancestors of a pin: the wrong placeholder height
  makes the scrollbar jump and throws off ScrollTrigger positions.

**CSS or JS**
- Predetermined motion (hover, reveal, infinite strip): CSS or WAAPI (`el.animate()`), which runs on the compositor and does not
  stutter while the page loads.
- Interactive and interruptible motion (physics, following the cursor, scroll scrub): JS, but through transform and one ticker.

## 6. CSS-native first (2025–2026)
No libraries, no JS to load, and it respects browser settings by itself. Always behind a support check: without support the site
just stays static and nothing breaks.

**Page transitions in WordPress (cross-document View Transitions)** instead of Barba/Swup:
```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: .3s; }
  .site-header { view-transition-name: site-header; } /* the header stays in place */
}
```
- Works only within one origin (`www` and the bare domain are different), in Chrome/Edge 126+ and Safari 18.2+.
  Other browsers simply don't play the transition.
- `view-transition-name` must be unique on the page, or the transition is cancelled. Chrome drops the transition if the new
  page isn't ready within 4 s: the page must be fast (plus speculative loading, see wordpress.md §5).
- A `pagereveal` handler (if JS is needed) goes in a normal render-blocking `<script>` in `<head>` (via `wp_head` with priority 1);
  modules and `defer` are too late. Check `if (e.viewTransition)`.

**Scroll animations without JS (scroll-driven)**:
```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 10% cover 30%; }
  }
}
@keyframes reveal { from { opacity: 0; translate: 0 24px; } }
```
- `animation-timeline` goes **after** the `animation` shorthand (the shorthand resets it); the duration is `auto`.
- Ranges: `entry`, `exit`, `cover`, `contain`. Reading progress: `animation-timeline: scroll()` on `scaleX`, not on `width`.
- Support: Chrome/Edge 115+, Safari 26+; elsewhere `@supports` keeps content visible immediately.

**Small things that used to need JS**: `@starting-style` (enter from `display: none`), `transition-behavior: allow-discrete`,
`interpolate-size: allow-keywords` (animate to `height: auto`, Chromium only for now), `text-wrap: balance | pretty`,
`:has()` for parent states.

## 7. GSAP, ScrollTrigger, Lenis: common mistakes
- **No ScrollTrigger on tweens inside a timeline**. One ScrollTrigger for the whole timeline.
- **Don't animate the pinned element**: animate its children. One pin per trigger.
- Create triggers **in page order** (or set `refreshPriority`), otherwise later pins are measured without the spacing of earlier ones.
- After images, fonts or content load: `ScrollTrigger.refresh()`. Viewport-dependent sizes as functions
  (`end: () => '+=' + el.offsetHeight`) + `invalidateOnRefresh: true`.
- Two triggers on the same property of one element → the value jumps: `immediateRender: false`, `fromTo()` or one timeline.
- A start before scroll position zero causes a jump on load: `start: 'clamp(top bottom)'` (GSAP 3.12+).
- `scroll-behavior: smooth` on `<html>` breaks recalculation on resize: `html { scroll-behavior: auto }` with GSAP/Lenis.
- `will-change: transform` / `transform` / `filter` on an ancestor of a pin breaks the pin's `position: fixed`.
- A longer scrub = a bigger `end` (`'+=600'` is twice as long as `'+=300'`), not `duration`.
- **Breakpoints and reduced motion: only `gsap.matchMedia()`** (`ScrollTrigger.matchMedia` is deprecated):
  ```js
  const mm = gsap.matchMedia();
  mm.add({ desktop: '(min-width: 62em)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
    const { desktop, motion } = ctx.conditions;
    if (!motion) return;          // static version: content visible, no pins
    /* scenes; everything created here is reverted when the conditions change */
  });
  ```
- **Lenis + ScrollTrigger** (one ticker):
  ```js
  const lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  ```
  Don't create Lenis under reduced motion, or on touch without a reason. Anchors and back-to-top buttons go through `lenis.scrollTo`
  with the header offset. Scrollable modals and menus get `data-lenis-prevent`.
- Debug with `markers: true`; none in the delivered site. To review scenes, look at screenshots at scroll positions
  (`motion.mjs --shots`): a full-page screenshot shows pinned scenes as empty bands.

## 8. 3D and WebGL (Three.js, OGL, shaders)
**When it's worth it**
- Only as the signature, from the subject: water, glass, liquid, a product you want to turn around, machinery, data.
  For services, places and people, a real photo or video is almost always stronger.
- **One WebGL context per page** (two at most). Each context means its own GPU memory and shader compilation.
- A decorative background is often cheaper and more reliable as a short video: `<video autoplay muted loop playsinline poster>`
  (H.264 MP4 + WebM, 6–10 s, no sound, with a poster). Under reduced motion, only the poster.

**LCP and the first screen**
- **The first screen never waits for WebGL**: a poster (photo or CSS) is visible from the first paint, the canvas fades in on top
  when ready. The headline and button are plain HTML, not a texture.
- Creating the first WebGL context blocks the main thread for about 100 ms (several times longer on a weak phone), and so does
  shader compilation. Options: create it after the first paint in idle time; render in a worker via
  `canvas.transferControlToOffscreen()` (OffscreenCanvas); warm shaders up with `renderer.compileAsync(scene, camera)`.
- Heavy runtimes (Three.js, Spline, large Lottie files) below the first screen load via `import()` as they approach
  (IntersectionObserver with `rootMargin: '50%'`), with a poster until loaded.

**Budget**
- `devicePixelRatio` ≤ 1.5–2 (`Math.min(devicePixelRatio, 2)`). A full-screen effect at 2–3× DPR can eat a phone GPU whole.
  Compute heavy passes (blur, surface slope) in a downscaled buffer.
- Draw calls: up to ~100 on phones, a few hundred on desktop (`renderer.info.render.calls`). Repeats → `InstancedMesh`,
  shared materials, merged static geometry.
- Textures ≤ 2048 px (4096² RGBA = 64 MB of GPU memory, ~85 MB with mipmaps); compressed KTX2 (4–8× less memory).
  Models: glTF through `gltf-transform optimize` (Meshopt/Draco, texture resize).
- Shaders on phones: `mediump` where precision allows; loop only over active elements; exit early.
- 30 fps at rest is acceptable for a living background surface; 60 during interaction.

**Lifecycle**
- Pause off-screen (IntersectionObserver) and in hidden tabs: `renderer.setAnimationLoop(null)` or stop your own loop.
- Free everything: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, render targets; on `pagehide`
  `WEBGL_lose_context`. Watch `renderer.info.memory`.
- Handle `webglcontextlost` / `webglcontextrestored`: on loss, show the poster, not a black rectangle.

**Weak devices and the fallback**
- Software rendering (GPU disabled or blocklisted: SwiftShader, "Microsoft Basic Render Driver", llvmpipe) runs a full-screen
  shader at 3–5 fps. Detect it: `getContext('webgl2', { failIfMajorPerformanceCaveat: true })` returned `null`, or the
  `WEBGL_debug_renderer_info` string contains those names. Then use a static poster or a simplified effect.
- No WebGL2 → WebGL1 → poster. Reduced motion → poster or one static frame of the effect.
- If the effect is simplified for weak devices, it **does not change** on strong ones (the "optimization doesn't change the look" rule).

## 9. Effects by reflex
Custom cursor, magnetic buttons, cards tilting after the mouse, scramble text, parallax on every image, smooth scrolling
"because it's trendy": this is a kit from demo libraries (slop-tells.md, M7). Acceptable only as part of the signature or a direct
client decision, and then with reduced motion, mouse only (`pointer: fine`), without hurting reading.
**Scroll-jacking** (replacing scroll distance, "one wheel tick = one slide", blocking native scrolling): never (M8). It breaks
trackpads, the keyboard, find-in-page and accessibility.

## 10. How to test motion
- `node <skill>/scripts/motion.mjs <url> --mode gpu,nogpu --shots 8`: fps and p95 frame time per section, long tasks,
  shots at scroll positions (pinned scenes, a live WebGL frame). Targets: average ≥ 55 fps and p95 ≤ 25 ms with a GPU;
  without a GPU no lower than 30 fps and no long tasks > 200 ms (otherwise you need the fallback from section 8).
- `--mode mobile` (412×823, touch, CPU ×4) for phones; `--reduced-motion` for shots of the static version.
- A DevTools screenshot may show an **old WebGL frame**. motion.mjs redraws canvases within a frame before the shot;
  in your own scripts read the canvas with `drawImage` inside `requestAnimationFrame`.
- Watch animations slowed down: DevTools → Animations → 10–25%, or `document.getAnimations().forEach(a => a.playbackRate = .25)`.
  Hitches, overlaps and overshoots invisible at 1× become obvious.
- Before optimizing: measurements and "before" shots; after: the same measurements and shots. Pixel differences = a design change,
  which is agreed separately.
