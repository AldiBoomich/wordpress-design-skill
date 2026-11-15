# Slop tells catalogue (signs of AI-generic or template design)

A tell only says that a choice was made by default. It does not prove authorship: designers used rounded cards and centred heroes long before neural networks. The fix is always the same: replace the default with a decision.

**Levels** (by who notices):
- **P0**: an ordinary visitor notices; these are memes;
- **P1**: a designer or developer notices;
- **P2**: rough edges of craft.

Fix P0 and P1 on every pass unless the brief says otherwise. Context can raise or lower a level. Missing `:focus-visible`, contrast below AA and motion without reduced-motion are **accessibility defects**: fix them at once, whatever the level.

Markers:
- ⚙: caught by `check.mjs` / `scan-theme.mjs`;
- 👁: visible only on a screenshot;
- 🧠: needs judgement against the brief.

---

## First order: "the median"

| ID | Tell | Why it's slop | What to do |
|---|---|---|---|
| C1 P0 ⚙ | Purple-blue / indigo diagonal gradient (hero, buttons, glow behind a heading) | Inherited from Tailwind UI's `bg-indigo-500`, tied to no brand | One dominant colour and one accent with a job, taken from the subject. Gradients only tonal within one hue, or from brand colours |
| C6 P0 ⚙ | Gradient-filled headline text (`background-clip: text`) | A 2024 ornament that also hurts legibility | Solid colour; emphasis through size and weight |
| T1 P0 ⚙ | Inter / Roboto / Arial / system-ui everywhere, no second face | Means nobody chose a font | Fonts for the brief: one family with a strong scale, or two clearly different ones |
| L1 P0 ⚙🧠 | Pill badge + centred h1 + subheading + 2 centred buttons | The skeleton of "a landing page in general", no spatial idea | Start from what is most characteristic of the subject: a product or place photo, a number that matters, a live example. 5/7 asymmetry, large type |
| L2 P0 ⚙ | A row of 3 (or 6) identical cards: icon in a circle, heading, one line of text | The most worn SaaS and WP template | One large showcase with small items beside it, alternating text/photo, a list with varying density. If a grid is needed, cells of different size and weight |
| IM1 P1 👁 | Stock "team smiling at a laptop", open-plan office | The visual default for "a company" | Real photos: product, place, process, hands, material |
| IM2 P1 👁 | Glossy 3D blobs, AI illustrations (too smooth and symmetrical) | Filler with no subject | Product, place, an illustration with character |
| WP5 P0 ⚙ | Demo leftovers: Lorem ipsum, "Hello world!", "Sample Page", "Just another WordPress site", "Uncategorized", "Proudly powered by WordPress", the W icon instead of a favicon | Says "installed and never finished" | Remove or rewrite (delete only with permission), set a Site Icon |

## Second order: the "tasteful" AI default
Once models learned to avoid purple, their "escapes from the template" converged into templates too. Anthropic lists these clusters in its own `frontend-design` skill.

| ID | Tell | What to do |
|---|---|---|
| SD1 P1 | Cream background (around `#F4F1EA`) + terracotta/clay (around `#D97757`) + high-contrast serif. "The Claude look" | Take the background and accent from the subject's materials, place and packaging. If it needs warmth, use another hue family and not parchment |
| SD2 P1 | Near-black background (`#0B0B0B`–`#111`) + one acid-green or vermilion accent + monospace | A dark theme only when the product demands it, and as a full palette, not "neon on black" |
| SD3 P2 | "Newspaper": hairline rules everywhere, zero radius, dense columns on a site that is not a publication | Rules and columns only for genuinely editorial content |
| SD4 P1 ⚙ | Generic scaffolding: an ALL-CAPS tracked label above every heading, `A · B · C` lines, `WORD — fragment` captions, monospace for small things, tinted near-black instead of a chosen colour | A label above a heading only if it carries information the heading lacks. Normal case, the main typeface |
| SD5 P1 | One word of the headline highlighted with colour, italic or a marker: "Water that *just works*" | The whole headline carries the idea: size, weight, line break. Highlight what matters (a number, a name) through the type system |
| SD6 P1 | Decorative `01 / 02 / 03` on items that are not a sequence | Number only steps, stages, rankings |
| SD7 P2 | A fake window with three macOS dots instead of a screenshot | A real screenshot or the real product state |
| SD8 P2 | Emerald or teal as "the only accent" for no reason (fleeing purple) | The accent comes from the brand and gets a job |
| T2 P1 ⚙ | "Trendy free" fonts as the only design gesture: Space Grotesk, Geist, Syne, Sora, Instrument Serif, Fraunces, Cal Sans, Playfair Display, DM Sans, Outfit, Manrope. For WP templates: Poppins, Montserrat, Open Sans, Lato, Raleway | Keep the font only if the brief justifies it, and always paired. **Don't use the same font as in your last three projects** |

**A third order is already forming**: deliberate "hand-madeness" as a reaction to AI: grain and noise over everything, handwritten fonts, scrapbook collage, "crooked" stickers. Fine when the subject earns it (bakery, craft, kids), a template when added just to "not look like AI".

## Typography
| ID | Tell | What to do |
|---|---|---|
| T3 P1 | Sans headline with one word in serif italic | See SD5 |
| T5 P1 ⚙ | An ALL-CAPS eyebrow above every section | Most sections don't need one. Where needed, write the question the section answers, a count or a date, in normal case |
| T6 P2 👁 | One font, one weight, a flat scale (h2 barely bigger than text) | A real scale (see craft.md), the heading as part of the design |
| T7 P1 ⚙ | A font declared in CSS but not loaded: everyone sees the fallback | Check `document.fonts` (check.mjs does) |
| T8 P2 ⚙ | More than 3 families on a page (usually brought in by plugins) | 1–2 families; override plugin styles |

## Colour
| ID | Tell | What to do |
|---|---|---|
| C2 P1 ⚙ | Indigo or purple buttons | Colour the main action in the brand colour, with hover and active |
| C3 P1 👁 | "Vibe-code dark": dark background, low-contrast grey text, purple accent | A dark palette with intent, AA text |
| C4 P0/P1 👁 | A timid palette: several colours of equal weight, none leads | 60/30/10: dominant, secondary, accent for actions |
| C5 P2 ⚙ | Coloured glow shadows under cards and buttons | A shadow expresses height, not colour |
| C7 P1 🧠 | A dark theme nobody asked for | Brand and context choose light or dark |
| C8 P2 | Primary and accent within 20° of hue: "one colour pretending to be two" | The second colour gets another job and another hue or lightness |
| C9 P1 ⚙ | Muted text below 4.5:1 | Check with a tool, not by eye |
| WP1 P1 ⚙ | Untouched Bootstrap: `#0d6efd` / `#007bff` buttons and links, stock `.card`, carousel arrows and dots | Theme Bootstrap through your own tokens, buttons and states |

## Layout
| ID | Tell | What to do |
|---|---|---|
| L3 P1/P2 🧠 | A bento grid "because it's trendy" | Only if the cells really differ in importance |
| L4 P1 ⚙ | A strip of round numbers "10,000+ · 99.9% · 4.9★", logos of "clients" who don't exist, generated faces in testimonials | Real numbers or nothing. One precise number beats four invented ones. In a portfolio demo: plausible and without other brands |
| L5 P2 🧠 | "How it works: 1-2-3" | Only if the process really has steps |
| L6 P1 👁 | One container width on every section | Width depends on role: full-bleed photos, a narrow text column, a wide grid |
| L7 P1 ⚙ | Three pricing tiers with the middle one enlarged and a "Most Popular" badge | The structure mirrors the real offer: 2 plans, a table, one plan with options |
| L8 P1 👁 | A footer of 4 equal columns + newsletter + socials + "All rights reserved" | Build the footer from what really exists. Often 2 columns and a line are enough |
| L9 P1 👁 | The generic order: hero → logos → features → steps → testimonials → numbers → pricing → FAQ → CTA | Section order follows what the audience needs to decide; cut the rest; one structural idea per page |
| WP9 P2 👁 | The same banner on every inner page: dark photo, centred title, "Home / About" | A banner earns its place when it carries information (a short answer, a key fact). Vary the height or drop it on simple pages |
| S1 P2 👁 | Equal spacing everywhere, no rhythm | A spacing scale: isolate what matters, group what belongs together |

## Components
| ID | Tell | What to do |
|---|---|---|
| K2 P1 ⚙ | One big radius + a soft shadow (≈0.1) on every surface; a grey 1px border around every card | Radius and elevation express hierarchy: 2–3 values by role, some surfaces flat |
| K3 P1 ⚙ | Glass (`backdrop-filter`) out of habit; also costly for performance | Only where layering is real (header over content), otherwise solid colour |
| K4 P1 ⚙ | Cards with a coloured stripe on the left or top | Emphasise with weight, scale, background, position |
| K5 P2 | A "✨ New" pill above the heading | Remove unless it holds real, dated news |
| K6 P1 👁 | An icon in a tinted rounded square or circle on every item (Font Awesome in a coloured circle is the WP classic) | Your own icon set with one stroke weight, or no icons at all |
| K7 P1 ⚙ | Dead states: hover does nothing, no focus, forms without errors or loading | Every state (see craft.md) |
| K10 P1 | Library effects "as in the demo": spotlight, beams, meteors, shimmer, logo marquee | Build the effect from the product's data and subject, or cut it |
| K11 P2 👁 | Cards inside cards | One level of nesting; beyond that, space and type hold the hierarchy |
| K12 P2 | Chips and badges everywhere with no real status | Only for a real, changing state |
| K13 P2 👁 | A photo in a "blob", circle, arch or diamond as decoration (a common WP "about us" template) | A rectangular crop by role; a mask shape only if it comes from the subject (a porthole, a drop for a water brand as the signature) |

## Motion
| ID | Tell | What to do |
|---|---|---|
| M1 P2 ⚙ | The same fade-up on every section (WOW.js, AOS, animate.css `fadeInUp`) | 1 entrance on load and 1–2 directed moments. Content visible without JS |
| M2 P2 👁 | Micro-animations scattered with no shared language | One duration and easing scale |
| M3 P2 👁 | "Linear-style glow" behind a screenshot | Take the principle (depth), not the effect |
| M4 P2 ⚙ | Spring easing, bounce, `easeOutBack` | Ease-out without overshoot (springs only for playful brands) |
| M5 P2 ⚙ | Counters ticking up on scroll | Show the number and make it true |
| M6 P1 ⚙ | No `prefers-reduced-motion` | Mandatory |
| WP2 P2 ⚙ | "ThemeForest 2015": spinner preloader, autoplay slider with "Welcome to…", parallax everywhere, a round back-to-top button | A preloader delays LCP; remove it. Replace the slider with a static hero where possible, otherwise ≥6 s and a pause control |
| M7 P2 🧠 | The "Awwwards kit" by reflex: custom cursor, magnetic buttons, cards tilting after the mouse, scramble text, parallax on every image, smooth scrolling "because it's trendy" | Only as part of the signature or a direct client decision; with reduced motion and mouse only. Details in motion-3d.md §9 |
| M8 P1 👁 | Scroll-jacking: the wheel pages "one slide at a time", scrolling replaced or locked | Never: it breaks trackpads, the keyboard, find-in-page and accessibility. Scenes via pin + scrub; native scrolling stays |

## Icons
| ID | Tell | What to do |
|---|---|---|
| I2 P1 ⚙ | Emoji instead of icons in menus, items, headings | A real icon set or your own marks |
| I3 P1 | The worn set: rocket, lightning bolt, shield, sparkles ✨, ticks in circles | Pick icons by meaning; draw your own simple marks |
| WP10 P2 ⚙ | Mixed libraries (FA + Bootstrap Icons + emoji), different stroke weights | One library or your own SVGs in one style |

## Copy
| ID | Tell | What to do |
|---|---|---|
| CP1 P1 ⚙ | Empty grandeur: "Elevate your…", "Transform your…", "Unleash the power", "Your all-in-one solution", "Welcome to our website", "We are a passionate team" | What we do, for whom, where, with a number. Test: would the business owner say it out loud? |
| CP2 P2 ⚙ | seamless, cutting-edge, best-in-class, world-class, innovative, revolutionary, "may help you" | Replace with a concrete fact, number or verb |
| CP3 P1 ⚙ | `→` arrows glued to button and link text | Remove. If an arrow is needed, it is an SVG icon aligned to the text |
| CP4 P2 | "Faster. Smarter. Simpler." | One concrete claim |
| CP5 P2 | Title Case Everywhere | Sentence case for UI (unless the brand style says otherwise) |
| CP6 P2 ⚙ | "Learn more", "Read more", "Get started", "Submit", "Click here" | Verb + object: "Order a 19 L cooler bottle", "Read the delivery guide" |

## Cross-cutting
| ID | Tell | What to do |
|---|---|---|
| X1 P0 👁 | Design-system drift: different fonts, radii, buttons, header on different pages | One contract in `DESIGN.md` and one set of `:root` tokens. Build every page from them |
| F1 P1 ⚙ | Generator traces: builder meta generator tags, "Designed with ❤️ by AI" | Remove, except credits required by a licence (e.g. a template author credit) |

---

## How to use
1. Run the scripts first, then look at the screenshots (👁) and walk through the whole catalogue.
2. For every tell record: location, ID, level, one line "why it looks AI-made", and the source (script / screenshot / judgement).
3. **Don't invent problems.** If the site already looks distinctive, say so and stop. A clean audit is a normal result.
4. **Don't swap one cliché for another.** "Indigo → teal" and "Inter → Space Grotesk" pass the scanner but keep the template.

Sources: the avoid-ai-design catalogue 0.4.0 (funboy322, MIT, 2026-09; based on an analysis of ~1,400 Show HN sites, Krebs), the skills frontend-design (Anthropic), impeccable (pbakaus), taste-skill (Leonxlnx), emil-design-eng (Emil Kowalski), Vercel Web Interface Guidelines, articles by 925studios, superdesign.dev, concepcion-design, the WordPress.org theme requirements. Checked 2026-11-15.
