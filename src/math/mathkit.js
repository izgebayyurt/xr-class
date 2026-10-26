// mathkit.js: the shell every generated math experience runs in.
// One layout (card, stage, side, controls, footer), guess-first controls, SVG drawing, exact fractions,
// seeded randomness, timers that Start over clears, and event reporting to the hosting viewer.
// Usage (inside the page):  MK.start({ title, build })  — build() makes everything; Start over runs it again from scratch.
(() => {
  'use strict';
  const VERSION = '__MK_VERSION__';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const css = `
  :root{--bg:#f7f6f2;--ink:#1d2330;--mute:#5d6676;--line:#d9d6cc;--card:#fff;--accent:#2f6fde;--accent-ink:#fff;
        --good:#1f8a4c;--bad:#c2412d;--warm:#e8912d;--soft:#eef3fc;--radius:12px}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .mk{max-width:1180px;margin:0 auto;padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;min-height:100vh}
  #mk-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px}
  #mk-card h1{margin:0 0 4px;font-size:1.35rem;line-height:1.2}
  #mk-say{margin:0;white-space:pre-line;font-size:1.05rem}
  #mk-main{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:12px;align-items:start}
  #mk-main.wide{grid-template-columns:minmax(0,1fr)}
  #mk-stage{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:10px;min-height:120px;
            display:flex;flex-direction:column;gap:10px;align-items:stretch;overflow:hidden}
  #mk-stage>svg{width:100%;height:auto;max-height:56vh;display:block;touch-action:none;user-select:none}
  #mk-side{display:flex;flex-direction:column;gap:10px}
  #mk-side:empty{display:none}
  .mk-box{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px}
  .mk-readout .k{color:var(--mute);font-size:.85rem}
  .mk-readout .v{font-size:1.25rem;font-weight:650;font-variant-numeric:tabular-nums;white-space:pre-line}
  #mk-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  #mk-controls:empty{display:none}
  .mk-group{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);
            border-radius:var(--radius);padding:8px 10px}
  .mk-group .q{flex-basis:100%;font-weight:600}
  button.mk-btn{font:inherit;font-weight:600;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);
            border-radius:999px;padding:7px 16px;cursor:pointer;min-height:40px}
  button.mk-btn.alt{background:var(--card);color:var(--accent)}
  button.mk-btn:disabled{opacity:.55;cursor:default}
  button.mk-btn.right{background:var(--good);border-color:var(--good);color:#fff;opacity:1}
  button.mk-btn.picked{outline:3px solid var(--warm);outline-offset:2px;opacity:1}
  .mk-group.done{background:transparent;border-style:dashed;color:var(--mute);padding:4px 10px}
  button.mk-btn.wrong{background:var(--bad);border-color:var(--bad);color:#fff;opacity:1}
  .mk-slider{display:flex;align-items:center;gap:10px;min-width:260px}
  .mk-slider input{flex:1;accent-color:var(--accent);min-width:140px}
  .mk-slider .val{min-width:4ch;font-weight:650;font-variant-numeric:tabular-nums}
  .mk-input{display:flex;gap:8px;align-items:center}
  .mk-input input{font:inherit;width:9ch;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
  table.mk-table{border-collapse:collapse;font-variant-numeric:tabular-nums;width:100%;font-size:.95rem}
  table.mk-table th,table.mk-table td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:right}
  table.mk-table th:first-child,table.mk-table td:first-child{text-align:left}
  table.mk-table tr.hl td{background:var(--soft);font-weight:650}
  .mk-note{color:var(--mute);font-size:.95rem;white-space:pre-line}
  #mk-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto;color:var(--mute);font-size:.9rem}
  #mk-model{font-style:italic}
  #mk-err{position:fixed;left:10px;bottom:10px;background:#fff3f0;border:1px solid var(--bad);color:var(--bad);padding:6px 10px;border-radius:8px;font-size:.85rem;display:none;max-width:60vw}
  [hidden]{display:none!important}
  @media (max-width:820px){#mk-main{grid-template-columns:minmax(0,1fr)} body{font-size:16px}}
  `;

  // ---------- reporting to the viewer (x.html) ----------
  const events = [];
  const post = (event, data) => { events.push({ event, data: data ?? null, t: Math.round(performance.now()) }); if (events.length > 500) events.shift(); try { parent !== window && parent.postMessage({ mk: 1, event, data: data ?? null }, '*'); } catch {} };
  const shown = [];
  addEventListener('error', e => { post('error', { msg: String(e.message || e) .slice(0, 300) }); showErr(e.message); });
  addEventListener('unhandledrejection', e => { post('error', { msg: String(e.reason?.message || e.reason).slice(0, 300) }); showErr(e.reason?.message || e.reason); });
  function showErr(m){ const el = document.getElementById('mk-err'); if (el){ el.textContent = 'Something went wrong: ' + m; el.style.display = 'block'; } shown.push(String(m)); }

  // ---------- small DOM helpers ----------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const area = where => document.getElementById({ stage: 'mk-stage', side: 'mk-side', controls: 'mk-controls' }[where || 'controls'] || 'mk-controls');
  const wrap = (node, api = {}) => Object.assign(api, {
    node,
    show(on = true){ node.hidden = !on; return api; },
    hide(){ node.hidden = true; return api; },
    get visible(){ return !node.hidden; },
    set visible(v){ node.hidden = !v; },
    remove(){ node.remove(); },
  });

  // ---------- timers that Start over clears ----------
  let timers = [], frames = [], session = 0;
  const after = (ms, fn) => { const s = session; const id = setTimeout(() => s === session && fn(), ms); timers.push(id); return id; };
  const every = (ms, fn) => { const s = session; const id = setInterval(() => s === session ? fn() : clearInterval(id), ms); timers.push(id); return id; };
  const stop = id => { clearTimeout(id); clearInterval(id); };
  function loop(fn){            // fn(dt, t) every animation frame until it returns false or Start over
    const s = session; let last = performance.now(), t0 = last, alive = true;
    const step = now => { if (!alive || s !== session) return; const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (fn(dt, (now - t0) / 1000) === false) return; requestAnimationFrame(step); };
    requestAnimationFrame(step); const h = { stop(){ alive = false; } }; frames.push(h); return h;
  }

  // ---------- page ----------
  let cfg = null, built = false;
  function start(o){
    cfg = o; if (!o || typeof o.build !== 'function') throw new Error('MK.start needs { title, build }');
    const boot = () => {
      if (!document.getElementById('mk-style')){ const st = el('style'); st.id = 'mk-style'; st.textContent = css + (o.css || ''); document.head.appendChild(st); }
      document.title = o.title || 'Math experience';
      document.body.innerHTML = '';
      const root = el('div', 'mk');
      root.innerHTML = `<header id="mk-card"><h1></h1><p id="mk-say"></p></header>
        <div id="mk-main"><section id="mk-stage"></section><aside id="mk-side"></aside></div>
        <nav id="mk-controls"></nav>
        <footer id="mk-foot"><span id="mk-model"></span><button class="mk-btn alt" id="mk-again" type="button">Start over</button></footer><div id="mk-err"></div>`;
      document.body.appendChild(root);
      root.querySelector('h1').textContent = o.title || '';
      document.getElementById('mk-again').onclick = () => { post('again', null); run(); };
      run(); post('ready', { title: o.title || '', mk: VERSION });
    };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', boot) : boot();
  }
  function run(){
    session++; timers.forEach(stop); timers = []; frames.forEach(f => f.stop()); frames = [];
    ['mk-stage', 'mk-side', 'mk-controls'].forEach(id => document.getElementById(id).innerHTML = '');
    document.getElementById('mk-main').classList.toggle('wide', false);
    say(''); model('');
    built = false; cfg.build(); built = true;
    if (!document.getElementById('mk-say').textContent.trim()) console.warn('MK: the card is empty; call MK.say() in build()');
  }
  function say(text){ const p = document.getElementById('mk-say'); if (p) p.textContent = String(text ?? ''); if (built && text) post('say', { text: String(text).slice(0, 200) }); }
  function model(text){ const m = document.getElementById('mk-model'); if (m) m.textContent = text ? 'Model: ' + text : ''; }
  function wide(on = true){ document.getElementById('mk-main').classList.toggle('wide', on); }

  // ---------- controls ----------
  function button(label, onClick, o = {}){
    const b = el('button', 'mk-btn' + (o.alt ? ' alt' : ''), label); b.type = 'button';
    b.onclick = () => { post('click', { label: b.textContent }); onClick && onClick(api); };
    const api = wrap(b, { set label(t){ b.textContent = t; }, get label(){ return b.textContent; }, enable(on = true){ b.disabled = !on; return api; } });
    area(o.where).appendChild(b); return api;
  }
  function group(question, where){ const g = el('div', 'mk-group'); if (question) g.appendChild(el('div', 'q', question)); area(where).appendChild(g); return g; }
  function choices(options, onPick, o = {}){
    const g = group(o.ask, o.where); let locked = false;
    const btns = options.map((t, i) => { const b = el('button', 'mk-btn alt', String(t)); b.type = 'button';
      b.onclick = () => { if (locked) return; post('pick', { ask: o.ask || null, choice: String(t), i }); onPick && onPick(i, String(t), api); }; g.appendChild(b); return b; });
    const api = wrap(g, {
      lock(){ locked = true; btns.forEach(b => b.disabled = true); return api; },
      mark(i, kind){ btns[i]?.classList.add(kind === 'right' ? 'right' : 'wrong'); return api; },
      reset(){ locked = false; btns.forEach(b => { b.disabled = false; b.classList.remove('right', 'wrong'); }); return api; },
      buttons: btns,
    });
    return api;
  }
  function slider(o){
    const g = el('label', 'mk-slider mk-group'); const name = el('span', null, o.label || ''); const r = el('input'); const v = el('span', 'val');
    r.type = 'range'; r.min = o.min ?? 0; r.max = o.max ?? 10; r.step = o.step ?? 1; r.value = o.value ?? r.min;
    const fmt = o.format || (x => String(x)); let tm;
    const upd = fire => { const x = +r.value; v.textContent = fmt(x); if (fire){ o.onInput && o.onInput(x); clearTimeout(tm); tm = setTimeout(() => post('slide', { label: o.label || null, value: x }), 400); } };
    r.oninput = () => upd(true); g.append(name, r, v); area(o.where).appendChild(g); upd(false);
    const api = wrap(g, { get value(){ return +r.value; }, set value(x){ r.value = x; upd(false); }, enable(on = true){ r.disabled = !on; return api; } });
    return api;
  }
  function input(o){
    const g = group(o.ask, o.where); const w = el('div', 'mk-input'); const f = el('input'); f.type = o.type || 'number';
    if (o.placeholder) f.placeholder = o.placeholder; if (o.step != null) f.step = o.step;
    const b = el('button', 'mk-btn', o.button || 'Check'); b.type = 'button';
    const submit = () => { const raw = f.value.trim(); if (!raw) return; const val = f.type === 'number' ? Number(raw) : raw;
      if (f.type === 'number' && !Number.isFinite(val)) return; post('enter', { ask: o.ask || null, value: raw }); o.onSubmit && o.onSubmit(val, api); };
    b.onclick = submit; f.onkeydown = e => { if (e.key === 'Enter') submit(); };
    w.append(f); if (o.unit) w.append(el('span', null, o.unit)); w.append(b); g.appendChild(w);
    const api = wrap(g, { get value(){ return f.value; }, set value(x){ f.value = x; }, lock(){ f.disabled = b.disabled = true; return api; }, reset(){ f.disabled = b.disabled = false; f.value = ''; return api; } });
    return api;
  }
  // guess-first: one question, answered once per run; the answer is reported to the viewer.
  function guess(o, onGuess){
    if (o.options){
      const c = choices(o.options, (i, t, row) => { row.lock(); row.buttons[i].classList.add('picked'); post('guess', { ask: o.ask, value: t }); onGuess && onGuess(t, i, row); }, { ask: o.ask, where: o.where });
      return c;
    }
    const c = input({ ask: o.ask, unit: o.unit, step: o.step, placeholder: o.placeholder, button: o.button || 'Lock in my guess', where: o.where,
      onSubmit: (v, row) => { row.lock(); post('guess', { ask: o.ask, value: v }); settle(row, v); onGuess && onGuess(v, row); } });
    return c;
  }
  function settle(row, v){ const n = row.node; const q = n.querySelector('.q'); const line = el('div', 'mk-guessed', (q ? q.textContent.replace(/[?:]\s*$/, '') : 'Your guess') + ': ' + v);
    n.replaceChildren(line); n.classList.add('done'); }
  function readout(label, value, o = {}){
    const b = el('div', 'mk-box mk-readout'); const k = el('div', 'k', label); const v = el('div', 'v', value ?? '');
    b.append(k, v); area(o.where || 'side').appendChild(b);
    return wrap(b, { set(x){ v.textContent = String(x); return this; }, label(x){ k.textContent = x; return this; } });
  }
  function note(text, o = {}){ const n = el('div', 'mk-note mk-box', text); area(o.where || 'side').appendChild(n); return wrap(n, { set(t){ n.textContent = t; return this; } }); }
  function table(headers, rows = [], o = {}){
    const box = el('div', 'mk-box'); const t = el('table', 'mk-table'); box.appendChild(t); area(o.where || 'side').appendChild(box);
    const api = wrap(box, { set(rs, hl = -1){
      t.innerHTML = '';
      const hr = el('tr'); headers.forEach(h => hr.appendChild(el('th', null, h))); t.appendChild(hr);
      rs.forEach((r, i) => { const tr = el('tr', i === hl ? 'hl' : null); r.forEach(c => tr.appendChild(el('td', null, String(c)))); t.appendChild(tr); });
      return api; } });
    return api.set(rows);
  }
  const show = (...xs) => xs.forEach(x => x && (x.show ? x.show(true) : (x.hidden = false)));
  const hide = (...xs) => xs.forEach(x => x && (x.hide ? x.hide() : (x.hidden = true)));

  // ---------- SVG ----------
  function svg(w, h, o = {}){
    const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('font-family', 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'); s.setAttribute('font-size', o.fontSize || 16);
    if (o.maxHeight) s.style.maxHeight = o.maxHeight;
    area(o.where || 'stage').appendChild(s);
    const mk = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); const api = shape(n); api.attr(attrs || {}); (parent?.node || parent || s).appendChild(n); return api; };
    const shape = n => {
      const api = {
        node: n,
        attr(a){ for (const k in a){ const v = a[k]; if (v == null || v === false) n.removeAttribute(k); else n.setAttribute(k, v === true ? '' : v); } return api; },
        text(t){ n.textContent = String(t); return api; },
        on(ev, fn){ n.addEventListener(ev, fn); n.style.cursor = 'pointer'; return api; },
        show(on = true){ n.style.display = on ? '' : 'none'; return api; },
        hide(){ n.style.display = 'none'; return api; },
        remove(){ n.remove(); },
        add(tag, attrs){ return mk(tag, attrs, n); },
      };
      return api;
    };
    const style = st => ({ fill: 'none', stroke: 'none', ...st });
    const api = {
      node: s, width: w, height: h,
      rect: (x, y, ww, hh, st = {}) => mk('rect', style({ x, y, width: Math.max(0, ww), height: Math.max(0, hh), fill: '#2f6fde', ...st }), st.parent),
      circle: (cx, cy, r, st = {}) => mk('circle', style({ cx, cy, r, fill: '#2f6fde', ...st }), st.parent),
      line: (x1, y1, x2, y2, st = {}) => mk('line', style({ x1, y1, x2, y2, stroke: '#1d2330', 'stroke-width': 2, ...st }), st.parent),
      path: (d, st = {}) => mk('path', style({ d, stroke: '#1d2330', 'stroke-width': 2, ...st }), st.parent),
      polygon: (pts, st = {}) => mk('polygon', style({ points: pts.map(p => p.join(',')).join(' '), fill: '#2f6fde', ...st }), st.parent),
      text: (x, y, t, st = {}) => { const { anchor, size, weight, ...rest } = st; return mk('text', { x, y, fill: '#1d2330', 'text-anchor': anchor || 'middle', 'dominant-baseline': 'middle', 'font-size': size, 'font-weight': weight, ...rest }, st.parent).text(t); },
      g: (st = {}) => mk('g', st, st.parent),
      clear(){ while (s.firstChild) s.removeChild(s.firstChild); },
      // point in SVG coordinates from a pointer event
      point(e){ const r = s.getBoundingClientRect(); return [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * h / r.height]; },
      // make a shape draggable: fn(x, y) gets SVG coordinates while dragging; done(x, y) on release
      drag(shp, fn, done){
        const n = shp.node || shp; n.style.cursor = 'grab'; n.style.touchAction = 'none';
        n.addEventListener('pointerdown', e => { e.preventDefault(); n.setPointerCapture(e.pointerId);
          const mv = ev => fn(...api.point(ev)); const up = ev => { n.removeEventListener('pointermove', mv); n.removeEventListener('pointerup', up);
            post('drag', null); done && done(...api.point(ev)); };
          n.addEventListener('pointermove', mv); n.addEventListener('pointerup', up); });
        return shp;
      },
    };
    return api;
  }
  function scale(d0, d1, r0, r1){ const f = x => r0 + (x - d0) * (r1 - r0) / (d1 - d0); f.invert = y => d0 + (y - r0) * (d1 - d0) / (r1 - r0); return f; }
  // axis ticks: nice round steps between a and b (about n of them)
  function ticks(a, b, n = 5){ const span = b - a, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)); const st = [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw) || raw;
    const out = []; for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(+v.toFixed(10)); return out; }
  // bar chart in an svg box: values[] with labels[]; returns { set(values, opts) }
  function bars(S, o){
    const g = S.g(); const box = { x: 40, y: 10, w: S.width - 50, h: S.height - 50, ...o.box };
    const draw = (values, oo = {}) => {
      while (g.node.firstChild) g.node.removeChild(g.node.firstChild);
      const max = oo.max ?? o.max ?? Math.max(1e-9, ...values); const n = values.length; const bw = box.w / n;
      const y = scale(0, max, box.y + box.h, box.y);
      ticks(0, max, 4).forEach(t => { g.add('line', { x1: box.x, x2: box.x + box.w, y1: y(t), y2: y(t), stroke: '#e3e0d6' });
        g.add('text', { x: box.x - 6, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 12, fill: '#5d6676' }).text((o.tick || (v => v))(t)); });
      values.forEach((v, i) => {
        const hl = (oo.highlight ?? o.highlight)?.includes?.(i);
        g.add('rect', { x: box.x + i * bw + bw * 0.12, y: y(v), width: bw * 0.76, height: Math.max(0, y(0) - y(v)), fill: hl ? '#e8912d' : (o.color || '#2f6fde'), rx: 3 });
        if (o.labels) g.add('text', { x: box.x + i * bw + bw / 2, y: box.y + box.h + 16, 'text-anchor': 'middle', 'font-size': 13, fill: '#1d2330' }).text(o.labels[i]);
        if (o.showValues !== false && n <= 16) g.add('text', { x: box.x + i * bw + bw / 2, y: y(v) - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#1d2330' }).text((o.format || (z => z))(v));
      });
      g.add('line', { x1: box.x, x2: box.x + box.w, y1: y(0), y2: y(0), stroke: '#1d2330', 'stroke-width': 1.5 });
      if (o.xLabel) g.add('text', { x: box.x + box.w / 2, y: box.y + box.h + 36, 'text-anchor': 'middle', 'font-size': 13, fill: '#5d6676' }).text(o.xLabel);
    };
    draw(o.values || []); return { set: draw, node: g.node };
  }

  // ---------- exact and random math ----------
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  class Frac {
    constructor(n, d = 1){ if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error('MK.frac needs whole numbers and d ≠ 0'); const s = d < 0 ? -1 : 1, g = gcd(n, d); this.n = s * n / g; this.d = s * d / g; }
    static of(x){ return x instanceof Frac ? x : new Frac(x, 1); }
    add(o){ o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o){ o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o){ o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
    div(o){ o = Frac.of(o); return new Frac(this.n * o.d, this.d * o.n); }
    cmp(o){ o = Frac.of(o); return Math.sign(this.n * o.d - o.n * this.d); }
    eq(o){ return this.cmp(o) === 0; }
    valueOf(){ return this.n / this.d; }
    toString(){ return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`; }
  }
  const frac = (n, d) => new Frac(n, d);
  // seeded random numbers (same seed → same sequence); default seed changes every run
  function rng(seed){ let a = (seed ?? (Math.random() * 2 ** 32)) >>> 0; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)); r.pick = arr => arr[Math.floor(r() * arr.length)]; r.chance = p => r() < p; return r; }
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => a.length ? sum(a) / a.length : NaN;
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function fmt(x, o = {}){
    if (!Number.isFinite(x)) return String(x);
    const dp = o.dp ?? (Math.abs(x) >= 100 ? 0 : 2);
    const s = x.toLocaleString('en-US', { minimumFractionDigits: o.fixed ? dp : 0, maximumFractionDigits: dp });
    return (o.money ? '$' : '') + s + (o.pct ? '%' : '');
  }

  window.MK = { version: VERSION, start, say, model, wide, button, choices, slider, input, guess, readout, note, table, show, hide,
    svg, scale, ticks, bars, frac, Frac, rng, sum, mean, median, fmt, after, every, stop, loop, log: post, get errors(){ return shown.slice(); }, get events(){ return events.slice(); } };
})();
