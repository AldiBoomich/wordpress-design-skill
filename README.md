# WordPress Design Skill for Claude Code

**`wp-premium-design`**: an [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills) that makes Claude design, build and audit WordPress sites that look **premium and hand-made, not AI-generated or templated**, and then **proves it in a real browser**.

It combines three things that usually live apart:

1. **Design taste with numbers**: a catalogue of 70+ "AI slop" and template tells, and concrete rules for typography, colour, spacing, photos, copy, motion and 3D.
2. **WordPress engineering rules**: escaping, ACF without hardcoded text, LCP images, Core Web Vitals, speculative loading, WCAG 2.2, a client-friendly admin, delivery.
3. **Zero-dependency browser checks**: three Node scripts that drive Chrome over the DevTools Protocol and report what is actually broken: on the page, in the motion and in the theme source.

> Built from real client work on a classic PHP + ACF theme and refined against the best public design skills (Anthropic `frontend-design`, `impeccable`, `taste-skill`, Emil Kowalski's design-engineering rules, Vercel Web Interface Guidelines, `avoid-ai-design`) and the official `WordPress/agent-skills`.

---

## Why

Ask any AI to "make a WordPress site look premium" and you get the same site: a purple gradient, Inter, a centred hero, three icon cards, fade-up on every section, "10,000+ happy customers". When models are told to avoid that, they drift into the *next* cliché: cream + terracotta + serif, near-black + acid green, an ALL-CAPS label above every heading.

**Slop is a default nobody chose.** This skill makes Claude replace defaults with decisions taken from the client's subject, spend boldness in exactly one place, and verify the result instead of guessing.

## What it helps with

| You ask Claude to… | The skill makes it… |
|---|---|
| Build a new theme or code a layout into WordPress | Write a short brief and a `DESIGN.md` contract first, check the plan against the slop catalogue, show you an alternative, then build with ACF fields for every text and image |
| Polish an existing site | Fix the tells in place without breaking ACF fields, menus, forms or JS hooks |
| "Why does this site look cheap?" / "find the slop" | Run an audit: scripts + screenshots + the catalogue, with every finding ranked P0/P1/P2 and tied to a file or element |
| Make animations, GSAP scenes or WebGL smooth | Apply motion rules (when to animate, curves, durations, reduced motion, GSAP/Lenis pitfalls, WebGL budgets) and measure fps per section, with and without a GPU |
| Get a site portfolio-ready (Upwork, Dribbble, case studies) | Run the final gate and assemble a case study: cover, screenshots, Lighthouse, a short video, honest numbers |

## What's inside

```
skills/wp-premium-design/
├── SKILL.md                      workflow, modes (build / polish / audit), hard rules
├── references/
│   ├── slop-tells.md             70+ tells: first order, "tasteful AI" second order, third order; P0/P1/P2
│   ├── craft.md                  numbers that read as expensive: type scale, colour roles, spacing, photos, buttons, forms, copy
│   ├── motion-3d.md              when to animate, curves, reduced motion, View Transitions, scroll-driven CSS,
│   │                             GSAP/ScrollTrigger/Lenis mistakes, WebGL budgets, fallbacks, how to test motion
│   ├── wordpress.md              classic-theme skeleton, security, ACF, images/LCP, Core Web Vitals, WP 6.8/6.9 changes,
│   │                             WCAG 2.2, client admin, delivery, portfolio case study
│   ├── checklist.md              the final gate before saying "done"
│   └── design-md-template.md     the DESIGN.md contract (palette roles, type, layout, motion, signature)
├── scripts/
│   ├── check.mjs                 real-browser page audit
│   ├── motion.mjs                motion and performance per section
│   └── scan-theme.mjs            static scan of the theme source
└── tests/
    ├── run.mjs                   self-test: planted-problem pages vs clean pages
    └── fixtures/                 bad.html, good.html, theme-bad/, theme-good/
```

## The workflow Claude follows

1. **Subject**: 3–5 lines on what the business sells, to whom, where, the main action, what makes it different. Colour, type, photos and the signature move come from that world.
2. **Plan → `DESIGN.md`**: palette with roles and contrast, type roles and scale, spacing, radii, motion language, **one signature detail**, homepage section order.
3. **Check the plan for defaults** against the slop catalogue: *"Would I have arrived at this for any similar site?"* Show you the plan plus one alternative, and build only after you answer.
4. **Build** with the craft, motion and WordPress references.
5. **Check in a real browser**: the scripts below plus looking at every screenshot (squint test, silhouette test, first screen on a phone). At most three fix rounds.
6. **Final gate**: the checklist, and an honest report of what was and was not checked.

Hard rules include: no unchosen defaults; don't swap one cliché for another; real photos of the subject; concrete copy and verb-first buttons; motion answers an action; every state designed; everything editable in the admin; exactly one `<h1>`, AA contrast, keyboard access, no horizontal scroll; and **optimization never changes the look**.

## The scripts

All three run on **Node.js 22+** with **no npm install**. They talk to Chrome, Edge or Chromium directly over the DevTools Protocol. Claude runs them during the workflow, but you can also use them on their own on any site.

### `check.mjs`: page audit in headless Chrome

```bash
node skills/wp-premium-design/scripts/check.mjs https://site.local/ https://site.local/about/ --widths 1440,390 --out ./check
```

Scrolls each page fully, takes a full-page and a first-screen screenshot per width, and writes `report.md` + `report.json`.

| Quality (FAIL / WARN) | Design tells |
|---|---|
| JS console errors, failed requests, HTTP status | Purple gradients, gradient text |
| Horizontal overflow + the element that causes it | Default or cliché fonts, fonts declared but not loaded |
| Exactly one `<h1>`, heading order, title, `lang`, meta | Rows of identical icon cards, centred hero skeleton |
| Images: alt, broken, missing dimensions, lazy in the first screen, oversized, upscaled | ALL-CAPS eyebrows, arrows glued to buttons, emoji icons |
| LCP (element, lazy, fetchpriority) and CLS | Glass everywhere, coloured glow shadows, one radius on everything |
| WCAG AA contrast, including text over transparent headers | Untouched Bootstrap blue, Font Awesome overload |
| Accessible names, form labels, tap targets, **blocked pinch zoom**, **fields under 16 px on phones** | Scroll-reveal on every element, bouncy easing, autoplay sliders, preloaders |
| Skip link, `:focus-visible`, reduced-motion rules | Stat strips, vague copy ("elevate", "seamless"), "Learn more" buttons |
| **Focus hidden under a sticky header or bar (WCAG 2.4.11)**, anchors without header offset | Demo leftovers ("Hello world!", "Sample Page") |
| **Text that never appeared** (a reveal animation that didn't run) | |

Options: `--cookie name=value` (audit as a logged-in WordPress admin), `--reduced-motion`, `--eval "<js>"` (e.g. open the menu before the screenshot), `--no-focus`, `--no-scroll`, `--no-shots`, `--height`, `--wait`, `--chrome`, `--json`. Exit code `2` when there is a FAIL, so it works in CI.

### `motion.mjs`: is the motion actually smooth?

```bash
node skills/wp-premium-design/scripts/motion.mjs https://site.local/ --mode gpu,nogpu --shots 8 --out ./motion
```

Scrolls the page section by section at a constant speed **from inside `requestAnimationFrame`**, idles on the first screen, moves the pointer over it, and reports per section:

- fps, p95 and max frame time, share of frames over 33 ms;
- frames the compositor really drew (from a trace), long tasks and **long animation frames with the script that caused them**;
- the GPU renderer that was used, whether Lenis, GSAP and pinned scenes are present.

Modes: `gpu`, `nogpu` (software rendering, like a PC with hardware acceleration off: the case where WebGL heroes and glass headers collapse), `cpu4`, `mobile` (412×823, touch, CPU ×4). `--shots N` saves viewport screenshots at scroll positions, so **pinned ScrollTrigger scenes are visible** (full-page screenshots show them as empty bands) and **WebGL canvases show a fresh frame**. `--reduced-motion` captures the static version and flags text left invisible.

Real output on the self-test page that blocks the main thread on purpose (excerpt):

```
| Section             | px  | rAF fps | p95 ms | max ms | jank % | drawn fps | long tasks     | LoAF (max / blocked)     |
|---------------------|-----|---------|--------|--------|--------|-----------|----------------|--------------------------|
| first screen · idle | 0   | 14.9    | 309    | 309    | 100    | –         | 1 (max 260 ms) | 1: 305 / 255 ms bad.html |
| section#s2          | 797 | 16.1    | 303    | 303    | 100    | 14.6      | 1 (max 260 ms) | 1: 69 / 0 ms bad.html loop |

- ⚠️ SLOW first screen · idle: 14.9 fps (< 50), p95 309 ms, long task 260 ms, frame blocked 255 ms by bad.html
- ⚠️ SLOW section#s2: 16.1 fps (< 50), p95 303 ms, long task 260 ms
```

On a healthy site every section reads ~60 fps (or the display's refresh rate) with no long tasks, and the report ends with `✅ no slow sections`.

### `scan-theme.mjs`: static scan of the theme source

```bash
node skills/wp-premium-design/scripts/scan-theme.mjs ./wp-content/themes/my-theme --en
```

Finds: `echo` without escaping, superglobals without sanitizing, `$wpdb` without `prepare()`, `eval`/`extract`/`query_posts`, text hardcoded in templates, CDN and Google Fonts assets, scripts without `defer`, Lorem ipsum, `console.log`, purple gradients, gradient text, cliché fonts, Bootstrap blue, glass, bouncy easing, scroll-reveal classes, arrows in buttons, `transition: all`, `outline: none`, blocked zoom in the viewport meta, deprecated `ScrollTrigger.matchMedia`, too many `will-change`, no reduced-motion rules, no `:focus-visible`, an incomplete `style.css` header, mismatched text domains. `--en` flags non-English client-facing text.

## Installation

Requirements: [Claude Code](https://docs.claude.com/en/docs/claude-code), Node.js 22 or newer, and Chrome, Edge or Chromium installed.

**For all your projects** (personal skills folder):

```bash
git clone https://github.com/AldiBoomich/wordpress-design-skill.git
# macOS / Linux
cp -r wordpress-design-skill/skills/wp-premium-design ~/.claude/skills/
# Windows (PowerShell)
Copy-Item -Recurse wordpress-design-skill\skills\wp-premium-design $HOME\.claude\skills\
```

**For one project only**: copy the same folder into `.claude/skills/` inside the project.

Claude Code picks the skill up automatically. Check with `/skills`, or just ask for something it covers.

If Chrome is in an unusual place, pass `--chrome <path>` to the scripts or set `CHROME_PATH`.

## Usage

Talk to Claude normally; the skill triggers on WordPress design, redesign, polish and audit tasks. For example:

- *"Code this HTML template into a WordPress theme with ACF, and make it look like a real commercial site, not a template."*
- *"Audit http://mysite.local/: find the AI slop and anything broken. Don't change code yet."*
- *"Polish the homepage. Keep the structure and ACF fields."*
- *"The hero WebGL effect and the GSAP scenes lag on my laptop. Measure it and fix it without changing how it looks."*
- *"Get this site ready for my Upwork portfolio."*

Modes:
- **build**: a new theme or page; the full workflow including the plan you approve.
- **polish** (default for existing sites): targeted fixes; structure, tokens and fields stay.
- **audit**: report only, no edits.

Project rules always win: if your `CLAUDE.md`, brief or brand guide asks for a slider or a gradient, Claude builds it well and marks it `slop-ok: <ID>` in the code.

## Self-test

```bash
node skills/wp-premium-design/tests/run.mjs            # ~1.5 min
node skills/wp-premium-design/tests/run.mjs --skip-motion
```

Serves two fixture pages on localhost (one with planted problems: blocked zoom, small inputs, focus under a fixed header, a reveal that never runs, a janky main thread, a purple gradient; and the same page fixed) plus two mini themes, runs all three scripts, and checks that every planted problem is caught and the clean versions stay clean (35 checks).

## Who it's for

- **Freelance WordPress developers and designers** (Upwork, Fiverr, agencies) who need client sites that don't look generated and hold up to a technical review.
- **Teams using Claude Code** on classic PHP + ACF themes, Bootstrap themes, block themes or WooCommerce.
- Anyone who wants **evidence** (screenshots, fps, contrast ratios, focus tests) instead of "looks good to me".

## Sources and credits

The slop catalogue builds on [avoid-ai-design](https://github.com/funboy322/avoid-ai-design) (MIT). Rules were cross-checked against: Anthropic's `frontend-design` skill, [impeccable](https://github.com/pbakaus/impeccable), [taste-skill](https://github.com/Leonxlnx/taste-skill), [Emil Kowalski's skills](https://github.com/emilkowalski/skills), [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), [WordPress/agent-skills](https://github.com/WordPress/agent-skills), the WordPress.org Theme Handbook, WCAG 2.2, GSAP ScrollTrigger docs, Chrome's docs on scroll-driven animations and cross-document View Transitions, and the WordPress 6.8 and 6.9 developer notes. No text was copied from these projects; the rules are rewritten and extended from hands-on work.

## License

[MIT](LICENSE) © AldiBoomich
