const { THREE, scene, shape, place, label, tone, sky, ground, ui, H, stations } = XR;

// Model quantities (metres). Every number shown on screen is computed from these.
const W = 0.9, WALL_H = 2.1, SW = 0.5;          // trench floor width, wall height, soldier shoulder width
const MOUTH = -3.2, END = -14, LEN = MOUTH - END; // where the trench starts / ends (z), its length
const MUD = 0x40342a, BOARD = 0x5f4a31, BAGS = 0x4d4636;

const T0 = `Inside a WWI trench\nGuess first: how many soldiers, shoulder to shoulder, fit across the floor of the trench ahead? (Model: floor ${W.toFixed(1)} m wide, shoulders ${SW.toFixed(1)} m.) Point at an answer and click or pull the trigger.`;

let S0, S1, S2, card0, card1, card2, guess, again, dg, dgLabel;
let guessed = false, fits = 0, stage = -1, lastCm = -1;
const head = new THREE.Vector3();

function lookText(eye) {
  const d = WALL_H - eye;
  return `Look up\nThe walls are ${WALL_H.toFixed(1)} m high. Your eyes are ${eye.toFixed(2)} m up, so the top is ${Math.abs(d).toFixed(2)} m ${d > 0 ? 'above' : 'below'} them. `
    + (d > 0 ? 'You see only sky; soldiers stood on a fire-step to look out. ' : 'You could just see out. ')
    + 'Keep walking.';
}

function restart() {
  guessed = false;
  guess.reset();
  dg.visible = false;
  dgLabel.visible = false;
  card0.setText(T0);
  try { if (XR.teleportTo) XR.teleportTo(new THREE.Vector3(0, 0, 0)); } catch (e) {}
  stage = -1;
}

function build() {
  ground({ color: 0x2e2519, grid: false, arrow: false, radius: 25 });
  sky({ top: 0x1c1f22, bottom: 0x3a3830 });
  stations.push([0, 0, 0]);
  stations.push([0, -5, 0]);
  stations.push([0, -8.5, 0]);

  // --- the trench: two walls, sandbag rims, posts, duckboards, a closed end ---
  const zMid = (MOUTH + END) / 2;
  const addAt = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); return m; };
  for (const s of [-1, 1]) {
    addAt(shape.box(0.3, WALL_H, LEN, MUD), s * (W / 2 + 0.15), WALL_H / 2, zMid);
    addAt(shape.box(0.55, 0.25, LEN, BAGS), s * (W / 2 + 0.15), WALL_H + 0.125, zMid);
    for (const z of [-4.4, -6.6, -8.8, -11, -13]) {
      addAt(shape.box(0.1, WALL_H, 0.12, BOARD), s * (W / 2 + 0.01), WALL_H / 2, z);
    }
  }
  addAt(shape.box(W + 0.6, WALL_H, 0.3, MUD), 0, WALL_H / 2, END - 0.15);
  addAt(shape.box(0.7, 0.04, LEN, BOARD), 0, 0.02, zMid);

  // --- one group per stage; only the current stage is shown ---
  S0 = shape.group(); S1 = shape.group(); S2 = shape.group();
  S1.position.z = -5;
  S2.position.z = -8.5;
  scene.add(S0); scene.add(S1); scene.add(S2);

  // Stage 0: guess first
  card0 = ui.sign(T0, { width: 1.1, dist: 'room', dir: 'ahead', height: 'eye' });
  S0.add(card0);

  // Diagram: a row of shoulder-width soldiers packed from the left wall, drawn at half scale.
  // Green = fully between the walls, red = inside the wall. Computed from W and SW.
  const sc = 0.5, sw = SW * sc, w = W * sc;
  dg = shape.group();
  for (const s of [-1, 1]) {
    const wall = shape.box(0.06, 0.5, 0.04, MUD);
    wall.position.set(s * (w / 2 + 0.03), 0, -0.03);
    dg.add(wall);
  }
  const strip = shape.box(w + 0.12, 0.03, 0.04, BOARD);
  strip.position.set(0, -0.165, -0.03);
  dg.add(strip);
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const left = -w / 2 + i * sw;
    const fit = left + sw <= w / 2 + 1e-9;
    if (fit) n++;
    const c = fit ? 'green' : 'red';
    const body = shape.box(sw * 0.94, 0.3, 0.04, c);
    body.position.set(left + sw / 2, 0, 0);
    const hd = shape.ball(0.05, c);
    hd.position.set(left + sw / 2, 0.2, 0);
    dg.add(body); dg.add(hd);
  }
  fits = n;
  place(dg, { dist: 'room', dir: -24, height: 1.25, anchor: 'center', face: true });
  S0.add(dg);
  dg.visible = false;
  dgLabel = label('green fits · red is inside the wall', { above: dg, size: 'small' });
  dgLabel.visible = false;

  guess = ui.choices(['1', '2', '3'], { dist: 'near', dir: 'ahead', height: 'waist', onPick: (i, t, row) => {
    row.lock();
    const ok = Number(t) === fits;
    row.mark(i, ok ? 'right' : 'wrong');
    if (!ok && fits >= 1 && fits <= 3) row.mark(fits - 1, 'right');
    tone(ok ? 660 : 220, 0.2, ok ? 'sine' : 'square');
    guessed = true;
    dg.visible = true;
    dgLabel.visible = stage === 0;
    const pct = Math.round(100 * SW / W);
    card0.setText(`Inside a WWI trench\nYou said ${t}. Answer: ${fits}. ${W.toFixed(1)} m ÷ ${SW.toFixed(1)} m = ${(W / SW).toFixed(1)}, so a second man ends up inside the wall (red, left). Lesson: one man's shoulders fill ${pct}% of the floor width, so passing means squeezing by. Walk forward into the trench and read the signs.`);
  } });
  S0.add(guess);

  // Stage 1: the walls
  card1 = ui.sign(lookText(H.eye), { width: 0.78, dist: 'room', dir: 'ahead', height: 'eye' });
  S1.add(card1);

  // Stage 2: end of the line
  card2 = ui.sign(`End of the line\nThis model is straight; real trenches zigzagged. A trench was narrow and deep: about ${(W / SW).toFixed(1)} shoulder-widths across, with walls above your head. Press Start over to guess again.`,
    { width: 0.78, dist: 'room', dir: 'ahead', height: 'eye' });
  S2.add(card2);
  again = ui.button('Start over', { dist: 'near', dir: 'ahead', height: 'waist', onPress: restart });
  S2.add(again);

  S1.visible = false;
  S2.visible = false;
}

function frame(dt, t) {
  XR.camera.getWorldPosition(head);
  const s = head.z > -1.8 ? 0 : (head.z > -7.0 ? 1 : 2);
  if (s !== stage) {
    stage = s;
    S0.visible = stage === 0;
    S1.visible = stage === 1;
    S2.visible = stage === 2;
    dgLabel.visible = guessed && stage === 0;
  }
  if (stage === 1) {
    const eye = head.y > 0.8 ? head.y : H.eye;
    const cm = Math.round(eye * 100);
    if (cm !== lastCm) { lastCm = cm; card1.setText(lookText(cm / 100)); }
  }
}

XR.run({ build, frame });
