#!/usr/bin/env node
// wp-premium-design / motion.mjs: how smooth is the motion? (no dependencies; Node 22+, Chrome/Edge over DevTools Protocol)
// Scrolls the page from inside requestAnimationFrame at a constant speed, section by section, and records frame times,
// long tasks / long animation frames and the frames the compositor really drew. Optional viewport screenshots at scroll
// positions (pinned scenes look empty on full-page shots) with a fresh WebGL frame, and a prefers-reduced-motion run.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HELP = `Usage: node motion.mjs <url> [url...] [options]
  --mode gpu|nogpu|cpu4|mobile   one or a comma list (default gpu)
                                 gpu    hardware GPU, headless
                                 nogpu  --disable-gpu (software compositing, like a PC with acceleration off); opens a real window
                                 cpu4   hardware GPU + CPU throttled ×4
                                 mobile 412×823 @1.75, touch, mobile UA, CPU ×4
  --size 1440x900[@1]            desktop viewport (default 1440x900@1)
  --speed <px/s>                 scroll speed (default 1000)
  --sections "<sel>,<sel>"       sections to measure (default: auto, the blocks of <main> + the site footer)
  --idle <ms>                    measure the first screen idle, then with the pointer moving (default 2000 each; 0 = skip)
  --shots <n>                    viewport screenshots at n+1 evenly spaced scroll positions
  --reduced-motion               emulate prefers-reduced-motion: reduce (text left invisible is then a WARN)
  --headed                       real window for every mode (nogpu always uses one: headless does not pace frames)
  --wait <ms>                    wait after load before measuring (default 2500; ×1.6 with CPU throttling)
  --cookie name=value            add a cookie (repeatable), e.g. a WP logged_in cookie
  --no-fresh                     do not redraw WebGL canvases into the screenshot
  --out <dir>                    output folder (default <tmp>/wp-motion-<time>)
  --chrome <path>                browser executable (or env CHROME_PATH)
  --json                         also print the JSON summary
Exit code: 0 = no JS errors, 2 = JS errors on a page, 1 = the checker itself failed. Slow sections are WARN lines in motion.md.`;

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { urls: [], modes: ['gpu'], size: [1440, 900, 1], speed: 1000, sections: [], idle: 2000, shots: 0, reduced: false, headed: false, wait: 2500, cookies: [], fresh: true, out: '', chrome: process.env.CHROME_PATH || '', json: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '--mode') opt.modes = next().split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--size') { const m = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(next() || ''); if (!m) { console.error('--size expects 1440x900 or 1440x900@1.5'); process.exit(1); } opt.size = [+m[1], +m[2], +(m[3] || 1)]; }
  else if (a === '--speed') opt.speed = +next();
  else if (a === '--sections') opt.sections = next().split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--idle') opt.idle = +next();
  else if (a === '--shots') opt.shots = +next();
  else if (a === '--reduced-motion') opt.reduced = true;
  else if (a === '--headed') opt.headed = true;
  else if (a === '--wait') opt.wait = +next();
  else if (a === '--cookie') opt.cookies.push(next());
  else if (a === '--no-fresh') opt.fresh = false;
  else if (a === '--out') opt.out = next();
  else if (a === '--chrome') opt.chrome = next();
  else if (a === '--json') opt.json = true;
  else if (a.startsWith('--')) { console.error('Unknown option ' + a + '\n' + HELP); process.exit(1); }
  else opt.urls.push(a);
}
if (!opt.urls.length) { console.log(HELP); process.exit(1); }
const MODES = {
  gpu: { gpu: true, cpu: 1, mobile: false },
  nogpu: { gpu: false, cpu: 1, mobile: false, headed: true },
  cpu4: { gpu: true, cpu: 4, mobile: false },
  mobile: { gpu: true, cpu: 4, mobile: true },
};
for (const m of opt.modes) if (!MODES[m]) { console.error(`Unknown mode "${m}" (gpu, nogpu, cpu4, mobile)`); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(opt.out || path.join(os.tmpdir(), 'wp-motion-' + stamp));
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// ---------- browser ----------
function findChrome() {
  if (opt.chrome) return opt.chrome;
  const env = process.env, c = [];
  if (process.platform === 'win32') {
    for (const base of [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter(Boolean)) c.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
  } else if (process.platform === 'darwin') c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  else c.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium');
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
    if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(p.method + ': ' + m.error.message)) : p.res(m.result); }
    else if (m.method) for (const h of this.handlers) h(m);
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

async function launch(M, headed) {
  const exe = findChrome();
  if (!exe) throw new Error('Chrome/Edge not found. Pass --chrome <path> or set CHROME_PATH.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wpmotion-profile-'));
  const [w, h] = opt.size;
  const gpuFlags = M.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [])] : ['--disable-gpu'];
  const winFlags = headed
    ? ['--window-position=10,10', `--window-size=${M.mobile ? 430 : w + 16},${M.mobile ? 940 : h + 90}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion']
    : ['--headless=new', '--hide-scrollbars', `--window-size=${w},${h}`];
  const proc = spawn(exe, [...winFlags, ...gpuFlags, '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--disable-sync', '--disable-component-update', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: !headed });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { proc.kill(); throw new Error('Chrome did not start (no DevToolsActivePort)'); }
  let lines = [];
  for (let i = 0; i < 20; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
  const cdp = new CDP(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await cdp.open();
  return { cdp, proc, profile };
}

async function shutdown(b) {
  try { await Promise.race([b.cdp.send('Browser.close'), sleep(3000)]); } catch { /* closed */ }
  try { b.proc.kill(); } catch { /* gone */ }
  for (let i = 0; i < 20; i++) { try { fs.rmSync(b.profile, { recursive: true, force: true }); return; } catch { await sleep(250); } }
}

// ---------- in-page code ----------
const INIT = `(() => {
  window.__mo = { long: [], loaf: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__mo.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { const s = (e.scripts || []).slice().sort((a, b) => b.duration - a.duration)[0];
    window.__mo.loaf.push([e.startTime, e.duration, e.blockingDuration || 0, s ? ((s.sourceURL || '').split('/').pop().split('?')[0] + (s.sourceFunctionName ? ' ' + s.sourceFunctionName : '')) : '']); } }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
})();`;

// Installs window.__moTools and returns the page facts + section ranges (document coordinates).
function setup(cfg) {
  const de = document.documentElement;
  const prevBehavior = de.style.scrollBehavior;
  de.style.scrollBehavior = 'auto';
  const lenis = [window.lenis, window.__lenis, window.Lenis && window.Lenis.instance].find(l => l && typeof l.scrollTo === 'function');
  const go = y => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo({ top: y, left: 0, behavior: 'instant' }); };
  const pct = (arr, q) => arr.length ? +arr[Math.min(arr.length - 1, Math.floor(arr.length * q))].toFixed(1) : 0;
  const stats = (frames, t0, t1) => {
    const f = frames.slice(1).sort((a, b) => a - b), sum = f.reduce((a, b) => a + b, 0);
    const mo = window.__mo || { long: [], loaf: [] };
    const long = mo.long.filter(([s, d]) => s + d > t0 && s < t1);
    const loaf = mo.loaf.filter(([s, d]) => s + d > t0 && s < t1).sort((a, b) => b[1] - a[1]);
    return { frames: f.length, fps: f.length && sum ? +(1000 * f.length / sum).toFixed(1) : 0, p50: pct(f, 0.5), p95: pct(f, 0.95), max: f.length ? +f[f.length - 1].toFixed(1) : 0,
      jank: f.length ? Math.round(100 * f.filter(x => x > 33.4).length / f.length) : 0,
      long: long.length, longMax: long.length ? Math.round(Math.max(...long.map(l => l[1]))) : 0,
      loaf: loaf.length, loafMax: loaf.length ? Math.round(loaf[0][1]) : 0, loafBlock: loaf.length ? Math.round(Math.max(...loaf.map(l => l[2]))) : 0, loafScript: loaf.length ? loaf[0][3] : '' };
  };
  const record = (duration, onFrame, name) => new Promise(resolve => {
    performance.mark('mo:' + name + ':start');
    const frames = []; const t0 = performance.now(); let last = 0;
    const tick = now => {
      frames.push(last ? now - last : 0); last = now;
      const t = now - t0;
      if (onFrame) onFrame(Math.max(0, t));
      if (t >= duration) { performance.mark('mo:' + name + ':end'); resolve(stats(frames, t0, performance.now())); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  window.__moTools = { go, record, restore: () => { de.style.scrollBehavior = prevBehavior; } };
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); go(0);

  // sections
  const label = el => { const t = el.classList.contains('pin-spacer') && el.firstElementChild ? el.firstElementChild : el; if (t.id) return t.tagName.toLowerCase() + '#' + t.id; const c = [...t.classList].find(k => !/^(is-|has-|js-|wow|animated|pin-|aos|wp-block-group$)/.test(k)); return t.tagName.toLowerCase() + (c ? '.' + c : ''); };
  let els = [];
  if (cfg.sections.length) els = cfg.sections.flatMap(s => { try { return [...document.querySelectorAll(s)]; } catch (e) { return []; } });
  else {
    const root = document.querySelector('main') || document.body;
    let kids = [...root.children];
    while (kids.length === 1 && kids[0].children.length > 1) kids = [...kids[0].children];
    els = kids;
    const footer = document.querySelector('footer.site-footer, #colophon, body > footer');
    if (footer && !root.contains(footer)) els.push(footer);
  }
  const used = {};
  const sections = els.filter(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return r.height >= 120 && s.display !== 'none' && s.position !== 'fixed' && !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK)$/.test(el.tagName); })
    .slice(0, 20).map(el => { const r = el.getBoundingClientRect(); let n = label(el); used[n] = (used[n] || 0) + 1; if (used[n] > 1) n += ' (' + used[n] + ')'; return { name: n, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; })
    .sort((a, b) => a.top - b.top);
  let renderer = '';
  try { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); renderer = g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl') : 'no webgl'; } catch (e) { renderer = 'error'; }
  return { sections, renderer, lenis: !!lenis, viewport: innerWidth + '×' + innerHeight + '@' + devicePixelRatio, docHeight: de.scrollHeight, canvases: [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 100).length,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, gsap: !!window.gsap, scrollTrigger: !!window.ScrollTrigger, pins: document.querySelectorAll('.pin-spacer').length };
}

// Text that is in the viewport but cannot be seen (a reveal that never ran, content hidden for reduced motion).
function hiddenInView() {
  const vh = innerHeight, vw = innerWidth, out = [];
  const SKIP = '[inert], [aria-hidden="true"], [hidden], dialog:not([open]), details:not([open]) > :not(summary), .screen-reader-text, .sr-only, [class*="visually-hidden"], .skip-link, #wpadminbar, script, style, noscript, template, svg, .carousel, .swiper, .slick-slider, .splide, .flickity-enabled, [aria-roledescription="carousel"], [aria-roledescription="slide"]';
  const root = document.querySelector('main') || document.body;
  for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)) continue;
    if (el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    let op = 1, hidden = false, fixed = false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none') { hidden = 'none'; break; }
      if (a === el && s.visibility === 'hidden') hidden = 'visibility';
      if (s.position === 'fixed') fixed = true;
      op *= +s.opacity;
    }
    if (hidden === 'none' || fixed) continue;
    if (hidden || op < 0.1) out.push(((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)) + (hidden ? ' [visibility]' : ` [opacity ${op.toFixed(2)}]`));
    if (out.length >= 6) break;
  }
  return out;
}

// Puts a fresh 2D copy of every visible canvas in its place (a DevTools screenshot can show an old WebGL frame).
function freshCanvases() {
  return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    let n = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width < 100 || r.height < 100 || r.bottom < 0 || r.top > innerHeight || c.dataset.moCopy) continue;
      try {
        const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        t.getContext('2d').drawImage(c, 0, 0);
        t.className = c.className; t.setAttribute('style', (c.getAttribute('style') || '') + `;width:${c.clientWidth}px;height:${c.clientHeight}px`); t.dataset.moCopy = '1';
        c.dataset.moVis = c.style.visibility || ''; c.style.visibility = 'hidden'; c.after(t); n++;
      } catch (e) { /* tainted or detached: keep the original */ }
    }
    res(n);
  })));
}
function restoreCanvases() {
  for (const t of document.querySelectorAll('canvas[data-mo-copy]')) t.remove();
  for (const c of document.querySelectorAll('canvas[data-mo-vis]')) { c.style.visibility = c.dataset.moVis; delete c.dataset.moVis; }
}

// ---------- run one page in one mode ----------
const slug = u => { const x = new URL(u); return (x.hostname + x.pathname).replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page'; };

async function runPage(b, M, mode, url, headed) {
  const { cdp } = b;
  let targetId;
  if (headed) { const list = await cdp.send('Target.getTargets'); targetId = list.targetInfos.find(t => t.type === 'page').targetId; }
  else ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  const E = async (fn, arg) => { const r = await S('Runtime.evaluate', { expression: `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true, timeout: 600000 }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0]); return r.result.value; };
  const errors = [];
  const trace = [];
  const off = cdp.on(m => {
    if (m.method === 'Tracing.dataCollected') { for (const ev of m.params.value) if (ev.name === 'DrawFrame' || ev.name === 'DroppedFrame' || (typeof ev.name === 'string' && ev.name.startsWith('mo:'))) trace.push([ev.name, ev.ts]); return; }
    if (m.sessionId !== sessionId) return;
    const pr = m.params;
    if (m.method === 'Runtime.exceptionThrown') errors.push('Uncaught: ' + ((pr.exceptionDetails.exception && pr.exceptionDetails.exception.description) || pr.exceptionDetails.text || '').split('\n')[0].slice(0, 200));
    else if (m.method === 'Runtime.consoleAPICalled' && (pr.type === 'error' || pr.type === 'assert')) errors.push('console.error: ' + pr.args.map(x => x.value ?? x.description ?? '').join(' ').slice(0, 200));
  });
  const [w, h, dpr] = opt.size;
  const result = { url, mode, headed, sections: [], shots: [], hidden: [], errors };
  try {
    await Promise.all([S('Page.enable'), S('Runtime.enable'), S('Network.enable')]);
    if (M.mobile) {
      await S('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
      await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await S('Network.setUserAgentOverride', { userAgent: MOBILE_UA });
    } else if (!headed) await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    if (M.cpu > 1) await S('Emulation.setCPUThrottlingRate', { rate: M.cpu });
    if (opt.reduced) await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const c of opt.cookies) { const i = c.indexOf('='); await S('Network.setCookie', { name: c.slice(0, i), value: c.slice(i + 1), url }); }
    await S('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    const loaded = cdp.waitFor('Page.loadEventFired', sessionId, 60000);
    const nav = await S('Page.navigate', { url });
    if (nav.errorText) throw new Error('navigation failed: ' + nav.errorText);
    await loaded.catch(() => errors.push('checker: load event did not fire within 60 s'));
    await sleep(opt.wait * (M.cpu > 1 ? 1.6 : 1));

    const info = await E(setup, { sections: opt.sections });
    Object.assign(result, info);
    await sleep(500);
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['disabled-by-default-devtools.timeline.frame', 'blink.user_timing'] } });
    const rows = [];
    const vw = M.mobile ? 412 : w, vh = M.mobile ? 823 : h;
    if (opt.idle > 0) {
      rows.push({ name: 'first screen · idle', px: 0, ...(await E(ms => window.__moTools.record(ms, null, 'idle'), opt.idle)) });
      if (!M.mobile) {
        const pending = E(ms => window.__moTools.record(ms, null, 'pointer'), opt.idle);
        let done = false; pending.then(() => { done = true; }, () => { done = true; });
        for (let k = 0; !done; k++) { const a = k * 0.22; await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(vw * (0.5 + 0.3 * Math.cos(a))), y: Math.round(vh * (0.45 + 0.2 * Math.sin(a))) }); await sleep(30); }
        rows.push({ name: 'first screen · pointer', px: 0, ...(await pending) });
      }
    }
    for (let i = 0; i < info.sections.length; i++) {
      const s = info.sections[i];
      const r = await E(([s, speed, id]) => new Promise(async res => {
        const T = window.__moTools, vh = innerHeight, max = Math.max(0, document.documentElement.scrollHeight - vh);
        const y0 = Math.max(0, Math.min(max, s.top - vh * 0.5)), y1 = Math.max(y0, Math.min(max, s.bottom - vh * 0.5));
        T.go(y0); await new Promise(r => setTimeout(r, 400));
        const duration = Math.max(600, (y1 - y0) / speed * 1000);
        const st = await T.record(duration, t => T.go(y0 + (y1 - y0) * Math.min(1, t / duration)), id);
        res({ ...st, px: Math.round(y1 - y0) });
      }), [s, opt.speed, 's' + i]);
      rows.push({ name: s.name, ...r });
    }
    await new Promise(r => { const offT = cdp.on(m => { if (m.method === 'Tracing.tracingComplete') { offT(); r(); } }); cdp.send('Tracing.end').catch(r); setTimeout(r, 15000); });
    const markId = name => name === 'first screen · idle' ? 'idle' : name === 'first screen · pointer' ? 'pointer' : 's' + info.sections.findIndex(s => s.name === name);
    for (const row of rows) {
      const id = markId(row.name);
      const a = trace.find(e => e[0] === `mo:${id}:start`), z = trace.find(e => e[0] === `mo:${id}:end`);
      if (!a || !z) continue;
      const draws = trace.filter(e => e[0] === 'DrawFrame' && e[1] >= a[1] && e[1] <= z[1]).length;
      row.drawFps = draws ? +(draws / ((z[1] - a[1]) / 1e6)).toFixed(1) : null;
      row.dropped = trace.filter(e => e[0] === 'DroppedFrame' && e[1] >= a[1] && e[1] <= z[1]).length;
    }
    result.sections = rows;

    // screenshots + invisible text at scroll positions
    const n = Math.max(0, opt.shots | 0);
    const positions = n ? Array.from({ length: n + 1 }, (_, i) => i / n) : [];
    if (!n && opt.reduced) positions.push(0, 0.25, 0.5, 0.75, 1);
    for (let i = 0; i < positions.length; i++) {
      const y = await E(f => { const max = Math.max(0, document.documentElement.scrollHeight - innerHeight), y = Math.round(max * f); window.__moTools.go(y); return y; }, positions[i]);
      await sleep(900);
      const hid = await E(hiddenInView);
      if (hid.length) result.hidden.push({ y, items: hid });
      if (n) {
        if (opt.fresh) await E(freshCanvases);
        const shot = await S('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, `${slug(url)}-${mode}${opt.reduced ? '-rm' : ''}-${String(i).padStart(2, '0')}-y${y}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        result.shots.push(file);
        if (opt.fresh) await E(restoreCanvases);
      }
    }
    await E(() => { window.__moTools.go(0); window.__moTools.restore(); });
    return result;
  } finally {
    off();
    if (!headed) { try { await cdp.send('Target.closeTarget', { targetId }); } catch { /* closed */ } }
  }
}

// ---------- verdicts ----------
const SOFTWARE = /swiftshader|basic render|llvmpipe|software/i;
function verdicts(r) {
  const W = [], soft = SOFTWARE.test(r.renderer || '');
  const minFps = r.mode === 'nogpu' || soft ? 30 : 50;
  for (const s of r.sections) {
    if (!s.frames) continue;
    const why = [];
    if (s.fps < minFps) why.push(`${s.fps} fps (< ${minFps})`);
    if (r.mode !== 'nogpu' && !soft && s.p95 > 33.4) why.push(`p95 ${s.p95} ms`);
    if (s.longMax > 200) why.push(`long task ${s.longMax} ms`);
    if (s.loafBlock > 200) why.push(`frame blocked ${s.loafBlock} ms${s.loafScript ? ' by ' + s.loafScript : ''}`);
    if (why.length) W.push(`SLOW ${s.name}: ${why.join(', ')}`);
  }
  if (r.mode !== 'nogpu' && soft) W.push(`GPU mode requested but the renderer is software (${r.renderer}): numbers are pessimistic; try --headed`);
  if (r.reduced) for (const h of r.hidden) W.push(`HIDDEN-TEXT at y=${h.y} with reduced motion: ${h.items.join(' · ')}`);
  return W;
}

function toMarkdown(results) {
  const L = [`# Motion check: ${new Date().toLocaleString()}`, '',
    'rAF fps = frames the page got; drawn fps = frames the compositor drew (from the trace). p95 = 95th-percentile frame time.',
    'Jank = share of frames over 33 ms. Long task / LoAF = main-thread blocks (LoAF names the worst script). Targets: see references/motion-3d.md §10.', ''];
  for (const r of results) {
    L.push(`## ${r.url} · ${r.mode}${r.reduced ? ' · reduced motion' : ''}`, '');
    if (r.error) { L.push('Checker error: ' + r.error, ''); continue; }
    L.push(`Viewport ${r.viewport}${r.headed ? ' (window)' : ' (headless)'} · renderer: ${r.renderer} · Lenis ${r.lenis ? 'yes' : 'no'}${r.gsap ? ' · GSAP (global)' : ''}${r.scrollTrigger ? ' + ScrollTrigger' : ''} · pinned scenes ${r.pins} · canvases ${r.canvases} · page ${r.docHeight}px`, '');
    L.push('| Section | px | rAF fps | p95 ms | max ms | jank % | drawn fps | long tasks | LoAF (max / blocked) |', '|---|---|---|---|---|---|---|---|---|');
    for (const s of r.sections) L.push(`| ${s.name} | ${s.px} | ${s.fps} | ${s.p95} | ${s.max} | ${s.jank} | ${s.drawFps ?? '–'} | ${s.long}${s.long ? ` (max ${s.longMax} ms)` : ''} | ${s.loaf ? `${s.loaf}: ${s.loafMax} / ${s.loafBlock} ms${s.loafScript ? ' ' + s.loafScript : ''}` : '0'} |`);
    L.push('');
    const W = verdicts(r);
    if (W.length) { L.push('**Warnings**', ''); for (const w of W) L.push('- ⚠️ ' + w); L.push(''); } else L.push('- ✅ no slow sections', '');
    if (!r.reduced && r.hidden.length) { L.push('Text invisible at some scroll positions (often intended inside a scene; check the shots):', ''); for (const h of r.hidden) L.push(`- y=${h.y}: ${h.items.join(' · ')}`); L.push(''); }
    if (r.errors.length) { L.push('**JS errors**', ''); for (const e of [...new Set(r.errors)]) L.push('- ❌ ' + e); L.push(''); }
    if (r.shots.length) { L.push('Shots:', ''); for (const f of r.shots) L.push('- ' + f); L.push(''); }
  }
  return L.join('\n');
}

// ---------- main ----------
const results = [];
try {
  for (const mode of opt.modes) {
    const M = MODES[mode], headed = opt.headed || !!M.headed;
    process.stderr.write(`[${mode}] starting Chrome${headed ? ' (window)' : ''} …\n`);
    const b = await launch(M, headed);
    try {
      for (const url of opt.urls) {
        process.stderr.write(`[${mode}] ${url} … `);
        try { const r = await runPage(b, M, mode, url, headed); results.push(r); const W = verdicts(r); process.stderr.write(`${r.sections.length} sections, ${W.length} warnings, ${r.errors.length} JS errors\n`); }
        catch (e) { results.push({ url, mode, error: e.message, sections: [], shots: [], hidden: [], errors: [] }); process.stderr.write('error: ' + e.message + '\n'); }
      }
    } finally { await shutdown(b); }
  }
  fs.writeFileSync(path.join(OUT, 'motion.json'), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, 'motion.md'), toMarkdown(results));
  console.log(`\nReport: ${path.join(OUT, 'motion.md')}`);
  if (opt.json) console.log(JSON.stringify(results.map(r => ({ url: r.url, mode: r.mode, error: r.error, renderer: r.renderer, warnings: r.error ? [] : verdicts(r), errors: r.errors })), null, 1));
  process.exit(results.some(r => r.error) ? 1 : results.some(r => r.errors.length) ? 2 : 0);
} catch (e) {
  console.error('motion.mjs failed: ' + e.message);
  process.exit(1);
}
