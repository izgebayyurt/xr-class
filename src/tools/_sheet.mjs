import { chromium } from 'playwright';
const [cat, from = 0, n = 12, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://127.0.0.1:8150/view/sheet.html?cat=${cat}&from=${from}&n=${n}`);
await p.waitForFunction(() => window.DONE, null, { timeout: 120000 }).catch(() => errs.push('timeout'));
await p.screenshot({ path: out }); console.log(errs.join('\n') || 'ok'); await b.close();
