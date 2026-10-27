// Release: assign scenes, publish one private link per view, and write the class sheet.
//   node release.mjs <runDir> <siteDir> "<pre-filled Form 2 link with PID, OA, OB, S1A, S1B, S2A, S2B>" [seed] [base url]
// Every design has two versions (one per model arm: <run>/<bid>/opus/page.html and <run>/<bid>/sonnet/page.html).
// Assignment: a seeded ring. Each student opens both versions of their own design and both versions of the next two designs in
//   the ring, so every design gets exactly 2 peer reviewers and nobody reviews their own.
// Blinding: which model is "Version A" is randomized per pair (balanced: half Opus-first, half Sonnet-first), and every link is its own encrypted copy with its own
//   random scene code. Students can't tell the models apart or match a reviewed scene to its author; views.json records both.
// Outputs:
//   <siteDir>/e/<code>.txt     encrypted pages (mathkit inlined and frozen); the key is only in the link's #fragment
//   <runDir>/sheet.csv         Name | Your design: A | Your design: B | Design 1: A | Design 1: B | Design 2: A | Design 2: B | Feedback form
//   <runDir>/views.json        PRIVATE: scene code → design, author, model, version label, reviewer, slot
//   <runDir>/assignments.csv   PRIVATE: one row per student with every code, model and link
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const ARMS = ['opus', 'sonnet'];
const TOKENS = ['PID', 'OA', 'OB', 'S1A', 'S1B', 'S2A', 'S2B'];
const [RUN, SITE, FORM, seedArg = '20261102', BASE = 'https://izgebayyurt.github.io/xr-class/'] = process.argv.slice(2);
if (!RUN || !SITE || !FORM || !TOKENS.every(t => new RegExp(`=${t}(&|$)`).test(FORM))) {
  console.error(`usage: node release.mjs <runDir> <siteDir> "<pre-filled form link with ${TOKENS.join(', ')} typed into the fields>" [seed] [base url]`); process.exit(2); }
const VERSION = readFileSync(join(HERE, 'VERSION'), 'utf8').trim();
const KIT = readFileSync(join(HERE, 'mathkit.js'), 'utf8').replace('__MK_VERSION__', VERSION);
const inline = html => html.replace(/<script\s+src=["']mathkit\.js["']\s*>\s*<\/script>/i, () => `<script>\n${KIT}\n</script>`);
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const briefs = JSON.parse(readFileSync(join(RUN, 'briefs.json'), 'utf8'));
const roster = JSON.parse(readFileSync(join(RUN, 'roster.json'), 'utf8'));
const page = (b, arm) => join(RUN, b.bid, arm, 'page.html');

const people = briefs.filter(b => ARMS.every(a => existsSync(page(b, a))));
const skipped = briefs.filter(b => !people.includes(b)).map(b => `${b.bid} ${roster[b.pid] || b.pid} (missing: ${ARMS.filter(a => !existsSync(page(b, a))).join(', ')})`);
if (people.length < 3) { console.error('need at least 3 designs with both versions'); process.exit(1); }
let s = +seedArg >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ring = [...people].sort((a, b) => a.bid.localeCompare(b.bid));
for (let i = ring.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }

mkdirSync(join(SITE, 'e'), { recursive: true });
const html = Object.fromEntries(people.flatMap(b => ARMS.map(a => [`${b.bid}/${a}`, deflateRawSync(Buffer.from(inline(readFileSync(page(b, a), 'utf8')), 'utf8'), { level: 9 })])));
const used = new Set();
const newCode = () => { let c; do c = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => ALPHA[x % ALPHA.length]).join(''); while (used.has(c) || existsSync(join(SITE, 'e', c + '.txt'))); used.add(c); return c; };
async function view(design, arm, label, rater, slot){
  const code = newCode(), keyRaw = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, html[`${design.bid}/${arm}`]));
  writeFileSync(join(SITE, 'e', code + '.txt'), b64u(Buffer.concat([iv, ct])));
  return { code, design: design.bid, author: design.pid, model: arm, version: label, rater: rater.pid, slot,
    url: `${BASE}x.html?e=${code}&v=${rater.pid}&r=${slot}${label.toLowerCase()}#k=${b64u(keyRaw)}` };
}
// both versions of one design: [Version A, Version B]. Which model is A is balanced: exactly half the pairs (±1) have Opus as A, shuffled.
const flips = Array.from({ length: ring.length * 3 }, (_, i) => i % 2 === 0);
for (let i = flips.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [flips[i], flips[j]] = [flips[j], flips[i]]; }
let fi = 0;
const pair = async (design, rater, slot) => { const order = flips[fi++] ? ARMS : [...ARMS].reverse(); return [await view(design, order[0], 'A', rater, slot), await view(design, order[1], 'B', rater, slot)]; };

const views = {}, rows = [], reviewers = {};
for (let i = 0; i < ring.length; i++){
  const me = ring[i], one = ring[(i + 1) % ring.length], two = ring[(i + 2) % ring.length];
  const v = [...await pair(me, me, 'own'), ...await pair(one, me, 's1'), ...await pair(two, me, 's2')];
  v.forEach(x => views[x.code] = { design: x.design, author: x.author, model: x.model, version: x.version, rater: x.rater, slot: x.slot, kit: VERSION });
  (reviewers[one.bid] ??= []).push(me.pid); (reviewers[two.bid] ??= []).push(me.pid);
  let form = FORM; TOKENS.forEach((t, k) => { form = form.replace(new RegExp(`=${t}(&|$)`), `=${k === 0 ? me.pid : v[k - 1].code}$1`); });
  rows.push({ name: roster[me.pid] || me.pid, pid: me.pid, v, form });
}
const bad = people.filter(p => (reviewers[p.bid] || []).length !== 2 || reviewers[p.bid].includes(p.pid));
if (bad.length) { console.error('assignment check failed for ' + bad.map(p => p.bid).join(', ')); process.exit(1); }

const q = x => /[",\n]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : String(x);
const csv = rs => rs.map(r => r.map(q).join(',')).join('\n') + '\n';
const H = (url, label) => `=HYPERLINK("${url}","${label}")`;
rows.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(RUN, 'sheet.csv'), csv([['Name', 'Your design: version A', 'Your design: version B', 'Design 1: version A', 'Design 1: version B', 'Design 2: version A', 'Design 2: version B', 'Feedback form'],
  ...rows.map(r => [r.name, ...r.v.map(x => H(x.url, 'Open')), H(r.form, 'Give feedback')])]));
const cols = ['own A', 'own B', 's1 A', 's1 B', 's2 A', 's2 B'];
writeFileSync(join(RUN, 'assignments.csv'), csv([['name', 'pid', ...cols.flatMap(c => [c + ' code', c + ' design', c + ' author', c + ' model']), 'form', ...cols.map(c => c + ' url')],
  ...rows.map(r => [r.name, r.pid, ...r.v.flatMap(x => [x.code, x.design, x.author, x.model]), r.form, ...r.v.map(x => x.url)])]));
writeFileSync(join(RUN, 'views.json'), JSON.stringify({ seed: seedArg, kit: VERSION, views }, null, 1));
const opusFirst = Object.values(views).filter(x => x.version === 'A' && x.model === 'opus').length;
console.log(`${rows.length} students × 6 links = ${Object.keys(views).length}; every design has exactly 2 peer reviewers; Opus was version A in ${opusFirst} of ${Object.keys(views).length / 2} pairs (seed ${seedArg})` +
  (skipped.length ? `\nnot included (needs both versions): ${skipped.join('; ')}` : ''));
