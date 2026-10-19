// Headless check of one CONTENT block, the way a student's laptop would run it.
//   node tools/check-scene.mjs <scene.js> [outPrefix] [--engine ../xr-engine.js]
// Boots the scene on a virtual page (no server needed), runs the audit, fires every select/release a few times
// (catching handler crashes), takes desktop screenshots before/after, and prints a JSON summary.
// Exit 1 if it fails to boot, shows an on-screen error, throws, or has audit errors.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ei = args.indexOf('--engine'); const enginePath = ei >= 0 ? args.splice(ei, 2)[1] : join(HERE, '../../xr-engine.js');
const [file, out = '/tmp/scene'] = args;
const code = readFileSync(file, 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"}}</script>
<script type="module" src="/xr-engine.js"></script></head><body><script type="module">
for (let i = 0; i < 400 && !window.XR; i++) await new Promise(r => setTimeout(r, 25));
const s = document.createElement('script'); s.type = 'module'; s.textContent = ${JSON.stringify(code)}; document.body.appendChild(s);
</script></body></html>`;
const threeRoot = resolve(HERE, '../node_modules/three');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ body: readFileSync(resolve(threeRoot, r.request().url().match(/three@[^/]+\/(.*)$/)[1])), contentType: 'application/javascript' }));
await page.route('http://xr.test/**', r => { const u = new URL(r.request().url()); if (u.pathname === '/xr-engine.js') return r.fulfill({ body: readFileSync(enginePath), contentType: 'application/javascript' }); return r.fulfill({ body: html, contentType: 'text/html' }); });
await page.goto('http://xr.test/scene.html?harness');
const R = { file, lines: code.split('\n').length };
try { await page.waitForFunction(() => window.XR && XR.ready === true, null, { timeout: 30000 }); R.boot = true; } catch { R.boot = false; }
await page.waitForTimeout(1200);
R.err = await page.evaluate(() => document.getElementById('err')?.textContent || '');
const visibleLabels = () => page.evaluate(() => { const l = []; XR.scene.traverse(o => { if (!o.userData?.label) return; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v && o.userData.label.text.trim().length > 1 && o.parent?.name !== 'debug') l.push(o.userData.label.text.replace(/\n/g, ' / ').slice(0, 160)); }); return l; });
if (R.boot){
  Object.assign(R, await page.evaluate(() => { const a = XR.audit(true); return { auditErrors: a.errors, auditWarnings: a.warnings, interactables: XR._test.interactables.size }; }));
  R.labelsAtStart = await visibleLabels();
  await page.screenshot({ path: out + '-start.png' });
  R.handlerErrors = await page.evaluate(async () => {
    const errs = [];
    for (let pass = 0; pass < 3; pass++) for (const [obj, h] of [...XR._test.interactables]){
      try { h.select?.(obj, { point: obj.getWorldPosition(new XR.THREE.Vector3()) }); } catch (e) { errs.push((obj.name || 'obj') + ': ' + e.message); }
      try { h.release?.(obj); } catch (e) { errs.push((obj.name || 'obj') + ' release: ' + e.message); }
      await new Promise(r => setTimeout(r, 300));
    }
    return [...new Set(errs)];
  });
  await page.waitForTimeout(2500);
  R.labelsAfter = await visibleLabels();
  R.errAfter = await page.evaluate(() => document.getElementById('err')?.textContent || '');
  await page.screenshot({ path: out + '-after.png' });
}
R.pageErrors = [...new Set(pageErrors)];
R.pass = R.boot && !R.err && !R.errAfter && !R.pageErrors.length && !(R.auditErrors?.length) && !(R.handlerErrors?.length);
console.log(JSON.stringify(R, null, 1));
await browser.close();
process.exit(R.pass ? 0 : 1);
