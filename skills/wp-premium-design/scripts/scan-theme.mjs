#!/usr/bin/env node
// wp-premium-design / scan-theme.mjs: static scan of a WordPress theme's source (no dependencies).
// Finds code-certain problems (escaping, input handling, remote assets, leftovers) and design tells in CSS/PHP.
// Everything it reports is a lead to verify, not a verdict.
import fs from 'node:fs';
import path from 'node:path';

const HELP = `Usage: node scan-theme.mjs <theme-dir> [--en] [--exclude dir1,dir2] [--json] [--max 15]
  --en        flag non-English (non-Latin) text in client-facing files (skips CLAUDE.md, *.ru.md)
  --exclude   extra folders to skip (always skipped: .git node_modules vendor src-layout dist lib *.min.*)
  --max       max hits shown per rule (default 15)
Exit code: 2 if any FAIL rule matched, else 0.`;

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const root = path.resolve(args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || '.');
const EN = args.includes('--en'), JSON_OUT = args.includes('--json');
const maxI = args.indexOf('--max'), MAX = maxI > -1 ? +args[maxI + 1] : 15;
const exI = args.indexOf('--exclude');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'src-layout', 'dist', 'lib', '.claude', ...(exI > -1 ? args[exI + 1].split(',') : [])]);
const SKIP_FILES = /(\.min\.(js|css)$|bootstrap[\w.-]*\.css$|^CLAUDE\.md$|\.ru\.md$|package-lock\.json$)/i;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
    else if (/\.(php|css|scss|js|mjs|json|html|md|txt|pot?)$/i.test(e.name) && !SKIP_FILES.test(e.name)) files.push(p);
  }
})(root);

// rule: id, level (FAIL/WARN/INFO/SLOP), ext regex, test(line, ctx) → string|bool
const hexHue = hex => { let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return { h: 0, s: 0, l }; let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (H * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l }; };
const isPurple = str => [...str.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].some(m => { const q = hexHue(m[0]); return q.h >= 235 && q.h <= 300 && q.s > 0.35 && q.l > 0.2 && q.l < 0.85; });
const SAFE_ECHO = /^(esc_|wp_kses|absint|intval|floatval|\(int\)|\(float\)|\(bool\)|number_format|wp_json_encode|json_encode|wp_nonce_field|get_template_part|paginate_links|the_\w+|wp_get_attachment_image\b|get_the_post_thumbnail\b|get_avatar|get_search_form|wp_link_pages|PHP_EOL|['"]|\d|sprintf\(\s*esc|implode\(\s*['"][^'"]*['"]\s*,\s*array_map\(\s*['"]esc_)/;

const RULES = [
  { id: 'ESC', level: 'WARN', ext: /\.php$/, msg: 'echo of a variable / getter without escaping (verify; name pre-escaped vars *_safe / *_html)',
    test: l => { if (/phpcs:ignore[^\n]*EscapeOutput/.test(l)) return false; const m = l.match(/(?:\becho\b|<\?=)\s*([^;]+)/); if (!m) return false; const e = m[1].trim(); if (SAFE_ECHO.test(e) || /^\$\w+\s*\?\s*['"][^'"]*['"]\s*:\s*['"]/.test(e)) return false; return /^(\$\w+(?!_(safe|escaped|clean|html)\b)|get_(field|sub_field|option|the_title|the_excerpt|permalink|post_meta|bloginfo)\b|\$_)/.test(e); } },
  { id: 'ACF-THE', level: 'INFO', ext: /\.php$/, msg: 'the_field()/the_sub_field(): ACF filters it, but explicit esc_*( get_field() ) is clearer', test: l => /\bthe_(sub_)?field\s*\(/.test(l) },
  { id: 'INPUT', level: 'WARN', ext: /\.php$/, msg: 'Superglobal used without sanitize_/absint/wp_verify_nonce on the same line', test: l => /\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/.test(l) && !/(sanitize_|absint|intval|wp_verify_nonce|check_admin_referer|isset|empty|wp_unslash\(\s*sanitize|esc_)/.test(l) },
  { id: 'SQL', level: 'WARN', ext: /\.php$/, msg: '$wpdb query without prepare()', test: l => /\$wpdb->(query|get_results|get_var|get_row|get_col)\s*\(/.test(l) && !/prepare\s*\(/.test(l) },
  { id: 'DANGER', level: 'FAIL', ext: /\.php$/, msg: 'eval / create_function / extract / query_posts / mysql_*', test: l => /\b(eval|create_function|extract|query_posts|mysql_\w+)\s*\(/.test(l) && !/^\s*(\/\/|\*|#)/.test(l) },
  { id: 'HARDCODE', level: 'INFO', ext: /\.php$/, skipPath: /(^|[\\/])(inc|acf-json|languages)[\\/]|functions\.php$/, msg: 'Text hardcoded in a template (make it an ACF field with a default, or translatable)',
    test: l => { const s = l.replace(/<\?(php|=)[\s\S]*?(\?>|$)/g, '§'); const m = s.match(/>\s*([A-Za-z][^<>§{}$=]{3,}?)\s*</); return m && /[a-z]{3,}\s+[a-z]{2,}/i.test(m[1]) ? `"${m[1].trim().slice(0, 50)}"` : false; } },
  { id: 'REMOTE', level: 'WARN', ext: /\.(php|css|scss|html)$/, msg: 'Remote asset (CDN / Google Fonts / Font Awesome kit): self-host it (speed, GDPR)', test: l => /(https?:)?\/\/(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdnjs\.cloudflare|unpkg\.com|code\.jquery|kit\.fontawesome|use\.fontawesome|stackpath\.bootstrapcdn|maxcdn)/i.test(l) },
  { id: 'JQUERY', level: 'INFO', ext: /\.php$/, msg: "jQuery dependency in an enqueue (needed?)", test: l => /wp_enqueue_script\s*\(.*['"]jquery['"]/.test(l) },
  { id: 'DEFER', level: 'INFO', ext: /\.php$/, msg: "wp_enqueue_script without 'strategy' => 'defer' (WP 6.3+)", test: l => /wp_enqueue_script\s*\(\s*['"]/.test(l) && /\.js|get_template_directory_uri|get_theme_file_uri|_url/.test(l) && !/strategy/.test(l) },
  { id: 'LOREM', level: 'FAIL', ext: /./, msg: 'Placeholder text', test: l => /lorem ipsum|dolor sit amet|consectetur adipiscing/i.test(l) },
  { id: 'CONSOLE', level: 'INFO', ext: /\.m?js$/, msg: 'console.log left in', test: l => /console\.(log|debug)\(/.test(l) && !/^\s*\/\//.test(l) },
  // design tells in CSS
  { id: 'SLOP-C1', level: 'SLOP', ext: /\.s?css$/, msg: 'P0 purple / indigo gradient', test: l => /gradient\(/.test(l) && isPurple(l) },
  { id: 'SLOP-C6', level: 'SLOP', ext: /\.s?css$/, msg: 'P0 gradient text (background-clip: text)', test: l => /background-clip\s*:\s*text/.test(l) },
  { id: 'SLOP-T1', level: 'SLOP', ext: /\.s?css$/, msg: 'Default / cliché primary font (fine only if the brief chose it)', test: l => { const m = l.match(/font-family\s*:\s*['"]?([^,;'"]+)/i); return m && /^(inter|roboto|arial|helvetica|poppins|montserrat|open sans|lato|raleway|nunito|space grotesk|geist|syne|sora|dm sans|outfit|manrope|playfair display|fraunces)\s*$/i.test(m[1].trim()) ? m[1].trim() : false; } },
  { id: 'SLOP-WP1', level: 'SLOP', ext: /\.s?css$/, msg: 'P1 untouched Bootstrap blue (#0d6efd / #007bff)', test: l => /#(0d6efd|007bff)\b/i.test(l) },
  { id: 'SLOP-K3', level: 'SLOP', ext: /\.s?css$/, msg: 'P1 backdrop-filter (glass): only where layering is real; costly while scrolling', test: l => /backdrop-filter\s*:\s*(?!none)/.test(l) },
  { id: 'SLOP-M4', level: 'SLOP', ext: /\.s?css$/, msg: 'P2 overshooting (bounce) easing', test: l => /cubic-bezier\([^)]*(-0?\.\d+|1\.[1-9]\d*)/.test(l) },
  { id: 'SLOP-M1', level: 'SLOP', ext: /\.(php|html)$/, msg: 'P2 scroll-reveal class on markup (WOW/AOS/fadeInUp): keep 1–2 moments', test: l => /class=["'][^"']*\b(wow|fadeInUp|animate__fadeInUp)\b|data-aos=/.test(l) },
  { id: 'SLOP-CP3', level: 'SLOP', ext: /\.(php|html)$/, msg: 'P1 arrow glyph in link/button text', test: l => /[→⟶➜➔]|&rarr;/.test(l) },
  { id: 'TRANS-ALL', level: 'WARN', ext: /\.s?css$/, msg: '"transition: all" (animates layout properties; name the properties)', test: l => /transition\s*:\s*all\b/.test(l) },
  { id: 'OUTLINE', level: 'WARN', ext: /\.s?css$/, msg: 'outline: none/0: make sure a :focus-visible style replaces it', test: l => /outline\s*:\s*(none|0)\b/.test(l) },
  { id: 'IMPORTANT', level: 'INFO', ext: /\.s?css$/, msg: '!important', test: l => /!important/.test(l), countOnly: true },
  { id: 'VIEWPORT-ZOOM', level: 'FAIL', ext: /\.(php|html)$/, msg: 'Viewport meta blocks pinch zoom (user-scalable=no / maximum-scale < 2): WCAG 1.4.4', test: l => /name=["']viewport["']/i.test(l) && /user-scalable\s*=\s*(no|0)\b|maximum-scale\s*=\s*(0?\.\d+|1(\.\d+)?)(?![\d.])/i.test(l) },
  { id: 'GSAP-DEPRECATED', level: 'INFO', ext: /\.(m?js|php)$/, msg: 'ScrollTrigger.matchMedia() is deprecated: use gsap.matchMedia() (also handles reduced motion)', test: l => /ScrollTrigger\.matchMedia\s*\(/.test(l) },
  { id: 'WILL-CHANGE', level: 'INFO', ext: /\.s?css$/, msg: 'Many will-change declarations: keep it on the few layers that really move (it costs GPU memory)', test: l => /will-change\s*:\s*(?!auto\b)/.test(l), countOnly: true, min: 11 },
];
if (EN) RULES.push({ id: 'NON-EN', level: 'WARN', ext: /\.(php|js|mjs|json|css|html|pot?|txt)$/, msg: 'Non-Latin text in a client-facing file (site, admin, ACF, emails must be English)', test: l => { const m = l.match(/[Ѐ-ӿ؀-ۿ一-鿿]+[^'"<>]{0,30}/); return m ? `"${m[0].slice(0, 40)}"` : false; } });

const hits = Object.fromEntries(RULES.map(r => [r.id, []]));
const counts = Object.fromEntries(RULES.map(r => [r.id, 0]));
let hasReducedMotion = false, hasAnimation = false, hasFocusVisible = false, styleCss = '', textDomains = new Set();
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const src = fs.readFileSync(f, 'utf8');
  if (/\.s?css$/.test(f)) { if (/prefers-reduced-motion/.test(src)) hasReducedMotion = true; if (/(animation|transition)\s*:/.test(src)) hasAnimation = true; if (/:focus-visible/.test(src)) hasFocusVisible = true; }
  if (rel === 'style.css') styleCss = src;
  if (/\.php$/.test(f)) for (const m of src.matchAll(/\b(?:__|_e|_x|_n|esc_html__|esc_html_e|esc_attr__|esc_attr_e|esc_html_x|esc_attr_x)\s*\(\s*(['"]).*?\1\s*,\s*(['"])([\w-]+)\2\s*\)/g)) textDomains.add(m[3]);
  const lines = src.split(/\r?\n/);
  let inBlock = false;
  lines.forEach((line, i) => {
    // skip PHP/JS/CSS block comments roughly
    const t = line.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return; }
    if (t.startsWith('/*') && !t.includes('*/')) { inBlock = true; return; }
    if (/^(\/\/|\*|#(?!\w))/.test(t)) return;
    for (const r of RULES) {
      if (!r.ext.test(f) || (r.skipPath && r.skipPath.test(rel))) continue;
      const res = r.test(line);
      if (!res) continue;
      counts[r.id]++;
      if (!r.countOnly && hits[r.id].length < MAX) hits[r.id].push(`${rel}:${i + 1}${typeof res === 'string' ? '  ' + res : '  ' + t.slice(0, 110)}`);
    }
  });
}

const extra = [];
if (hasAnimation && !hasReducedMotion) extra.push({ level: 'FAIL', id: 'REDUCED-MOTION', msg: 'CSS animates but has no prefers-reduced-motion rule' });
if (!hasFocusVisible) extra.push({ level: 'WARN', id: 'FOCUS-VISIBLE', msg: 'No :focus-visible rule in the theme CSS' });
if (styleCss) {
  const hdr = k => (styleCss.match(new RegExp('^\\s*\\*?\\s*' + k + ':\\s*(.+)$', 'mi')) || [])[1]?.trim();
  for (const k of ['Theme Name', 'Version', 'Requires at least', 'Tested up to', 'Requires PHP', 'License', 'Text Domain']) if (!hdr(k)) extra.push({ level: 'WARN', id: 'STYLE-HEADER', msg: `style.css header missing "${k}"` });
  const td = hdr('Text Domain');
  if (td && textDomains.size && [...textDomains].some(d => d !== td)) extra.push({ level: 'WARN', id: 'TEXTDOMAIN', msg: `Text domains used: ${[...textDomains].join(', ')}; style.css says "${td}"` });
} else extra.push({ level: 'WARN', id: 'STYLE-HEADER', msg: 'No style.css in the theme root' });
for (const [file, msg] of [['screenshot.png', 'No screenshot.png (1200×900)'], ['README.md', 'No README.md']]) if (!fs.existsSync(path.join(root, file))) extra.push({ level: 'INFO', id: 'DELIVERY', msg });
if (!fs.existsSync(path.join(root, 'DESIGN.md'))) extra.push({ level: 'INFO', id: 'DESIGN', msg: 'No DESIGN.md (design contract: tokens, type, motion, signature)' });

const report = { root, files: files.length, rules: RULES.filter(r => counts[r.id] && counts[r.id] >= (r.min || 1)).map(r => ({ id: r.id, level: r.level, msg: r.msg, count: counts[r.id], hits: hits[r.id] })), extra };
if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
else {
  const order = { FAIL: 0, WARN: 1, SLOP: 2, INFO: 3 };
  console.log(`Theme scan: ${root} (${files.length} files)\n`);
  for (const e of extra.sort((a, b) => order[a.level] - order[b.level])) console.log(`[${e.level}] ${e.id}: ${e.msg}`);
  if (extra.length) console.log('');
  for (const r of report.rules.sort((a, b) => order[a.level] - order[b.level])) {
    console.log(`[${r.level}] ${r.id} ×${r.count}: ${r.msg}`);
    for (const h of r.hits) console.log('    ' + h);
    if (r.count > r.hits.length && r.hits.length) console.log(`    … ${r.count - r.hits.length} more`);
  }
  if (!report.rules.length && !extra.length) console.log('Nothing found.');
}
process.exit([...report.rules, ...extra].some(r => r.level === 'FAIL') ? 2 : 0);
