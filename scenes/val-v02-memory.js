const { THREE, scene, shape, place, label, interactive, tone, mat, ground, ui, C } = XR;

const SHOW_SECONDS = 4;
const ROUNDS = [3, 6, 9];
const COLS = 4, ROWS = 3, SLOTS = COLS * ROWS;
const SLOT_DX = 0.3, SLOT_DZ = 0.28;
const SLOT_BASE = 0x5a4636;
const BANDS = ['0-2', '3-4', '5-6', '7-9'];
const BAND_RANGE = [[0, 2], [3, 4], [5, 6], [7, 9]];
const BAR_MAX = 0.6;

const ITEMS = [
  { name: 'red ball',     kind: 'ball',  color: 'red' },
  { name: 'blue cube',    kind: 'cube',  color: 'blue', s: 0.09 },
  { name: 'yellow cone',  kind: 'cone',  color: 'yellow', r: 0.05, h: 0.11 },
  { name: 'green can',    kind: 'can',   color: 'green' },
  { name: 'purple ring',  kind: 'ring',  color: 'purple' },
  { name: 'orange block', kind: 'block', color: 'orange' },
  { name: 'pink egg',     kind: 'egg',   color: 'pink' },
  { name: 'teal cone',    kind: 'cone',  color: 'teal', r: 0.035, h: 0.14 },
  { name: 'white cube',   kind: 'cube',  color: 'white', s: 0.07 },
];

const INTRO = `Memory on a table\nObjects will show on this table, then vanish, and you put them back.\nFirst, a guess: if 9 objects like these show for ${SHOW_SECONDS} seconds, how many will you place in the right spot? Point at an answer and click.`;

// scene references (filled in build)
let card, board, guessRow, startBtn, nextBtn, resultsBtn, againBtn, chart;
let items = [], markers = [], discs = [], lines = [], bars = [], valueLabels = [];

// state
let phase = 'guess', rd = 0, q = 0, tLeft = 0, lastShown = -1, guessBand = -1;
let layout = [], order = [], answers = [], results = [];

const slotX = s => ((s % COLS) - (COLS - 1) / 2) * SLOT_DX;
const slotZ = s => (Math.floor(s / COLS) - (ROWS - 1) / 2) * SLOT_DZ;
const pct = r => Math.round(100 * r.correct / r.n) + '%';

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = b[i]; b[i] = b[j]; b[j] = tmp;
  }
  return b;
}

function makeItem(def) {
  const g = shape.group();
  let m;
  if (def.kind === 'ball')       { m = shape.ball(0.05, def.color); m.position.y = 0.05; }
  else if (def.kind === 'egg')   { m = shape.ball(0.04, def.color); m.scale.y = 1.4; m.position.y = 0.056; }
  else if (def.kind === 'cube')  { m = shape.box(def.s, def.s, def.s, def.color); m.position.y = def.s / 2; }
  else if (def.kind === 'block') { m = shape.box(0.13, 0.05, 0.07, def.color); m.position.y = 0.025; }
  else if (def.kind === 'cone')  { m = shape.cone(def.r, def.h, def.color); m.position.y = def.h / 2; }
  else if (def.kind === 'can')   { m = shape.cylinder(0.04, 0.1, def.color); m.position.y = 0.05; }
  else                           { m = shape.torus(0.04, 0.014, def.color); m.position.y = 0.054; }
  g.add(m);
  return g;
}

function build() {
  ground({ color: 'grey', grid: false, arrow: false });

  // the table: a plain counter-height table, placed in front of the visitor
  const TOP = 1.0, TW = 1.5, TD = 1.0;
  const table = shape.group();
  const slab = shape.box(TW, 0.05, TD, 0x7a5c45);
  slab.position.y = TOP - 0.025;
  table.add(slab);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = shape.cylinder(0.035, TOP - 0.05, 0x5f4634);
      leg.position.set(sx * (TW / 2 - 0.07), (TOP - 0.05) / 2, sz * (TD / 2 - 0.07));
      table.add(leg);
    }
  }
  place(table, { dist: 'room', dir: 'ahead', height: 0.01, anchor: 'bottom' });

  // a board that sits on the table top; everything on the table is a child of it
  const bb = new THREE.Box3().setFromObject(table);
  const c = bb.getCenter(new THREE.Vector3());
  board = new THREE.Group();
  board.position.set(c.x, bb.max.y, c.z);
  scene.add(board);

  // 12 spots (large discs, easy to point at)
  const discGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.008, 28);
  for (let s = 0; s < SLOTS; s++) {
    const d = new THREE.Mesh(discGeo, mat(SLOT_BASE));
    d.position.set(slotX(s), 0.004, slotZ(s));
    board.add(d);
    interactive(d, { select: () => onSlot(s) });
    discs.push(d);
  }

  // the nine objects, your-answer dots, and error lines
  for (let i = 0; i < ITEMS.length; i++) {
    const it = makeItem(ITEMS[i]);
    it.visible = false;
    board.add(it);
    items.push(it);
    const mk = shape.ball(0.03, ITEMS[i].color);
    mk.visible = false;
    board.add(mk);
    markers.push(mk);
    const ln = shape.box(1, 0.008, 0.008, 'red');
    ln.visible = false;
    board.add(ln);
    lines.push(ln);
  }

  // card, guess row, buttons
  card = ui.sign(INTRO, { width: 1.7, anchor: 'top', dist: 'room', dir: 'ahead', height: 'eye' });
  guessRow = ui.choices(BANDS, {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, text, row) => { row.lock(); onGuess(i); }
  });
  startBtn = ui.button('Show the objects', { dist: 'near', dir: 'ahead', height: 'waist', color: 'teal', onPress: startShow });
  nextBtn = ui.button('Next round', { dist: 'near', dir: 'ahead', height: 'waist', color: 'teal', onPress: nextRound });
  resultsBtn = ui.button('See results', { dist: 'near', dir: 'ahead', height: 'waist', color: 'teal', onPress: showResults });
  againBtn = ui.button('Start over', { dist: 'near', dir: 'ahead-right', height: 'waist', onPress: restart });
  startBtn.visible = false; nextBtn.visible = false; resultsBtn.visible = false; againBtn.visible = false;

  // results chart: share placed right per round, with the guessing level
  chart = shape.group();
  chart.add(shape.box(1.0, 0.012, 0.1, 'grey'));
  for (let i = 0; i < 3; i++) {
    const b = shape.box(0.2, 1, 0.12, 'teal');
    b.scale.y = 0.004;
    b.position.set((i - 1) * 0.3, 0.006 + 0.002, 0);
    chart.add(b);
    bars.push(b);
  }
  const chanceY = 0.006 + BAR_MAX / SLOTS;
  const chanceLine = shape.box(0.95, 0.006, 0.13, 'orange');
  chanceLine.position.y = chanceY;
  chart.add(chanceLine);
  place(chart, { dist: 'room', dir: 'ahead-left', height: 'waist', anchor: 'bottom' });
  chart.rotation.y = THREE.MathUtils.degToRad(30);
  for (let i = 0; i < 3; i++) {
    label(`${ROUNDS[i]} objects`, { parent: chart, at: [(i - 1) * 0.3, -0.06, 0.07], capHeight: 0.035, bg: false });
    valueLabels.push(label('-', { parent: chart, at: [(i - 1) * 0.3, 0.1, 0.07], capHeight: 0.04, bg: false }));
  }
  label('Share placed right', { parent: chart, at: [0, BAR_MAX + 0.14, 0.07], capHeight: 0.04, bg: false });
  label(`guessing: ${Math.round(100 / SLOTS)}%`, { parent: chart, at: [0.62, chanceY + 0.02, 0.07], capHeight: 0.03, bg: false });
  chart.visible = false;

  preview();
}

// ---- helpers ----
function hideItems() { items.forEach(it => { it.visible = false; }); }

function clearMarks() {
  markers.forEach(m => { m.visible = false; });
  lines.forEach(l => { l.visible = false; });
  discs.forEach(d => d.material.color.setHex(SLOT_BASE));
}

function showItem(l) {
  const it = items[l.item];
  it.position.set(slotX(l.slot), 0.008, slotZ(l.slot));
  it.visible = true;
}

function preview() {
  hideItems();
  clearMarks();
  const picks = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const spots = shuffle(Array.from({ length: SLOTS }, (_, i) => i));
  picks.forEach((it, k) => showItem({ item: it, slot: spots[k] }));
}

function roundHead() { return `Round ${rd + 1} of ${ROUNDS.length} · ${ROUNDS[rd]} objects`; }

// ---- flow ----
function onGuess(i) {
  guessBand = i;
  guessRow.visible = false;
  againBtn.visible = true;
  hideItems();
  phase = 'ready';
  rd = 0;
  setReady();
}

function setReady() {
  card.setText(`${roundHead()}\nWatch for ${SHOW_SECONDS} seconds. When they vanish, I name each object and you click the spot where it stood.\nPress the button when you are ready.`);
  startBtn.visible = true;
}

function startShow() {
  startBtn.visible = false;
  clearMarks();
  const n = ROUNDS[rd];
  const picks = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, n);
  const spots = shuffle(Array.from({ length: SLOTS }, (_, i) => i)).slice(0, n);
  layout = picks.map((it, k) => ({ item: it, slot: spots[k] }));
  layout.forEach(showItem);
  order = shuffle(layout.map(l => l.item));
  answers = [];
  q = 0;
  phase = 'show';
  tLeft = SHOW_SECONDS;
  lastShown = -1;
}

function askNext() {
  const n = ROUNDS[rd];
  card.setText(`${roundHead()}\nWhere was the ${ITEMS[order[q]].name}?\nClick its spot on the table.  (${q + 1} of ${n})`);
}

function onSlot(s) {
  if (phase !== 'recall') return;
  const it = order[q];
  answers[q] = s;
  const mk = markers[it];
  mk.position.set(slotX(s) + ((q % 3) - 1) * 0.04, 0.04, slotZ(s) + (q % 2 ? 0.035 : -0.035));
  mk.visible = true;
  tone(520, 0.08, 'sine');
  q++;
  if (q >= order.length) finishRound(); else askNext();
}

function finishRound() {
  phase = 'review';
  const n = ROUNDS[rd];
  let correct = 0;
  layout.forEach(showItem);
  let li = 0;
  order.forEach((it, k) => {
    const L = layout.find(x => x.item === it);
    if (answers[k] === L.slot) {
      correct++;
      discs[L.slot].material.color.setHex(C.green);
      markers[it].visible = false;
    } else {
      const m = markers[it].position;
      const dx = slotX(L.slot) - m.x, dz = slotZ(L.slot) - m.z;
      const len = Math.hypot(dx, dz);
      const ln = lines[li++];
      ln.scale.x = Math.max(len, 0.01);
      ln.position.set(m.x + dx / 2, 0.03, m.z + dz / 2);
      ln.rotation.y = Math.atan2(-dz, dx);
      ln.visible = true;
    }
  });
  results[rd] = { n, correct };
  card.setText(`${roundHead()}: ${correct} of ${n} in the right spot.\nGreen spots are right. Each coloured dot is where you put that object; a red line runs to where it really stood.`);
  if (rd < ROUNDS.length - 1) nextBtn.visible = true; else resultsBtn.visible = true;
}

function nextRound() {
  nextBtn.visible = false;
  rd++;
  clearMarks();
  hideItems();
  phase = 'ready';
  setReady();
}

function showResults() {
  resultsBtn.visible = false;
  phase = 'done';
  const first = results[0], last = results[results.length - 1];
  for (let i = 0; i < results.length; i++) {
    const f = results[i].correct / results[i].n;
    const h = f * BAR_MAX;
    bars[i].scale.y = Math.max(h, 0.004);
    bars[i].position.y = 0.006 + bars[i].scale.y / 2;
    valueLabels[i].setText(`${results[i].correct}/${results[i].n}`);
    if (valueLabels[i].position) valueLabels[i].position.y = 0.006 + h + 0.06;
  }
  chart.visible = true;

  const range = BAND_RANGE[guessBand];
  let cmp = 'about what you guessed';
  if (last.correct < range[0]) cmp = 'lower than you guessed';
  else if (last.correct > range[1]) cmp = 'higher than you guessed';

  const f1 = first.correct / first.n, f2 = last.correct / last.n;
  let lesson;
  if (last.correct === last.n) {
    lesson = `You placed all ${last.n}, which is strong. Grouping objects into patterns (chunking) can stretch memory. Start over to try a new layout.`;
  } else if (f1 > f2) {
    lesson = `Lesson: as objects grew from ${first.n} to ${last.n}, the share you placed right fell from ${pct(first)} to ${pct(last)}. Short-term memory holds only a handful of items at once, so the rest slip away.`;
  } else {
    lesson = `Your share right did not fall as objects were added (${pct(first)} to ${pct(last)}), but one short run is a small sample. Start over and compare.`;
  }
  const chance = ROUNDS.map(n => (n / SLOTS).toFixed(1)).join(', ');
  card.setText(`Results\nRight: ${results.map(r => r.correct + '/' + r.n).join(', ')}. Pure guessing would get about ${chance}.\nYou guessed ${BANDS[guessBand]} for the ${last.n}-object round and placed ${last.correct}: ${cmp}.\n${lesson}`);
}

function restart() {
  phase = 'guess';
  rd = 0; q = 0; guessBand = -1;
  results = []; layout = []; order = []; answers = [];
  startBtn.visible = false; nextBtn.visible = false; resultsBtn.visible = false; againBtn.visible = false;
  chart.visible = false;
  guessRow.reset();
  guessRow.visible = true;
  preview();
  card.setText(INTRO);
}

function frame(dt, t) {
  if (phase !== 'show') return;
  tLeft -= dt;
  const sec = Math.max(0, Math.ceil(tLeft));
  if (sec !== lastShown) {
    lastShown = sec;
    card.setText(`${roundHead()}\nMemorise where each object is.\n${sec}`);
  }
  if (tLeft <= 0) {
    hideItems();
    phase = 'recall';
    askNext();
  }
}

XR.run({ build, frame });
