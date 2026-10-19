// Builds the class site from src/engine/ into the repo root (the GitHub Pages site).
//   cd src && node build.mjs            → writes ../xr-engine.js, ../student.html, ../make.html, ../run.html, ../brief.html,
//                                          ../xr-log.js, ../prompt-kit*.md, and src/xr-base.html (single-file harness page)
//   node build.mjs --out /tmp/site      → write somewhere else (used by tests)
//   node build.mjs --engine-url URL     → engine address baked into run.html / student.html
// Sources: engine/xr-engine.js (engine incl. widgets + domain packs), engine/cheatsheet.html (API text, @@DOMAIN@@ marker),
// engine/domains/*.txt (per-field cheat sections), engine/*.template.html, engine/VERSION (stamped everywhere).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(HERE, p), 'utf8');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const OUT = arg('--out', join(HERE, '..'));
const ENGINE_URL = arg('--engine-url', 'https://izgebayyurt.github.io/xr-class/xr-engine.js');
mkdirSync(OUT, { recursive: true });
const out = (p, s) => writeFileSync(join(OUT, p), s);

const VERSION = src('engine/VERSION').trim();
const engine = src('engine/xr-engine.js').replace('__KIT_VERSION__', VERSION);
const cheat = src('engine/cheatsheet.html');
const content = src('engine/default-content.js');
const RULES = src('engine/kit-rules.md');
const domains = Object.fromEntries(readdirSync(join(HERE, 'engine/domains')).filter(f => f.endsWith('.txt')).map(f => [f.replace('.txt', ''), src('engine/domains/' + f).trimEnd()]));
const DOMAIN_ORDER = ['phys', 'chem', 'bio', 'lit', 'hist', 'art', 'music'];
const cheatAll = cheat.replace('@@DOMAIN@@', DOMAIN_ORDER.map(d => domains[d]).join('\n'));
const IMPORTMAP = `<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"
} }
</script>`;
const HEAD = (title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>`;

// 1. single-file page (engine inlined) — for the headless harness
writeFileSync(join(HERE, 'xr-base.html'), `${HEAD('XR Base')}
${IMPORTMAP}
</head>
<body>
<script type="module">
${engine.trimEnd()}
</script>

${cheatAll.trimEnd()}
<script type="module">
${content.trimEnd()}
</script>
</body>
</html>
`);

// 2. hosted engine
out('xr-engine.js', engine);

// 3. student page: engine from the class site; only the CONTENT block lives here
out('student.html', `${HEAD('My XR project')}
<!--
  STUDENT PAGE. The engine (controllers, teleport, text, placement helpers, audit) is loaded from the class site.
  Paste the CONTENT block Claude gives you between the CONTENT markers below, save, and open the file in Chrome
  (or put it on the class GitHub Pages site and open that address in the Quest browser). Add ?debug to the address
  for the mannequin and the audit panel; "Copy report for Claude" gives you the numbers to paste back if something is off.
-->
${IMPORTMAP}
<script type="module" src="${ENGINE_URL}"></script>
</head>
<body>

<!-- ===================== CONTENT (paste Claude's block below) ===================== -->
<script type="module">
${content.trimEnd()}
</script>
<!-- ===================== end CONTENT ===================== -->
</body>
</html>
`);

// 4. link maker + runner
const qrlib = src('engine/vendor/qrcode.js');
out('run.html', src('engine/run.template.html').replaceAll('{{ENGINE_URL}}', ENGINE_URL).replaceAll('{{VERSION}}', VERSION));
out('make.html', src('engine/make.template.html').replace('{{QRLIB}}', () => qrlib).replaceAll('{{VERSION}}', VERSION));
out('xr-log.js', src('engine/xr-log.js'));

// 5. prompt kit: header + rules (engine/kit-rules.md) + cheat sheet as plain text + example block
const cheatText = cheat.replace(/^\s*<!--\s*/, '').replace(/\s*-->\s*$/, '').split('\n').filter(l => !/^\s*=+\s*$/.test(l)).join('\n');
const kitMd = `# Prompt kit v${VERSION} (paste this whole file as your first message, then your brief)

${RULES.trim()}

API cheat sheet
\`\`\`
${cheatText.trim()}
\`\`\`

The CONTENT block always has this shape:
\`\`\`js
${content.trim()}
\`\`\`

---- My brief (from the questionnaire) ----
`;
out('prompt-kit.md', kitMd.replace(/^@@DOMAIN@@\n?/m, ''));
for (const d of DOMAIN_ORDER) out(`prompt-kit-${d}.md`, kitMd.replace('@@DOMAIN@@', domains[d]));

// 6. brief.html — the questionnaire; one button assembles kit + answers into the first message
const kitJson = JSON.stringify(kitMd).replace(/</g, '\\u003c');
const domainsJson = JSON.stringify(domains).replace(/</g, '\\u003c');
out('brief.html', src('engine/brief.template.html').replace('{{KIT_JSON}}', () => kitJson).replace('{{DOMAINS_JSON}}', () => domainsJson).replaceAll('{{VERSION}}', VERSION));
console.log(`built v${VERSION} → ${OUT}  (engine url: ${ENGINE_URL})`);
