---
name: wp-premium-design
description: >-
  Premium, hand-made-looking WordPress design without "AI slop", verified in a real browser. Use when building,
  coding a design into WordPress, redesigning, polishing or auditing a WordPress theme or site (classic PHP + ACF,
  Bootstrap, block theme, WooCommerce) or a WordPress landing page; when asked to make it look expensive / premium /
  like a commercial site / not like a template / not AI-made, to "check the design", "find the slop", "get it
  portfolio-ready (Upwork)", "why does the site look cheap", or when animations, GSAP, WebGL or 3D are janky or should
  feel impressive. Includes scripts/check.mjs (headless Chrome: screenshots, JS errors, overflow, h1, alt, contrast,
  forms, focus, LCP/CLS, slop tells), scripts/motion.mjs (fps per section, no-GPU mode, scroll-position shots) and
  scripts/scan-theme.mjs (theme source: escaping, hardcoded text, remote assets, cliché fonts and colours).
---

# WP Premium Design: premium WordPress sites without AI slop

The goal: the site looks as if a strong designer made it for this exact client, and the client edits it themselves in the admin.

**Slop** is a default nobody chose. A purple gradient is bad not because it is purple, but because nobody chose it. The cure is not more effects: replace defaults with decisions and remove what is not needed.

`<skill>` is this skill's folder, e.g. `~/.claude/skills/wp-premium-design`.

## What wins
1. **Project and client rules**: CLAUDE.md, the brief, a brand guide, an existing design system. They outrank this skill. If the client wants a slider or a gradient, build it, build it well, and mark it in the code with `slop-ok: <ID>`.
2. **Working code and data**: never break ACF fields, menus, forms or content in the database. Delete anything only with the user's permission.
3. **The quality floor**: accessibility, speed, security, no errors. Not negotiable.
4. **This skill's taste.**

## Modes
- **build**: a new theme or page from scratch, the full workflow below.
- **polish** (default for an existing project): remove slop tells and raise quality in place. Structure, tokens, fields and markup that JS depends on stay. A theme built on someone else's template (HTML Codex, ThemeForest, …) already has a generic skeleton: agree on any big section rebuild first.
- **audit**: report only, no edits. Triggered by "check", "find the slop", "what's wrong", "rate it".

## Workflow

### 1. Subject
Before any design, write 3–5 lines: what the business sells, to whom, where (city, niche), the main action on the site (call, request, order), and what makes it different. Colour, type, photos and the signature move come from the subject's world: materials, place, packaging, signage, trade vocabulary. If you don't know, ask, or propose an option and mark it as an assumption.

### 2. Plan → `DESIGN.md`
Template: [references/design-md-template.md](references/design-md-template.md). The file lives in the theme root and is written in English (the client may read it). In short:
- a palette of 4–6 colours with roles and contrast;
- typefaces and their roles, type scale, weights;
- containers, spacing scale, radii by role, shadows;
- motion language: durations, easing, 1–2 "moments" per page;
- **one signature detail**: the only place where boldness is spent;
- the order of homepage sections and why each exists.

### 3. Check the plan for defaults
Run the plan through [references/slop-tells.md](references/slop-tells.md), including the "second order" section. For every part ask: *"Would I have arrived at this for any similar site?"* If yes, replace it and write down what changed and why. Show the user the plan plus one alternative, and **build only after they answer**.

### 4. Build
- [references/craft.md](references/craft.md): concrete numbers and techniques that make a site look expensive (type, colour, grid, photos, motion, details, copy).
- [references/motion-3d.md](references/motion-3d.md): when there are scroll animations, GSAP/Lenis, pinned scenes, page transitions, WebGL/3D or a video background. When to animate, curves and durations, reduced motion, common GSAP mistakes, WebGL budgets and fallbacks.
- [references/wordpress.md](references/wordpress.md): mandatory WP rules. Escaping, ACF with no hardcoded text, images and LCP, local fonts, `defer`, speculative loading, accessibility (WCAG 2.2), a friendly admin, delivery and the portfolio case study.

### 5. Check in a real browser (mandatory)
```bash
node <skill>/scripts/check.mjs http://site.local/ http://site.local/about/ --out "<scratchpad>/check"
node <skill>/scripts/scan-theme.mjs "<path to theme>" --en
```
**check.mjs**: headless Chrome at 1440 and 390 px. It scrolls the whole page, takes a full-page and a first-screen screenshot, and writes `report.md` and `report.json`. It checks:
- JS and network errors;
- horizontal scroll (and which element overflows);
- h1 and heading order;
- alt text, broken and oversized images, lazy images in the first screen;
- LCP/CLS;
- AA contrast;
- form labels, link and button names, tap targets, blocked zoom, fields under 16 px on phones;
- skip link, `:focus`, reduced motion;
- focus hidden under a sticky header or bar (WCAG 2.4.11), anchors with no offset for the header;
- text that never appeared (a reveal animation that did not run);
- fonts;
- slop tells.

Options:
- `--widths 1440,768,390`
- `--cookie name=value`: log in as admin (cookie: `wp eval 'echo LOGGED_IN_COOKIE."=".wp_generate_auth_cookie(1,time()+3600,"logged_in");'`)
- `--eval "js"`: e.g. a click before the screenshot
- `--reduced-motion`: emulate reduced motion; everything must stay visible
- `--wait 1500`, `--no-scroll`, `--no-shots`, `--no-focus`, `--chrome <path>`

Exit code 2 means there is a FAIL.

**motion.mjs**: when the site moves (scroll animations, pinned scenes, WebGL, video background):
```bash
node <skill>/scripts/motion.mjs http://site.local/ --mode gpu,nogpu --shots 8 --out "<scratchpad>/motion"
```
- fps and p95 frame time per section, long tasks and long animation frames (with the script name), frames actually drawn;
- modes: `gpu`, `nogpu` (like a PC with hardware acceleration off; opens a window), `cpu4`, `mobile`;
- `--shots N`: viewport screenshots at scroll positions, so pinned scenes are visible and WebGL frames are fresh;
- `--reduced-motion`: shots of the static version plus a search for invisible text.
Targets and how to read the numbers: [motion-3d.md](references/motion-3d.md) §10. Without a GPU numbers are lower, which is normal; it is bad below 30 fps or with long tasks over 200 ms.

**scan-theme.mjs** searches the theme source for:
- echo without escaping;
- `$_POST`/`$_GET` without sanitizing;
- text hardcoded in templates;
- CDNs and Google Fonts;
- cliché fonts, purple gradients, Bootstrap blue, `transition: all`, bouncy easing, `outline: none`, blocked zoom, deprecated GSAP APIs, too many `will-change`;
- missing reduced-motion rules;
- Lorem ipsum;
- with `--en`, non-English text.

**Look at the screenshots yourself** (read the PNGs). Scripts only catch what is visible in code. Rhythm, hierarchy and "expensive or cheap" are judged by eye:
- *squint test*: on a shrunken screenshot each screen has one main thing and sections differ in weight;
- *silhouette test*: the page silhouette does not match a generic landing page;
- *390 first-screen test*: it is instantly clear what is sold, and the button is visible.

**Fix loop**: look at all shots → fix everything one look reveals → rebuild and shoot again. At most 3 rounds; whatever remains after the third goes to the user as a question.

**Deeper, if installed** (optional): `wp theme-check run <theme>` (Theme Check plugin, WordPress.org requirements) and PHPCS with WordPress Coding Standards (`composer require --dev wp-coding-standards/wpcs:"^3.0"`, `vendor/bin/phpcs --standard=WordPress <theme>`).

### 6. Final gate
Go through [references/checklist.md](references/checklist.md). A clean script report is necessary but not sufficient. In the report to the user, say honestly what was checked and what was not.

## Hard rules (short version)
1. **No unchosen defaults**:
   - purple-blue gradients, gradient text;
   - Inter, Roboto, Poppins or Montserrat as the only typeface;
   - Bootstrap blue `#0d6efd`;
   - a centred hero with 3 identical icon-in-a-circle cards under it;
   - glass (backdrop blur) everywhere, the same `radius + shadow` on everything;
   - fade-up on every section;
   - "10,000+ happy customers" with invented numbers.
2. **Don't swap one cliché for another**. These are clichés too:
   - "cream background + terracotta + high-contrast serif";
   - "near-black + one acid accent";
   - an ALL-CAPS tracked label above every heading;
   - `01 / 02 / 03` on things that are not steps;
   - one word of the headline in another colour or italic;
   - `→` in buttons;
   - monospace for small captions;
   - lines like `A · B · C`.
3. **Boldness in one place** (the signature); everything else is calm and strict. Before delivery, remove one more trinket.
4. **Real photos of the subject**: from the client or licensed (Pexels/Unsplash, logged in CREDITS), one colour grade and consistent ratios per role. Banned: team at a laptop, 3D blobs, AI illustrations, "corporate people" art.
5. **Concrete copy**: what, for whom, where, how much, how fast. A button names the action ("Order delivery", not "Submit" or "Learn more"). No seamless, cutting-edge, elevate, unleash, "Welcome to our website".
6. **Motion answers an action or guides the eye**:
   - 1 entrance on load and 1–2 moments per page;
   - hovers 150–250 ms, ease-out, no springs, mouse only (`@media (hover: hover)`);
   - autoplaying sliders only with a pause control;
   - `prefers-reduced-motion`: less and gentler, nothing left hidden;
   - the first screen never waits for JS or WebGL.
7. **Every state**: hover, active, `:focus-visible`, disabled, form error and success, empty archive, 404, long title, missing image.
8. **WordPress**:
   - everything is editable through ACF, menus and the Customizer;
   - everything is escaped on output;
   - everything the client sees is in the project's language (usually English);
   - one design system across all pages: the same header, footer, buttons and tokens.
9. **Quality floor**:
   - exactly one `<h1>`;
   - no horizontal scroll at 360–1920 px;
   - AA contrast;
   - everything works with a keyboard;
   - the LCP image has no `lazy` and has `fetchpriority="high"`;
   - zero PHP or JS errors, including with `WP_DEBUG`.
10. **Optimization does not change the look or behaviour.** Speeding up means the same design, faster: measurements and screenshots before and after; any pixel difference is agreed first. If an effect is simplified for weak devices, it stays the same on strong ones.

## Maintaining the skill
After any change to the scripts: `node <skill>/tests/run.mjs` (serves test pages with planted problems and a clean copy, and compares the findings of all three scripts; `--skip-motion` is faster). A new rule = a new planted problem in `tests/fixtures/bad.html` or `theme-bad/` + an expectation in `run.mjs`.

## Report to the user
In the user's language, plainly:
- what was found, by level P0/P1/P2 and FAIL/WARN;
- what was fixed and in which files;
- where the before/after screenshots are;
- what is left for the client to decide;
- what was not checked.
