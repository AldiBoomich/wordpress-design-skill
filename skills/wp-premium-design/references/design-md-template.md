# DESIGN.md template (put in the theme root, English)

Copy the block below into `<theme>/DESIGN.md` and fill it in **before** building. Every page is built from this contract; if a token you need is missing, add it here first. Values in the template are placeholders on purpose: copying example values is how defaults are born.

If the client's team uses Google Stitch or other tools that read the Google Labs DESIGN.md format (April 2026: YAML token front matter + Markdown prose), add the tokens as YAML front matter on top; the prose below stays the same.

```markdown
# <Site name>: design system

## Subject
- Business: <what is sold, to whom, where>
- Main action: <call / order / book / buy>
- What is different: <one sentence>
- The world it is made of: <materials, place, packaging, signage, vocabulary>

## Direction
<2-3 sentences: the idea of the design and where it comes from in the subject.>
Signature (the one bold thing): <…>
Rejected defaults: <what the first idea was and why it was changed>

## Color (roles → values; contrast against --c-ground)
| Token | Value | Role | Contrast |
|---|---|---|---|
| --c-ground | | page background (60%) | – |
| --c-surface | | sections / cards (30%) | – |
| --c-ink | | text | ≥ 7:1 |
| --c-muted | | secondary text | ≥ 4.5:1 |
| --c-action | | buttons, links (10%) | ≥ 4.5:1 / 3:1 UI |
| --c-accent | | one emphasis job: <which> | |

## Type
- Display: <family, weights, source + license> (headings)
- Text: <family, weights, source + license> (body, UI)
- Scale: body <px>/<lh>; small <px>; h3 <>; h2 <>; h1 clamp(<min>, <fluid>, <max>)
- Headline tracking: <em>; measure: <ch>
- Numbers: tabular-nums for prices

## Layout
- Container <px>; text column <px>; gutters <desktop>/<mobile>
- Spacing scale: 4 8 12 16 24 32 48 64 96 128 160
- Section padding: desktop <>, tablet <>, mobile <> (vary by importance)
- Radius by role: buttons <>, cards <>, media <>
- Elevation: <which elements float, shadow token>
- Alignment: <left / centered where and why>

## Motion
- Durations: press/hover <ms>, UI <ms>, reveal <ms>
- Easing: <cubic-bezier>
- Moments: 1) <page-load entrance> 2) <one scroll moment>
- Reduced motion: <what stops; what stays (fades); nothing stays hidden>
- 3D / WebGL (if any): <what, why it comes from the subject>; poster/fallback: <…>; budget: DPR ≤ <>, one context, paused off-screen
- Performance budget: LCP ≤ <> s (mobile), JS ≤ <> KB on the home page, ≥ 55 fps while scrolling with a GPU

## Imagery
- Source: <client / Pexels / Unsplash → CREDITS.md>
- Grade: <warm/cool, contrast>; ratios: hero <>, card <>, portrait <>

## Components
Buttons (primary/secondary/text + states), card, form field, nav, footer, page banner: <short spec each>

## Page structure
Home: <section → why it exists for this audience>
Inner pages: <…>

## Copy rules
Voice: <…>; CTA verbs: <…>; banned words: elevate, seamless, cutting-edge, unleash, "Welcome to our website"
```
