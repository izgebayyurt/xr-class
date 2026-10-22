// Play a scene step by step like a visitor and screenshot each step (desktop view).
//   node tools/play.mjs <scene.js> <outPrefix> step [step ...] [--engine path] [--wait ms]
// Steps: "<regex>"            click the visible interactive whose label text matches (select + release), then wait
//        "slider:<i>:<value>"  set the i-th visible slider (0-based, left to right as built) to value
//        "wait:<ms>"           just wait
// After every step: a screenshot <outPrefix>-<n>.png and the list of visible text.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const enginePath = opt('--engine', join(HERE, '../../xr-engine.js')), wait = +opt('--wait', 6000);
const [file, out, ...steps] = args;
const code = readFileSync(file, 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"}}</script>
<script type="module" src="/xr-engine.js"></script></head><body><script type="module">
for (let i = 0; i < 400 && !window.XR; i++) await new Promise(r => setTimeout(r, 25));
const s = document.createElement('script'); s.type = 'module'; s.textContent = ${JSON.stringify(code)}; document.body.appendChild(s);
</script></body></html>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ body: readFileSync(resolve(HERE, '../node_modules/three', r.request().url().match(/three@[^/]+\/(.*)$/)[1])), contentType: 'application/javascript' }));
await page.route('http://xr.test/**', r => { const u = new URL(r.request().url()); if (u.pathname === '/xr-engine.js') return r.fulfill({ body: readFileSync(enginePath), contentType: 'application/javascript' });
  if (u.pathname.startsWith('/models/')) { try { return r.fulfill({ body: readFileSync(join(dirname(enginePath), decodeURIComponent(u.pathname))), contentType: 'model/gltf-binary' }); } catch { return r.fulfill({ status: 404, body: '' }); } }
  return r.fulfill({ body: html, contentType: 'text/html' }); });
await page.goto('http://xr.test/scene.html');   // no ?harness: the visitor's view, incl. the scene-check chip
await page.waitForFunction(() => window.XR && XR.ready === true, null, { timeout: 30000 }); await page.waitForTimeout(1200);
await page.evaluate(() => {
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  window.__vis = () => { const l = []; XR.scene.traverse(o => { if (o.userData?.label && shown(o) && o.userData.label.text.trim().length > 1 && o.parent?.name !== 'debug') l.push(o.userData.label.text.replace(/\n/g, ' / ')); }); return l; };
  window.__press = src => { const re = new RegExp(src, 'i'); for (const [obj, h] of XR._test.interactables){ if (!shown(obj)) continue; let t = []; obj.traverse(o => { if (o.userData?.label) t.push(o.userData.label.text); }); let p = obj.parent; while (p && !t.length){ p.children.forEach(c => c.userData?.label && t.push(c.userData.label.text)); p = p.parent; if (p === XR.scene) break; }
    if (t.some(x => re.test(x.trim()))){ h.select?.(obj, { point: obj.getWorldPosition(new XR.THREE.Vector3()) }); h.release?.(obj); return t.join('|'); } } return null; };
});
const log = [{ step: 'start', visible: await page.evaluate(() => __vis()) }];
await page.screenshot({ path: `${out}-0.png` });
for (let i = 0; i < steps.length; i++){
  const st = steps[i]; let hit = null;
  if (st.startsWith('wait:')) { await page.waitForTimeout(+st.slice(5)); hit = 'waited'; }
  else if (st.startsWith('slider:')) { const [, idx, val] = st.split(':'); hit = await page.evaluate(([idx, val]) => { const sl = []; XR.scene.traverse(o => { if (o.name === 'slider' && o.knob) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) sl.push(o); } }); if (!sl[+idx]) return null; sl[+idx].value = +val; return 'slider ' + idx + ' = ' + sl[+idx].value; }, [idx, val]); await page.waitForTimeout(hit ? wait : 300); }
  else { hit = await page.evaluate(s => __press(s), st); await page.waitForTimeout(hit ? wait : 300); }
  log.push({ step: steps[i], pressed: hit, visible: await page.evaluate(() => __vis()) });
  await page.screenshot({ path: `${out}-${i + 1}.png` });
}
console.log(JSON.stringify({ errs, err: await page.evaluate(() => document.getElementById('err')?.textContent || ''), log }, null, 1));
await browser.close();
