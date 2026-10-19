const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

// ---- Scene quantities (metres). Cone and cylinder share the same radius and height. ----
const R = 0.1, HT = 0.25, TABLE_H = 0.75, BASE = 0.01;
const CYL_X = 0.3, CONE_X = -0.3;
const HOME_Y = TABLE_H + 0.07;                    // cone tip rests on its little stand
const POUR_Y = TABLE_H + BASE + HT * 1.04 + 0.10; // cone tip hovers above the cylinder rim
const AREA = Math.PI * R * R;
const CYL_VOL = AREA * HT;                        // straight-sided: base area x height

// Cone volume is measured by adding up thin slices (point down): the slice at height y has radius R*y/HT.
const SLICES = 400;
const coneCum = new Float64Array(SLICES + 1);     // coneCum[i] = water volume when the cone is filled to depth i/SLICES*HT
for (let i = 1; i <= SLICES; i++) {
  const y = (i - 0.5) / SLICES * HT;
  const rr = R * y / HT;
  coneCum[i] = coneCum[i - 1] + Math.PI * rr * rr * (HT / SLICES);
}
const CONE_VOL = coneCum[SLICES];
function coneDepth(v) {
  if (v <= 0) return 0;
  if (v >= CONE_VOL) return HT;
  let lo = 0, hi = SLICES;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (coneCum[m] <= v) lo = m; else hi = m; }
  const f = (v - coneCum[lo]) / (coneCum[hi] - coneCum[lo]);
  return (lo + f) / SLICES * HT;
}

const COLORS = [0xff8a3d, 0xff5fa2, 0x2ec4b6, 0xffd23f];
const READY = 0x2fbf71, BUSY = 0x8a8f98, AGAIN = 0xff8a3d;

let coneG, coneLiquid, stream, layers = [], card, status, btn, btnLabel;
let phase = 'idle', pt = 0, nPours = 0, vIn = 0, vCone = CONE_VOL, pourStartV = 0, full = false;

const ease = u => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = u => Math.max(0, Math.min(1, u));

function glass() {
  return mat(0xffffff, { opacity: 0.22, transparent: true, side: THREE.DoubleSide, depthWrite: false });
}
function coneGeo(r, h, open) {                    // apex at the origin, opening upward
  const g = new THREE.ConeGeometry(r, h, 48, 1, open);
  g.rotateX(Math.PI);
  g.translate(0, h / 2, 0);
  return g;
}

function setConeLiquid(v) {
  const s = coneDepth(v) / HT;
  coneLiquid.visible = s > 1e-4;
  coneLiquid.scale.setScalar(Math.max(s, 1e-4));
}
function setLayers() {
  for (let i = 0; i < layers.length; i++) {
    const v = Math.max(0, Math.min(CONE_VOL, vIn - i * CONE_VOL));
    const h = v / AREA;
    const m = layers[i];
    m.visible = h > 1e-5;
    m.scale.y = Math.max(h, 1e-5);
    m.position.y = TABLE_H + BASE + (i * CONE_VOL) / AREA + h / 2;
  }
}
function updateStream(q) {
  const surfaceY = TABLE_H + BASE + vIn / AREA;
  const len = Math.max(POUR_Y - surfaceY, 0.001);
  stream.visible = q < 1;
  stream.scale.y = len;
  stream.position.set(CYL_X, (POUR_Y + surfaceY) / 2, 0);
}
function pose(w) {                                // w = 0 at home, 1 over the cylinder
  const x = lerp(CONE_X, CYL_X, ease(clamp01((w - 0.3) / 0.7)));
  const y = lerp(HOME_Y, POUR_Y, ease(clamp01(w * 2)));
  coneG.position.set(x, y, 0);
}
function statusText() {
  const pct = Math.round(100 * vIn / CYL_VOL);
  return 'Cones poured: ' + nPours + '     Cylinder: ' + pct + '% full';
}
function introText() {
  return 'Cone and cylinder\nSame base, same height. Each pour is one full cone of water, cone point down.\nPoint at the green button and pull the trigger.';
}

function onPour() {
  if (phase !== 'idle') return;
  if (full) { resetAll(); return; }
  tone(520, 0.08, 'triangle');
  pourStartV = vIn;
  const c = COLORS[nPours % COLORS.length];
  coneLiquid.material.color.setHex(c);
  stream.material.color.setHex(c);
  phase = (vCone < CONE_VOL * 0.999) ? 'refill' : 'lift';
  pt = 0;
  btnLabel.setText('Pouring');
  btn.material.color.setHex(BUSY);
}

function endPour() {
  phase = 'return';
  pt = 0;
  stream.visible = false;
  vCone = 0;
  setConeLiquid(0);
  nPours++;
  full = vIn >= CYL_VOL * (1 - 1e-4);
  status.setText(statusText());
  if (full) {
    card.setText('V = 1/3 πr²h\n' + nPours + ' cones filled the cylinder exactly (same base, same height), so one cone is 1/' + nPours + ' of the cylinder.\nPress Start over to watch it again.');
    tone(660, 0.12, 'sine');
    setTimeout(() => tone(880, 0.2, 'sine'), 130);
  } else {
    const pct = Math.round(100 * vIn / CYL_VOL);
    card.setText('Pour ' + nPours + ' done\nThe cylinder is ' + pct + '% full.\nPull the trigger on the button to pour another cone.');
    tone(400, 0.1, 'triangle');
  }
}

function endReturn() {
  phase = 'idle';
  pose(0);
  if (full) {
    btnLabel.setText('Start over');
    btn.material.color.setHex(AGAIN);
  } else {
    btnLabel.setText('Pour');
    btn.material.color.setHex(READY);
  }
}

function resetAll() {
  tone(330, 0.1, 'triangle');
  nPours = 0; vIn = 0; vCone = CONE_VOL; full = false; phase = 'idle';
  coneLiquid.material.color.setHex(COLORS[0]);
  stream.material.color.setHex(COLORS[0]);
  setConeLiquid(vCone);
  setLayers();
  stream.visible = false;
  pose(0);
  status.setText(statusText());
  card.setText(introText());
  btnLabel.setText('Pour');
  btn.material.color.setHex(READY);
}

function build() {
  ground({ color: 'green', grid: false, arrow: false });

  const stage = shape.group();
  const table = shape.box(1.4, TABLE_H, 0.7, 0x7b61ff);
  table.position.set(0, TABLE_H / 2, 0);
  stage.add(table);

  // Cylinder (glass) with stacked water layers, one per pour
  const cylBase = shape.cylinder(R * 1.06, BASE, 'white');
  cylBase.position.set(CYL_X, TABLE_H + BASE / 2, 0);
  stage.add(cylBase);
  const shellH = HT * 1.04;
  const cylShell = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, shellH, 48, 1, true), glass());
  cylShell.position.set(CYL_X, TABLE_H + BASE + shellH / 2, 0);
  stage.add(cylShell);
  const cylRim = shape.torus(R * 1.04, 0.004, 'white');
  cylRim.rotation.x = Math.PI / 2;
  cylRim.position.set(CYL_X, TABLE_H + BASE + shellH, 0);
  stage.add(cylRim);
  for (let i = 0; i < COLORS.length; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 48), mat(COLORS[i], { opacity: 0.92, transparent: true }));
    m.position.set(CYL_X, TABLE_H + BASE, 0);
    m.visible = false;
    stage.add(m);
    layers.push(m);
  }

  // Cone (glass, point down) on a little stand, full of water
  const stand = shape.cylinder(0.035, 0.07, 'yellow');
  stand.position.set(CONE_X, TABLE_H + 0.035, 0);
  stage.add(stand);
  coneG = shape.group();
  const coneShell = new THREE.Mesh(coneGeo(R * 1.04, HT * 1.04, true), glass());
  coneG.add(coneShell);
  const coneRim = shape.torus(R * 1.04, 0.004, 'white');
  coneRim.rotation.x = Math.PI / 2;
  coneRim.position.y = HT * 1.04;
  coneG.add(coneRim);
  coneLiquid = new THREE.Mesh(coneGeo(R, HT, false), mat(COLORS[0], { opacity: 0.92, transparent: true }));
  coneG.add(coneLiquid);
  coneG.position.set(CONE_X, HOME_Y, 0);
  stage.add(coneG);
  setConeLiquid(vCone);

  // Thin stream from the cone tip down to the water surface
  stream = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 10), mat(COLORS[0]));
  stream.visible = false;
  stage.add(stream);

  place(stage, { dist: 1.2, dir: 'ahead', height: 'floor', anchor: 'bottom' });

  // Status written on the front of the table
  status = label(statusText(), { parent: table, at: [0, 0.28, 0.38], capHeight: 0.035, bg: false });

  // Pour button
  btn = shape.box(0.4, 0.14, 0.05, READY);
  place(btn, { dist: 0.7, dir: 'ahead', height: 'waist' });
  btnLabel = label('Pour', { parent: btn, at: [0, 0, 0.055], capHeight: 0.04, bg: false });
  interactive(btn, { select: () => onPour() });

  // Opening card
  card = label(introText(), { size: 'comfortable', width: 1.8, dist: 'room', dir: 'ahead', height: 'eye', theme: 'dark', title: true, accent: '#ff8a3d', anchor: 'top' });
}

function frame(dt, t) {
  if (phase === 'idle') return;
  dt = Math.min(dt, 0.05);
  pt += dt;
  if (phase === 'refill') {
    const u = Math.min(pt / 0.7, 1);
    vCone = CONE_VOL * u;
    setConeLiquid(vCone);
    if (u >= 1) { phase = 'lift'; pt = 0; }
  } else if (phase === 'lift') {
    const u = Math.min(pt / 1.0, 1);
    pose(u);
    if (u >= 1) { phase = 'pour'; pt = 0; }
  } else if (phase === 'pour') {
    const q = Math.min(pt / 3.0, 1);
    vCone = CONE_VOL * (1 - q);
    vIn = pourStartV + CONE_VOL * q;
    setConeLiquid(vCone);
    setLayers();
    updateStream(q);
    if (q >= 1) endPour();
  } else if (phase === 'return') {
    const u = Math.min(pt / 1.0, 1);
    pose(1 - u);
    if (u >= 1) endReturn();
  }
}

XR.run({ build, frame });
