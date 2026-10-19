const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

// Cone and cylinder share the same radius R and height HT.
const R = 0.11, HT = 0.22;
const TOP = 0.04;                       // table top (local to the rig)
const CYL_X = 0.25, CONE_X = -0.25;
const REST_Y = TOP + 0.10 + HT / 2;     // cone centre while resting on its stand
const HOVER_Y = TOP + HT + 0.05 + HT / 2; // cone centre while hovering above the cylinder
const AREA = Math.PI * R * R;
const SLICES = 400;

// Volume of liquid in the cone up to a depth measured from its tip: add up thin round slices.
function coneVolume(depth) {
  const dy = depth / SLICES;
  let v = 0;
  for (let i = 0; i < SLICES; i++) {
    const y = (i + 0.5) * dy;
    const r = R * y / HT;
    v += Math.PI * r * r * dy;
  }
  return v;
}
const V_CONE = coneVolume(HT);
const V_CYL = AREA * HT;
const ease = p => p * p * (3 - 2 * p);
const lerp = (a, b, p) => a + (b - a) * p;

const INTRO = 'Cone and cylinder\nSame radius r, same height h, same liquid. How many cones fill the cylinder?\nPoint at the green Pour button and pull the trigger.';

let rig, cone, coneLiquid, cyl, cylLiquid, stream, card, lesson, pourBtn;
let ticks = [];
let state = 'idle', ph = 0, poured = 0, pours = 0, ready = false;

function setConeFill(s) {
  coneLiquid.visible = s > 0.002;
  const k = Math.max(s, 0.001) * 0.96;
  coneLiquid.scale.setScalar(k);
  coneLiquid.position.y = (HT / 2) * (1 - k); // keeps the tip fixed while the level drops
}

function setCylFill(vol) {
  const h = Math.min(vol / AREA, HT - 0.004);
  cylLiquid.visible = h > 0.002;
  cylLiquid.scale.y = Math.max(h, 0.001);
  cylLiquid.position.y = -HT / 2 + h / 2;
  return h;
}

function updateStream(h) {
  const tipY = cone.position.y - HT / 2;
  const surf = TOP + h;
  const len = tipY - surf;
  stream.visible = len > 0.003;
  stream.scale.y = Math.max(len, 0.001);
  stream.position.set(CYL_X, surf + len / 2, 0);
}

function moveCone(p) {
  cone.position.set(lerp(CONE_X, CYL_X, p), lerp(REST_Y, HOVER_Y, p) + 0.05 * Math.sin(Math.PI * p), 0);
}

function setBtn(t) {
  if (pourBtn && typeof pourBtn.setText === 'function') pourBtn.setText(t);
}

function hideResults() {
  ticks.forEach(t => { t.ring.visible = false; t.lbl.visible = false; });
  lesson.visible = false;
}

function onPour() {
  if (state !== 'idle') return;
  if (poured >= V_CYL * 0.995) {
    hideResults();
    state = 'empty'; ph = 0;
    setBtn('Pour');
    card.setText('Emptying the cylinder\nThe cone is full again.\nPoint at Pour and pull the trigger to repeat.');
    tone(330, 0.15, 'triangle');
    return;
  }
  state = 'in'; ph = 0;
  tone(520, 0.1, 'triangle');
  card.setText('Pouring cone ' + (pours + 1) + '\nThe cone drains through its tip into the cylinder.\nWatch the level rise.');
}

function finishPour() {
  pours++;
  const frac = poured / V_CYL;
  ticks.forEach(t => {
    const on = poured >= t.need * 0.999;
    t.ring.visible = on;
    t.lbl.visible = on;
  });
  if (frac >= 0.995) {
    const n = V_CYL / V_CONE;
    lesson.setText('V = 1/3 πr²h\nThe cylinder holds ' + n.toFixed(2) + ' cones, so one cone is a third.');
    lesson.visible = true;
    card.setText('Full after ' + pours + ' pours\nSame radius, same height: the cone is a third of the cylinder.\nPress the button again to empty and repeat.');
    setBtn('Empty and repeat');
    tone(660, 0.12, 'sine');
    setTimeout(() => tone(880, 0.2, 'sine'), 130);
  } else {
    card.setText('Pour ' + pours + ' done\nThe cylinder is ' + Math.round(frac * 100) + '% full.\nPoint at Pour and pull the trigger again.');
    tone(600, 0.1, 'sine');
  }
  state = 'idle';
}

function build() {
  ground({ color: 'teal', grid: false, arrow: false });
  input.teleport = 'none';

  rig = shape.group();

  const slab = shape.box(1.2, TOP, 0.5, 'purple');
  slab.position.set(0, TOP / 2, 0);
  rig.add(slab);

  const stand = shape.cylinder(0.01, 0.10, 'grey');
  stand.position.set(CONE_X, TOP + 0.05, 0);
  rig.add(stand);

  const glass = c => mat(c, { opacity: 0.28, transparent: true, depthWrite: false, side: THREE.DoubleSide });

  // Cylinder (glass) with its liquid and rim
  cyl = shape.cylinder(R, HT, 'teal');
  cyl.material = glass('teal');
  cyl.position.set(CYL_X, TOP + HT / 2, 0);
  rig.add(cyl);
  cylLiquid = shape.cylinder(R * 0.96, 1, 'orange');
  cylLiquid.visible = false;
  cyl.add(cylLiquid);
  const rimC = shape.torus(R, 0.004, 'white');
  rimC.rotation.x = Math.PI / 2;
  rimC.position.y = HT / 2;
  cyl.add(rimC);

  // Cone (glass, point down) with its liquid and rim
  cone = shape.cone(R, HT, 'pink');
  cone.material = glass('pink');
  cone.rotation.x = Math.PI;
  cone.position.set(CONE_X, REST_Y, 0);
  rig.add(cone);
  coneLiquid = shape.cone(R, HT, 'orange');
  cone.add(coneLiquid);
  setConeFill(1);
  const rimK = shape.torus(R, 0.004, 'white');
  rimK.rotation.x = Math.PI / 2;
  rimK.position.y = -HT / 2;
  cone.add(rimK);

  // Thin stream from the cone tip to the liquid surface
  stream = shape.cylinder(0.007, 1, 'orange');
  stream.visible = false;
  rig.add(stream);

  place(rig, { dist: 'near', dir: 'ahead', height: 'hip', anchor: 'bottom' });

  label('cone', { parent: slab, at: [CONE_X, 0, 0.28], capHeight: 0.022, bg: false });
  label('cylinder', { parent: slab, at: [CYL_X, 0, 0.28], capHeight: 0.022, bg: false });

  // Level marks: where the liquid reaches after k cones (computed from the volumes), shown only once reached
  for (let k = 1; ; k++) {
    const lvl = k * V_CONE / AREA;
    if (lvl > HT * 1.001) break;
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push([(R + 0.004) * Math.cos(a), lvl - HT / 2, (R + 0.004) * Math.sin(a)]);
    }
    const ring = shape.line(pts, 'white');
    ring.visible = false;
    cyl.add(ring);
    const lbl = label('pour ' + k, { parent: cyl, at: [R + 0.08, lvl - HT / 2, 0], capHeight: 0.02, bg: false });
    lbl.visible = false;
    ticks.push({ ring, lbl, need: k * V_CONE });
  }

  lesson = label('V = 1/3 πr²h\n.', { parent: cyl, at: [0, HT / 2 + 0.2, 0], width: 0.7, size: 'comfortable', theme: 'dark', title: true, accent: '#ffb300' });
  lesson.visible = false;

  card = label(INTRO, { size: 'comfortable', width: 1.3, dist: 'room', dir: 'ahead', height: 'eye', theme: 'dark', title: true, accent: '#ffb300' });

  pourBtn = ui.button('Pour', { onPress: onPour, color: 'green', dist: 'reach', dir: 'ahead', height: 'waist' });

  ready = true;
}

function frame(dt, t) {
  if (!ready || state === 'idle') return;
  dt = Math.min(dt, 0.05);
  if (state === 'in') {
    ph = Math.min(1, ph + dt / 0.8);
    moveCone(ease(ph));
    if (ph >= 1) { state = 'drain'; ph = 0; }
  } else if (state === 'drain') {
    ph = Math.min(1, ph + dt / 2.4);
    const depth = HT * (1 - ph);
    setConeFill(depth / HT);
    const v = poured + V_CONE - coneVolume(depth);
    const h = setCylFill(v);
    updateStream(h);
    if (ph >= 1) {
      poured = v;
      stream.visible = false;
      state = 'out'; ph = 0;
    }
  } else if (state === 'out') {
    ph = Math.min(1, ph + dt / 0.8);
    moveCone(1 - ease(ph));
    if (ph >= 1) { state = 'refill'; ph = 0; }
  } else if (state === 'refill') {
    ph = Math.min(1, ph + dt / 0.7);
    setConeFill(ease(ph));
    if (ph >= 1) finishPour();
  } else if (state === 'empty') {
    ph = Math.min(1, ph + dt / 1.2);
    setCylFill(poured * (1 - ease(ph)));
    if (ph >= 1) {
      poured = 0; pours = 0;
      setCylFill(0);
      card.setText(INTRO);
      state = 'idle';
    }
  }
}

XR.run({ build, frame });
