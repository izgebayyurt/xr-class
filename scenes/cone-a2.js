const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

// Cone and cylinder share the same radius and height (R, HT).
const R = 0.2, HT = 0.4, H3 = HT / 3;
const TOP = 0.85;            // table top
const BASE = 1.10;           // bottom of cylinder / tip of resting cone (on stands)
const CX = 0.55;             // cylinder at +CX, cone at -CX (table-local metres)
const HEX = [0xff6fae, 0xffd23f, 0x20c8b4];   // one colour per pour
const T_MOVE = 1.0, T_DRAIN = 2.2, T_BACK = 1.0;

const rest = new THREE.Vector3(-CX, BASE, 0);
const over = new THREE.Vector3(CX, BASE + HT + 0.12, 0);
const layers = [];
let coneG, coneLq, coneMesh, cylG, stream, readout, lesson;
let count = 0, state = 'idle', tt = 0;

const smooth = u => u * u * (3 - 2 * u);

function setCone(f){
  coneLq.scale.setScalar(Math.max(0.001, Math.cbrt(f)));   // volume ~ scale^3
  coneLq.visible = f > 0.001;
}

function reset(){
  layers.forEach(m => { m.visible = false; m.scale.y = 0.001; });
  count = 0;
  lesson.visible = false;
  readout.set(0);
  coneMesh.material.color.setHex(HEX[0]);
  setCone(1);
}

function pour(){
  if (state !== 'idle') return;
  if (count >= 3) reset();
  state = 'move';
  tt = 0;
  tone(420, 0.15, 'triangle');
}

function build(){
  sky({ top: 'purple', bottom: 'pink' });
  ground({ color: 'teal', grid: false, arrow: false });

  const stage = shape.group();

  // table, column, stands
  const slab = shape.box(2.0, 0.05, 0.8, 'dark');
  slab.position.set(0, TOP - 0.025, 0);
  const col = shape.cylinder(0.08, TOP - 0.05, 'grey');
  col.position.set(0, (TOP - 0.05) / 2, 0);
  const stem = shape.cylinder(0.025, 0.25, 'grey');
  stem.position.set(-CX, TOP + 0.125, 0);
  const disc = shape.cylinder(0.12, 0.03, 'grey');
  disc.position.set(-CX, TOP + 0.015, 0);
  const plinth = shape.cylinder(0.24, 0.25, 'grey');
  plinth.position.set(CX, TOP + 0.125, 0);
  stage.add(slab, col, stem, disc, plinth);

  // cylinder: glass shell, three liquid layers (one per pour), thirds rings
  cylG = shape.group();
  const cShell = shape.cylinder(0.21, HT, 'white');
  cShell.material = mat('white', { opacity: 0.22, transparent: true, depthWrite: false });
  cShell.position.y = HT / 2;
  cylG.add(cShell);
  for (let k = 0; k < 3; k++){
    const m = shape.cylinder(R, H3, HEX[k]);
    m.material = mat(HEX[k]);
    m.scale.y = 0.001;
    m.position.y = k * H3;
    m.visible = false;
    cylG.add(m);
    layers.push(m);
  }
  [H3, 2 * H3, HT].forEach(y => {
    const ring = shape.torus(0.212, 0.005, 'white');
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    cylG.add(ring);
  });
  cylG.position.set(CX, BASE, 0);
  stage.add(cylG);

  // cone (tip down, origin at the tip): glass shell + liquid that scales about the tip
  coneG = shape.group();
  const kShell = shape.cone(0.215, HT, 'white');
  kShell.material = mat('white', { opacity: 0.22, transparent: true, depthWrite: false });
  kShell.rotation.z = Math.PI;
  kShell.position.y = HT / 2;
  coneG.add(kShell);
  const kRing = shape.torus(0.215, 0.005, 'white');
  kRing.rotation.x = Math.PI / 2;
  kRing.position.y = HT;
  coneG.add(kRing);
  coneLq = shape.group();
  coneMesh = shape.cone(R, HT, HEX[0]);
  coneMesh.material = mat(HEX[0]);
  coneMesh.rotation.z = Math.PI;
  coneMesh.position.y = HT / 2;
  coneLq.add(coneMesh);
  coneG.add(coneLq);
  coneG.position.copy(rest);
  stage.add(coneG);

  // thin stream from the cone tip to the liquid surface
  stream = shape.cylinder(0.012, 1, HEX[0]);
  stream.material = mat(HEX[0]);
  stream.scale.y = 0.001;
  stream.position.set(CX, BASE + HT, 0);
  stream.visible = false;
  stage.add(stream);

  place(stage, { dist: 'room', dir: 'ahead', height: 'floor', anchor: 'bottom' });
  stage.updateMatrixWorld(true);

  // UI
  ui.button('Pour', { color: 'green', dist: 'near', dir: 'ahead', height: 'waist', onPress: pour });
  readout = ui.readout('Cones poured: ', { units: ' of 3', decimals: 0, dist: 'near', dir: 'ahead', height: 'chest' });
  readout.set(0);

  lesson = label('3 cones fill 1 cylinder: V = 1/3 πr²h', { above: cylG, size: 'large', width: 1.8, theme: 'dark', accent: '#ffd23f' });
  lesson.visible = false;
}

function frame(dt, t){
  if (state === 'idle') return;
  tt += dt;
  const k = count;   // layer being filled this pour

  if (state === 'move'){
    const u = Math.min(1, tt / T_MOVE);
    const ey = smooth(Math.min(1, u * 1.6));
    coneG.position.set(
      THREE.MathUtils.lerp(rest.x, over.x, smooth(u)),
      THREE.MathUtils.lerp(rest.y, over.y, ey), 0);
    if (u >= 1){
      state = 'drain'; tt = 0;
      layers[k].visible = true;
      stream.material.color.setHex(HEX[k]);
      stream.visible = true;
    }
  } else if (state === 'drain'){
    const p = Math.min(1, tt / T_DRAIN);
    setCone(1 - p);
    const lay = layers[k];
    lay.scale.y = Math.max(0.001, p);
    lay.position.y = k * H3 + H3 * lay.scale.y / 2;
    const surf = BASE + k * H3 + H3 * p;
    stream.scale.y = Math.max(0.001, over.y - surf);
    stream.position.set(CX, (over.y + surf) / 2, 0);
    if (p >= 1){
      stream.visible = false;
      count++;
      readout.set(count);
      state = 'back'; tt = 0;
      tone(count === 3 ? 880 : 600, count === 3 ? 0.35 : 0.12, 'triangle');
    }
  } else if (state === 'back'){
    const u = Math.min(1, tt / T_BACK);
    coneG.position.set(
      THREE.MathUtils.lerp(over.x, rest.x, smooth(u)),
      THREE.MathUtils.lerp(over.y, rest.y, smooth(Math.max(0, (u - 0.35) / 0.65))), 0);
    if (u >= 1){
      coneG.position.copy(rest);
      coneMesh.material.color.setHex(HEX[count % 3]);
      setCone(1);
      if (count === 3) lesson.visible = true;
      state = 'idle';
    }
  }
}

XR.run({ build, frame });
