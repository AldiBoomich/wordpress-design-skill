# Final gate (before saying "done")

Mark each item: ✅ checked / ❌ fails / ➖ not applicable. In the report to the user list every ❌ and everything that could not be checked.

## Scripts
- [ ] `check.mjs` on every page type: home, inner page, blog post, archive, contact, 404. Widths 1440 and 390; 768 and 1024 too for complex grids. **0 FAIL.**
- [ ] `check.mjs` logged in as admin (`--cookie`): the header does not slide under the admin bar, no errors.
- [ ] `check.mjs --reduced-motion` on pages with animation: no HIDDEN-TEXT, content visible.
- [ ] If the site moves → `motion.mjs --mode gpu,nogpu --shots 8` on the homepage: ≥ 55 fps with a GPU and no long tasks; ≥ 30 fps without a GPU or the fallback kicked in; pinned scenes look as intended on the shots.
- [ ] `scan-theme.mjs --en`: no unescaped echo, no Lorem, no non-English client-facing text.
- [ ] `php -l` on every PHP file. Pages with `WP_DEBUG` show no notices or warnings.

## By eye (screenshots)
- [ ] First screen at 1440: within 3 seconds it is clear what this is, for whom, and what to do.
- [ ] First screen at 390: the headline is not cut, the button is visible without scrolling, the header covers no content.
- [ ] Squint: one main thing per screen, sections differ in weight, there is rhythm.
- [ ] The silhouette does not match a generic landing page. The section order follows from the brief.
- [ ] Photos share one colour grade, ratios are consistent per role, nothing stretched or blurry.
- [ ] Content edges line up between sections, no "dancing" margins.
- [ ] One design system on every page: same header, footer, buttons, radii, fonts.

## Slop catalogue
- [ ] No P0. P1 fixed or justified by the brief (`slop-ok: ID` in the code).
- [ ] Nothing from the "second order": SD1–SD8, T2.
- [ ] One signature detail, and it comes from the subject. The last trinket is removed.

## Interaction
- [ ] Hover, press and focus on every link, button, card and field. Cards don't jitter on hover.
- [ ] Mobile menu: opens and closes (button, Esc, backdrop, link), focus stays inside, page scroll locked, works with a keyboard.
- [ ] Keyboard focus is never hidden under the sticky header or bars (no FOCUS-OBSCURED), anchors don't land under the header.
- [ ] Everything that works by dragging or swiping (carousel, shelf, before/after) also works with buttons or the keyboard.
- [ ] Submenus work with mouse, keyboard and touch.
- [ ] Forms: validation, errors, "sending", success. The email really arrives (Mailpit or SMTP), Reply-To is the visitor.
- [ ] Slider (if any): pause control, stops off-screen, no jumps. Reduced motion stops the movement.
- [ ] 404, empty search, empty archive, post without an image, long title: all look decent.

## Speed
- [ ] The LCP image has no `lazy` and has `fetchpriority="high"`. CLS < 0.1. No preloader holding the screen.
- [ ] Scripts deferred. Plugin assets only on their pages. Fonts self-hosted.
- [ ] Live site, PageSpeed (mobile): LCP ≤ 2.5 s, CLS < 0.1, no large render-blocking resources.
- [ ] The first screen does not wait for WebGL/JS: a poster or photo is visible at once, the headline is HTML.
- [ ] If anything was optimized: before/after shots and measurements compared; look and behaviour unchanged (or the changes were agreed).

## WordPress and the client
- [ ] Every text and image is editable in the admin. Field → site verified for at least 1 text, 1 image and 1 toggle.
- [ ] Empty fields → defaults; the site does not fall apart.
- [ ] Everything the client sees is in the right language (usually English).
- [ ] `style.css` version and asset version bumped. `screenshot.png`, README, CREDITS up to date.
- [ ] Live site: backup → upload theme → ACF Sync → check pages.
- [ ] Portfolio: case folder assembled (wordpress.md §10): cover, 375/1440 screenshots, Lighthouse, video, concept label.
