const { THREE, shape, place, label, ui, tone, mat, sky, ground } = XR;

const R = 0.11, CH = 0.22, TOP = 0.9;            // cone and cylinder share the same radius and height
const COL = [0xff9f1c, 0xff5d8f, 0x2ec4b6];      // one colour per cone-full
const REST = new THREE.Vector3(-0.3, 0.12, 0);   // cone apex at rest (local to the tabletop)
const POUR = new THREE.Vector3(0.3, CH + 0.07, 0); // cone apex while pouring (above the cylinder)
let cone, coneLiquid, stream, info;
const layers = [];
let phase = 'idle', pt = 0, k = 0;

function glass(color, a){
  const m = mat(color, { opacity: a, transparent: true });
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  return m;
}
function ease(x){ return x * x * (3 - 2 * x); }

// cone liquid is a similar cone about the apex, so volume fraction v -> scale cbrt(v)
function setCone(v){
  const s = Math.cbrt(Math.max(v, 0));
  coneLiquid.scale.setScalar(Math.max(s, 1e-3));
  coneLiquid.visible = v > 0.001;
}
function fillLayer(i, q){
  layers[i].scale.y = Math.max(q * CH / 3, 1e-4);
  layers[i].position.y = i * CH / 3 + q * CH / 6;
}
function movePour(e){
  cone.position.lerpVectors(REST, POUR, e);
  cone.position.y += Math.sin(e * Math.PI) * 0.12;
}

function build(){
  ground({ color: 'teal', grid: false, arrow: false });
  sky({ top: 'blue', bottom: 'pink' });

  const rig = shape.group();
  const plinth = shape.box(1.0, TOP, 0.4, 'purple');
  plinth.position.y = TOP / 2;
  rig.add(plinth);
  const top = shape.group();
  top.position.y = TOP;
  rig.add(top);

  // cylinder: glass shell, three coloured liquid layers, marks at 1/3 and 2/3
  const cyl = shape.group();
  cyl.position.set(0.3, 0, 0);
  top.add(cyl);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, CH, 40, 1, true), glass(0xffffff, 0.18));
  shell.position.y = CH / 2;
  cyl.add(shell);
  const lg = new THREE.CylinderGeometry(R, R, 1, 40);
  for (let i = 0; i < 3; i++){
    const m = new THREE.Mesh(lg, mat(COL[i]));
    m.scale.y = 1e-4;
    m.position.y = i * CH / 3;
    cyl.add(m);
    layers.push(m);
  }
  for (let i = 1; i <= 2; i++){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.07, 0.003, 6, 48), mat(0xffffff));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i * CH / 3;
    cyl.add(ring);
  }

  // cone: point down, held on a small stand
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 24), mat(0xffffff));
  disc.position.set(-0.3, 0.005, 0);
  top.add(disc);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12), mat(0xffffff));
  rod.position.set(-0.3, 0.06, 0);
  top.add(rod);

  cone = shape.group();
  cone.position.copy(REST);
  top.add(cone);
  const gl = new THREE.ConeGeometry(R, CH, 40);
  gl.translate(0, -CH / 2, 0);
  gl.rotateX(Math.PI);                            // apex at origin, opening upward
  const gs = new THREE.ConeGeometry(R, CH, 40, 1, true);
  gs.translate(0, -CH / 2, 0);
  gs.rotateX(Math.PI);
  const coneShell = new THREE.Mesh(gs, glass(0x8ecae6, 0.28));
  coneShell.scale.set(1.06, 1, 1.06);
  coneLiquid = new THREE.Mesh(gl, mat(COL[0]));
  cone.add(coneShell);
  cone.add(coneLiquid);

  // thin stream from the cone tip into the cylinder
  stream = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 10), mat(COL[0]));
  stream.scale.y = 1e-3;
  stream.position.set(POUR.x, CH, 0);
  stream.visible = false;
  top.add(stream);

  place(rig, { dist: 'near', dir: 'ahead', height: 'floor', anchor: 'bottom' });

  ui.button('Pour', { onPress: press, color: 'orange', dist: 'reach', dir: 'ahead', height: 'waist' });

  info = label('How many cones fill the cylinder?\nPress Pour', {
    size: 'large', width: 1.6, dist: 'room', dir: 'ahead', height: 'eye',
    anchor: 'top', theme: 'dark', title: true, accent: '#ff9f1c'
  });
}

function press(){
  if (phase !== 'idle') return;
  if (k >= 3){
    phase = 'reset'; pt = 0;
    coneLiquid.material.color.setHex(COL[0]);
    info.setText('How many cones fill the cylinder?\nPress Pour');
    tone(330, 0.2, 'triangle');
    return;
  }
  phase = 'in'; pt = 0;
  coneLiquid.material.color.setHex(COL[k]);
  stream.material.color.setHex(COL[k]);
  tone(520, 0.12, 'triangle');
}

function frame(dt, t){
  if (phase === 'idle') return;

  if (phase === 'in'){
    pt += dt / 0.8;
    movePour(ease(Math.min(pt, 1)));
    if (pt >= 1){ phase = 'drain'; pt = 0; stream.visible = true; tone(300, 0.25, 'sine'); }
  }
  else if (phase === 'drain'){
    pt += dt / 1.8;
    const u = Math.min(pt, 1);
    setCone(1 - u);
    fillLayer(k, u);
    const a = cone.position.y;
    const s = k * CH / 3 + u * CH / 3;
    stream.position.y = (a + s) / 2;
    stream.scale.y = Math.max(a - s, 1e-3);
    if (u >= 1){
      stream.visible = false;
      k++;
      if (k < 3){
        info.setText(k + '/3 full\n' + k + ' cone' + (k > 1 ? 's' : '') + ' poured');
        tone(600 + k * 100, 0.15, 'triangle');
      } else {
        info.setText('3 cones fill 1 cylinder\nSo a cone is 1/3 of a cylinder:\nV = 1/3 πr²h');
        tone(784, 0.5, 'triangle');
      }
      phase = 'out'; pt = 0;
    }
  }
  else if (phase === 'out'){
    pt += dt / 0.8;
    movePour(1 - ease(Math.min(pt, 1)));
    if (pt >= 1){
      if (k < 3){ coneLiquid.material.color.setHex(COL[k]); phase = 'refill'; pt = 0; }
      else phase = 'idle';
    }
  }
  else if (phase === 'refill'){
    pt += dt / 0.6;
    setCone(Math.min(pt, 1));
    if (pt >= 1) phase = 'idle';
  }
  else if (phase === 'reset'){
    pt += dt / 0.8;
    const u = Math.min(pt, 1);
    for (let i = 0; i < 3; i++){
      layers[i].scale.y = Math.max(CH / 3 * (1 - u), 1e-4);
      layers[i].position.y = (i * CH / 3 + CH / 6) * (1 - u);
    }
    setCone(u);
    if (pt >= 1){ k = 0; phase = 'idle'; }
  }
}

XR.run({ build, frame });
