// Google Form 1 responses (CSV download) → one folder per brief with the exact prompt the builder gets.
//   node ingest.mjs responses.csv <runDir>   → <runDir>/briefs.json, <runDir>/roster.json (PRIVATE: pid → name), <runDir>/<bid>/brief.md, prompt.txt
// Students are identified by name in the form; everything downstream uses a participant ID (p01, p02, …). Names never reach the builder.
// The prompt = prompt.md (rules + MK reference + example) + the student's answers to questions 2–9.
// Questions 10–11 (expectation, expected helpfulness) are measurement, not design, so the builder never sees them.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [csvPath, RUN] = process.argv.slice(2);
if (!csvPath || !RUN) { console.error('usage: node ingest.mjs responses.csv <runDir>'); process.exit(2); }

export function parseCSV(text){
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const FIELDS = {   // key → start of the question title in Form 1
  name: 'your name', idea: 'which idea do you want to teach', other: 'if you chose', know: 'what do you already know',
  wrong: 'what would your friend get wrong', show: 'how would you show your friend', steps: 'walk through it',
  look: 'look and feel', dim: 'flat or 3d', expect: 'what do you expect the finished', expectScore: 'how well do you expect', time: 'timestamp',
};
const norm = s => s.toLowerCase().replace(/[“”"’']/g, '').replace(/\s+/g, ' ').trim();
const rows = parseCSV(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const head = rows[0].map(norm);
const col = Object.fromEntries(Object.entries(FIELDS).map(([k, p]) => [k, head.findIndex(h => h.startsWith(p))]));
const missing = Object.entries(col).filter(([k, i]) => i < 0 && !['time', 'other', 'steps', 'look', 'dim', 'wrong'].includes(k)).map(([k]) => k);
if (missing.length) { console.error('CSV is missing questions: ' + missing.join(', ') + '\nheaders: ' + rows[0].join(' | ')); process.exit(1); }

let base = readFileSync(join(HERE, 'prompt.md'), 'utf8');
base = base.replace('@@EXAMPLE@@', () => readFileSync(join(HERE, 'example.html'), 'utf8').trim());
const ans = (r, k) => (col[k] >= 0 ? (r[col[k]] || '') : '').trim();
const seen = new Map(), briefs = [];
rows.slice(1).forEach((r, n) => {
  const name = ans(r, 'name').replace(/\s+/g, ' ');
  const code = name.toLowerCase();
  if (!code) return;
  if (seen.has(code)) briefs.splice(briefs.findIndex(b => b.code === code), 1);   // a resubmission (same name) replaces the earlier one
  const idea = ans(r, 'idea'), other = ans(r, 'other');
  const concept = /^something else/i.test(idea) ? (other || '(not given)') : idea + (other ? `\n(Also wrote: ${other})` : '');
  const b = { bid: '', pid: '', code, name, time: ans(r, 'time'), concept, listed: !/^something else/i.test(idea),
    know: ans(r, 'know'), wrong: ans(r, 'wrong'), show: ans(r, 'show'), steps: ans(r, 'steps'), look: ans(r, 'look'), dim: ans(r, 'dim'),
    expect: ans(r, 'expect'), expectScore: ans(r, 'expectScore') };
  seen.set(code, true); briefs.push(b);
});
const blank = s => s || '(left blank)';
const roster = {};
briefs.forEach((b, i) => {
  b.bid = 'b' + String(i + 1).padStart(2, '0'); b.pid = 'p' + String(i + 1).padStart(2, '0');
  roster[b.pid] = b.name; delete b.name; delete b.code;
  const md = [
    `**The idea I want to teach:** ${b.concept}`,
    `**What I already know about it:** ${blank(b.know)}`,
    `**What my friend would get wrong at first, and why:** ${blank(b.wrong)}`,
    `**How I would show my friend why the right answer is right:** ${blank(b.show)}`,
    `**What happens first, next, and at the end:** ${blank(b.steps)}`,
    `**Look and feel:** ${blank(b.look)}`,
    `**Flat or 3D:** ${b.dim || 'No preference'}`,
  ].join('\n\n');
  const dir = join(RUN, b.bid); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'brief.md'), md + '\n');
  writeFileSync(join(dir, 'prompt.txt'), base.trimEnd() + '\n\n' + md + '\n');
});
writeFileSync(join(RUN, 'briefs.json'), JSON.stringify(briefs, null, 1));
writeFileSync(join(RUN, 'roster.json'), JSON.stringify(roster, null, 1));
console.log(`${briefs.length} briefs → ${RUN}`);
