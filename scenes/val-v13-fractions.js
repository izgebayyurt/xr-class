const { THREE, shape, place, label, interactive, tone, ground, ui } = XR;

// Each round: [numerator, denominator, numerator, denominator]
const ROUNDS = [[1,4,1,8], [1,3,1,6], [3,8,1,2], [5,8,3,4], [5,6,3,4]];
const R = 0.23;                       // pizza radius (m), about 46 cm across
const PLATE_OK = 0x5fd068, PLATE_BAD = 0xe85a5a, PLATE_PLAIN = 0xffffff;

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lcm = (a, b) => a / gcd(a, b) * b;

let plan = [], round = 0, score = 0, state = 'pick';
let pz = [], lab = [], card, nextBtn, scoreBtn, overBtn, table;

function makePizza() {
  const g = shape.group();
  const plate = shape.cylinder(R + 0.035, 0.02, 'white');
  plate.position.y = 0.01;
  g.add(plate);
  const hit = shape.hit(2 * R + 0.06, 0.12, 2 * R + 0.06);   // big invisible target
  hit.position.y = 0.06;
  g.add(hit);
  const slices = new THREE.Group();
  g.add(slices);
  const mk = c => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7 });
  return { g, plate, slices, m: { crust: mk(0xd98c2b), cheese: mk(0xffcf3f), pep: mk(0xc8372d), ghost: mk(0xe9e1d0) } };
}

function addPart(p, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  p.slices.add(mesh);
}

function wedge(p, r, h, y, a0, len, mat) {
  const seg = Math.max(2, Math.ceil(len / 0.2));
  addPart(p, new THREE.CylinderGeometry(r, r, h, seg, 1, false, a0, len), mat, 0, y, 0);
}

// Draw a pizza cut into d equal slices, with n of them present (the rest shown as an empty box-colour ghost).
function setPizza(p, n, d) {
  while (p.slices.children.length) {
    const c = p.slices.children[0];
    p.slices.remove(c);
    if (c.geometry) c.geometry.dispose();
  }
  const step = Math.PI * 2 / d;
  const gap = Math.min(0.05, step * 0.12);
  for (let i = 0; i < d; i++) {
    const a0 = Math.PI + i * step + gap / 2;
    const len = step - gap;
    if (i < n) {
      wedge(p, R, 0.03, 0.035, a0, len, p.m.crust);
      wedge(p, R - 0.025, 0.012, 0.056, a0, len, p.m.cheese);
      const pr = Math.min(0.026, 0.6 * R * len * 0.3);
      if (pr > 0.008) {
        const mid = a0 + len / 2;
        addPart(p, new THREE.CylinderGeometry(pr, pr, 0.008, 16), p.m.pep,
          0.6 * R * Math.sin(mid), 0.066, 0.6 * R * Math.cos(mid));
      }
    } else {
      wedge(p, R, 0.012, 0.026, a0, len, p.m.ghost);
    }
  }
}

function newPlan() {
  plan = ROUNDS.map(([a, b, c, d]) => Math.random() < 0.5
    ? { L: [a, b], R: [c, d] }
    : { L: [c, d], R: [a, b] });
}

function showRound() {
  const q = plan[round];
  setPizza(pz[0], q.L[0], q.L[1]);
  setPizza(pz[1], q.R[0], q.R[1]);
  pz[0].plate.material.color.setHex(PLATE_PLAIN);
  pz[1].plate.material.color.setHex(PLATE_PLAIN);
  lab[0].setText(`${q.L[0]}/${q.L[1]}`);
  lab[1].setText(`${q.R[0]}/${q.R[1]}`);
  state = 'pick';
  nextBtn.visible = false;
  scoreBtn.visible = false;
  card.setText(`Pizza Fractions\nRound ${round + 1} of ${plan.length} · Score ${score}\nSame-size pizzas. Point at the one with MORE pizza and click (+1 point).`);
}

function pick(i) {
  if (state !== 'pick') return;
  state = 'shown';
  const q = plan[round];
  const f = [q.L, q.R];
  const big = f[0][0] * f[1][1] > f[1][0] * f[0][1] ? 0 : 1;   // cross-multiplied comparison
  const ok = i === big;
  if (ok) { score++; tone(660, 0.15, 'triangle'); } else { tone(200, 0.25, 'square'); }

  // Re-cut both pizzas into the same size slices so the visitor can count them.
  const D = lcm(f[0][1], f[1][1]);
  const n0 = f[0][0] * (D / f[0][1]);
  const n1 = f[1][0] * (D / f[1][1]);
  setPizza(pz[0], n0, D);
  setPizza(pz[1], n1, D);
  lab[0].setText(`${f[0][0]}/${f[0][1]} = ${n0}/${D}`);
  lab[1].setText(`${f[1][0]}/${f[1][1]} = ${n1}/${D}`);
  pz[big].plate.material.color.setHex(PLATE_OK);
  if (!ok) pz[i].plate.material.color.setHex(PLATE_BAD);

  let why;
  if (f[0][0] === f[1][0]) {
    const bd = Math.min(f[0][1], f[1][1]);
    const sd = Math.max(f[0][1], f[1][1]);
    why = `More cuts, smaller slices: a 1/${bd} slice is ${Math.round(360 / bd)}° wide, a 1/${sd} slice only ${Math.round(360 / sd)}°.`;
  } else {
    why = 'Same-size slices make it a fair count: more slices wins.';
  }
  card.setText(`${ok ? 'Yes!' : 'Not quite.'} ${f[big][0]}/${f[big][1]} is bigger.\nCut into ${D}ths: ${n0} slices vs ${n1} slices. Count them.\n${why}`);

  if (round < plan.length - 1) nextBtn.visible = true; else scoreBtn.visible = true;
}

function advance() {
  round++;
  showRound();
}

function finish() {
  state = 'done';
  pz[0].g.visible = false;
  pz[1].g.visible = false;
  lab[0].visible = false;
  lab[1].visible = false;
  nextBtn.visible = false;
  scoreBtn.visible = false;
  const total = plan.length;
  const msg = score === total ? 'Perfect!' : score >= total - 1 ? 'Great job!' : 'Good try!';
  card.setText(`Pizza Fractions\nScore: ${score} out of ${total}. ${msg}\nA bigger bottom number does not make a bigger fraction: more slices means smaller slices.\nPoint at Start over to play again.`);
}

function restart() {
  newPlan();
  round = 0;
  score = 0;
  pz[0].g.visible = true;
  pz[1].g.visible = true;
  lab[0].visible = true;
  lab[1].visible = true;
  showRound();
}

function build() {
  ground({ color: 'teal', grid: false, arrow: false });

  // Table (top surface at about 0.92 m, below the waist-height controls)
  table = shape.group();
  const top = shape.box(1.7, 0.04, 0.9, 'red');
  top.position.set(0, 0.90, 0);
  table.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = shape.cylinder(0.035, 0.88, 0x8a5a2b);
      leg.position.set(sx * 0.78, 0.44, sz * 0.38);
      table.add(leg);
    }
  }
  place(table, { dist: 'near', dir: 'ahead', height: 0.01, anchor: 'bottom' });

  // Two pizzas, side by side on the table
  pz = [makePizza(), makePizza()];
  place(pz[0].g, { dist: 'near', dir: -24, height: 0.92, anchor: 'bottom' });
  place(pz[1].g, { dist: 'near', dir: 24, height: 0.92, anchor: 'bottom' });
  pz.forEach((p, i) => interactive(p.g, { select: () => pick(i) }));

  // Fraction labels (created once, updated with setText)
  lab = [
    label('1/4', { size: 'large', dist: 'near', dir: -24, height: 'chest' }),
    label('1/8', { size: 'large', dist: 'near', dir: 24, height: 'chest' })
  ];

  card = ui.sign('Pizza Fractions\nSame-size pizzas. Point at the one with MORE pizza and click.', { dist: 'room', dir: 'ahead', height: 'eye', anchor: 'top' });

  nextBtn = ui.button('Next round', { dist: 'near', dir: 'ahead', height: 'chest', color: 'green', onPress: advance });
  scoreBtn = ui.button('See my score', { dist: 'near', dir: 'ahead', height: 'chest', color: 'green', onPress: finish });
  overBtn = ui.button('Start over', { dist: 'room', dir: 'ahead-right', height: 'waist', color: 'orange', onPress: restart });
  nextBtn.visible = false;
  scoreBtn.visible = false;

  newPlan();
  showRound();
}

function frame(dt, t) {
  // nothing to animate; the pizzas are static
}

XR.run({ build, frame });
