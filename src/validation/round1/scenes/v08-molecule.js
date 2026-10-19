const { THREE, scene, shape, place, label, interactive, tone, mat, sky, ground, ui, geo, template, H, C, input, onButton, stations } = XR;

// Water, shown as a simple repulsion model: four electron clouds around oxygen
// (2 bonds + 2 lone pairs) sit on a sphere and push each other away.
// Lone-pair clouds are fatter, so they push harder. The angle is read off the result.

const L = 0.2;          // drawn O-H bond length (m)
const LPD = 0.12;       // lone-pair cloud centre distance from O (m)
const W_BB = 1, W_BL = 1.25, W_LL = 1.5;   // push strength: bond-bond, bond-lone, lone-lone
const SC = Math.sqrt(1 / 3), SS = Math.sqrt(2 / 3);
const RULE = 'Model: each cloud pushes the others away; lone pairs push harder.';
const START = 'Water molecule\nIs H-O-H a straight line or bent? Make your guess: point at an answer and click (or pull the trigger).';
const UP = new THREE.Vector3(0, 1, 0);
const D = [0, 1, 2, 3].map(() => new THREE.Vector3());   // cloud directions from O: 0,1 = bonds, 2,3 = lone pairs
const F = [0, 1, 2, 3].map(() => new THREE.Vector3());
const tmp = new THREE.Vector3();

let card, row, toggleBtn, againBtn, readout, mol;
const hs = [], bonds = [], lps = [];
let lpOn = false, lpS = 0, state = 'guess', reported = true;
let quiet = 0, since = 0, now = 0, revealAt = 0, shown = -999;

function seed() {
  D[0].set(SS, -SC, 0);
  D[1].set(-SS, -SC, 0);
  D[2].set(0, SC, SS);
  D[3].set(0, SC, -SS);
}

function weight(i, j) {
  const bi = i < 2, bj = j < 2;
  if (bi && bj) return W_BB;
  if (!bi && !bj) return W_LL;
  return W_BL;
}

// a few steps of "every cloud pushes the others away" on the unit sphere
function relax(n, step) {
  const m = lpOn ? 4 : 2;
  let moved = 0;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < m; i++) {
      F[i].set(0, 0, 0);
      for (let j = 0; j < m; j++) {
        if (i === j) continue;
        tmp.subVectors(D[i], D[j]);
        const r = Math.max(tmp.length(), 0.05);
        F[i].addScaledVector(tmp, weight(i, j) / (r * r * r));
      }
      F[i].addScaledVector(D[i], -F[i].dot(D[i]));
    }
    moved = 0;
    for (let i = 0; i < m; i++) {
      moved = Math.max(moved, F[i].length() * step);
      D[i].addScaledVector(F[i], step).normalize();
    }
  }
  return moved;
}

function angle() {
  return Math.acos(Math.min(1, Math.max(-1, D[0].dot(D[1])))) * 180 / Math.PI;
}

function apply() {
  for (let i = 0; i < 2; i++) {
    hs[i].position.copy(D[i]).multiplyScalar(L);
    bonds[i].position.copy(D[i]).multiplyScalar(L / 2);
    bonds[i].quaternion.setFromUnitVectors(UP, D[i]);
    lps[i].position.copy(D[i + 2]).multiplyScalar(LPD);
    lps[i].quaternion.setFromUnitVectors(UP, D[i + 2]);
  }
}

function pick(i) {
  row.lock();
  row.mark(1, 'right');
  if (i !== 1) row.mark(i, 'wrong');
  state = 'picked';
  const verdict = i === 1
    ? 'Right: water is bent, about 105 degrees.'
    : 'Not quite: real water is bent, about 105 degrees.';
  card.setText('Water molecule\n' + verdict + '\nNext: a model that shows why.');
  revealAt = now + 2.2;
}

function reveal() {
  row.visible = false;
  mol.visible = true;
  readout.visible = true;
  toggleBtn.visible = true;
  againBtn.visible = true;
  lpOn = false; lpS = 0;
  seed(); apply();
  state = 'run'; reported = false; quiet = 0; since = 0; shown = -999;
  card.setText('Water molecule\n' + RULE + '\nBonds only, lone pairs ignored: watch the two O-H bonds.');
}

function toggle() {
  if (state !== 'run') return;
  lpOn = !lpOn;
  if (lpOn) {
    D[2].set(0, SC, SS);
    D[3].set(0, SC, -SS);
  }
  reported = false; quiet = 0; since = 0;
  card.setText('Water molecule\n' + RULE + (lpOn ? '\nLone pairs on: watch the hydrogens.' : '\nLone pairs hidden: watch the bonds.'));
}

function restart() {
  revealAt = 0; state = 'guess'; lpOn = false; lpS = 0; reported = true;
  mol.visible = false; readout.visible = false; toggleBtn.visible = false; againBtn.visible = false;
  row.reset(); row.visible = true;
  card.setText(START);
}

function report(ang) {
  const a = ang.toFixed(0);
  if (lpOn) {
    card.setText('Water molecule\n' + RULE + '\nThe two fat lone pairs squeeze the hydrogens together: H-O-H = ' + a + ' degrees here, 104.5 in real water. That is why water is bent.\nToggle lone pairs again to compare.');
  } else {
    card.setText('Water molecule\n' + RULE + '\nWith only the two bonds, they push as far apart as they can: H-O-H = ' + a + ' degrees, a straight line.\nClick Toggle lone pairs.');
  }
}

function build() {
  sky({ top: 'dark', bottom: 'grey' });

  card = ui.sign(START, { dist: 'room', dir: 'ahead', height: 'eye', width: 1.7 });

  // molecule: oxygen at the group origin, placed first so the anchor is exact
  mol = shape.group();
  const O = shape.ball(0.07, 'red');
  mol.add(O);
  place(mol, { dist: 'near', dir: -24, height: H.chest + 0.05, anchor: 'center' });
  label('O', { parent: O, at: [0, 0, 0.105], capHeight: 0.04, bg: false });

  for (let i = 0; i < 2; i++) {
    const h = shape.ball(0.045, 'white');
    mol.add(h); hs.push(h);
    label('H', { parent: h, at: [0, 0, 0.078], capHeight: 0.03, bg: false });

    const b = shape.cylinder(0.014, L, 'grey');
    mol.add(b); bonds.push(b);

    const g = new THREE.Group();
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      mat('purple', { opacity: 0.4, transparent: true, depthWrite: false })
    );
    cloud.scale.set(0.075, 0.1, 0.075);
    g.add(cloud);
    mol.add(g); lps.push(g);
  }

  readout = ui.readout('H-O-H = ', { units: ' deg', decimals: 0, dist: 'near', dir: 3, height: 'chest' });
  toggleBtn = ui.button('Toggle lone pairs', { dist: 'near', dir: 22, height: 'chest', onPress: toggle });
  againBtn = ui.button('Start over', { dist: 'near', dir: 22, height: 'waist', onPress: restart });
  row = ui.choices(['Straight 180', 'Bent 105', 'Bent 90'], { dist: 'near', dir: 'ahead', height: 'waist', onPick: pick });

  mol.visible = false; readout.visible = false; toggleBtn.visible = false; againBtn.visible = false;
  seed(); apply();
  for (const g of lps) g.visible = false;
}

function frame(dt, t) {
  now = t;
  if (revealAt && now >= revealAt) { revealAt = 0; reveal(); }
  if (state !== 'run') return;

  const moved = relax(4, 0.12);
  apply();

  lpS += ((lpOn ? 1 : 0) - lpS) * Math.min(1, dt * 6);
  for (const g of lps) {
    g.visible = lpS > 0.03;
    g.scale.setScalar(Math.max(lpS, 0.001));
  }
  mol.rotation.y = 0.55 * Math.sin(t * 0.6);

  const ang = angle();
  const r = Math.round(ang);
  if (r !== shown) { shown = r; readout.set(ang); }

  quiet = moved < 2e-5 ? quiet + dt : 0;
  since += dt;
  if (!reported && (quiet > 0.3 || since > 5)) { reported = true; report(ang); }
}

XR.run({ build, frame });
