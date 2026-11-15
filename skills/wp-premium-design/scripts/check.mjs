#!/usr/bin/env node
// wp-premium-design / check.mjs: real-browser audit of WordPress pages (no dependencies).
// Node 22+ (global WebSocket), Chrome / Edge / Chromium. Talks to Chrome over the DevTools Protocol.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELP = `Usage: node check.mjs <url> [url...] [options]
  --widths 1440,390     viewport widths (default 1440,390)
  --height <px>         viewport height (default 900 desktop / 844 under 768px)
  --out <dir>           output folder (default: <tmp>/wp-check-<time>)
  --cookie name=value   add a cookie for every URL (repeatable), e.g. a WP logged_in cookie
  --eval "<js>"         run JS in the page before audit + screenshot (e.g. open the menu)
  --wait <ms>           extra wait after load (default 800)
  --no-scroll           do not scroll through the page before the audit
  --no-shots            skip screenshots
  --reduced-motion      emulate prefers-reduced-motion: reduce (content must still be visible)
  --no-focus            skip the "focus hidden under a sticky bar" test (it tabs through up to 20 controls)
  --chrome <path>       browser executable (or env CHROME_PATH)
  --json                also print the JSON summary to stdout
Exit code: 0 = no FAIL, 2 = at least one FAIL, 1 = the checker itself failed.`;

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { urls: [], widths: [1440, 390], height: 0, out: '', cookies: [], evalJs: '', wait: 800, scroll: true, shots: true, reduced: false, focus: true, chrome: process.env.CHROME_PATH || '', json: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '--widths') opt.widths = next().split(',').map(Number).filter(Boolean);
  else if (a === '--height') opt.height = +next();
  else if (a === '--out') opt.out = next();
  else if (a === '--cookie') opt.cookies.push(next());
  else if (a === '--eval') opt.evalJs = next();
  else if (a === '--wait') opt.wait = +next();
  else if (a === '--no-scroll') opt.scroll = false;
  else if (a === '--no-shots') opt.shots = false;
  else if (a === '--reduced-motion') opt.reduced = true;
  else if (a === '--no-focus') opt.focus = false;
  else if (a === '--chrome') opt.chrome = next();
  else if (a === '--json') opt.json = true;
  else if (a.startsWith('--')) { console.error('Unknown option ' + a + '\n' + HELP); process.exit(1); }
  else opt.urls.push(a);
}
if (!opt.urls.length) { console.log(HELP); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(opt.out || path.join(os.tmpdir(), 'wp-check-' + stamp));
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAX_SHOT_H = 15000;

// ---------- browser ----------
function findChrome() {
  if (opt.chrome) return opt.chrome;
  const env = process.env, c = [];
  if (process.platform === 'win32') {
    for (const base of [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter(Boolean)) {
      c.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'), path.join(base, 'Chromium/Application/chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    c.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge');
  }
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Set(); }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener('open', () => res(), { once: true });
      this.ws.addEventListener('error', e => rej(new Error('WebSocket error ' + (e.message || ''))), { once: true });
      this.ws.addEventListener('message', e => this.onMsg(e));
      this.ws.addEventListener('close', () => { for (const p of this.pending.values()) p.rej(new Error('CDP closed')); this.pending.clear(); });
    });
  }
  onMsg(e) {
    const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
    if (m.id && this.pending.has(m.id)) {
      const p = this.pending.get(m.id); this.pending.delete(m.id);
      m.error ? p.rej(new Error(p.method + ': ' + m.error.message)) : p.res(m.result);
    } else if (m.method) for (const h of this.handlers) h(m);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id, msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej, method }); this.ws.send(JSON.stringify(msg)); });
  }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  waitFor(method, sessionId, timeout) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(new Error('timeout waiting for ' + method)); }, timeout);
      const off = this.on(m => { if (m.method === method && (!sessionId || m.sessionId === sessionId)) { clearTimeout(t); off(); res(m.params); } });
    });
  }
}

async function launch() {
  const exe = findChrome();
  if (!exe) throw new Error('Chrome/Edge not found. Pass --chrome <path> or set CHROME_PATH.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wpcheck-profile-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--disable-background-networking', '--disable-sync', '--disable-component-update',
    '--window-size=1440,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { proc.kill(); throw new Error('Chrome did not start (no DevToolsActivePort)'); }
  let lines = [];
  for (let i = 0; i < 20; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
  const cdp = new CDP(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await cdp.open();
  return { cdp, proc, profile, exe };
}

async function shutdown(b) {
  try { await Promise.race([b.cdp.send('Browser.close'), sleep(3000)]); } catch { /* already closed */ }
  try { b.proc.kill(); } catch { /* gone */ }
  for (let i = 0; i < 20; i++) { try { fs.rmSync(b.profile, { recursive: true, force: true }); return; } catch { await sleep(250); } }
}

// ---------- in-page code ----------
const PERF_INIT = `(() => {
  window.__wpCheck = { lcp: 0, lcpEl: null, lcpUrl: '', cls: 0, frozen: false };
  // LCP is frozen before the checker scrolls (programmatic scrolling does not end LCP like a real user's input would).
  try { new PerformanceObserver(l => { if (window.__wpCheck.frozen) return; for (const e of l.getEntries()) { window.__wpCheck.lcp = Math.round(e.startTime); window.__wpCheck.lcpEl = e.element || null; window.__wpCheck.lcpUrl = e.url || ''; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__wpCheck.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
})();`;

const SCROLL = `(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const step = Math.max(200, innerHeight * 0.7);
  const go = top => window.scrollTo({ top, left: 0, behavior: 'instant' }); // beats CSS scroll-behavior: smooth
  for (let y = 0, i = 0; i < 300; i++) {
    y += step; go(y); await s(110);
    if (y >= document.documentElement.scrollHeight - innerHeight) break;
  }
  await s(600); go(0); await s(800);
  if (window.scrollY) { go(0); await s(800); }
  try { await document.fonts.ready; } catch (e) {}
  return document.documentElement.scrollHeight;
})()`;

// Runs inside the page. Must be self-contained.
function audit() {
  const de = document.documentElement, vw = de.clientWidth, vh = innerHeight, sy = window.scrollY;
  const HIDDEN_SEL = '.screen-reader-text, .sr-only, [class*="visually-hidden"], .skip-link, [aria-hidden="true"]';
  const SKIP = '#wpadminbar, script, style, noscript, template, svg *';
  const all = [...document.body.querySelectorAll('*')].filter(el => !el.closest(SKIP));
  const styles = new Map(all.map(el => [el, getComputedStyle(el)]));
  const cs = el => styles.get(el) || getComputedStyle(el);
  const txt = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  const sel = el => {
    if (!el || !el.tagName) return '';
    const one = e => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; const c = [...e.classList].filter(k => !/^(wow|animated|active|show|fade)/.test(k)).slice(0, 2); return c.length ? s + '.' + c.join('.') : s; };
    const p = el.parentElement;
    return (p && p !== document.body && !el.id ? one(p) + ' > ' : '') + one(el);
  };
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = cs(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const parseC = str => { const m = /rgba?\(([^)]+)\)/.exec(str || ''); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const blend = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const hsl = c => { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return { h: 0, s: 0, l }; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return { h, s: d / (1 - Math.abs(2 * l - 1)), l }; };
  const rgb = c => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  const out = { url: location.href, vw, vh };

  // --- document basics
  out.title = document.title.trim();
  out.lang = de.getAttribute('lang') || '';
  out.metaDescription = (document.querySelector('meta[name="description"]')?.content || '').trim();
  out.viewportMeta = document.querySelector('meta[name="viewport"]')?.content || '';
  out.ogImage = !!document.querySelector('meta[property="og:image"]');
  out.siteIcon = !!document.querySelector('link[rel~="icon"]');
  out.docHeight = de.scrollHeight;
  out.loggedIn = document.body.classList.contains('logged-in');
  out.jquery = !!window.jQuery;

  // --- headings
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => !h.closest('#wpadminbar'));
  out.h1 = heads.filter(h => h.tagName === 'H1').map(h => ({ text: txt(h).slice(0, 90), visible: visible(h) }));
  out.headingSkips = []; let prev = 0;
  for (const h of heads) { const l = +h.tagName[1]; if (prev && l > prev + 1) out.headingSkips.push(`${h.tagName} after H${prev}: "${txt(h).slice(0, 50)}"`); prev = l; }

  // --- horizontal overflow (report outermost offenders only)
  out.overflowX = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
  out.overflowers = [];
  const clipsX = el => { for (let a = el.parentElement; a && a !== de; a = a.parentElement) { const s = cs(a); if (s.overflowX !== 'visible' || (s.contain || '').includes('paint')) return true; } return false; };
  const reported = new Set();
  for (const el of all) {
    const s = cs(el); if (s.position === 'fixed' || el.closest('[style*="position: fixed"]')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let a = el.parentElement, inside = false; for (; a; a = a.parentElement) if (reported.has(a)) { inside = true; break; }
    if (inside || clipsX(el)) continue;
    let fixedAnc = false; for (let p = el.parentElement; p && p !== de; p = p.parentElement) if (cs(p).position === 'fixed') { fixedAnc = true; break; }
    if (fixedAnc) continue;
    reported.add(el); out.overflowers.push(`${sel(el)} [${Math.round(r.left)} … ${Math.round(r.right)}px]`);
  }

  // --- images
  const imgs = [...document.images].filter(i => !i.closest('#wpadminbar'));
  const name = i => ((i.currentSrc || i.src || '').split('?')[0].split('/').pop() || sel(i)).slice(0, 70);
  out.img = { total: imgs.length, noAlt: [], broken: [], noDims: [], lazyAboveFold: [], oversized: [], upscaled: [] };
  for (const i of imgs) {
    const r = i.getBoundingClientRect(), shown = r.width > 1 && r.height > 1;
    if (!i.hasAttribute('alt')) out.img.noAlt.push(name(i));
    if (i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute('src'))) out.img.broken.push(i.currentSrc || i.src);
    if (!(i.getAttribute('width') && i.getAttribute('height')) && cs(i).aspectRatio === 'auto' && shown) out.img.noDims.push(name(i));
    if (i.loading === 'lazy' && shown && r.top + sy < vh && r.bottom + sy > 0 && r.left < vw && r.right > 0) out.img.lazyAboveFold.push(`${name(i)} (top ${Math.round(r.top + sy)}px)`);
    if (shown && r.width > 40 && i.naturalWidth > Math.max(r.width * 3.2, 1400)) out.img.oversized.push(`${name(i)}: ${i.naturalWidth}px file shown at ${Math.round(r.width)}px`);
    if (shown && r.width > 240 && i.naturalWidth && i.naturalWidth < r.width * 0.9 && !/\.svg/i.test(i.currentSrc || i.src)) out.img.upscaled.push(`${name(i)}: ${i.naturalWidth}px stretched to ${Math.round(r.width)}px`);
  }

  // --- accessible names, generic CTAs, forms, tap targets
  const nameOf = el => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') || txt(el) ||
    [...el.querySelectorAll('img[alt]')].map(i => i.alt).join(' ') || el.querySelector('svg title')?.textContent || el.getAttribute('title') || el.value || '').trim();
  out.unnamed = []; out.ambiguous = []; out.genericCta = []; out.arrows = []; out.newTabNoWarn = 0;
  const controls = [...document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"]')].filter(el => !el.closest('#wpadminbar'));
  for (const el of controls) {
    const n = nameOf(el);
    if (!n) { if (visible(el) || el.closest('nav, header, footer')) out.unnamed.push(sel(el) + (el.getAttribute('href') ? ' href=' + el.getAttribute('href').slice(0, 60) : '')); continue; }
    const t = txt(el);
    if (el.tagName === 'A' && /^(read more|learn more|click here|here|more|details|link|view)$/i.test(n)) out.ambiguous.push(n);
    if (/^(learn more|read more|get started|click here|submit|send|more|discover more|view more|see more|explore)$/i.test(t)) out.genericCta.push(t);
    if (/[→⟶➜➔➝➞↗]/.test(t) && !el.closest('.breadcrumb, [class*="breadcrumb"], .pagination, [class*="pagination"]')) out.arrows.push(t.slice(0, 40));
    if (el.target === '_blank' && !/new (tab|window)/i.test(n)) out.newTabNoWarn++;
  }
  out.unlabeled = [];
  for (const f of document.querySelectorAll('input, select, textarea')) {
    const t = (f.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(t) || f.closest('#wpadminbar') || !visible(f)) continue;
    const ok = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label') || f.title;
    if (!ok) out.unlabeled.push(sel(f) + (f.placeholder ? ` (placeholder only: "${f.placeholder.slice(0, 30)}")` : ''));
  }
  // iOS zooms the page when a focused field's text is under 16px
  out.inputZoom = [];
  if (innerWidth < 768) for (const f of document.querySelectorAll('input, select, textarea')) {
    const t = (f.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file'].includes(t) || f.closest('#wpadminbar') || !visible(f)) continue;
    const px = parseFloat(cs(f).fontSize);
    if (px < 16) out.inputZoom.push(`${sel(f)} ${px}px`);
  }
  // in-page anchors under a fixed/sticky top bar need scroll-padding-top (html) or scroll-margin-top (targets)
  out.anchorOffset = null;
  const topBar = all.find(el => { const s = cs(el); if (s.position !== 'fixed' && s.position !== 'sticky') return false; const r = el.getBoundingClientRect(); return r.top <= 1 && r.bottom > 0 && r.height >= 30 && r.height < vh * 0.4 && r.width > vw * 0.5 && visible(el); });
  if (topBar) {
    const targets = [...new Set([...document.querySelectorAll('a[href^="#"]')].filter(x => !x.closest('#wpadminbar')).map(x => x.getAttribute('href')).filter(h => h.length > 1 && h !== '#top'))]
      .map(h => { try { return document.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { return null; } }).filter(Boolean);
    const spt = parseFloat(getComputedStyle(de).scrollPaddingTop);
    if (targets.length && !(spt > 0) && !targets.some(t => parseFloat(getComputedStyle(t).scrollMarginTop) > 0)) out.anchorOffset = { bar: sel(topBar), h: Math.round(topBar.getBoundingClientRect().height), anchors: targets.length };
  }

  out.smallTargets = [];
  if (innerWidth < 768) for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')) {
    if (el.closest('#wpadminbar') || el.closest(HIDDEN_SEL) || !visible(el)) continue;
    if (el.tagName === 'A' && el.closest('p, td, .entry-content, .wp-block-post-content')) continue; // inline links are exempt
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) out.smallTargets.push(`${sel(el)} "${nameOf(el).slice(0, 25)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  // --- skip link
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(e => !e.closest('#wpadminbar') && !e.disabled && e.type !== 'hidden');
  const first = focusables[0];
  out.skipLink = first && first.tagName === 'A' && /^#./.test(first.getAttribute('href') || '')
    ? { text: txt(first), target: first.getAttribute('href'), targetExists: !!document.getElementById(decodeURIComponent(first.getAttribute('href').slice(1))) }
    : { missing: true, first: first ? sel(first) : null };

  // --- stylesheet scan
  out.css = { focusRules: 0, focusVisible: 0, reducedMotion: 0, sheets: 0, crossOrigin: 0, transitionAll: 0, bounce: 0 };
  const walk = rules => {
    for (const r of rules) {
      if (r.selectorText) {
        if (r.selectorText.includes(':focus')) { out.css.focusRules++; if (r.selectorText.includes(':focus-visible')) out.css.focusVisible++; }
        const st = r.style;
        if (st && /(^|,)\s*all(\s|$)/.test(st.transitionProperty || '') && (st.transitionDuration || '') !== '0s' && st.transition) out.css.transitionAll++;
        if (st && /cubic-bezier\([^)]*(-0?\.\d+|1\.[1-9]\d*)/.test(st.transitionTimingFunction + ' ' + st.animationTimingFunction)) out.css.bounce++;
      }
      const cond = (r.media && r.media.mediaText) || r.conditionText || '';
      if (cond.includes('prefers-reduced-motion')) out.css.reducedMotion++;
      if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch (e) { out.css.crossOrigin++; } }
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); out.css.sheets++; } catch (e) { out.css.crossOrigin++; } }

  // --- fonts
  const fam = el => el ? cs(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null;
  out.fonts = {
    body: fam(document.body), h1: fam(document.querySelector('h1')), h2: fam(document.querySelector('h2')),
    button: fam(document.querySelector('.button, .btn, button, [class*="button"]')),
    loaded: [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')))],
    remote: [...document.querySelectorAll('link[rel~="stylesheet"][href*="fonts.googleapis"], link[rel~="stylesheet"][href*="use.typekit"], link[rel~="stylesheet"][href*="fonts.bunny"], link[rel~="stylesheet"][href*="fontawesome"]')].map(l => l.href.slice(0, 90)),
    used: {}
  };

  // --- contrast (walk to the first opaque background; skip text over images / gradients)
  const mediaCache = new Map();
  const mediaIn = a => { if (!mediaCache.has(a)) mediaCache.set(a, [...a.querySelectorAll('img, video, picture, canvas, iframe')].map(m => m.getBoundingClientRect())); return mediaCache.get(a); };
  const overlaps = (r, m) => m.width > 0 && m.height > 0 && r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top;
  // What is painted under an out-of-flow (absolute/fixed) transparent box: hit-test the viewport.
  const behind = (el, rect) => {
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) return undefined; // off-screen: cannot tell
    const stack = document.elementsFromPoint(x, y);
    return stack.find(e => !e.contains(el) && !el.contains(e));
  };
  const bgOf = (el, rect, depth = 0) => {
    const layers = []; let floating = false, opaque = false, src = 'default white';
    for (let a = el; a; a = a.parentElement) {
      const s = cs(a);
      if (s.display === 'contents') continue; // generates no box, paints no background
      if (s.backgroundImage !== 'none') return null;
      for (const ps of ['::before', '::after']) { const p = getComputedStyle(a, ps); if (p.content !== 'none' && p.backgroundImage !== 'none' && (p.position === 'absolute' || p.position === 'fixed')) return null; }
      if (a !== el && mediaIn(a).some(m => overlaps(rect, m))) return null;
      const c = parseC(s.backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 0.99) { opaque = true; src = sel(a); break; }
      if (s.position === 'absolute' || s.position === 'fixed') { floating = true; break; }
    }
    if (floating && !opaque) { // e.g. a transparent header laid over a photo banner
      if (depth) return null;
      const b = behind(el, rect);
      if (!b || /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|SVG)$/i.test(b.tagName)) return null;
      const under = bgOf(b, rect, 1);
      if (!under) return null;
      layers.push(under); src = 'under ' + sel(b) + ' → ' + under.src;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    bg.src = src;
    return bg;
  };
  const fails = new Map(); let checked = 0, unknown = 0;
  for (const el of all) {
    if (!ownText(el)) continue;
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.1) continue;
    if (el.closest(HIDDEN_SEL) || el.closest('option') || el.disabled) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const f = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); out.fonts.used[f] = (out.fonts.used[f] || 0) + 1;
    const fg = parseC(s.color); if (!fg) continue;
    const bg = bgOf(el, r); if (!bg) { unknown++; continue; }
    checked++;
    const fgB = fg.a < 1 ? blend(fg, bg) : fg;
    const L1 = lum(fgB), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), large = px >= 24 || (+s.fontWeight >= 700 && px >= 18.66), need = large ? 3 : 4.5;
    if (ratio < need - 0.05) {
      const k = `${rgb(fgB)} on ${rgb(bg)}`;
      if (!fails.has(k)) fails.set(k, { pair: k, ratio: +ratio.toFixed(2), need, sample: txt(el).slice(0, 40), sel: sel(el), bgFrom: bg.src, count: 0 });
      fails.get(k).count++;
    }
  }
  out.contrast = { checked, unknown, fails: [...fails.values()].sort((a, b) => a.ratio - b.ratio) };

  // --- design tells
  const sl = { purpleGradients: [], gradientText: [], eyebrows: 0, eyebrowSamples: [], emoji: [], glass: 0, stripeCards: [], glow: [], radii: {}, surfaces: 0,
    fadeUp: 0, counters: 0, bootstrapBlue: [], bootstrapLinks: 0, fa: 0, iconCardRows: [], bigNumbers: 0, placeholder: [], vague: [], autoplay: 0, preloader: false, centeredHero: false };
  const emojiRe = /\p{Extended_Pictographic}/u;
  for (const el of all) {
    const s = cs(el), r = el.getBoundingClientRect(), shown = r.width > 1 && r.height > 1;
    const bi = s.backgroundImage;
    if (bi.includes('gradient') && r.width > 80) {
      const cols = [...bi.matchAll(/rgba?\([^)]+\)/g)].map(m => parseC(m[0])).filter(c => c && c.a > 0.3);
      if (cols.some(c => { const q = hsl(c); return q.h >= 235 && q.h <= 300 && q.s > 0.35 && q.l > 0.2 && q.l < 0.85; })) sl.purpleGradients.push(sel(el));
    }
    if ((s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') && txt(el)) sl.gradientText.push(`${sel(el)} "${txt(el).slice(0, 30)}"`);
    if (s.backdropFilter && s.backdropFilter !== 'none') sl.glass++;
    if (ownText(el) && shown && s.textTransform === 'uppercase' && parseFloat(s.letterSpacing) >= 0.5 && parseFloat(s.fontSize) <= 15) {
      const t = txt(el); if (t.length > 2 && t.length < 50 && !el.closest('nav, .main-nav, header, button, .button, .btn')) { sl.eyebrows++; if (sl.eyebrowSamples.length < 6) sl.eyebrowSamples.push(t); }
    }
    if (shown && /^(H[1-4]|BUTTON|A|LI)$/.test(el.tagName) && el.closest('h1,h2,h3,h4,nav,button,.button,.btn,ul') && emojiRe.test(txt(el).replace(/[©®™]/g, ''))) sl.emoji.push(`${el.tagName.toLowerCase()} "${txt(el).slice(0, 30)}"`);
    const bl = parseFloat(s.borderLeftWidth), bt = parseFloat(s.borderTopWidth), br = parseFloat(s.borderRightWidth);
    const bgc = parseC(s.backgroundColor), hasBg = bgc && bgc.a > 0.05;
    if (shown && r.height > 50 && r.width > 120 && el.tagName !== 'BLOCKQUOTE' && bl >= 3 && br < 1 && bt < 1 && hasBg) { const c = parseC(s.borderLeftColor); if (c && hsl(c).s > 0.3) sl.stripeCards.push(sel(el)); }
    if (s.boxShadow && s.boxShadow !== 'none') {
      const sc = [...s.boxShadow.matchAll(/rgba?\([^)]+\)/g)].map(m => parseC(m[0])).filter(c => c && c.a > 0.2 && hsl(c).s > 0.5 && hsl(c).l > 0.25 && hsl(c).l < 0.8);
      if (sc.length && shown) sl.glow.push(sel(el));
    }
    if (shown && r.width > 160 && r.height > 100 && (hasBg || s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0) && r.width < vw * 0.95) {
      sl.surfaces++; const k = s.borderTopLeftRadius; sl.radii[k] = (sl.radii[k] || 0) + 1;
    }
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/\b(wow|fadeInUp|fadeIn|fade-up|animate__\w+|aos-init|aos-animate)\b/.test(cls) || el.hasAttribute('data-aos') || el.hasAttribute('data-wow-delay')) sl.fadeUp++;
    if (el.getAttribute('data-toggle') === 'counter-up' || /\b(counter|count-up|countup|odometer)\b/.test(cls) || /^\d+$/.test(el.getAttribute('data-count') || el.getAttribute('data-target') || '')) sl.counters++;
    if (shown && /^rgb\((13, 110, 253|0, 123, 255)\)$/.test(s.backgroundColor) && /^(A|BUTTON|INPUT)$/.test(el.tagName)) sl.bootstrapBlue.push(sel(el));
    if (el.tagName === 'A' && /^rgb\((13, 110, 253|0, 123, 255)\)$/.test(s.color)) sl.bootstrapLinks++;
    if (el.tagName === 'I' && /\bfa[srlbd]?\b|\bfa-/.test(cls)) sl.fa++;
    if (ownText(el) && shown && parseFloat(s.fontSize) >= 30 && /^[\d.,\s]+[+%★kKmM]?$/.test(txt(el)) && txt(el).length <= 8) sl.bigNumbers++;
    // identical icon-card rows
    const kids = [...el.children].filter(c => cs(c).display !== 'none');
    if (kids.length >= 3 && kids.length <= 6 && typeof kids[0].className === 'string' && kids[0].className && kids.every(c => c.className === kids[0].className)
        && kids.every(c => c.querySelector('svg, i[class*="fa"], [class*="icon"]') && c.querySelector('h2, h3, h4, h5'))) {
      const ws = kids.map(c => Math.round(c.getBoundingClientRect().width));
      if (ws[0] > 0 && Math.max(...ws) - Math.min(...ws) <= 2 && ws[0] < vw * 0.5) sl.iconCardRows.push(`${sel(el)} ×${kids.length}`);
    }
  }
  sl.autoplay = document.querySelectorAll('[data-bs-ride="carousel"], [data-ride="carousel"], .owl-carousel, .slick-slider, [data-autoplay]').length;
  sl.preloader = !!document.querySelector('#preloader, #spinner, .preloader, [class*="preloader"], .loader-wrapper');
  const h1 = document.querySelector('h1');
  if (h1) { const r = h1.getBoundingClientRect(); sl.centeredHero = r.top + sy < vh && cs(h1).textAlign === 'center'; }
  sl.iconCardRows = [...new Set(sl.iconCardRows)];
  const bodyText = document.body.innerText;
  for (const re of [/lorem ipsum/i, /dolor sit amet/i, /hello world!/i, /just another wordpress site/i, /\bsample page\b/i, /proudly powered by wordpress/i, /\buncategori[sz]ed\b/i]) { const m = bodyText.match(re); if (m) sl.placeholder.push(m[0]); }
  const vagueRe = /\b(elevate|unleash|transform your|seamless(ly)?|cutting[- ]edge|best[- ]in[- ]class|world[- ]class|revolutioni[sz]e|empower(ing)?|next[- ]level|innovative solutions?|one[- ]stop|all[- ]in[- ]one|unlock the power|welcome to our (website|site)|we are a (passionate|dedicated) team|state[- ]of[- ]the[- ]art|game[- ]chang)/i;
  for (const el of document.querySelectorAll('h1, h2, h3, p, .button, .btn, button, li')) { if (el.closest('#wpadminbar')) continue; const m = txt(el).match(vagueRe); if (m && sl.vague.length < 12) sl.vague.push(`"${m[0]}" in ${el.tagName.toLowerCase()}: ${txt(el).slice(0, 60)}`); }
  out.slop = sl;

  // --- performance
  const p = window.__wpCheck || {};
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const kb = t => Math.round(res.filter(t).reduce((n, e) => n + (e.transferSize || 0), 0) / 1024);
  out.perf = {
    lcp: p.lcp || null, cls: +(p.cls || 0).toFixed(3),
    lcpEl: p.lcpEl ? sel(p.lcpEl) : null, lcpTag: p.lcpEl ? p.lcpEl.tagName : null, lcpUrl: (p.lcpUrl || '').split('/').pop().slice(0, 70),
    lcpLoading: p.lcpEl && p.lcpEl.getAttribute ? p.lcpEl.getAttribute('loading') : null,
    lcpFetch: p.lcpEl && p.lcpEl.getAttribute ? p.lcpEl.getAttribute('fetchpriority') : null,
    ttfb: nav ? Math.round(nav.responseStart) : null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null,
    requests: res.length, kbTotal: kb(() => true), kbJs: kb(e => e.initiatorType === 'script'), kbCss: kb(e => e.initiatorType === 'link' && /\.css/.test(e.name)),
    kbImg: kb(e => e.initiatorType === 'img' || /\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/.test(e.name)), kbFont: kb(e => /\.(woff2?|ttf|otf)(\?|$)/.test(e.name)),
    renderBlockingScripts: [...document.querySelectorAll('head script[src]:not([defer]):not([async]):not([type="module"])')].map(s => s.src.split('?')[0].split('/').pop())
  };
  return out;
}

// Runs inside the page after the scroll pass. Self-contained. It scrolls and moves focus, then puts both back.
// 1) Text that stays invisible even when scrolled into view and given time (a reveal that never ran).
// 2) WCAG 2.4.11: a focused control entirely covered by a fixed/sticky bar (tab up → header, tab down → bottom bars).
async function interact(cfg) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const de = document.documentElement, prevSB = de.style.scrollBehavior, out = { hidden: [], obscured: [], focusChecked: 0 };
  de.style.scrollBehavior = 'auto';
  const txt = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sel = el => { const one = e => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; const c = [...e.classList].slice(0, 2); return c.length ? s + '.' + c.join('.') : s; }; const p = el.parentElement; return (p && p !== document.body && !el.id ? one(p) + ' > ' : '') + one(el); };
  const settle = async (els, cap) => { try { const anims = els.flatMap(e => e.getAnimations ? e.getAnimations({ subtree: true }) : []).filter(a => { const t = a.effect && a.effect.getTiming(); return t && t.iterations !== Infinity; }); await Promise.race([Promise.all(anims.map(a => a.finished)), sleep(cap)]); } catch (e) { /* cancelled */ } };

  // 1. invisible text
  const SKIP = '[inert], [aria-hidden="true"], [hidden], dialog:not([open]), details:not([open]) > :not(summary), .screen-reader-text, .sr-only, [class*="visually-hidden"], .skip-link, #wpadminbar, script, style, noscript, template, svg, nav, [role="dialog"], [role="menu"], [role="tabpanel"], [class*="dropdown"], [class*="submenu"], [class*="modal"], [class*="popup"], [class*="tooltip"], [class*="offcanvas"], .pin-spacer, .carousel, .swiper, .slick-slider, .splide, .flickity-enabled, [aria-roledescription="carousel"], [aria-roledescription="slide"]';
  const hiddenBy = el => { let op = 1, hider = null; for (let a = el; a && a !== de; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.position === 'fixed') return null; if (+s.opacity < 0.999 && +s.opacity * op < 0.1 && !hider) hider = a; op *= +s.opacity; } if (getComputedStyle(el).visibility === 'hidden') return { why: 'visibility hidden', hider: el }; return op < 0.1 ? { why: 'opacity ' + op.toFixed(2), hider: hider || el } : null; };
  const root = document.querySelector('main') || document.body;
  const groups = new Map();
  for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2) || el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const h = hiddenBy(el); if (!h) continue;
    if (!groups.has(h.hider)) groups.set(h.hider, el);
    if (groups.size >= 12) break;
  }
  for (const [hider, el] of groups) {
    el.scrollIntoView({ block: 'center' }); await sleep(700); await settle([hider, el], 1500); await frame();
    const h = hiddenBy(el);
    if (h) out.hidden.push(`"${txt(el).slice(0, 50)}" [${h.why}] ${sel(h.hider)}`);
  }

  // 2. focus hidden under a fixed/sticky bar
  if (cfg.focus) {
    const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
    const overlays = [...document.body.querySelectorAll('*')].filter(e => { if (e.closest('#wpadminbar, [inert], [aria-hidden="true"]')) return false; const p = getComputedStyle(e).position; if (p !== 'fixed' && p !== 'sticky') return false; const r = e.getBoundingClientRect(); return vis(e) && r.width * r.height < innerWidth * innerHeight * 0.6; });
    if (overlays.length) {
      const inOverlay = e => overlays.some(o => o.contains(e));
      const all = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
        .filter(e => !e.disabled && !e.closest('#wpadminbar, [inert], [aria-hidden="true"], [hidden], .skip-link, .screen-reader-text, [class*="skip-to"], [class*="visually-hidden"], .sr-only') && !inOverlay(e) && vis(e));
      const n = Math.min(20, all.length), pick = [];
      for (let i = 0; i < n; i++) pick.push(all[Math.floor(i * all.length / n)]);
      const covered = e => {
        const r = e.getBoundingClientRect();
        const pts = [[0.5, 0.5], [0.12, 0.2], [0.88, 0.2], [0.12, 0.8], [0.88, 0.8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
        if (!pts.length) return null;
        let by = null;
        for (const [x, y] of pts) { const hit = document.elementFromPoint(x, y); if (!hit || hit === e || e.contains(hit) || hit.contains(e)) return null; const o = overlays.find(o => o.contains(hit)); if (!o) return null; by = o; }
        return by;
      };
      const seen = new Set();
      for (const dir of ['up', 'down']) {
        window.scrollTo(0, dir === 'up' ? de.scrollHeight : 0); await sleep(400);
        for (const e of dir === 'up' ? [...pick].reverse() : pick) {
          e.focus({ preventScroll: true });
          e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          await frame(); await settle(overlays, 700); await frame();
          out.focusChecked++;
          const by = covered(e);
          if (by && !seen.has(e)) { seen.add(e); out.obscured.push(`${sel(e)} "${txt(e).slice(0, 30) || e.getAttribute('aria-label') || ''}" under ${sel(by)} (tabbing ${dir})`); }
        }
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  }
  window.scrollTo(0, 0); de.style.scrollBehavior = prevSB; await sleep(600);
  if (window.scrollY) { window.scrollTo(0, 0); await sleep(400); }
  return out;
}

// ---------- findings ----------
const DEFAULT_FONTS = /^(inter|roboto|arial|helvetica( neue)?|system-ui|-apple-system|blinkmacsystemfont|segoe ui|sans-serif|serif|times new roman)$/i;
const TEMPLATE_FONTS = /^(poppins|montserrat|open sans|lato|raleway|nunito|source sans pro|work sans)$/i;
const TASTEFUL_FONTS = /^(space grotesk|geist|syne|sora|instrument serif|fraunces|cal sans|playfair display|dm sans|outfit|manrope|plus jakarta sans)$/i;

function classify(a, ctx) {
  const Q = [], D = [];
  const q = (level, id, msg, items) => Q.push({ level, id, msg, items: (items || []).slice(0, 12), more: items && items.length > 12 ? items.length - 12 : 0 });
  const d = (sev, id, msg, items) => D.push({ sev, id, msg, items: (items || []).slice(0, 8), more: items && items.length > 8 ? items.length - 8 : 0 });

  if (ctx.docStatus >= 400) q('FAIL', 'HTTP', `Page returned HTTP ${ctx.docStatus}`);
  if (ctx.errors.length) q('FAIL', 'JS', 'JavaScript / console errors', ctx.errors);
  if (ctx.failed.length) q('FAIL', 'NET', 'Failed requests', ctx.failed);
  if (a.overflowX > 0) q('FAIL', 'OVERFLOW', `Horizontal scroll: page is ${a.overflowX}px wider than the viewport`, a.overflowers);
  else if (a.overflowers.length) q('INFO', 'OVERFLOW', 'Elements extend past the viewport but are clipped by an ancestor', a.overflowers);
  if (a.h1.length !== 1) q('FAIL', 'H1', `${a.h1.length} <h1> elements (need exactly 1)`, a.h1.map(h => h.text));
  else if (!a.h1[0].visible) q('WARN', 'H1', 'The <h1> is not visible on load', a.h1.map(h => h.text));
  if (a.headingSkips.length) q('WARN', 'HEADINGS', 'Heading levels skip', a.headingSkips);
  if (!a.title) q('FAIL', 'TITLE', 'Empty <title>');
  if (!a.lang) q('FAIL', 'LANG', '<html> has no lang attribute');
  if (!/width=device-width/.test(a.viewportMeta)) q('FAIL', 'VIEWPORT', 'No responsive viewport meta');
  const maxScale = /maximum-scale\s*=\s*([\d.]+)/i.exec(a.viewportMeta);
  if (/user-scalable\s*=\s*(no|0)\b/i.test(a.viewportMeta) || (maxScale && +maxScale[1] < 2)) q('FAIL', 'VIEWPORT-ZOOM', `Pinch zoom is blocked: "${a.viewportMeta}" (remove user-scalable=no / maximum-scale; WCAG 1.4.4)`);
  if (!a.metaDescription) q('WARN', 'META', 'No meta description (set it in the SEO plugin)');
  if (!a.siteIcon) q('WARN', 'ICON', 'No site icon / favicon (Settings → General → Site Icon)');
  if (!a.ogImage) q('INFO', 'OG', 'No og:image (SEO plugin)');

  const im = a.img;
  if (im.broken.length) q('FAIL', 'IMG-BROKEN', 'Broken images', im.broken);
  if (im.noAlt.length) q('FAIL', 'IMG-ALT', 'Images without an alt attribute (use alt="" for decorative ones)', im.noAlt);
  if (im.noDims.length) q('WARN', 'IMG-DIMS', 'Images without width/height or aspect-ratio (layout shift)', im.noDims);
  if (im.lazyAboveFold.length) q('WARN', 'IMG-LAZY', 'loading="lazy" on images in the first screen', im.lazyAboveFold);
  if (im.oversized.length) q('WARN', 'IMG-SIZE', 'Image files far larger than shown (check sizes/srcset)', im.oversized);
  if (im.upscaled.length) q('WARN', 'IMG-BLUR', 'Images stretched beyond their pixels (blurry)', im.upscaled);

  const p = a.perf;
  if (p.lcpTag === 'IMG' && p.lcpLoading === 'lazy') q('FAIL', 'LCP', `LCP image is lazy-loaded: ${p.lcpEl}`);
  else if (p.lcpTag === 'IMG' && p.lcpFetch !== 'high') q('WARN', 'LCP', `LCP image has no fetchpriority="high": ${p.lcpEl}`);
  if (p.lcp > 2500) q('WARN', 'LCP-TIME', `LCP ${p.lcp} ms locally (target ≤ 2500 on a real phone, so locally it should be far lower)`);
  if (p.cls >= 0.1) q('FAIL', 'CLS', `CLS ${p.cls} (target < 0.1)`); else if (p.cls >= 0.05) q('WARN', 'CLS', `CLS ${p.cls} (target < 0.1)`);
  if (p.renderBlockingScripts.length) q('WARN', 'BLOCKING-JS', 'Render-blocking scripts in <head> (use strategy => defer)', p.renderBlockingScripts);

  if (a.unnamed.length) q('FAIL', 'A11Y-NAME', 'Links/buttons without an accessible name', a.unnamed);
  if (a.unlabeled.length) q('FAIL', 'A11Y-LABEL', 'Form fields without a label', a.unlabeled);
  if (a.contrast.fails.length) q('FAIL', 'CONTRAST', `Text below WCAG AA (${a.contrast.checked} checked, ${a.contrast.unknown} over images skipped: check those on the screenshot)`,
    a.contrast.fails.map(f => `${f.ratio}:1 (need ${f.need}) ${f.pair} ×${f.count} e.g. ${f.sel} "${f.sample}" (background from ${f.bgFrom})`));
  if (a.skipLink.missing) q('WARN', 'A11Y-SKIP', `No skip link as the first focusable element (first is ${a.skipLink.first})`);
  else if (!a.skipLink.targetExists) q('FAIL', 'A11Y-SKIP', `Skip link target ${a.skipLink.target} does not exist`);
  if (a.css.focusRules === 0) q('FAIL', 'A11Y-FOCUS', 'No :focus styles found in same-origin CSS');
  else if (a.css.focusVisible === 0) q('WARN', 'A11Y-FOCUS', 'No :focus-visible rules (keyboard focus ring)');
  if (a.css.reducedMotion === 0) q(a.slop.fadeUp || a.slop.autoplay ? 'FAIL' : 'WARN', 'A11Y-MOTION', 'No prefers-reduced-motion rules');
  if (a.ambiguous.length) q('WARN', 'A11Y-LINKTEXT', 'Ambiguous link text without context (add screen-reader text)', [...new Set(a.ambiguous)]);
  if (a.smallTargets.length) q('WARN', 'TAP', 'Tap targets under 24×24 px on mobile', a.smallTargets);
  if (a.inputZoom.length) q('WARN', 'INPUT-ZOOM', 'Form fields under 16px text on mobile: iOS zooms the page on focus', a.inputZoom);
  if (a.interact.hidden.length) q('WARN', 'HIDDEN-TEXT', `Text stays invisible even when scrolled into view${ctx.reduced ? ' with reduced motion' : ''} (a reveal that never ran, or content hidden until JS)`, a.interact.hidden);
  if (a.interact.obscured.length) q('WARN', 'FOCUS-OBSCURED', `Keyboard focus lands entirely under a fixed/sticky bar (WCAG 2.4.11; ${a.interact.focusChecked} focus moves checked): add scroll-padding to <html> or move the bar`, a.interact.obscured);
  if (a.interact.error) q('INFO', 'INTERACT', 'Interaction checks did not run: ' + a.interact.error);
  if (a.anchorOffset) q('INFO', 'ANCHOR-OFFSET', `Fixed/sticky bar ${a.anchorOffset.bar} (${a.anchorOffset.h}px) but no scroll-padding-top on <html> or scroll-margin-top on the ${a.anchorOffset.anchors} anchor targets: links to #sections land under the bar`);
  if (a.newTabNoWarn) q('INFO', 'NEWTAB', `${a.newTabNoWarn} links open a new tab without saying so`);
  if (a.css.crossOrigin) q('INFO', 'CSS', `${a.css.crossOrigin} cross-origin stylesheets not scanned`);
  if (a.fonts.remote.length) q('WARN', 'FONTS-REMOTE', 'Fonts loaded from a third-party host (self-host; GDPR)', a.fonts.remote);
  if (a.jquery) q('INFO', 'JQUERY', 'jQuery is loaded on this page');

  // design tells
  const fams = Object.entries(a.fonts.used).sort((x, y) => y[1] - x[1]).map(([f]) => f);
  const head = a.fonts.h1 || a.fonts.h2, body = a.fonts.body;
  if (body && DEFAULT_FONTS.test(body) && (!head || head === body)) d('P0', 'T1', `One default face for everything: ${body}`);
  else for (const f of [...new Set([head, body].filter(Boolean))]) {
    if (DEFAULT_FONTS.test(f)) d('P1', 'T1', `Default face "${f}" used for ${f === head ? 'headings' : 'body'}`);
    if (TEMPLATE_FONTS.test(f)) d('P1', 'T2', `WP-template cliché face "${f}" (only fine if the brief earns it)`);
    if (TASTEFUL_FONTS.test(f)) d('P1', 'T2', `"Tasteful AI" cliché face "${f}" (pair it, or choose from the subject)`);
  }
  if (fams.length > 3) d('P2', 'T8', `${fams.length} font families render text`, fams);
  const declared = [head, body].filter(f => f && !DEFAULT_FONTS.test(f) && !/^(georgia|verdana|tahoma|trebuchet ms|garamond|courier new|consolas|monospace|cursive|ui-[\w-]+)$/i.test(f));
  const missing = declared.filter(f => !a.fonts.loaded.some(l => l.toLowerCase() === f.toLowerCase()));
  if (missing.length) d('P1', 'T7', 'Font declared but not loaded (visitors see the fallback)', missing);
  const s = a.slop;
  if (s.placeholder.length) { d('P0', 'WP5', 'Leftover demo content', [...new Set(s.placeholder)]); q('FAIL', 'CONTENT', 'Placeholder / default WordPress content on the page', [...new Set(s.placeholder)]); }
  if (s.purpleGradients.length) d('P0', 'C1', 'Purple / indigo gradients', s.purpleGradients);
  if (s.gradientText.length) d('P0', 'C6', 'Gradient-filled text', s.gradientText);
  if (s.iconCardRows.length) d('P1', 'L2', 'Rows of identical icon + heading cards (judge on the screenshot)', s.iconCardRows);
  if (s.centeredHero) d('P2', 'L1', 'Centered hero headline: fine only if it is a choice, not the default skeleton');
  if (s.counters || s.bigNumbers >= 3) d(s.counters ? 'P1' : 'P2', 'L4/M5', `Stat strip (${s.bigNumbers} big numbers${s.counters ? ', animated counters' : ''}): numbers must be real`);
  if (s.eyebrows >= 4) d('P1', 'SD4', `${s.eyebrows} small ALL-CAPS tracked labels`, s.eyebrowSamples);
  if (a.arrows.length) d('P1', 'CP3', 'Arrow glyphs glued to link/button text', [...new Set(a.arrows)]);
  if (s.emoji.length) d('P1', 'I2', 'Emoji used as icons', s.emoji);
  if (s.glass > 2) d('P1', 'K3', `${s.glass} elements use backdrop-filter (glass by reflex; also costly)`);
  if (s.stripeCards.length) d('P1', 'K4', 'Cards with a colored left stripe', s.stripeCards);
  if (s.glow.length > 1) d('P2', 'C5', 'Colored glow shadows', s.glow);
  const radii = Object.entries(s.radii).sort((x, y) => y[1] - x[1]);
  if (s.surfaces >= 8 && radii.length && radii[0][1] / s.surfaces > 0.8 && parseFloat(radii[0][0]) >= 12) d('P1', 'K2', `${radii[0][1]}/${s.surfaces} surfaces share one radius (${radii[0][0]})`);
  if (s.bootstrapBlue.length) d('P1', 'WP1', 'Untouched Bootstrap blue buttons (#0d6efd / #007bff)', s.bootstrapBlue);
  if (s.bootstrapLinks > 2) d('P1', 'WP1', `${s.bootstrapLinks} links in default Bootstrap blue`);
  if (s.fadeUp > 6) d(s.fadeUp > 15 ? 'P1' : 'P2', 'M1', `${s.fadeUp} elements with scroll-reveal classes (WOW/AOS/animate.css): keep 1–2 moments`);
  if (a.css.bounce) d('P2', 'M4', `${a.css.bounce} rules with overshooting (bounce) easing`);
  if (a.css.transitionAll) d('P2', 'PERF', `${a.css.transitionAll} rules use "transition: all"`);
  if (s.autoplay) d('P2', 'WP2', 'Auto-rotating carousel: ≥6 s, pause control, paused off-screen (or a static hero)');
  if (s.preloader) d('P2', 'WP2', 'Preloader in the markup: delays the first paint / LCP');
  if (s.fa > 12) d('P2', 'WP10', `${s.fa} Font Awesome <i> icons (one consistent icon set?)`);
  if (a.genericCta.length) d('P2', 'CP6', 'Generic CTA labels (verb + object instead)', [...new Set(a.genericCta)]);
  if (s.vague.length) d('P1', 'CP1', 'Vague / filler copy', s.vague);
  return { quality: Q, design: D };
}

// ---------- run ----------
const slug = (u, w) => { const x = new URL(u); return ((x.hostname + x.pathname).replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page') + '-' + w; };

async function checkPage(cdp, url, width) {
  const mobile = width < 768, height = opt.height || (mobile ? 844 : 900);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  const errors = [], failed = [], reqs = new Map(); let docStatus = 0;
  const off = cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    const pr = m.params;
    switch (m.method) {
      case 'Runtime.exceptionThrown': { const d = pr.exceptionDetails; errors.push('Uncaught: ' + ((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 240) + (d.url ? ` (${d.url.split('/').pop()}:${d.lineNumber + 1})` : '')); break; }
      case 'Runtime.consoleAPICalled': if (pr.type === 'error' || pr.type === 'assert') errors.push('console.error: ' + pr.args.map(x => x.value ?? x.description ?? '').join(' ').slice(0, 240)); break;
      case 'Log.entryAdded': if (pr.entry.level === 'error' && pr.entry.source !== 'network') errors.push(`${pr.entry.source}: ${pr.entry.text.slice(0, 240)}`); break;
      case 'Network.requestWillBeSent': reqs.set(pr.requestId, pr.request.url); break;
      case 'Network.responseReceived': {
        const mainDoc = pr.type === 'Document' && !docStatus;
        if (mainDoc) docStatus = pr.response.status; // reported once as HTTP, not again as a failed request
        else if (pr.response.status >= 400) failed.push(`${pr.response.status} ${pr.response.url.slice(0, 160)}`);
        break;
      }
      case 'Network.loadingFailed': if (!pr.canceled && pr.errorText !== 'net::ERR_ABORTED') failed.push(`${pr.errorText} ${(reqs.get(pr.requestId) || '').slice(0, 160)}`); break;
    }
  });
  try {
    await Promise.all([S('Page.enable'), S('Runtime.enable'), S('Log.enable'), S('Network.enable')]);
    await S('Network.setCacheDisabled', { cacheDisabled: true });
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) { await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await S('Network.setUserAgentOverride', { userAgent: MOBILE_UA }); }
    if (opt.reduced) await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const c of opt.cookies) { const i = c.indexOf('='); await S('Network.setCookie', { name: c.slice(0, i), value: c.slice(i + 1), url }); }
    await S('Page.addScriptToEvaluateOnNewDocument', { source: PERF_INIT });
    const loaded = cdp.waitFor('Page.loadEventFired', sessionId, 45000);
    const nav = await S('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    await loaded.catch(() => errors.push('checker: load event did not fire within 45 s'));
    await sleep(opt.wait);
    await S('Runtime.evaluate', { expression: 'window.__wpCheck && (window.__wpCheck.frozen = true)' });
    if (opt.scroll) await S('Runtime.evaluate', { expression: SCROLL, awaitPromise: true, returnByValue: true, timeout: 120000 });
    let inter = { hidden: [], obscured: [], focusChecked: 0 };
    const ir = await S('Runtime.evaluate', { expression: `(${interact.toString()})(${JSON.stringify({ focus: opt.focus })})`, awaitPromise: true, returnByValue: true, timeout: 180000 });
    if (ir.exceptionDetails) inter.error = (ir.exceptionDetails.exception?.description || ir.exceptionDetails.text || '').split('\n')[0];
    else inter = ir.result.value;
    if (opt.evalJs) { await S('Runtime.evaluate', { expression: opt.evalJs, awaitPromise: true }); await sleep(700); }
    const r = await S('Runtime.evaluate', { expression: `(${audit.toString()})()`, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) throw new Error('audit script: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    const a = r.result.value;
    a.interact = inter;
    const shots = {};
    if (opt.shots) {
      const base = path.join(OUT, slug(url, width) + (opt.reduced ? '-rm' : ''));
      const fold = await S('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shots.fold = base + '-fold.png', Buffer.from(fold.data, 'base64'));
      const lm = await S('Page.getLayoutMetrics');
      const h = Math.min(Math.ceil((lm.cssContentSize || lm.contentSize).height), MAX_SHOT_H);
      const full = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
      fs.writeFileSync(shots.full = base + '-full.png', Buffer.from(full.data, 'base64'));
      if (h >= MAX_SHOT_H) shots.truncated = true;
    }
    const ctx = { docStatus, errors: [...new Set(errors)], failed: [...new Set(failed)], reduced: opt.reduced };
    return { url, width, height, audit: a, shots, ...classify(a, ctx) };
  } finally {
    off();
    try { await cdp.send('Target.closeTarget', { targetId }); } catch { /* closed */ }
  }
}

function toMarkdown(results) {
  const L = [];
  const icon = { FAIL: '❌', WARN: '⚠️', INFO: 'ℹ️' };
  L.push(`# WP page check: ${new Date().toLocaleString()}${opt.reduced ? ' (prefers-reduced-motion: reduce)' : ''}`, '');
  L.push('| Page | Width | FAIL | WARN | Design tells (P0/P1/P2) | LCP ms | CLS | Height |', '|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.error) { L.push(`| ${r.url} | ${r.width} | checker error | | | | | |`); continue; }
    const c = l => r.quality.filter(x => x.level === l).length, dc = s => r.design.filter(x => x.sev === s).length;
    L.push(`| ${r.url} | ${r.width} | ${c('FAIL')} | ${c('WARN')} | ${dc('P0')}/${dc('P1')}/${dc('P2')} | ${r.audit.perf.lcp ?? '–'} | ${r.audit.perf.cls} | ${r.audit.docHeight}px |`);
  }
  L.push('', 'Lab numbers come from a local, unthrottled run. Confirm on the live site with PageSpeed Insights. Design tells are evidence of defaults, not verdicts: judge them on the screenshots.', '');
  for (const r of results) {
    L.push(`## ${r.url} @ ${r.width}px`, '');
    if (r.error) { L.push('Checker error: ' + r.error, ''); continue; }
    const a = r.audit, p = a.perf;
    L.push(`Title: "${a.title}" · lang=${a.lang || '–'} · h1: ${a.h1.map(h => '"' + h.text + '"').join(', ') || '–'}${a.loggedIn ? ' · logged in' : ''}`);
    L.push(`Fonts: headings ${a.fonts.h1 || a.fonts.h2 || '–'}, body ${a.fonts.body}, button ${a.fonts.button || '–'}; loaded: ${a.fonts.loaded.join(', ') || 'none'}`);
    L.push(`Perf: TTFB ${p.ttfb} ms, DCL ${p.dcl} ms, load ${p.load} ms, LCP ${p.lcp ?? '–'} ms (${p.lcpTag || '–'} ${p.lcpUrl || p.lcpEl || ''}), CLS ${p.cls}; ${p.requests} requests, ${p.kbTotal} KB (JS ${p.kbJs}, CSS ${p.kbCss}, img ${p.kbImg}, fonts ${p.kbFont})`);
    if (r.shots.full) L.push(`Screenshots: ${r.shots.fold} · ${r.shots.full}${r.shots.truncated ? ' (cut at ' + MAX_SHOT_H + 'px)' : ''}`);
    L.push('', '**Quality**', '');
    if (!r.quality.length) L.push('- ✅ nothing found');
    for (const f of r.quality) { L.push(`- ${icon[f.level]} **${f.level} ${f.id}**: ${f.msg}`); for (const it of f.items) L.push(`  - ${it}`); if (f.more) L.push(`  - … and ${f.more} more`); }
    L.push('', '**Design tells** (see references/slop-tells.md)', '');
    if (!r.design.length) L.push('- ✅ no code-detectable tells (still review the screenshots)');
    for (const f of r.design) { L.push(`- **${f.sev} ${f.id}**: ${f.msg}`); for (const it of f.items) L.push(`  - ${it}`); if (f.more) L.push(`  - … and ${f.more} more`); }
    L.push('');
  }
  return L.join('\n');
}

let browser;
try {
  browser = await launch();
  const results = [];
  for (const url of opt.urls) for (const w of opt.widths) {
    process.stderr.write(`checking ${url} @ ${w}px … `);
    try { const r = await checkPage(browser.cdp, url, w); results.push(r); process.stderr.write(`${r.quality.filter(x => x.level === 'FAIL').length} FAIL, ${r.quality.filter(x => x.level === 'WARN').length} WARN, ${r.design.length} tells\n`); }
    catch (e) { results.push({ url, width: w, error: e.message }); process.stderr.write('error: ' + e.message + '\n'); }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.md'), toMarkdown(results));
  console.log(`\nReport: ${path.join(OUT, 'report.md')}`);
  if (opt.json) console.log(JSON.stringify(results.map(r => ({ url: r.url, width: r.width, error: r.error, quality: r.quality, design: r.design })), null, 1));
  await shutdown(browser);
  const anyFail = results.some(r => r.error || r.quality.some(x => x.level === 'FAIL'));
  process.exit(anyFail ? 2 : 0);
} catch (e) {
  console.error('check.mjs failed: ' + e.message);
  if (browser) await shutdown(browser);
  process.exit(1);
}
