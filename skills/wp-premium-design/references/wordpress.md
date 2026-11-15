# WordPress: rules for a commercial-grade theme

Based on the WordPress.org theme requirements (Theme Review Handbook, accessibility-ready) and the security and performance documentation. A client theme does not have to pass directory review, but security, accessibility, i18n and zero errors are mandatory.

## 1. Skeleton (classic theme)
- `<html <?php language_attributes(); ?>>`, `wp_head()` right before `</head>`, `<body <?php body_class(); ?>>`, `wp_body_open()` right after `<body>`, `wp_footer()` before `</body>`.
- `add_theme_support( 'title-tag' | 'post-thumbnails' | 'html5' | 'automatic-feed-links' | 'custom-logo' | 'responsive-embeds' )`.
- `post_class()` on the post wrapper, `wp_link_pages()` in single.
- Parts via `get_template_part()`, `get_header()`, `get_footer()`.
- Handle "static front page + posts page" correctly (`front-page.php`, `home.php`).
- Prefix everything global with the theme slug (functions, handles, options, meta, menu locations). Files in `inc/` start with `defined( 'ABSPATH' ) || exit;`.
- Site functionality (CPTs, shortcodes, SEO, forms, analytics) belongs in a plugin by WP.org rules. For a client theme it may stay in the theme, but in separate `inc/*.php` files.
- Don't hide the admin bar, don't redirect on activation, make admin notices dismissible.

## 2. Security (sanitize early, escape late)
| Output context | Function |
|---|---|
| Text inside a tag | `esc_html()` / `esc_html_e()` / `esc_html__()` |
| Attribute (class, alt, data-*, value) | `esc_attr()` / `esc_attr_e()`; escape a concatenated string as a whole |
| URL in href/src | `esc_url()` (not `esc_attr`); `esc_url_raw()` when saving to the DB |
| HTML from an ACF WYSIWYG / content | `wp_kses_post()` |
| Your own limited HTML | `wp_kses( $html, [ 'a' => ['href'=>[], 'title'=>[]], 'br'=>[], 'em'=>[], 'strong'=>[] ] )` |
| Inside `<textarea>` | `esc_textarea()` |
| Inline JS | `esc_js()`; pass data via `wp_add_inline_script` / `wp_json_encode()` |
| Numbers | `(int)`, `(float)`, `absint()`, `number_format_i18n()` |

- Helpers that return HTML must return already-safe HTML. Name such variables `$html_safe` / `_escaped`.
- Input: `sanitize_text_field()`, `sanitize_email()`, `sanitize_key()`, `absint()`; `wp_unslash()` before sanitizing.
- Forms and actions: `wp_nonce_field()` + `wp_verify_nonce()` / `check_admin_referer()`, capabilities via `current_user_can( 'edit_theme_options' )`.
- SQL only via `$wpdb->prepare()`. No `eval`, `extract`, `query_posts`, `create_function`.
- Not a single notice or warning with `WP_DEBUG`. No deprecated functions.

## 3. ACF: everything editable, nothing hardcoded
- Every text and image in a template goes through a helper **with a default from the design**, e.g. `theme_field( 'hero_title', 'Spring water…' )`. The site never goes blank, even with empty fields.
- **Local JSON** (`acf-json/` in the theme, `acf/settings/save_json`, `load_json`), field groups in Git. On the live site after deploy: ACF → Field Groups → Sync.
- Fields and instructions in plain English. Instructions give the recommended image size: "Recommended: 1920×1080 JPG, subject on the right". Tabs per section, conditional logic, `min/max` on repeaters, clear `button_label`s.
- Images return an ID or array and are output with `wp_get_attachment_image( $id, 'theme-hero', false, [ 'class' => '…', 'sizes' => '…' ] )`, so srcset, alt from the media library, lazy and fetchpriority all work.
- Links use the `link` field (url, title, target). `target="_blank"` only with `rel="noopener"` and a screen-reader note.
- Read true/false with a dedicated helper: `get_field` returns false, and "empty = default" would break the toggle.
- Global data (contacts, socials, hours, footer) lives on an Options Page "Theme Settings" with sub-pages.
- If a page has many ACF fields, hide the editor (or use the classic editor); otherwise the fields hide below Gutenberg.
- Menus only through Appearance → Menus (`register_nav_menus`). A custom Walker gives BEM markup and a fallback menu.
- Don't hardcode repeater values in templates. A seed script fills only empty fields, so re-running it is safe.

## 4. Images and LCP
- Only `wp_get_attachment_image()` / `the_post_thumbnail()`. Since WP 6.3 core adds `loading="lazy"` and `fetchpriority="high"` to the likely LCP image itself.
- **Set the LCP image (first slide or hero photo) explicitly**: `[ 'fetchpriority' => 'high', 'loading' => 'eager', 'decoding' => 'async' ]`. Never `lazy` together with `high`. Other slides are `lazy`.
- Every `<img>` has `width` and `height` (or a CSS `aspect-ratio`), otherwise CLS.
- `add_image_size()` per role (hero, card, thumb) and a correct `sizes`, otherwise phones download 2560 px.
- CSS background images get no srcset and no lazy loading, so content photos are `<img>` with `object-fit`.

## 5. Speed: Core Web Vitals targets
75th-percentile targets: **LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1**. Check with check.mjs locally and PageSpeed Insights on the live site.
- Scripts: `wp_enqueue_script( $h, $src, $deps, $ver, [ 'strategy' => 'defer', 'in_footer' => true ] )` (WP 6.3+). No jQuery unless needed. Don't duplicate libraries core already ships.
- Styles: your CSS split per block or bundled into one file. Don't load what isn't used. Load plugin assets only where needed (CF7: `wpcf7_load_js/css` + enqueue on the form page).
- If no Gutenberg blocks are used anywhere, `wp_dequeue_style( 'wp-block-library' )`, `'global-styles'`, `'classic-theme-styles'` is possible. Check that nothing broke.
- **WP 6.9+ with classic themes**: block styles load on demand by default (core buffers the template and hoists late `<link>`/`<style>` tags into `<head>`). `global-styles` is now enqueued at `wp_footer`, so `wp_dequeue_style( 'global-styles' )` at `wp_enqueue_scripts` may stop working: dequeue at `wp_footer` and check the page source. If block layout broke after updating to 6.9: `add_filter( 'should_load_separate_core_block_assets', '__return_false' )` in `after_setup_theme` (only if there is no other way).
- **Speculative loading (WP 6.8+)**: core prefetches a page when a link is pressed (prefetch, conservative eagerness), for logged-out visitors with pretty permalinks only; URLs with query parameters are excluded. For a brochure site it can be stronger:
  ```php
  add_filter( 'wp_speculation_rules_configuration', fn( $c ) => is_array( $c ) ? array( 'mode' => 'prerender', 'eagerness' => 'moderate' ) : $c );
  add_filter( 'wp_speculation_rules_href_exclude_paths', fn( $paths ) => array_merge( $paths, array( '/cart/*', '/checkout/*', '/my-account/*' ) ) );
  ```
  Prerender runs the page's JS in advance: analytics and run-once logic must check `document.prerendering`. Links that must not be preloaded get the `no-prefetch` / `no-prerender` class. Together with View Transitions (motion-3d.md §6) page changes feel instant.
- Fonts self-hosted, preload 1–2 files, `font-display: swap`.
- The asset version is a theme constant. Bump it after CSS/JS changes (cache busting).
- Animate only transform and opacity. Infinite animations and sliders pause off-screen. No `backdrop-filter` / `filter` on large areas.
- No external requests without need: CDNs, Google Fonts, map iframes. Load a map on click or with `loading="lazy"`.

## 6. Accessibility (accessibility-ready: the minimum for any client theme)
- **Skip link** is the first focusable element, visible on focus, pointing to `<main id="primary">`.
- Landmarks: `<header>`, `<nav aria-label="Primary">`, `<main>`, `<footer>`. Several `nav`s get different `aria-label`s.
- **Keyboard**: everything that works with a mouse is reachable with a keyboard, including submenus and the mobile menu. The burger button has `aria-expanded` and `aria-controls`; Esc closes; focus returns to the button.
- **Visible focus** (`:focus-visible`) on links, buttons, fields and menu items. `outline: none` without a replacement is forbidden.
- Headings in order, exactly one `<h1>`. The logo is not a heading.
- Links in body text are underlined. No empty links and no "read more" without context: add `<span class="screen-reader-text"> about …</span>`.
- AA contrast. Alt text on meaningful images, `alt=""` on decorative ones, decorative SVGs with `aria-hidden="true"`.
- Fields have a `<label>`, required fields `aria-required`, errors are tied to their field.
- No unexpected context changes. A new tab opens only with a warning.
- Video, animation and sliders can be paused. `prefers-reduced-motion` is respected.
- Text scales to 200% without loss; the layout holds at 320 px width (reflow). Never block zoom (`user-scalable=no`, `maximum-scale=1` are forbidden).
- The `.screen-reader-text` class exists (WP core styles).
- **WCAG 2.2 (AA, since 2023; what's new for marketing sites)**:
  - 2.4.11: a focused element is never entirely hidden under a sticky header, cookie or notice bar: `scroll-padding-top` on `<html>`, bottom bars don't cover content or can be dismissed (check.mjs: FOCUS-OBSCURED);
  - 2.5.7: anything done by dragging (swipe carousel, before/after slider, drag shelf) also works with buttons or the keyboard;
  - 2.5.8: tap targets at least 24×24 px (or spaced from neighbours);
  - 3.2.6: contact and help links are in the same place on every page;
  - 3.3.7: a form never asks for the same thing twice.
- If the client sells in the EU (WooCommerce, online booking), the European Accessibility Act applies since 28 June 2025: accessibility becomes a legal requirement; in practice the benchmark is WCAG 2.1/2.2 AA. Tell the client rather than deciding silently.

## 7. Copy and i18n
- Everything the client sees (site, admin, ACF fields, form emails, messages) is in the project's language, usually English. Check: `scan-theme.mjs --en`.
- Theme strings via `esc_html__( 'Text', 'textdomain' )`. Text Domain = theme slug = folder name = `style.css` header.

## 8. Admin for the client (matters on Upwork)
- A dashboard widget "How to edit this website": where to go to change the slider, prices, contacts, menus.
- Instructions on ACF fields, previews for icons and choices, sensible defaults. The client never has to remember shortcodes.
- Nothing breaks with an empty field, 1 or 12 repeater rows, or a three-line title.
- Don't hide admin menu items "forever". Standard user roles.

## 9. Delivery
- `style.css`: Theme Name, Description, Version (bumped every release), Requires at least, Tested up to, Requires PHP, License (GPLv2 or later), Text Domain.
- `screenshot.png` 1200×900 (4:3) showing the real site.
- `README.md` (English): features, requirements (plugins), installation, how to edit.
- `CREDITS.md`: photos, fonts, libraries, licences. Credits required by the template licence stay in the footer.
- Upload archive without `.git`, `node_modules`, layout sources, `.sql`, `.zip`, logs (e.g. `git archive --prefix=<theme>/ HEAD`).
- Live site: Settings → Permalinks → Save, Site Icon, Admin Email, SMTP for forms (test send), SEO plugin (title and description), backup before replacing the theme, ACF Sync after replacing it.

## 10. Portfolio case study (Upwork and similar)
A client decides in seconds from the cover and the first line, and hires on evidence. Collect it at the end of the project while everything is at hand:
- **Cover**: one strong first-screen frame (1440) with the phone view (390) next to it; passes the "3-second test": it is clear what the business is and what was done. No laptop mockups on wooden desks.
- **Case structure**: the client's problem → my role (design, front end, WP/ACF, motion) → decisions (signature, system, admin) → results in numbers → proof.
- **Numbers**: Lighthouse mobile (Performance / Accessibility / Best Practices / SEO), LCP and CLS from the live site (PageSpeed Insights), homepage weight before/after, scene fps from motion.mjs. Only true ones.
- **Before/after**: if there was an old site or a template, matching frames side by side.
- **A 60–90 s video**: scrolling the homepage with its motion + 15–20 s of the admin ("the client changes text and photos through ACF"). This sells WordPress work better than screenshots.
- **Admin**: 2–3 screenshots of ACF fields with instructions, showing the site is easy to run.
- **Honesty**: a concept is labelled as a concept (on the site and in the case), no third-party brands or invented reviews, photo credits in CREDITS.md.
- Case folder: `case/` next to the project (not in the theme): cover, 375/1440 screenshots of every page, Lighthouse report, video, a short description in English.
