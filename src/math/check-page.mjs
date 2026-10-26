// Headless check of one generated math experience, played like a curious visitor would.
//   node check-page.mjs <page.html> <outPrefix>   → JSON report on stdout; screenshots <outPrefix>-start.png, -after.png, -phone.png
// Inlines mathkit.js, boots the page, answers the guess, presses every visible button, moves every slider, clicks and drags
// SVG targets, waits for timers, presses Start over, and repeats at phone width. Exit 1 on any failure.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [file, out = '/tmp/page'] = process.argv.slice(2);
const KIT = readFileSync(join(HERE, 'mathkit.js'), 'utf8');
export const inline = (html, kit = KIT) => html.replace(/<script\s+src=["']mathkit\.js["']\s*>\s*<\/script>/i, () => `<script>\n${kit}\n</script>`);
const src = readFileSync(file, 'utf8');
const html = inline(src);
const threeRoot = resolve(HERE, 'node_modules/three');

const R = { file, lines: src.split('\n').length, usesKit: /<script\s+src=["']mathkit\.js["']/i.test(src), problems: [], warnings: [] };
import { existsSync, readdirSync } from 'node:fs';
const exe = (() => { try { const d = readdirSync('/opt/pw-browsers').filter(x => /^chromium-\d+$/.test(x)).sort().pop(); const p = d && `/opt/pw-browsers/${d}/chrome-linux/chrome`; return p && existsSync(p) ? p : undefined; } catch { return undefined; } })();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function visit(viewport, deep){
  const page = await browser.newPage({ viewport });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  // Playwright tries the most recently added route first: catch-all first, specific routes after
  await page.route(/^https?:\/\/(?!mk\.test)/, r => /jsdelivr|unpkg|cdnjs/.test(r.request().url()) ? r.continue() : r.fulfill({ status: 404, body: '' }));
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => { try { return r.fulfill({ body: readFileSync(resolve(threeRoot, r.request().url().match(/three@[^/]+\/(.*)$/)[1])), contentType: 'application/javascript' }); } catch { return r.fulfill({ status: 404, body: '' }); } });
  await page.route('http://mk.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.goto('http://mk.test/page.html');
  await page.waitForTimeout(1200);
  const S = { errors: errs };
  S.kit = await page.evaluate(() => !!window.MK && !!document.getElementById('mk-card'));
  const state = () => page.evaluate(() => ({
    card: document.getElementById('mk-say')?.textContent || '',
    title: document.querySelector('#mk-card h1')?.textContent || '',
    overflowX: document.documentElement.scrollWidth > innerWidth + 2,
    height: document.documentElement.scrollHeight,
    shownErr: (window.MK?.errors || []).slice(0, 5),
    svgTextOverlaps: (() => {      // visible SVG labels that sit on top of each other
      const ts = [...document.querySelectorAll('svg text')].filter(t => t.getClientRects().length && t.textContent.trim() && getComputedStyle(t).display !== 'none' && getComputedStyle(t).visibility !== 'hidden' && +getComputedStyle(t).opacity !== 0)
        .map(t => ({ t: t.textContent.trim().slice(0, 30), r: t.getBoundingClientRect() })).filter(x => x.r.width > 0);
      const o = []; for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++){ const a = ts[i].r, b = ts[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0 && h > 0 && w * h > 0.35 * Math.min(a.width * a.height, b.width * b.height)) o.push(ts[i].t + ' / ' + ts[j].t); }
      return o.slice(0, 8); })(),
    offscreenSvgText: [...document.querySelectorAll('svg')].flatMap(s => { const sr = s.getBoundingClientRect(); return [...s.querySelectorAll('text')].filter(t => t.getClientRects().length && t.textContent.trim()).filter(t => { const r = t.getBoundingClientRect(); return r.width && (r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2); }).map(t => t.textContent.trim().slice(0, 30)); }).slice(0, 8),
    guessBelowFold: (() => { const g = [...document.querySelectorAll('.mk-group')].find(g => !g.hidden && g.offsetParent && g.querySelector('button:not(:disabled), input:not(:disabled)'));
      return g ? Math.round(g.getBoundingClientRect().bottom - innerHeight) : null; })(),
    longText: [...document.querySelectorAll('#mk-say, .mk-note')].filter(n => n.offsetParent).map(n => n.textContent.trim().split(/\s+/).length).filter(w => w > 60),
    guessOpen: [...document.querySelectorAll('#mk-controls .mk-group, #mk-side .mk-group, #mk-stage .mk-group')].some(g => !g.hidden && g.querySelector('button:not(:disabled), input:not(:disabled)')),
    visibleButtons: [...document.querySelectorAll('button.mk-btn')].filter(b => b.offsetParent && !b.disabled).map(b => b.textContent),
  }));
  S.start = await state();
  if (!deep){ await page.screenshot({ path: out + '-phone.png', fullPage: true }); S.events = await page.evaluate(() => window.MK?.events?.length || 0); await page.close(); return S; }
  await page.screenshot({ path: out + '-start.png' });
  const firstGuess = await page.evaluate(() => (window.MK?.events || []).some(e => e.event === 'guess'));
  // 1. answer the guess the way a visitor would
  const g = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('.mk-group input:not([type=range])')].find(i => i.offsetParent && !i.disabled);
    if (inp) return 'input';
    const b = [...document.querySelectorAll('.mk-group button.mk-btn')].find(b => b.offsetParent && !b.disabled);
    return b ? 'choice' : 'none';
  });
  if (g === 'input'){ const inp = page.locator('.mk-group input:not([type=range]):visible:enabled').first(); await inp.fill('5'); await inp.press('Enter'); }
  else if (g === 'choice'){ await page.locator('.mk-group button.mk-btn:visible:enabled').first().click(); }
  await page.waitForTimeout(500);
  S.guessKind = g;
  S.guessLogged = await page.evaluate(() => (window.MK?.events || []).some(e => e.event === 'guess'));
  S.afterGuess = await state();
  // 2. explore: buttons, sliders, svg click and drag targets, a few passes
  for (let pass = 0; pass < 3; pass++){
    const labels = await page.evaluate(() => [...document.querySelectorAll('button.mk-btn')].filter(b => b.offsetParent && !b.disabled && b.id !== 'mk-again').map((b, i) => i));
    for (const i of labels){
      const b = page.locator('button.mk-btn:visible:enabled:not(#mk-again)').nth(i);
      if (await b.count()) { try { await b.click({ timeout: 1500 }); } catch {} await page.waitForTimeout(250); }
      const inp = page.locator('.mk-group input:not([type=range]):visible:enabled').first();     // later questions get an answer too
      if (await inp.count()){ try { await inp.fill(String(3 + pass)); await inp.press('Enter'); } catch {} }
    }
    await page.evaluate(p => { for (const r of document.querySelectorAll('input[type=range]')){ if (!r.offsetParent || r.disabled) continue;
      const v = [r.min, (+r.min + +r.max) / 2, r.max][p % 3]; r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); } }, pass);
    await page.waitForTimeout(300);
    const targets = await page.evaluate(() => [...document.querySelectorAll('svg *')].filter(n => n.getClientRects().length && ['pointer', 'grab'].includes(n.style.cursor)).slice(0, 14).map(n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, grab: n.style.cursor === 'grab' }; }));
    for (const t of targets){
      if (t.grab){ await page.mouse.move(t.x, t.y); await page.mouse.down(); await page.mouse.move(t.x + 40, t.y + 25, { steps: 6 }); await page.mouse.up(); }
      else await page.mouse.click(t.x, t.y);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(3000);           // let timers and animations finish
  S.after = await state();
  await page.screenshot({ path: out + '-after.png', fullPage: true });
  S.eventsAfter = await page.evaluate(() => (window.MK?.events || []).map(e => e.event));
  // 3. Start over must bring back the opening
  const again = page.locator('#mk-again');
  if (await again.count()){ await again.click(); await page.waitForTimeout(700); S.restart = await state(); }
  S.firstGuessBeforeVisitor = firstGuess;
  await page.close(); return S;
}

const D = await visit({ width: 1280, height: 800 }, true);
const P = await visit({ width: 390, height: 844 }, false);
await browser.close();
R.desktop = D; R.phone = P;
const prob = (c, m) => c && R.problems.push(m), warn = (c, m) => c && R.warnings.push(m);
prob(!R.usesKit || !D.kit, 'does not use mathkit (MK.start)');
prob(D.errors.length, 'errors: ' + [...new Set(D.errors)].slice(0, 5).join(' | '));
prob(P.errors.length && !D.errors.length, 'errors at phone width: ' + [...new Set(P.errors)].slice(0, 3).join(' | '));
prob(!D.start.card.trim(), 'opening card is empty');
prob(D.guessKind === 'none', 'no guess to make at the start');
prob(D.guessKind !== 'none' && !D.guessLogged, 'the opening question is not an MK.guess (the guess is not recorded)');
prob(D.after.shownErr.length, 'on-screen error: ' + D.after.shownErr.join(' | '));
prob(D.start.overflowX || D.after.overflowX, 'page scrolls sideways at laptop width');
prob(P.start.overflowX, 'page scrolls sideways at phone width');
prob(D.restart && D.restart.card !== D.start.card, 'Start over does not bring back the opening card');
warn(D.after.svgTextOverlaps.length, 'overlapping labels: ' + D.after.svgTextOverlaps.join('; '));
warn(D.start.svgTextOverlaps.length, 'overlapping labels at start: ' + D.start.svgTextOverlaps.join('; '));
warn(D.after.offscreenSvgText.length, 'labels cut off at the drawing edge: ' + D.after.offscreenSvgText.join('; '));
warn(D.after.card === D.afterGuess.card && D.afterGuess.card === D.start.card, 'the card never changes after the guess');
warn(D.start.height > 1400, `opening is very tall (${D.start.height}px)`);
warn(D.start.guessBelowFold > 0, `the opening guess is ${D.start.guessBelowFold}px below the bottom of a 1280×800 laptop screen; shrink the drawing or the card`);
warn(D.after.longText.length || D.afterGuess.longText.length, `long text blocks (${[...D.afterGuess.longText, ...D.after.longText].join(', ')} words); keep the card and notes under about 60 words and reveal the explanation in steps`);
warn(D.firstGuessBeforeVisitor, 'a guess was recorded before the visitor did anything');
R.pass = R.problems.length === 0;
console.log(JSON.stringify(R, null, 1));
process.exit(R.pass ? 0 : 1);
