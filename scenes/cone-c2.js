const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

const BASE_R = 0.15, BASE_H = 0.36;      // cone and cylinder share this base radius and height
const PLINTH_H = 0.45, POST_H = 0.10;
const CONE_X = -0.5, CYL_X = 0.5;
const SLICES = 400, TABLE = 200;
const MOVE_T = 0.8, DRAIN_T = 2.4, REFILL_T = 0.7;

let ready = false;
let sizeScale = 1, R = BASE_R, Hh = BASE_H;
let coneVol = 0, cylVol = 0, cumTable = [];
let poured = 0, pours = 0, guess = 0, marked = false;
let phase = 'idle', ph = 0, lastText = '';
let stage, cylG, coneG, coneShell, coneLiquid, coneRim, cylShell, cylFloor, cylLiquid, cylRim, stream;
let card, guessRow, sizeSlider;
const marks = [];
const restPos = new THREE.Vector3();
const pourPos = new THREE.Vector3();

const INTRO = 'Cone vs cylinder\nSame base, same height. Each pour moves one full cone.\nHow many cones will fill the cylinder?\nPoint at your guess (left) and pull the trigger.';

// ---------- measuring: volumes come from slicing the real shapes, not from a formula ----------
function volume(radiusAt, y0, y1, n){
  const dy = (y1 - y0) / n;
  let v = 0;
  for (let i = 0; i < n; i++){
    const r = radiusAt(y0 + (i + 0.5) * dy);
    v += Math.PI * r * r * dy;
  }
  return v;
}

function measure(){
  const coneR = y => R * (y / Hh);          // cone radius at height y above its tip
  cylVol = volume(() => R, 0, Hh, SLICES);
  coneVol = volume(coneR, 0, Hh, SLICES);
  cumTable = [0];
  const dy = Hh / TABLE;
  for (let i = 0; i < TABLE; i++) cumTable.push(cumTable[i] + volume(coneR, i * dy, (i + 1) * dy, 4));
}

function depthFor(v){                        // how deep the liquid is in the cone for a given volume
  if (v <= 0) return 0;
  const total = cumTable[TABLE];
  if (v >= total) return Hh;
  let lo = 0, hi = TABLE;
  while (hi - lo > 1){
    const mid = (lo + hi) >> 1;
    if (cumTable[mid] <= v) lo = mid; else hi = mid;
  }
  const f = (v - cumTable[lo]) / (cumTable[hi] - cumTable[lo]);
  return (lo + f) * Hh / TABLE;
}

// ---------- scene helpers ----------
function glass(color, opacity){
  const m = mat(color, { opacity, transparent: true });
  m.side = THREE.DoubleSide;
  m.depthWrite = false;
  return m;
}
function solid(color){
  const m = mat(color);
  m.side = THREE.DoubleSide;
  return m;
}
const mesh = (g, m) => new THREE.Mesh(g, m);

function unitCone(open){
  const g = new THREE.ConeGeometry(1, 1, 48, 1, open);
  g.rotateX(Math.PI);                        // tip down, opening up
  g.translate(0, 0.5, 0);                    // tip at y = 0, rim at y = 1
  return g;
}
function unitCyl(open){
  const g = new THREE.CylinderGeometry(1, 1, 1, 48, 1, open);
  g.translate(0, 0.5, 0);                    // base at y = 0, top at y = 1
  return g;
}
function unitRing(){
  const g = new THREE.RingGeometry(0.97, 1.03, 64);
  g.rotateX(-Math.PI / 2);
  return g;
}

function say(text){
  if (text !== lastText){ card.setText(text); lastText = text; }
}

function setConeVolume(v){
  const d = depthFor(v);
  if (d <= 0.0001){ coneLiquid.visible = false; return; }
  coneLiquid.visible = true;
  const lx = 0.96 * R * d / Hh;
  coneLiquid.scale.set(lx, d, lx);
}

function setCylVolume(v){
  const level = Math.min(Hh, v / (Math.PI * R * R));
  if (level <= 0.0001){ cylLiquid.visible = false; return 0; }
  cylLiquid.visible = true;
  cylLiquid.scale.set(0.96 * R, level, 0.96 * R);
  return level;
}

function layout(){
  cylShell.scale.set(R, Hh, R);
  cylFloor.scale.set(R, 1, R);
  cylRim.scale.set(R, 1, R);
  cylRim.position.y = Hh;
  coneShell.scale.set(R, Hh, R);
  coneRim.scale.set(R, 1, R);
  coneRim.position.y = Hh;
  marks.forEach(m => m.scale.set(R, 1, R));
  restPos.set(CONE_X, PLINTH_H + POST_H, 0);
  pourPos.set(CYL_X, PLINTH_H + Hh + 0.05, 0);
}

function resetAll(){
  phase = 'idle'; ph = 0; poured = 0; pours = 0;
  stream.visible = false;
  marks.forEach(m => { m.visible = false; });
  coneG.position.copy(restPos);
  setConeVolume(coneVol);
  setCylVolume(0);
}

function applySize(s){
  sizeScale = s;
  R = BASE_R * s;
  Hh = BASE_H * s;
  measure();
  layout();
  resetAll();
  if (ready && guess) say('New size\nPour again and count the cones. Same answer?');
}

function showMark(k, vol){
  if (k < 1 || k > marks.length) return;
  const m = marks[k - 1];
  m.position.y = Math.min(Hh, vol / (Math.PI * R * R));
  m.visible = true;
}

function reveal(){
  const N = pours;
  const ratio = cylVol / coneVol;
  say(N + ' cones fill the cylinder\n' +
      'You guessed ' + guess + '. A cone is 1/' + N + ' of the cylinder (πr²h), so:\n' +
      'V = 1/3 πr²h\n' +
      'cylinder ÷ cone = ' + ratio.toFixed(2));
  if (!marked){
    marked = true;
    if (guess !== N && guess >= 1 && guess <= 4) guessRow.mark(guess - 1, 'wrong');
    if (N >= 1 && N <= 4) guessRow.mark(N - 1, 'right');
  }
  tone(660, 0.25, 'sine');
}

function pour(){
  if (phase !== 'idle') return;
  if (!guess){
    say('Pick your guess first\nPoint at 1, 2, 3 or 4 cones on the left and pull the trigger.');
    tone(200, 0.15, 'square');
    return;
  }
  if (poured >= cylVol * 0.999){               // full: start over, then pour
    poured = 0; pours = 0;
    marks.forEach(m => { m.visible = false; });
    setCylVolume(0);
  }
  phase = 'up'; ph = 0;
  tone(440, 0.1, 'triangle');
  say('Pouring cone ' + (pours + 1) + '...');
}

const ease = k => k * k * (3 - 2 * k);

function build(){
  sky({ top: 'purple', bottom: 'pink' });
  ground({ color: 'green', grid: false, arrow: false });
  input.teleport = 'none';

  stage = shape.group();
  const plinth = mesh(new THREE.BoxGeometry(1.7, PLINTH_H, 0.7), mat('white'));
  plinth.position.y = PLINTH_H / 2;
  stage.add(plinth);

  const post = mesh(new THREE.CylinderGeometry(0.02, 0.035, POST_H, 16), mat('grey'));
  post.position.set(CONE_X, PLINTH_H + POST_H / 2, 0);
  stage.add(post);

  // cylinder (open top, glassy), with orange liquid inside
  cylG = shape.group();
  cylG.position.set(CYL_X, PLINTH_H, 0);
  stage.add(cylG);
  cylShell = mesh(unitCyl(true), glass('teal', 0.28));
  cylFloor = mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), glass('teal', 0.45));
  cylFloor.position.y = 0.004;
  cylLiquid = mesh(unitCyl(false), mat('orange'));
  cylRim = mesh(unitRing(), solid('teal'));
  cylG.add(cylShell, cylFloor, cylLiquid, cylRim);
  for (let i = 0; i < 8; i++){                 // level rings left behind after each pour
    const m = mesh(unitRing(), solid('white'));
    m.visible = false;
    marks.push(m);
    cylG.add(m);
  }

  // cone (tip down, open top, same base and height as the cylinder)
  coneG = shape.group();
  stage.add(coneG);
  coneShell = mesh(unitCone(true), glass('purple', 0.3));
  coneLiquid = mesh(unitCone(false), mat('orange'));
  coneRim = mesh(unitRing(), solid('purple'));
  coneG.add(coneShell, coneLiquid, coneRim);

  // thin stream used while pouring
  const sg = new THREE.CylinderGeometry(0.012, 0.012, 1, 10);
  sg.translate(0, -0.5, 0);
  stream = mesh(sg, mat('orange'));
  stream.visible = false;
  stage.add(stream);

  place(stage, { dist: 'room', dir: 'ahead', height: 'floor', anchor: 'bottom' });

  // opening card: ahead, eye height
  card = label(INTRO, { size: 'comfortable', width: 1.5, dist: 'room', dir: 'ahead', height: 'eye', title: true, theme: 'dark', accent: '#ffb74d' });
  lastText = INTRO;

  // 1) guess first
  guessRow = ui.choices(['1 cone', '2 cones', '3 cones', '4 cones'], {
    dist: 'near', dir: 'ahead-left', height: 'chest',
    onPick: (i, text, row) => {
      guess = i + 1;
      row.lock();
      tone(520, 0.1, 'sine');
      say('Your guess: ' + guess + (guess === 1 ? ' cone' : ' cones') + '\nPress Pour and watch the cylinder.');
    }
  });
  label('Your guess', { above: guessRow, size: 'small' });

  // 2) pour (repeatable)
  ui.button('Pour', { onPress: pour, color: 'orange', dist: 'near', dir: 'ahead', height: 'waist' });

  // 3) size of both containers
  sizeSlider = ui.slider({
    min: 0.7, max: 1.2, value: 1, step: 0.05,
    dist: 'near', dir: 'ahead-right', height: 'chest',
    onChange: v => { if (ready) applySize(v); }
  });
  label('Size', { above: sizeSlider, size: 'small' });

  measure();
  layout();
  resetAll();
  ready = true;
}

function frame(dt, t){
  if (!ready || phase === 'idle') return;
  ph += dt;
  if (phase === 'up'){
    const k = Math.min(1, ph / MOVE_T);
    const e = ease(k);
    coneG.position.lerpVectors(restPos, pourPos, e);
    coneG.position.y += Math.sin(Math.PI * k) * 0.15;
    if (k >= 1){ phase = 'drain'; ph = 0; stream.visible = true; }
  } else if (phase === 'drain'){
    const p = Math.min(1, ph / DRAIN_T);
    const moved = coneVol * p;
    setConeVolume(coneVol - moved);
    const level = setCylVolume(poured + moved);
    const apexY = pourPos.y;
    const surfaceY = PLINTH_H + level;
    stream.position.set(CYL_X, apexY, 0);
    stream.scale.set(sizeScale, Math.max(0.01, apexY - surfaceY), sizeScale);
    if (p >= 1){
      poured += coneVol;
      pours += 1;
      stream.visible = false;
      showMark(pours, poured);
      if (poured >= cylVol * 0.999){
        reveal();
      } else {
        say(pours + (pours === 1 ? ' cone' : ' cones') + ' poured\nCylinder is ' + Math.round(100 * poured / cylVol) + '% full. Pour again.');
        tone(500, 0.12, 'triangle');
      }
      phase = 'down'; ph = 0;
    }
  } else if (phase === 'down'){
    const k = Math.min(1, ph / MOVE_T);
    const e = ease(k);
    coneG.position.lerpVectors(pourPos, restPos, e);
    coneG.position.y += Math.sin(Math.PI * k) * 0.15;
    if (k >= 1){ phase = 'refill'; ph = 0; }
  } else if (phase === 'refill'){
    const k = Math.min(1, ph / REFILL_T);
    setConeVolume(coneVol * k);
    if (k >= 1){ phase = 'idle'; ph = 0; }
  }
}

XR.run({ build, frame });
