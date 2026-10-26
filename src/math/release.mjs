// Release: assign scenes, publish one private link per view, and write the class sheet.
//   node release.mjs <runDir> <siteDir> "<pre-filled Form 2 link with PID, OWN, S1, S2>" [seed] [base url]
// Assignment: a seeded ring. Each student opens their own scene and reviews the next two in the ring, so every scene
// gets exactly 2 reviewers and nobody reviews their own. Reproducible from the seed.
// Anonymity: every link is its own encrypted copy with its own random scene code, so the same scene has a different
// code and URL in each row. Nothing in the sheet shows whose scene a reviewer got.
// Outputs:
//   <siteDir>/e/<code>.txt     encrypted pages (mathkit inlined and frozen); the key is only in the link's #fragment
//   <runDir>/sheet.csv         Name | Your scene | Scene 1 to review | Scene 2 to review | Feedback form  (=HYPERLINK cells)
//   <runDir>/views.json        PRIVATE: scene code → which page, its author, the reviewer, the slot
//   <runDir>/assignments.csv   PRIVATE: one row per student with every code and link
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const [RUN, SITE, FORM, seedArg = '20261102', BASE = 'https://izgebayyurt.github.io/xr-class/'] = process.argv.slice(2);
if (!RUN || !SITE || !FORM || !['PID', 'OWN', 'S1', 'S2'].every(t => FORM.includes(t))) {
  console.error('usage: node release.mjs <runDir> <siteDir> "<pre-filled form link containing PID, OWN, S1 and S2>" [seed] [base url]'); process.exit(2); }
const VERSION = readFileSync(join(HERE, 'VERSION'), 'utf8').trim();
const KIT = readFileSync(join(HERE, 'mathkit.js'), 'utf8').replace('__MK_VERSION__', VERSION);
const inline = html => html.replace(/<script\s+src=["']mathkit\.js["']\s*>\s*<\/script>/i, () => `<script>\n${KIT}\n</script>`);
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const briefs = JSON.parse(readFileSync(join(RUN, 'briefs.json'), 'utf8'));
const roster = JSON.parse(readFileSync(join(RUN, 'roster.json'), 'utf8'));

const people = briefs.filter(b => existsSync(join(RUN, b.bid, 'page.html')));
const skipped = briefs.filter(b => !people.includes(b));
if (people.length < 3) { console.error('need at least 3 finished scenes'); process.exit(1); }
let s = +seedArg >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ring = [...people].sort((a, b) => a.bid.localeCompare(b.bid));
for (let i = ring.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }

mkdirSync(join(SITE, 'e'), { recursive: true });
const pages = Object.fromEntries(people.map(b => [b.bid, deflateRawSync(Buffer.from(inline(readFileSync(join(RUN, b.bid, 'page.html'), 'utf8')), 'utf8'), { level: 9 })]));
const used = new Set();
const newCode = () => { let c; do c = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => ALPHA[x % ALPHA.length]).join(''); while (used.has(c) || existsSync(join(SITE, 'e', c + '.txt'))); used.add(c); return c; };
async function view(page, rater, slot){
  const code = newCode(), keyRaw = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pages[page.bid]));
  writeFileSync(join(SITE, 'e', code + '.txt'), b64u(Buffer.concat([iv, ct])));
  return { code, page: page.bid, author: page.pid, rater: rater.pid, slot, url: `${BASE}x.html?e=${code}&v=${rater.pid}&r=${slot}#k=${b64u(keyRaw)}` };
}
const views = {}, rows = [], reviewers = {};
for (let i = 0; i < ring.length; i++){
  const me = ring[i], one = ring[(i + 1) % ring.length], two = ring[(i + 2) % ring.length];
  const v = [await view(me, me, 'own'), await view(one, me, 's1'), await view(two, me, 's2')];
  v.forEach(x => views[x.code] = { page: x.page, author: x.author, rater: x.rater, slot: x.slot, kit: VERSION });
  (reviewers[one.bid] ??= []).push(me.pid); (reviewers[two.bid] ??= []).push(me.pid);
  const form = FORM.replace('PID', me.pid).replace('OWN', v[0].code).replace('S1', v[1].code).replace('S2', v[2].code);
  rows.push({ name: roster[me.pid] || me.pid, pid: me.pid, own: v[0], s1: v[1], s2: v[2], form });
}
const bad = people.filter(p => (reviewers[p.bid] || []).length !== 2 || reviewers[p.bid].includes(p.pid));
if (bad.length) { console.error('assignment check failed for ' + bad.map(p => p.bid).join(', ')); process.exit(1); }

const q = x => /[",\n]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : String(x);
const csv = rs => rs.map(r => r.map(q).join(',')).join('\n') + '\n';
const H = (url, label) => `=HYPERLINK("${url}","${label}")`;
rows.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(RUN, 'sheet.csv'), csv([['Name', 'Your scene', 'Scene 1 to review', 'Scene 2 to review', 'Feedback form'],
  ...rows.map(r => [r.name, H(r.own.url, 'Open'), H(r.s1.url, 'Open'), H(r.s2.url, 'Open'), H(r.form, 'Give feedback')])]));
writeFileSync(join(RUN, 'assignments.csv'), csv([['name', 'pid', 'own_code', 'own_page', 's1_code', 's1_page', 's1_author', 's2_code', 's2_page', 's2_author', 'form', 'own_url', 's1_url', 's2_url'],
  ...rows.map(r => [r.name, r.pid, r.own.code, r.own.page, r.s1.code, r.s1.page, r.s1.author, r.s2.code, r.s2.page, r.s2.author, r.form, r.own.url, r.s1.url, r.s2.url])]));
writeFileSync(join(RUN, 'views.json'), JSON.stringify({ seed: seedArg, kit: VERSION, views }, null, 1));
console.log(`${rows.length} students, ${Object.keys(views).length} links; every scene has exactly 2 reviewers (seed ${seedArg})` +
  (skipped.length ? `\nnot included (no finished page): ${skipped.map(b => b.bid + ' ' + (roster[b.pid] || b.pid)).join(', ')}` : ''));
