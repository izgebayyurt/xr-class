// End-to-end test of the student flow on a freshly built site, against the local mock worker.
//   node build.mjs --out /tmp/xr-out && (node tools/shortlink-mock.mjs &) && node tools/site-test.mjs /tmp/xr-out
// brief.html (study code, fill, copy) → make.html (paste the default scene, get a short link + QR) → run.html?p= (boots)
// → audit chip → report; then /export must hold brief, link, open, scene-check (+ chip-open, report) with the kit version.
// Also: no study code → nothing logged; mangled link fails gracefully; ?s=demo named scene boots.
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdtempSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(process.argv[2] ?? '/tmp/xr-out'), SITE = 'http://localhost:8126', MOCK = 'http://localhost:8127';
// serve a copy of the built site with the config pointed at the mock and the demo scene in scenes/
const SERVE = mkdtempSync(join(tmpdir(), 'xr-site-')); cpSync(SITE_DIR, SERVE, { recursive: true });
writeFileSync(join(SERVE, 'shortlink-config.js'), `window.SHORTLINK_URL = '${MOCK}';`);
mkdirSync(join(SERVE, 'scenes'), { recursive: true }); writeFileSync(join(SERVE, 'scenes/demo.js'), readFileSync(join(HERE, '../engine/default-content.js')));
const server = spawn('python3', ['-m', 'http.server', '8126', '--bind', '127.0.0.1'], { cwd: SERVE, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.md': 'text/markdown' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ body: readFileSync(resolve(HERE, '../node_modules/three', r.request().url().match(/three@[^/]+\/(.*)$/)[1])), contentType: 'application/javascript' }));
await page.route(/izgebayyurt\.github\.io\/xr-class\/xr-engine\.js/, r => r.fulfill({ body: readFileSync(join(SITE_DIR, 'xr-engine.js')), contentType: 'application/javascript' }));
const exportLog = async (key = 'testkey') => { const r = await fetch(`${MOCK}/export?key=${key}`); if (!r.ok) return { status: r.status }; return (await r.text()).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); };
const before = (await exportLog()).length;
const R = {};
// 1. no study code → nothing logged
await page.goto(`${SITE}/brief.html`);
await page.evaluate(() => localStorage.clear()); await page.reload();
await page.fill('#idea', 'You put on the headset and see a cubic metre.');
await page.fill('#first', 'a wireframe cube on the floor ahead');
await page.click('#copy'); await page.waitForTimeout(400);
R.noPidLogged = (await exportLog()).length - before;
// 2. study code → brief event; kit header carries the version
await page.fill('#pid', 'T3ST');
await page.click('#copy'); await page.waitForTimeout(500);
R.kitHeader = (await page.evaluate(() => navigator.clipboard.readText())).split('\n')[0];
// 3. make a link
await page.goto(`${SITE}/make.html`);
await page.fill('#code', '```js\n' + readFileSync(join(HERE, '../engine/default-content.js'), 'utf8') + '\n```');
await page.click('#go');
await page.waitForFunction(() => document.getElementById('out').style.display === 'block', null, { timeout: 5000 });
R.link = await page.inputValue('#link'); R.short = /\?p=[a-z2-9]{6}$/.test(R.link); R.qr = await page.evaluate(() => !!document.querySelector('#qrbox img'));
// 4. open it (no ?harness → first-run scene check)
await page.goto(R.link);
await page.waitForFunction(() => window.XR && XR.ready === true, null, { timeout: 20000 }); await page.waitForTimeout(1500);
R.objects = await page.evaluate(() => XR._test.tracked.size);
R.chip = await page.evaluate(() => !!document.getElementById('audit-chip'));
if (R.chip){ await page.click('#audit-chip'); await page.waitForTimeout(300); await page.click('#audit-copy'); await page.waitForTimeout(400); }
// 5. named scene + mangled link
await page.goto(`${SITE}/run.html?s=demo&harness`);
R.named = await page.waitForFunction(() => window.XR && XR.ready === true, null, { timeout: 20000 }).then(() => true, () => false);
await page.goto(`${SITE}/run.html#c=not-a-real-payload`); await page.waitForTimeout(600);
R.graceful = await page.evaluate(() => /Could not read|valid scene/.test(document.getElementById('boot')?.textContent ?? ''));
// 6. export
R.badKey = (await exportLog('nope')).status;
const ev = (await exportLog()).slice(before);
R.events = ev.map(e => e.event); R.allPid = ev.every(e => e.pid === 'T3ST'); R.kit = [...new Set(ev.map(e => e.data?.kit))];
R.errors = errors;
console.log(JSON.stringify(R, null, 1));
await browser.close(); server.kill();
const need = ['brief', 'link', 'open', 'scene-check'];
const ok = R.noPidLogged === 0 && R.short && R.qr && R.objects >= 3 && R.named && R.graceful && R.badKey === 403 && need.every(n => R.events.includes(n)) && R.allPid && R.kit.length === 1 && R.kitHeader.includes(R.kit[0]) && !errors.length && (!R.chip || (R.events.includes('chip-open') && R.events.includes('report')));
console.log(ok ? 'site test passed' : 'SITE TEST FAILED'); process.exit(ok ? 0 : 1);
