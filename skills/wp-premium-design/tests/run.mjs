#!/usr/bin/env node
// Self-test for the skill's scripts: serves tests/fixtures on 127.0.0.1, runs check.mjs, motion.mjs and scan-theme.mjs
// against a page with planted problems (bad) and the same page fixed (good), and compares the findings with what is
// expected. Run after any change to the scripts: node tests/run.mjs [--skip-motion]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const FIX = path.join(HERE, 'fixtures');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'wpskill-test-'));
const SKIP_MOTION = process.argv.includes('--skip-motion');

const server = http.createServer((req, res) => {
  const p = path.join(FIX, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(FIX) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const run = (script, args) => new Promise(resolve => {
  const p = spawn(process.execPath, [path.join(SKILL, 'scripts', script), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { err += d; });
  p.on('close', code => resolve({ code, out, err }));
});

let failures = 0;
const expect = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  → ' + detail}`); if (!ok) failures++; };
const idsOf = r => new Set([...r.quality.map(x => x.id), ...r.design.map(x => x.id)]);
const NEW_IDS = ['VIEWPORT-ZOOM', 'INPUT-ZOOM', 'FOCUS-OBSCURED', 'ANCHOR-OFFSET', 'HIDDEN-TEXT'];

try {
  // ---- check.mjs (mobile width: INPUT-ZOOM only applies under 768px)
  {
    const out = path.join(OUT, 'check');
    const r = await run('check.mjs', [`${BASE}/bad.html`, `${BASE}/good.html`, '--widths', '390', '--no-shots', '--out', out]);
    const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    const bad = rep.find(x => x.url.endsWith('bad.html')), good = rep.find(x => x.url.endsWith('good.html'));
    expect('check.mjs ran on both pages', bad && good && !bad.error && !good.error, r.err.slice(-400));
    const b = idsOf(bad), g = idsOf(good);
    for (const id of NEW_IDS) expect(`check bad.html → ${id}`, b.has(id), [...b].join(', '));
    expect('check bad.html → C1 purple gradient (existing rule still works)', b.has('C1'), [...b].join(', '));
    for (const id of NEW_IDS) expect(`check good.html has no ${id}`, !g.has(id), JSON.stringify(good.quality.filter(x => x.id === id)));
    expect('check exit code 2 (bad page has a FAIL)', r.code === 2, 'code ' + r.code);
  }
  // ---- check.mjs --reduced-motion: the good page stays visible, the bad page is still hidden
  {
    const out = path.join(OUT, 'check-rm');
    await run('check.mjs', [`${BASE}/bad.html`, `${BASE}/good.html`, '--widths', '1440', '--no-shots', '--no-focus', '--reduced-motion', '--out', out]);
    const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    const bad = rep.find(x => x.url.endsWith('bad.html')), good = rep.find(x => x.url.endsWith('good.html'));
    expect('reduced motion: bad.html → HIDDEN-TEXT', idsOf(bad).has('HIDDEN-TEXT'));
    expect('reduced motion: good.html has no HIDDEN-TEXT', !idsOf(good).has('HIDDEN-TEXT'), JSON.stringify(good.quality.find(x => x.id === 'HIDDEN-TEXT')));
    expect('--no-focus skips the focus test', !idsOf(bad).has('FOCUS-OBSCURED'));
  }
  // ---- motion.mjs
  if (!SKIP_MOTION) {
    const out = path.join(OUT, 'motion');
    const r = await run('motion.mjs', [`${BASE}/bad.html`, `${BASE}/good.html`, '--mode', 'gpu', '--idle', '800', '--shots', '2', '--wait', '800', '--out', out, '--json']);
    const j = JSON.parse(r.out.slice(r.out.indexOf('\n[') + 1));
    const bad = j.find(x => x.url.endsWith('bad.html')), good = j.find(x => x.url.endsWith('good.html'));
    expect('motion.mjs ran on both pages', bad && good && !bad.error && !good.error, r.err.slice(-400));
    expect('motion bad.html → SLOW sections', bad.warnings.some(w => w.startsWith('SLOW')), JSON.stringify(bad.warnings));
    expect('motion bad.html → long task reported', bad.warnings.some(w => /long task|blocked/.test(w)), JSON.stringify(bad.warnings));
    expect('motion good.html → no SLOW sections', !good.warnings.some(w => w.startsWith('SLOW')), JSON.stringify(good.warnings));
    const full = JSON.parse(fs.readFileSync(path.join(out, 'motion.json'), 'utf8'));
    expect('motion found the 4 sections + footer area', full[0].sections.length >= 4, String(full[0].sections.length));
    expect('motion saved 3 shots per page', full.every(x => x.shots.length === 3 && x.shots.every(f => fs.existsSync(f))));
    const rm = path.join(OUT, 'motion-rm');
    const r2 = await run('motion.mjs', [`${BASE}/bad.html`, `${BASE}/good.html`, '--mode', 'gpu', '--idle', '0', '--reduced-motion', '--wait', '800', '--out', rm, '--json']);
    const j2 = JSON.parse(r2.out.slice(r2.out.indexOf('\n[') + 1));
    expect('motion --reduced-motion: bad.html → HIDDEN-TEXT', j2.find(x => x.url.endsWith('bad.html')).warnings.some(w => w.startsWith('HIDDEN-TEXT')));
    expect('motion --reduced-motion: good.html has no HIDDEN-TEXT', !j2.find(x => x.url.endsWith('good.html')).warnings.some(w => w.startsWith('HIDDEN-TEXT')));
  }
  // ---- scan-theme.mjs
  {
    const rb = await run('scan-theme.mjs', [path.join(FIX, 'theme-bad'), '--json']);
    const rg = await run('scan-theme.mjs', [path.join(FIX, 'theme-good'), '--json']);
    const b = JSON.parse(rb.out), g = JSON.parse(rg.out);
    const bi = new Set([...b.rules.map(x => x.id), ...b.extra.map(x => x.id)]), gi = new Set([...g.rules.map(x => x.id), ...g.extra.map(x => x.id)]);
    for (const id of ['VIEWPORT-ZOOM', 'GSAP-DEPRECATED', 'WILL-CHANGE', 'SLOP-C1', 'TRANS-ALL', 'REDUCED-MOTION']) expect(`scan theme-bad → ${id}`, bi.has(id), [...bi].join(', '));
    for (const id of ['VIEWPORT-ZOOM', 'GSAP-DEPRECATED', 'WILL-CHANGE', 'SLOP-C1', 'TRANS-ALL', 'REDUCED-MOTION']) expect(`scan theme-good has no ${id}`, !gi.has(id), [...gi].join(', '));
    expect('scan exit codes: bad 2, good 0', rb.code === 2 && rg.code === 0, `bad ${rb.code}, good ${rg.code}`);
  }
} catch (e) {
  failures++;
  console.log('FAIL  test runner error: ' + e.stack);
} finally {
  server.close();
}
console.log(`\n${failures ? failures + ' failed' : 'All passed'} · outputs in ${OUT}`);
process.exit(failures ? 1 : 0);
