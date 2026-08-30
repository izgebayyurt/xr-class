const { THREE, scene, shape, place, label, interactive, tone, mat, remove, H, C, ground, input } = XR;

// "Tower Race" — Tier 3. Two towers grow from the floor over 10 real seconds: A steady (+a m/s),
// B doubling (h0 * 2^(t/d)). Bet before each of 5 rounds, watch the true numbers, see who wins.
// Ruler caps visually at 3.0 m; the number stays honest about the real height either way.
// State machine: betting -> racing -> reveal -> (next round | gameover) -> restart.
// (round-2/3 fix history lives in the review thread, not here — see pipeline/reviews/)

const ROUNDS = [
  { a: 0.25, h0: 0.10, d: 3.0 },
  { a: 0.25, h0: 0.10, d: 1.9 },
  { a: 0.28, h0: 0.40, d: 3.6 },
  { a: 0.18, h0: 0.05, d: 1.8 },
  { a: 0.22, h0: 0.25, d: 4.5 },
];
const RULER_MAX = 3.0, MIN_H = 0.004, TEXT_DT = 0.2, RULER_OFFSET = 0.38;
const BAR_SIZE = 0.22, PAD_SIZE = H.knee;
const SIDE = {
  A: { angle: -24, color: 'teal', hex: C.teal },
  B: { angle: 24, color: 'orange', hex: C.orange },
};
const TICKS = [
  { h: 0.5, text: '0.5 m' }, { h: 1.0, text: '1.0 m — waist' }, { h: 1.5, text: '1.5 m' },
  { h: 2.0, text: '2.0 m' }, { h: 2.5, text: '2.5 m' }, { h: 3.0, text: '3.0 m' },
];
const rulerPos = {};

let roundIdx = 0, score = 0, phase = 'betting', bet = null;
let raceT = 0, revealT = 0, textTimer = 0, flashSide = null;
let crossFound = false, crossT = null, prevSign = 0, crossMark = null, crossLbl = null;
let ghostA = null, ghostB = null, numbersOn = false;
let barA, barB, capA, capB, capLblA, capLblB, padA, padB, numA, numB, signLbl, lastSignText = '';

const heightA = (t) => ROUNDS[roundIdx].a * t;
const heightB = (t) => ROUNDS[roundIdx].h0 * Math.pow(2, t / ROUNDS[roundIdx].d);
const honest = (h) => h > RULER_MAX ? `${h.toFixed(2)} m — off the top of the ruler` : `${h.toFixed(2)} m`;
function setBarHeight(bar, total){
  const drawn = Math.max(MIN_H, Math.min(total, RULER_MAX));
  bar.scale.y = drawn; bar.position.y = drawn / 2;
}
function updateCap(key, total){
  const cap = key === 'A' ? capA : capB, bar = key === 'A' ? barA : barB, lbl = key === 'A' ? capLblA : capLblB;
  const over = total > RULER_MAX;
  cap.visible = over; lbl.visible = over;
  if (over){
    cap.position.set(bar.position.x, RULER_MAX + 0.06, bar.position.z);
    lbl.position.set(bar.position.x, RULER_MAX + 0.34, bar.position.z);   // above the arrow tip, not behind the cap box
    lbl.setText(`${total.toFixed(2)} m ↑`);
  }
}
function buildTower(key){
  const s = SIDE[key];
  const pad = shape.box(PAD_SIZE, 0.02, PAD_SIZE, s.color);
  place(pad, { dist: 'room', dir: s.angle, height: 'floor' });

  const bar = shape.box(BAR_SIZE, 1, BAR_SIZE, s.color);
  bar.material = mat(s.color, { emissive: s.hex, emissiveIntensity: 0 });
  place(bar, { dist: 'room', dir: s.angle, height: 'floor' });
  setBarHeight(bar, MIN_H); bar.visible = false;

  // cap + arrow: built once, then scene.add()ed so it actually renders (a bare shape.group() does not)
  const cap = shape.group();
  const capBox = shape.box(BAR_SIZE * 1.15, 0.05, BAR_SIZE * 1.15, 'yellow');
  const arrow = shape.cone(0.06, 0.16, 'yellow'); arrow.position.y = 0.14;
  cap.add(capBox, arrow); cap.visible = false;
  scene.add(cap);

  const capLbl = label('0.00 m ↑', { at: [0, 0, 0], capHeight: 0.04, bg: false });
  capLbl.visible = false;

  if (key === 'A'){ barA = bar; capA = cap; capLblA = capLbl; } else { barB = bar; capB = cap; capLblB = capLbl; }
}
function buildRuler(key){
  const s = SIDE[key];
  const g = shape.group();
  const post = shape.cylinder(0.018, RULER_MAX, 'white'); post.position.y = RULER_MAX / 2; g.add(post);
  for (const tk of TICKS){
    const t = shape.box(0.014, 0.014, 0.09, 'white');
    t.position.set(0, tk.h, 0.018 + 0.045); g.add(t);
  }
  const eyeTick = shape.box(0.014, 0.014, 0.05, 'white');
  eyeTick.position.set(0, H.eye, 0.018 + 0.025); g.add(eyeTick);

  place(g, { dist: 'room', dir: s.angle, height: 'floor' });           // same azimuth as the tower...
  g.position.x += (key === 'A' ? -1 : 1) * RULER_OFFSET;               // ...just offset sideways, so it stands beside it
  rulerPos[key] = { x: g.position.x, z: g.position.z };

  const nx = -g.position.x, nz = -g.position.z, nl = Math.hypot(nx, nz) || 1;
  const outSign = key === 'A' ? -1 : 1;   // push labels further OUTWARD (away from the bar), same
  const lx = g.position.x + outSign * 0.07, lz = g.position.z + nz / nl * 0.15;   // sign as the post's own offset — symmetric on both sides
  for (const tk of TICKS) label(tk.text, { at: [lx, tk.h, lz], capHeight: 0.035 });
  // the eye tick's label rides the OTHER side of the post so it never collides with the 1.5 m plate
  const tx = g.position.x - nz / nl * 0.16, tz = g.position.z + nx / nl * 0.16;
  label('your eye', { at: [tx, H.eye, tz], capHeight: 0.03 });
}
function makeBetPad(key){
  const s = SIDE[key];
  const pad = shape.box(0.26, 0.05, 0.17, s.color);
  pad.material = mat(s.color, { emissive: s.hex, emissiveIntensity: 0 });
  place(pad, { dist: 'reach', dir: key === 'A' ? 'ahead-left' : 'ahead-right', height: 'waist', face: true });
  // free label, not parented to the pad: a caption glued to a low, close pad both inherits its
  // steep elevation (neck-strain) AND, with yaw-only billboards, foreshortens edge-on when the
  // near-eye-height camera looks down at it. Sitting at the pad's own +-35 deg put it on almost
  // the same azimuth as the ruler's tick column (+-34 deg) — any height there hits some tick, so
  // widen the angle to +-46 deg instead of just changing height; still ahead-left/right, near eye.
  const padAng = (key === 'A' ? -42 : 42) * Math.PI / 180;
  label(key === 'A' ? 'A — steady' : 'B — doubling', { at: [Math.sin(padAng), H.eye - 0.05, -Math.cos(padAng)], capHeight: 0.025 });
  interactive(pad, { select: () => { if (phase === 'betting') placeBet(key, pad); } });
  return pad;
}
function placeBet(key, pad){
  bet = key;
  pad.material.emissiveIntensity = 1;
  tone(key === 'A' ? 520 : 660, 0.15, 'sine');
  phase = 'racing'; raceT = 0; crossFound = false; crossT = null; prevSign = 0; textTimer = 0;
  barA.visible = true; barB.visible = true;
  numbersOn = true;
  updateSign(); updateNumbers();
}
function spawnCrossMarker(hA, hB, t){
  if (crossMark) remove(crossMark);
  if (crossLbl) remove(crossLbl);
  const y = Math.min(RULER_MAX, (hA + hB) / 2);
  const ax = barA.position.x, az = barA.position.z, bx = barB.position.x, bz = barB.position.z;
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  const x = (ax + bx) / 2, z = (az + bz) / 2;
  crossMark = shape.box(len, 0.03, 0.03, 'yellow');   // spans bar-to-bar, not a lone point in the sky
  crossMark.position.set(x, y, z);
  crossMark.rotation.y = -Math.atan2(dz, dx);
  scene.add(crossMark);   // a manually-positioned shape.box() needs this — place() is the only other thing that attaches
  crossLbl = label(`t = ${t.toFixed(1)} s`, { at: [x, y + 0.12, z], capHeight: 0.035 });
}
function spawnGhost(key, finalH){
  const s = SIDE[key], y = Math.min(RULER_MAX, finalH);
  const pip = shape.box(0.05, 0.015, 0.05, s.color);
  pip.material = mat(s.color, { emissive: s.hex, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });
  pip.position.set(rulerPos[key].x, y, rulerPos[key].z);
  scene.add(pip);
  if (key === 'A') ghostA = pip; else ghostB = pip;
}
function computeSignLines(){
  const r = ROUNDS[roundIdx], head = 'Tower Race';
  if (phase === 'betting'){
    return `${head}\nRound ${roundIdx + 1} of 5 — Score ${score}\nWhich tower is taller after 10 seconds?\nA: +${r.a.toFixed(2)} m every second\nB: starts at ${r.h0.toFixed(2)} m, doubles every ${r.d.toFixed(1)} s`;
  }
  if (phase === 'racing'){
    const hA = heightA(raceT), hB = heightB(raceT);
    let s = `${head}\nRound ${roundIdx + 1} of 5 — Score ${score}\nt = ${raceT.toFixed(1)} s\nA: ${honest(hA)}   B: ${honest(hB)}`;
    if (crossT != null) s += `\nThey crossed at t = ${crossT.toFixed(1)} s`;
    return s;
  }
  if (phase === 'reveal'){
    const hA = heightA(10), hB = heightB(10), winner = hA > hB ? 'A' : 'B', right = bet === winner;
    const lesson = crossT != null
      ? `${winner} was behind until t = ${crossT.toFixed(1)} s, then pulled ahead for good.`
      : `${winner} led the whole 10 seconds — no late reversal this time.`;
    return `${head}\nRound ${roundIdx + 1} of 5 — Score ${score}\nA ${hA.toFixed(2)} m — B ${hB.toFixed(2)} m. ${winner} wins.\n${right ? 'Right!' : 'Not this time.'}\n${lesson}`;
  }
  return `${head}\n5 rounds. Score ${score} of 5.\nSteady wins early. Doubling wins late.\nPoint at this sign to play again.`;
}
function updateSign(){
  const text = computeSignLines();
  if (text === lastSignText) return;
  lastSignText = text; signLbl.setText(text);
}
function updateNumbers(){
  const t = phase === 'reveal' ? 10 : raceT;
  const ta = `${heightA(t).toFixed(2)} m`, tb = `${heightB(t).toFixed(2)} m`;
  if (numA.userData._t !== ta){ numA.setText(ta); numA.userData._t = ta; }
  if (numB.userData._t !== tb){ numB.setText(tb); numB.userData._t = tb; }
}
function finishRace(){
  raceT = 10;
  const hA = heightA(10), hB = heightB(10);
  setBarHeight(barA, hA); setBarHeight(barB, hB);
  updateCap('A', hA); updateCap('B', hB);
  spawnGhost('A', hA); spawnGhost('B', hB);
  const winner = hA > hB ? 'A' : 'B', right = bet === winner;
  if (right) score++;
  flashSide = winner; phase = 'reveal'; revealT = 0;
  tone(right ? 880 : 220, 0.3, right ? 'sine' : 'square');
  updateSign(); updateNumbers();
}
function resetRoundVisuals(){
  bet = null; raceT = 0; crossFound = false; crossT = null; prevSign = 0;
  setBarHeight(barA, MIN_H); setBarHeight(barB, MIN_H);
  barA.visible = false; barB.visible = false;
  capA.visible = false; capB.visible = false; capLblA.visible = false; capLblB.visible = false;
  barA.material.emissiveIntensity = 0; barB.material.emissiveIntensity = 0;
  numbersOn = false; numA.visible = false; numB.visible = false;
  padA.material.emissiveIntensity = 0; padB.material.emissiveIntensity = 0;
  if (crossMark){ remove(crossMark); crossMark = null; }
  if (crossLbl){ remove(crossLbl); crossLbl = null; }
  if (ghostA){ remove(ghostA); ghostA = null; }
  if (ghostB){ remove(ghostB); ghostB = null; }
}
function nextRoundOrEnd(){
  if (roundIdx < ROUNDS.length - 1){ roundIdx++; resetRoundVisuals(); phase = 'betting'; updateSign(); }
  else { phase = 'gameover'; updateSign(); }
}
function restartGame(){ score = 0; roundIdx = 0; resetRoundVisuals(); phase = 'betting'; updateSign(); }
function build(){
  ground({ color: 'dark', grid: false, arrow: false });
  input.teleport = 'none';

  buildTower('A'); buildTower('B');
  buildRuler('A'); buildRuler('B');
  padA = makeBetPad('A'); padB = makeBetPad('B');

  const initText = computeSignLines();
  signLbl = label(initText, { dist: 'room', dir: 'ahead', height: 'eye', size: 'large', width: 1.8, title: true });
  lastSignText = initText;
  interactive(signLbl, { select: () => { if (phase === 'gameover') restartGame(); } });

  numA = label('0.00 m', { at: [barA.position.x, 0.3, barA.position.z], capHeight: 0.05 });
  numA.visible = false; numA.userData._t = '0.00 m';
  numB = label('0.00 m', { at: [barB.position.x, 0.3, barB.position.z], capHeight: 0.05 });
  numB.visible = false; numB.userData._t = '0.00 m';
}
function frame(dt){
  // suppress the live number whenever that side's overflow cap is showing its own — no duplicate
  numA.visible = numbersOn && !capA.visible;
  numB.visible = numbersOn && !capB.visible;
  if (numA.visible) numA.position.set(barA.position.x, barA.position.y + barA.scale.y / 2 + 0.12, barA.position.z);
  if (numB.visible) numB.position.set(barB.position.x, barB.position.y + barB.scale.y / 2 + 0.12, barB.position.z);

  if (phase === 'racing'){
    raceT += dt;
    if (raceT > 10){ finishRace(); return; }
    const hA = heightA(raceT), hB = heightB(raceT);
    setBarHeight(barA, hA); setBarHeight(barB, hB);
    updateCap('A', hA); updateCap('B', hB);
    if (raceT >= 1.0){
      const s = Math.sign(hA - hB);
      if (prevSign === 0) prevSign = s;
      else if (s !== 0 && s !== prevSign && !crossFound){
        crossFound = true; crossT = raceT;
        spawnCrossMarker(hA, hB, raceT); tone(1300, 0.05, 'square');
      }
    }
    textTimer += dt;
    if (textTimer >= TEXT_DT){ textTimer = 0; updateSign(); updateNumbers(); }
  } else if (phase === 'reveal'){
    revealT += dt;
    const bar = flashSide === 'A' ? barA : barB;
    bar.material.emissiveIntensity = revealT < 1.2 ? 0.15 + 0.85 * (Math.sin(revealT * 14) + 1) / 2 : 0;
    if (revealT >= 4.0) nextRoundOrEnd();
  }
}

XR.run({ build, frame });
