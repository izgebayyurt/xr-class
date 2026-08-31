const { THREE, scene, shape, place, label, interactive, tone, mat, C, ground, sky, input, remove } = XR;

// ─────────────────────────────────────────────────────────────────────────────
// x4 · THE ESTIMATION TUTOR (Tier X)
//
// Three embodied estimation modalities — DISTANCE (walk to a spot), HEIGHT (slide a marker on a
// pole), ANGLE (turn a dial from a beacon). Every trial: read the target on the plaque, ACT it out
// in space, CONFIRM with the trigger, then — only now — the truth appears next to your answer.
//
// ARCHITECTURE
//   • ONE seeded PRNG (mulberry32) drives every random draw: which magnitude is asked within a
//     modality's calibration slot, and which magnitude is drawn inside the worst bin once adaptive
//     magnitude-targeting begins. Modality choice itself is never random — it is argmax(|bias|+spread)
//     over the learner model, so two runs with the same seed and the same answers are identical,
//     trial for trial, even though the underlying numbers differ from a real human's.
//   • The learner model is one EWMA (λ=0.7) per modality over the RELATIVE signed error
//     (signedError / target), plus an identical EWMA kept separately for the "lo" and "hi" magnitude
//     bin of that modality. The per-modality number drives WHICH modality plays next; the per-bin
//     number drives WHICH magnitude range that trial samples from ("ask long distances" = the bin
//     with the bigger |bias| wins the next draw).
//   • submitAnswer(value, programmatic) is the single scoring path for both a real trigger-confirm
//     (value read live off the scene: camera-to-post distance, handle height, dial-vs-beacon angle)
//     and ENV_TEST.answer(value) (value written INTO the scene first, then read back through the very
//     same accessor) — so a human and the panel are graded by identical code, and the scene never
//     drifts out of sync with what ENV_TEST reports.
//   • The truth (tape / pole-tick / arc) is built only inside showFeedbackInSpace(), called only from
//     submitAnswer() after the model has already been updated — there is no code path that can render
//     it before a commit.
//   • frame() only ever: accumulates a clock, tracks the live "where are you standing" foot marker
//     while a distance trial is pending, flips the plaque out of its feedback linger, and eases the
//     three summary bars toward their target height. No per-frame allocation, no per-frame label
//     rebuild (setText fires only when the string actually changed), no per-frame geometry rebuild.
// ─────────────────────────────────────────────────────────────────────────────

// ── tuning ───────────────────────────────────────────────────────────────────
const LAMBDA = 0.7;                 // EWMA weight brief calls for (bias AND spread)
const CAL_ORDER = ['distance', 'height', 'angle', 'distance', 'height', 'angle']; // fixed calibration sweep
const CAL_N = CAL_ORDER.length;     // 6
const ADAPT_N = 10;
const TOTAL = CAL_N + ADAPT_N;      // 16
const FEEDBACK_LINGER = 3.2;        // seconds the plaque holds the feedback text before the next prompt

const RANGE = {
  distance: { lo: [1.2, 3.0], hi: [3.0, 5.0] },   // metres from the post
  height:   { lo: [0.35, 0.95], hi: [0.95, 1.6] },  // metres up the pole
  angle:    { lo: [12, 32], hi: [32, 60] },       // degrees off the beacon
};
const NOUN = { distance: 'distance', height: 'height', angle: 'angle' };
const BIN_WORD = {
  distance: { lo: 'short', hi: 'long' },
  height:   { lo: 'low', hi: 'high' },
  angle:    { lo: 'narrow', hi: 'wide' },
};
const SPACE_NOUN = {
  distance: { lo: 'near space', hi: 'far space' },
  height:   { lo: 'low reaches', hi: 'high reaches' },
  angle:    { lo: 'narrow turns', hi: 'wide turns' },
};
const ORDINAL = ['zeroth', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
function ordinal(n) { return ORDINAL[n] || (n + 'th'); }
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function roundTo(x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function decimalsFor(m) { return m === 'angle' ? 1 : 2; }
function unitFor(m) { return m === 'angle' ? '°' : 'm'; }

const OVER_COLOR = 0xff8f6b;   // overshoot (answer > truth)
const UNDER_COLOR = 0x6ba8ff;  // undershoot (answer < truth)
function signColor(signedError) { return signedError >= 0 ? OVER_COLOR : UNDER_COLOR; }

// ── seeded RNG ───────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let currentSeed = 1337, seedLocked = false, rng = mulberry32(currentSeed);

// ── learner model ────────────────────────────────────────────────────────────
function freshStat() { return { bias: 0, spread: 0, n: 0 }; }
function freshModel() {
  return {
    distance: { ...freshStat(), bins: { lo: freshStat(), hi: freshStat() } },
    height:   { ...freshStat(), bins: { lo: freshStat(), hi: freshStat() } },
    angle:    { ...freshStat(), bins: { lo: freshStat(), hi: freshStat() } },
  };
}
let model = freshModel();
let lastTestedIdx = { distance: -1, height: -1, angle: -1 };
let calCount = { distance: 0, height: 0, angle: 0 };

function ewmaUpdate(stat, x) {
  const delta = x - stat.bias;
  stat.bias += LAMBDA * delta;
  stat.spread = (1 - LAMBDA) * stat.spread + LAMBDA * Math.abs(delta);
  stat.n++;
}
function updateModel(modality, bin, relErr, idx) {
  ewmaUpdate(model[modality], relErr);
  ewmaUpdate(model[modality].bins[bin], relErr);
  lastTestedIdx[modality] = idx;
}
function scoreOf(modality) { const m = model[modality]; return Math.abs(m.bias) + m.spread; }

function pickAdaptiveModality() {
  const mods = ['distance', 'height', 'angle'];
  let best = mods[0];
  for (const m of mods) {
    const s = scoreOf(m), bs = scoreOf(best);
    if (s > bs + 1e-9) best = m;
    else if (Math.abs(s - bs) <= 1e-9 && lastTestedIdx[m] < lastTestedIdx[best]) best = m;
  }
  return best;
}
function worseBin(modality) {
  const b = model[modality].bins;
  if (b.lo.n === 0 && b.hi.n === 0) return 'hi';
  if (b.lo.n === 0) return 'hi';
  if (b.hi.n === 0) return 'lo';
  return Math.abs(b.hi.bias) >= Math.abs(b.lo.bias) ? 'hi' : 'lo';
}
function explainChoice(modality, bin) {
  const mods = ['distance', 'height', 'angle'];
  const others = mods.filter(m => m !== modality)
    .map(m => `${m} ${pct(Math.abs(model[m].bias) + model[m].spread)}`).join(', ');
  const mine = model[modality];
  const why = `${modality}: |bias| ${pct(Math.abs(mine.bias))} + spread ${pct(mine.spread)} = `
    + `${pct(scoreOf(modality))} — worst of the three (${others}). Sampling the ${BIN_WORD[modality][bin]} `
    + `range, where its error has been largest.`;
  return { modality, why };
}

// ── trial generation ─────────────────────────────────────────────────────────
function sampleInBin(modality, bin) {
  const [a, b] = RANGE[modality][bin];
  return a + rng() * (b - a);
}
let activeTrial = null, lastExplain = null, phase = 'calibration', trialIndex = -1;

function generateTrial(idx) {
  if (idx < CAL_N) {
    const modality = CAL_ORDER[idx];
    const bin = calCount[modality] === 0 ? 'lo' : 'hi';
    calCount[modality]++;
    const target = roundTo(sampleInBin(modality, bin), decimalsFor(modality));
    lastExplain = { modality, why: 'calibration sweep — fixed order, laying down a baseline in both magnitude ranges before the model picks anything.' };
    return { index: idx, phase: 'calibration', modality, target, bin };
  }
  const modality = pickAdaptiveModality();
  const bin = worseBin(modality);
  const target = roundTo(sampleInBin(modality, bin), decimalsFor(modality));
  lastExplain = explainChoice(modality, bin);
  return { index: idx, phase: 'adaptive', modality, target, bin };
}

function advanceTrial() {
  trialIndex++;
  if (trialIndex >= TOTAL) { phase = 'summary'; activeTrial = null; enterSummary(); return; }
  phase = trialIndex < CAL_N ? 'calibration' : 'adaptive';
  activeTrial = generateTrial(trialIndex);
}

// ── feedback text ────────────────────────────────────────────────────────────
function promptText(t) {
  if (!t) return '';
  if (t.modality === 'distance') return `Walk or teleport to where you think you are\n${t.target.toFixed(2)} m from the post.\nPull the trigger here to confirm.`;
  if (t.modality === 'height') return `Raise the marker on the pole to\n${t.target.toFixed(2)} m.\nPull the trigger here to confirm.`;
  return `Turn the pointer to ${t.target.toFixed(1)}° from the beacon.\nPull the trigger here to confirm.`;
}
function simpleFeedback(modality, signedError, value, target) {
  const d = decimalsFor(modality), u = unitFor(modality);
  const word = signedError < 0 ? 'short' : 'over';
  return `You answered ${value.toFixed(d)}${u}; the target was ${target.toFixed(d)}${u} — `
    + `${Math.abs(signedError).toFixed(d)}${u} ${word} (${Math.abs(signedError / target * 100).toFixed(0)}%).`;
}
function trendFeedback(modality, bin) {
  const m = model[modality];
  const n = m.n;
  const dirWord = m.bias < 0 ? 'undershot' : 'overshot';
  const verb = (m.bias < 0 ? 'compress' : 'stretch') + ' ' + SPACE_NOUN[modality][bin];
  return `${ordinal(n)} time you’ve ${dirWord} a ${BIN_WORD[modality][bin]} ${NOUN[modality]}. `
    + `You ${verb} by about ${Math.abs(m.bias * 100).toFixed(0)}%.`;
}
function buildFeedback(modality, bin, signedError, value, target, trialPhase) {
  return trialPhase === 'adaptive'
    ? trendFeedback(modality, bin)
    : simpleFeedback(modality, signedError, value, target);
}

// ── scene state ──────────────────────────────────────────────────────────────
let plaqueLbl, plaqueMode = 'prompt', feedbackUntil = 0, clockT = 0;
let post, pole, poleBase, handle, rose, arm, knob, beacon;
let footMarker;
let feedbackNodes = [];               // truth markers / tape / arc, torn down each new commit
let confirmBtn, restartBtn;
let bars = [], barLbls = [], barBaseLbls = [], sentenceLbl, payoffLbl, summarySnapshot = null, barsT = 0, barsAnimating = false;
let userDistanceOverride = null;
let dialAngleDeg = 0, roseBeaconDeg = 0;
const HMIN = 0.30, HMAX = 1.70;
const BAR_MAX_H = 1.0, BAR_MAX_BIAS = 0.5;   // |bias| of 0.5 (50%) maxes the bar out
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function poleWorldY(worldY) { return worldY - poleBase; }  // handle stores local (== world since pole sits on floor)

function liveAnswerValue(modality) {
  if (modality === 'distance') {
    if (userDistanceOverride != null) return userDistanceOverride;
    XR.camera.getWorldPosition(_v);
    _v2.set(post.position.x, 0, post.position.z);
    _v.y = 0;
    return _v.distanceTo(_v2);
  }
  if (modality === 'height') return handle.position.y;
  return dialAngleDeg;
}

function forceSceneValue(modality, value) {
  if (modality === 'distance') {
    userDistanceOverride = value;
    const ang = rng() * Math.PI * 2; // any bearing works for a synthetic marker; visuals only
    footMarker.position.set(post.position.x + Math.sin(ang) * value, 0.02, post.position.z + Math.cos(ang) * value);
    footMarker.visible = true;
  } else if (modality === 'height') {
    handle.position.y = clamp(value, HMIN, HMAX);
  } else {
    dialAngleDeg = value;
    updateArmVisual();
  }
}
function updateArmVisual() {
  const worldRad = THREE.MathUtils.degToRad(roseBeaconDeg + dialAngleDeg);
  arm.rotation.y = worldRad;
}

// ── feedback-in-space ────────────────────────────────────────────────────────
function hideFeedbackVisuals() {
  for (const n of feedbackNodes) remove(n);
  feedbackNodes = [];
}
function addFeedback(node) { scene.add(node); feedbackNodes.push(node); return node; }

function showFeedbackInSpace(modality, value, target, bin, signedError) {
  hideFeedbackVisuals();
  const col = signColor(signedError);
  if (modality === 'distance') {
    const bearing = Math.atan2(footMarker.position.x - post.position.x, footMarker.position.z - post.position.z);
    const truthX = post.position.x + Math.sin(bearing) * target;
    const truthZ = post.position.z + Math.cos(bearing) * target;
    const truth = shape.ball(0.045, 'yellow');
    truth.position.set(truthX, 0.045, truthZ);
    addFeedback(truth);
    const tape = shape.line([[footMarker.position.x, 0.02, footMarker.position.z], [truthX, 0.02, truthZ]], col);
    addFeedback(tape);
    const mid = { x: (footMarker.position.x + truthX) / 2, z: (footMarker.position.z + truthZ) / 2 };
    // This label must sit at a measured midpoint with no body-relative meaning — the one place the
    // kit's word-placement can't reach — so it is built via label() (for correct sizing) and then
    // moved to its true position directly, the documented escape hatch for measured points.
    const errLbl = label(`${signedError >= 0 ? '+' : ''}${signedError.toFixed(2)} m`, { size: 'small', width: 0.8, dist: 'near', dir: 'ahead', height: 'chest' });
    errLbl.position.set(mid.x, 0.35, mid.z);
    feedbackNodes.push(errLbl);
  } else if (modality === 'height') {
    const tick = shape.box(0.16, 0.012, 0.012, 'yellow');
    tick.position.set(pole.position.x, target, pole.position.z);
    addFeedback(tick);
    const errLbl = label(`${signedError >= 0 ? '+' : ''}${signedError.toFixed(2)} m`, { size: 'small', width: 0.7, dist: 'near', dir: 'ahead-left', height: 'chest' });
    errLbl.position.set(pole.position.x + 0.22, Math.max(target, handle.position.y), pole.position.z);
    feedbackNodes.push(errLbl);
  } else {
    const R = 0.42;
    const truthRad = THREE.MathUtils.degToRad(roseBeaconDeg + target);
    const truth = shape.box(0.05, 0.012, 0.10, 'yellow');
    truth.position.set(rose.position.x + Math.sin(truthRad) * R, 0.10, rose.position.z + Math.cos(truthRad) * R);
    truth.rotation.y = truthRad;
    addFeedback(truth);
    const a0 = roseBeaconDeg + Math.min(dialAngleDeg, target);
    const a1 = roseBeaconDeg + Math.max(dialAngleDeg, target);
    const pts = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * (i / steps));
      pts.push([rose.position.x + Math.sin(a) * (R - 0.06), 0.10, rose.position.z + Math.cos(a) * (R - 0.06)]);
    }
    addFeedback(shape.line(pts, col));
    const errLbl = label(`${signedError >= 0 ? '+' : ''}${signedError.toFixed(1)}°`, { size: 'small', width: 0.6, dist: 'near', dir: 'ahead-right', height: 'chest' });
    errLbl.position.set(rose.position.x, 0.5, rose.position.z);
    feedbackNodes.push(errLbl);
  }
}

// ── submit / advance ─────────────────────────────────────────────────────────
function submitAnswer(rawValue, programmatic) {
  if (!activeTrial || phase === 'summary') return null;
  const t = activeTrial;
  if (programmatic) forceSceneValue(t.modality, +rawValue);
  const value = liveAnswerValue(t.modality);
  const signedError = value - t.target;
  const relErr = signedError / t.target;
  updateModel(t.modality, t.bin, relErr, t.index);
  const feedbackText = buildFeedback(t.modality, t.bin, signedError, value, t.target, t.phase);
  showFeedbackInSpace(t.modality, value, t.target, t.bin, signedError);
  plaqueLbl.setText(feedbackText);
  advanceTrial();
  if (phase === 'summary') {
    plaqueMode = 'summary';
  } else {
    plaqueMode = 'feedback';
    feedbackUntil = clockT + FEEDBACK_LINGER;
  }
  if (!programmatic) tone(signedError >= 0 ? 520 : 340, 0.12, 'sine');
  return { signedError, feedbackText };
}

// ── summary ──────────────────────────────────────────────────────────────────
function strongestModality(snap) {
  const mods = ['distance', 'height', 'angle'];
  let best = mods[0];
  for (const m of mods) if (Math.abs(snap[m]) > Math.abs(snap[best])) best = m;
  return best;
}
function enterSummary() {
  hideFeedbackVisuals();
  footMarker.visible = false;
  summarySnapshot = { distance: model.distance.bias, height: model.height.bias, angle: model.angle.bias };
  const strongest = strongestModality(summarySnapshot);
  sentenceLbl.setText(`Your strongest habit: ${strongest}. You `
    + `${summarySnapshot[strongest] < 0 ? 'compress' : 'stretch'} it by about ${Math.abs(summarySnapshot[strongest] * 100).toFixed(0)}%.`);
  sentenceLbl.visible = true;
  payoffLbl.visible = true;
  const mods = ['distance', 'height', 'angle'];
  for (let i = 0; i < 3; i++) {
    const m = mods[i], b = summarySnapshot[m];
    const bin = worseBin(m);
    barLbls[i].setText(`${b >= 0 ? '+' : ''}${(b * 100).toFixed(0)}% ${BIN_WORD[m][bin]}`);
    barLbls[i].visible = true;
    baseLblShow(i);
    bars[i].material.color.setHex(b >= 0 ? OVER_COLOR : UNDER_COLOR);
  }
  barsT = 0; barsAnimating = true;
}
function baseLblShow(i) { barBaseLbls[i].visible = true; }
function resetSummaryVisuals() {
  sentenceLbl.visible = false;
  payoffLbl.visible = false;
  for (let i = 0; i < 3; i++) {
    bars[i].scale.y = 0.001; bars[i].position.y = 0.0005;
    barLbls[i].visible = false; barBaseLbls[i].visible = false;
  }
  barsAnimating = false;
}

// ── restart ──────────────────────────────────────────────────────────────────
function doRestart(rerollSeed) {
  if (rerollSeed && !seedLocked) currentSeed = (Math.random() * 4294967296) >>> 0;
  rng = mulberry32(currentSeed);
  model = freshModel();
  lastTestedIdx = { distance: -1, height: -1, angle: -1 };
  calCount = { distance: 0, height: 0, angle: 0 };
  trialIndex = -1; phase = 'calibration'; activeTrial = null; lastExplain = null;
  plaqueMode = 'prompt'; feedbackUntil = 0;
  hideFeedbackVisuals();
  userDistanceOverride = null; footMarker.visible = false;
  handle.position.y = 0.9;
  dialAngleDeg = 0; updateArmVisual();
  resetSummaryVisuals();
  advanceTrial();
  plaqueLbl.setText(promptText(activeTrial));
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────
function build() {
  sky({ top: 'dark', bottom: 'grey' });
  ground({ color: 'grey', grid: false, arrow: false, radius: 9 });
  input.teleport = 'both';

  // --- plaque: the single readable surface. prompt, feedback, and the confirm/restart pair live here.
  plaqueLbl = label('…', { dist: 1.2, dir: 'ahead', height: 'eye', size: 'comfortable', width: 1.15, theme: 'dark', anchor: 'top' });

  confirmBtn = shape.box(0.20, 0.08, 0.05, 'teal');
  place(confirmBtn, { dist: 1.2, dir: 'ahead', height: 1.30 });
  label('CONFIRM', { above: confirmBtn, size: 'small' });
  interactive(confirmBtn, {
    select: () => {
      if (!activeTrial || phase === 'summary' || plaqueMode !== 'prompt') return;
      submitAnswer(liveAnswerValue(activeTrial.modality), false);
    },
  });

  restartBtn = shape.box(0.20, 0.08, 0.05, 'grey');
  place(restartBtn, { dist: 1.2, dir: 'ahead', height: 1.10 });
  label('RESTART', { above: restartBtn, size: 'small' });
  interactive(restartBtn, { select: () => { doRestart(true); tone(300, 0.2, 'triangle'); } });

  // --- post: the distance anchor. a slim pillar, nothing more.
  post = shape.cylinder(0.05, 1.4, 'teal');
  post.position.y = 0.7;
  place(post, { dist: 2.6, dir: 13, height: 'floor', anchor: 'bottom' });

  footMarker = shape.ball(0.045, 'white');
  footMarker.material = mat('white', { transparent: true, opacity: 0.75 });
  footMarker.visible = false;
  scene.add(footMarker);

  // --- pole: the height rig. a bare rail plus a grab:'hold' sled the user slides by hand.
  pole = shape.group();
  const rail = shape.cylinder(0.018, 1.85, 'grey');
  rail.position.y = 0.925;
  pole.add(rail);
  for (const h of [0.4, 0.8, 1.2, 1.6]) {
    const t = shape.box(0.09, 0.006, 0.006, 'grey');
    t.position.y = h;
    pole.add(t);
  }
  place(pole, { dist: 0.95, dir: 'ahead-left', height: 'floor', anchor: 'bottom' });
  poleBase = pole.position.y;

  handle = shape.group();
  const sled = shape.box(0.10, 0.045, 0.10, 'orange');
  handle.add(sled);
  handle.add(shape.hitball(0.09));
  pole.add(handle);
  handle.position.y = 0.9;
  interactive(handle, {
    grab: 'hold',
    drag: (obj, info) => {
      const p = info && info.point;
      if (!p) return;
      handle.position.y = clamp(p.y - pole.position.y, HMIN, HMAX);
    },
  });

  // --- rose: the angle rig. a floor disc, a beacon reference, and a grab:'hold' dial arm.
  rose = shape.group();
  const disc = shape.cylinder(0.45, 0.02, 'dark');
  disc.position.y = 0.01;
  rose.add(disc);
  const rim = shape.torus(0.45, 0.008, 'grey');
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.021;
  rose.add(rim);
  place(rose, { dist: 1.0, dir: 'ahead-right', height: 'floor', anchor: 'bottom' });

  beacon = shape.cylinder(0.045, 0.9, 'purple');
  beacon.position.y = 0.45;
  place(beacon, { dist: 3.2, dir: 55, height: 'floor', anchor: 'bottom' });
  roseBeaconDeg = THREE.MathUtils.radToDeg(Math.atan2(beacon.position.x - rose.position.x, beacon.position.z - rose.position.z));
  scene.add(shape.line([[rose.position.x, 0.015, rose.position.z], [beacon.position.x, 0.015, beacon.position.z]], 'purple'));

  arm = shape.group();
  const barMesh = shape.box(0.03, 0.02, 0.42, 'orange');
  barMesh.position.z = 0.21;
  arm.add(barMesh);
  knob = shape.group();
  const knobBall = shape.ball(0.04, 'orange');
  knob.add(knobBall);
  knob.add(shape.hitball(0.08));
  knob.position.z = 0.42;
  arm.add(knob);
  arm.position.set(rose.position.x, 0.10, rose.position.z);
  scene.add(arm);
  interactive(knob, {
    grab: 'hold',
    drag: (obj, info) => {
      const p = info && info.point;
      if (!p) return;
      const worldDeg = THREE.MathUtils.radToDeg(Math.atan2(p.x - rose.position.x, p.z - rose.position.z));
      let off = worldDeg - roseBeaconDeg;
      off = ((off + 180) % 360 + 360) % 360 - 180;
      dialAngleDeg = off;
      updateArmVisual();
    },
  });
  updateArmVisual();

  // --- summary bars: built now, hidden until the session ends.
  const barDirs = [-25, 0, 25];
  const barMods = ['distance', 'height', 'angle'];
  for (let i = 0; i < 3; i++) {
    // Build the rig WITH its full-height bar already attached before place()ing it — place() anchors
    // on the group's current bounding box, and an empty group has none (NaN position out).
    const rig = shape.group();
    const bar = shape.box(0.28, BAR_MAX_H, 0.28, 'grey');
    rig.add(bar);
    place(rig, { dist: 1.8, dir: barDirs[i], height: 'floor', anchor: 'bottom' });
    bar.scale.y = 0.001;
    bar.position.y = 0.0005;
    bars.push(bar);
    barBaseLbls.push(label(barMods[i], { parent: rig, at: [0, 0.02, 0.15], capHeight: 0.05, bg: false }));
    barBaseLbls[i].visible = false;
    // A label glued ('above') to the bar re-reads the bar's own bounding box, which is deliberately
    // near-zero while the bar sits collapsed — flipping such a label visible then hits a degenerate
    // box. A free label at a fixed metre height above the bar's MAX extent sidesteps that entirely
    // and needs no re-anchoring as the bar grows.
    const bl = label('0%', { dist: 1.8, dir: barDirs[i], height: BAR_MAX_H + 0.18, size: 'comfortable' });
    bl.visible = false;
    barLbls.push(bl);
  }
  sentenceLbl = label('…', { dist: 1.5, dir: -22, height: 1.45, size: 'comfortable', width: 1.1, theme: 'glass' });
  sentenceLbl.visible = false;
  payoffLbl = label('Your eyes have habits.\nNow you’ve met them.', { dist: 1.8, dir: 'ahead', height: 1.9, size: 'large', width: 1.5, theme: 'dark', accent: '#f2a25c' });
  payoffLbl.visible = false;

  doRestart(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAME
// ─────────────────────────────────────────────────────────────────────────────
function frame(dt) {
  clockT += dt;

  if (activeTrial && activeTrial.modality === 'distance' && plaqueMode === 'prompt' && userDistanceOverride == null) {
    XR.camera.getWorldPosition(_v);
    footMarker.position.set(_v.x, 0.02, _v.z);
    footMarker.visible = true;
  } else if (!activeTrial || activeTrial.modality !== 'distance') {
    footMarker.visible = false;
  }

  if (plaqueMode === 'feedback' && clockT >= feedbackUntil) {
    plaqueMode = 'prompt';
    hideFeedbackVisuals();
    footMarker.visible = false;
    userDistanceOverride = null;
    plaqueLbl.setText(promptText(activeTrial));
  }

  if (barsAnimating) {
    barsT = Math.min(1, barsT + dt / 1.1);
    const e = 1 - Math.pow(1 - barsT, 3);
    for (let i = 0; i < 3; i++) {
      const target = clamp(Math.abs(summarySnapshot[['distance', 'height', 'angle'][i]]) / BAR_MAX_BIAS, 0, 1) * BAR_MAX_H;
      const h = Math.max(0.001, target * e);
      bars[i].scale.y = h / BAR_MAX_H;
      bars[i].position.y = h / 2;
    }
    if (barsT >= 1) barsAnimating = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
window.ENV_TEST = {
  seed(n) { currentSeed = (n >>> 0); seedLocked = true; return currentSeed; },
  restart() { doRestart(false); return true; },
  trial() {
    if (phase === 'summary' || !activeTrial) return { index: TOTAL, phase: 'summary', modality: null, target: null };
    return { index: activeTrial.index, phase: activeTrial.phase, modality: activeTrial.modality, target: activeTrial.target };
  },
  answer(value) { return submitAnswer(+value, true); },
  model() {
    const out = {};
    for (const m of ['distance', 'height', 'angle']) out[m] = { bias: model[m].bias, spread: model[m].spread, n: model[m].n };
    return out;
  },
  nextChoiceExplain() { return lastExplain ? { modality: lastExplain.modality, why: lastExplain.why } : null; },
  summary() { return phase === 'summary' ? { ...summarySnapshot } : null; },
  phase: () => phase,
};

XR.run({ build, frame });
