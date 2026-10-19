const { THREE, scene, shape, place, fit, label, interactive, tone, mat, ui, C } = XR;

// ---------- data the whole scene is computed from ----------
const K = 0.025;                         // metres of model wall per millimetre of real wall
const BLUE = 0x2f5fbf, RED = 0xc0282d;   // blood colours inside chambers and vessels
const CELL_BLUE = 0x59b0ff, CELL_RED = 0xff4040;

const CHAMBERS = {
  RA: { name: 'Right atrium',    c: [-0.55,  0.55], r: [0.40, 0.35, 0.35], wallMm: 2,  blood: BLUE, job: 'receives low-oxygen (blue) blood back from the body.' },
  RV: { name: 'Right ventricle', c: [-0.50, -0.45], r: [0.55, 0.70, 0.45], wallMm: 4,  blood: BLUE, job: 'pumps low-oxygen blood to the lungs, and only the lungs.' },
  LA: { name: 'Left atrium',     c: [ 0.70,  0.55], r: [0.40, 0.35, 0.35], wallMm: 2,  blood: RED,  job: 'receives oxygen-rich (red) blood back from the lungs.' },
  LV: { name: 'Left ventricle',  c: [ 0.60, -0.45], r: [0.55, 0.70, 0.45], wallMm: 10, blood: RED,  job: 'pumps oxygen-rich blood to the whole body.' }
};

// route of the blood cell (x, y in the heart diagram)
const PATH = [
  [-1.30, -1.75],  // 0 body
  [-1.30,  0.55],  // 1 vena cava
  [-0.55,  0.55],  // 2 right atrium
  [-0.50, -0.45],  // 3 right ventricle
  [ 0.00,  0.00],  // 4 pulmonary artery
  [ 0.00,  1.30],  // 5
  [ 0.40,  1.60],  // 6 lungs
  [ 0.80,  1.30],  // 7 pulmonary vein
  [ 0.70,  0.55],  // 8 left atrium
  [ 0.60, -0.45],  // 9 left ventricle
  [ 0.95, -0.85],  // 10 aorta
  [ 1.30, -1.20],  // 11
  [ 1.30, -1.75]   // 12 body again
];
const LUNG_STOP = 6;
const SPEED = 1.1, DWELL = 2.4;
const STOPS = {
  0: 'Start: the cell is in the body. It is blue because it has given up its oxygen. (Model: it follows a fixed route at a steady speed.)',
  2: 'Right atrium: the cell comes back from the body and collects here.',
  3: 'Right ventricle: this chamber sends the cell to the lungs, and only the lungs.',
  6: 'Lungs: the cell picks up oxygen, so it turns red.',
  8: 'Left atrium: the cell returns from the lungs.',
  9: 'Left ventricle: this chamber sends the cell out to the whole body.'
};

// ---------- state ----------
let card, guess, startBtn, againBtn, cell, heart;
const tags = {};
let phase = 'guess', seg = 0, prog = 0, dwell = 0, guessText = '', guessOK = false;

const setCard = body => card.setText('Heart: left vs right\n' + body);

function tube(g, a, b, r, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = shape.cylinder(r, Math.hypot(dx, dy), color);
  t.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -0.1);
  t.rotation.z = -Math.atan2(dx, dy);
  g.add(t);
}

function anchor(g, x, y, z) {
  const a = shape.hitball(0.05);
  a.position.set(x, y, z);
  g.add(a);
  return a;
}

function region(g, color, opacity, c, r, onSelect) {
  const m = shape.ball(1, color);
  m.material = mat(color, { opacity: opacity, transparent: true });
  m.scale.set(r[0], r[1], r[2]);
  m.position.set(c[0], c[1], 0);
  g.add(m);
  interactive(m, { select: onSelect });
  return m;
}

function makeChamber(g, key) {
  const d = CHAMBERS[key];
  const w = d.wallMm * K;                       // wall thickness drawn from the data
  const cav = shape.ball(1, d.blood);
  cav.material = mat(d.blood, { opacity: 0.85, transparent: true });
  cav.scale.set(Math.max(d.r[0] - w, 0.08), Math.max(d.r[1] - w, 0.08), Math.max(d.r[2] - w, 0.08));
  cav.position.set(d.c[0], d.c[1], 0);
  g.add(cav);
  const wall = shape.ball(1, C.pink);
  wall.material = mat(C.pink, { opacity: 0.42, transparent: true, depthWrite: false });
  wall.scale.set(d.r[0], d.r[1], d.r[2]);
  wall.position.set(d.c[0], d.c[1], 0);
  g.add(wall);
  interactive(wall, { select: () => pickChamber(key) });
}

function pickChamber(key) {
  if (phase === 'guess') return;
  const d = CHAMBERS[key];
  tags[key].visible = true;
  tone(440, 0.08, 'sine');
  if (phase === 'explore') setCard(d.name + ': ' + d.job + '\nClick another part, or press Start.');
}

function pickRegion(name, text) {
  if (phase !== 'explore') return;
  tone(440, 0.08, 'sine');
  setCard(name + ': ' + text + '\nClick another part, or press Start.');
}

// ---------- the run ----------
function arrive(i) {
  cell.position.set(PATH[i][0], PATH[i][1], 0.15);
  cell.material.color.setHex(i >= LUNG_STOP ? CELL_RED : CELL_BLUE);
  if (i === PATH.length - 1) { finish(); return; }
  if (STOPS[i]) {
    setCard(STOPS[i]);
    dwell = DWELL;
    tone(520 + 40 * i, 0.12, 'sine');
  }
}

function finish() {
  phase = 'done';
  const rv = CHAMBERS.RV, lv = CHAMBERS.LV;
  const ratio = (lv.wallMm / rv.wallMm).toFixed(1);
  tags.RV.setText(rv.name + '\nwall ' + rv.wallMm + ' mm');
  tags.LV.setText(lv.name + '\nwall ' + lv.wallMm + ' mm');
  tags.RV.visible = true;
  tags.LV.visible = true;
  againBtn.visible = true;
  setCard('Right ventricle: lungs only. Left ventricle: the whole body, so its wall is ' + ratio + 'x thicker (about ' + lv.wallMm + ' mm vs ' + rv.wallMm + ' mm).\nYour guess: "' + guessText + '" - ' + (guessOK ? 'correct' : 'not quite') + '.');
  tone(660, 0.25, 'triangle');
}

function startRun() {
  phase = 'run';
  startBtn.visible = false;
  againBtn.visible = true;
  seg = 0; prog = 0; dwell = 0;
  cell.visible = true;
  arrive(0);
}

function resetAll() {
  phase = 'guess';
  seg = 0; prog = 0; dwell = 0;
  cell.visible = false;
  cell.material.color.setHex(CELL_BLUE);
  Object.keys(CHAMBERS).forEach(k => { tags[k].setText(CHAMBERS[k].name); tags[k].visible = false; });
  guess.reset();
  guess.visible = true;
  startBtn.visible = false;
  againBtn.visible = false;
  setCard('What does the RIGHT side of the heart pump blood to? Point at your guess and click.');
}

// ---------- build ----------
function build() {
  heart = shape.group();

  // lungs and body (soft, see-through blocks)
  region(heart, 0xe8a0b4, 0.55, [0, 1.6],   [1.5, 0.30, 0.30], () => pickRegion('Lungs', 'blood picks up oxygen here.'));
  region(heart, 0x8fa3b8, 0.55, [0, -1.75], [1.5, 0.22, 0.30], () => pickRegion('Body', 'tissues use up the oxygen, so blood returns low in oxygen.'));

  // vessels
  tube(heart, [-1.30, -1.60], [-1.30, 0.55], 0.07, BLUE);   // vena cava
  tube(heart, [-1.30,  0.55], [-0.70, 0.55], 0.07, BLUE);
  tube(heart, [ 0.00,  0.00], [ 0.00, 1.30], 0.07, BLUE);   // pulmonary artery
  tube(heart, [ 0.80,  1.30], [ 0.80, 0.80], 0.07, RED);    // pulmonary vein
  tube(heart, [ 0.95, -0.85], [ 1.30, -1.20], 0.07, RED);   // aorta
  tube(heart, [ 1.30, -1.20], [ 1.30, -1.60], 0.07, RED);

  // chambers
  Object.keys(CHAMBERS).forEach(k => makeChamber(heart, k));

  // blood cell (always drawn on top so it is never hidden by a wall)
  cell = shape.ball(0.15, CELL_BLUE);
  cell.material = mat(CELL_BLUE, {});
  cell.material.depthTest = false;
  cell.renderOrder = 20;
  const halo = shape.ball(0.24, 0xffffff);
  halo.material = mat(0xffffff, { opacity: 0.3, transparent: true });
  halo.material.depthTest = false;
  halo.renderOrder = 21;
  cell.add(halo);
  cell.visible = false;
  heart.add(cell);

  // anchors for name tags
  const anchors = {};
  Object.keys(CHAMBERS).forEach(k => {
    const d = CHAMBERS[k];
    anchors[k] = anchor(heart, d.c[0], d.c[1], d.r[2] + 0.1);
  });
  const lungAnchor = anchor(heart, 0, 1.6, 0.4);
  const bodyAnchor = anchor(heart, 0, -1.75, 0.4);

  scene.add(heart);
  fit(heart, 2.7);
  place(heart, { dist: 4, dir: 14, height: 'eye', anchor: 'center', face: true });

  // labels: made once, shown/hidden or setText later
  Object.keys(CHAMBERS).forEach(k => {
    tags[k] = label(CHAMBERS[k].name, { above: anchors[k], size: 'comfortable' });
    tags[k].visible = false;
  });
  label('Lungs', { above: lungAnchor, size: 'comfortable' });
  label('Body',  { above: bodyAnchor, size: 'comfortable' });

  // card and controls
  card = ui.sign('Heart: left vs right\nWhat does the RIGHT side of the heart pump blood to? Point at your guess and click.', { width: 1.2, dist: 'room', dir: -20, height: 'eye' });

  guess = ui.choices(['Same as the left', 'Lungs only', 'Whole body'], {
    dist: 'room', dir: -20, height: 'waist',
    onPick: (i, text, row) => {
      guessText = text;
      guessOK = (i === 1);
      row.lock();
      row.visible = false;
      phase = 'explore';
      setCard("Let's test it. Click any chamber to see its name, then press Start to follow one blood cell. Blue = low oxygen, red = rich in oxygen.");
      startBtn.visible = true;
    }
  });

  startBtn = ui.button('Start', { color: 'green', dist: 'room', dir: -20, height: 'waist', onPress: () => { if (phase === 'explore') startRun(); } });
  againBtn = ui.button('Start over', { color: 'grey', dist: 'room', dir: -20, height: 'waist', onPress: resetAll });
  startBtn.visible = false;
  againBtn.visible = false;
}

function frame(dt, t) {
  if (phase !== 'run' || !cell) return;
  if (dwell > 0) { dwell -= dt; return; }
  const a = PATH[seg], b = PATH[seg + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  prog += SPEED * dt / len;
  if (prog >= 1) {
    seg++; prog = 0;
    arrive(seg);
    return;
  }
  cell.position.set(a[0] + (b[0] - a[0]) * prog, a[1] + (b[1] - a[1]) * prog, 0.15);
}

XR.run({ build, frame });
