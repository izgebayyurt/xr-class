const { THREE, scene, shape, place, label, interactive, tone, mat, ground, sky, camera, input, C } = XR;

// ─────────────────────────────────────────────────────────────────────────────
// x4 · THE ESTIMATION TUTOR (Tier X)
//
// A clinic at dusk. Three instruments stand in the front arc: a POST you walk away from, a POLE with a
// marker you raise, a floor ROSE with a pointer you turn. A plaque ahead asks for a distance, a height
// or an angle; you answer with your body; you commit with the trigger; only THEN does the room draw the
// truth beside your answer. Sixteen trials later three bars on the floor show what your eyes actually do.
//
// ARCHITECTURE
//   • LEARNER MODEL — per modality, a *normalised* exponentially-weighted mean and variance of the
//     RELATIVE signed error (err/target), λ = 0.7:
//         S ← λS + (1−λ)x      W ← λW + (1−λ)      Q ← λQ + (1−λ)x²
//         bias = S/W           spread = sqrt(Q/W − bias²)
//     Dividing by the accumulated weight W is what makes this an *estimate* rather than a ramp: a plain
//     λ-EWMA seeded at zero reads −0.10 after two −0.20 trials and only reaches −0.20 asymptotically,
//     so an early adaptive decision would be a function of trial count instead of of the learner.
//     Normalised, the estimate is exact from the first sample and still forgets old evidence at λ.
//   • SELECTION RULE — argmax over modalities of |bias| + spread; exact ties (|Δ| ≤ 1e-9) go to the
//     least-recently-tested. Then argmax over three magnitude BANDS of that modality's EW mean |relative
//     error| (an unvisited band inherits the modality's |bias| as its prior, so it is neither ignored nor
//     privileged); band ties go to the band with the fewest samples, then the lowest band. The magnitude
//     is drawn uniformly inside the winning band. A deterministic function of (model state, PRNG).
//   • DETERMINISM — one mulberry32 stream, advanced ONLY inside makeTrial(). Nothing time-based,
//     frame-based or position-based ever touches it, so seed(n) + restart() replays a session exactly,
//     trial for trial, given the same answers. The in-world RESTART pad *re-seeds* (it walks the seed
//     forward through a fixed hash) so a second visitor never gets the first one's session.
//   • NO MEASURING AIDS — no floor grid, no ticks on the pole, no degree marks on the rose, no live
//     readout of what you are currently holding, and the instrument never starts on the answer. The
//     room would be a ruler otherwise, and a ruler measures the instrument instead of the eye.
//   • FRAME COST — build() makes every mesh and every label exactly once; feedback is repositioning and
//     rescaling, never construction. frame() does one eased reveal scalar and one yaw-only billboard per
//     visible number. No allocation in any per-frame path (module-scope scratch vectors).
// ─────────────────────────────────────────────────────────────────────────────

// ── tuning ───────────────────────────────────────────────────────────────────
const LAM = 0.7;                 // λ for the exponentially-weighted learner model
const EPS = 1e-9;                // exact-tie epsilon for the selection rule
const N_CAL = 6, N_ADAPT = 10, N_TRIALS = N_CAL + N_ADAPT;

// The start view is roughly ±39° across and ±32° up/down, so a floor instrument only enters the opening
// frame from about 2.6 m out (below that its elevation drops past the bottom edge). The rose therefore
// stands where it can be SEEN from the door — a big compass rose two paces away — rather than at the
// visitor's toes where it would be invisible until they looked at their feet.
const ROSE_DIR = -26, ROSE_DIST = 2.90, ROSE_R = 0.58, NEEDLE_LEN = 0.50;
const BEACON_DIR = -38, BEACON_DIST = 4.60, BEACON_H = 1.60;   // off the rose's own bearing, so the
                                                               // beacon mast never stacks on the rose's label
// The plaque sits a touch LEFT of straight ahead and the post a touch right, because the distance trial's
// walking lane runs along the post's bearing: with the lane near the middle of the view, the tape the
// visitor lays down with their own feet is drawn where they are already looking, not off at the edge.
const PLAQUE_DIR = -14, PLAQUE_DIST = 2.40, PLAQUE_TOP = 1.98, PLAQUE_W = 1.6;
// The post stands 2.6 m out and the asked distances are 1.6-3.4 m, so the ring of legal standing spots
// always lies between 1.0 m in front of the visitor and 0.8 m behind them: they walk a little, never
// past the plaque, and never into the pole (kept a metre clear of that lane).
const POST_DIR = 14, POST_DIST = 2.60, POST_H = 2.35;
const POLE_DIR = 34, POLE_DIST = 1.90, POLE_H = 1.95;
const RAIL_LO = 0.40, RAIL_HI = 1.85, PARK_H = 1.35;
// Bars sit at 2.75 m so their FEET are inside the bottom of the view - a bar chart you can only see the
// top half of is not a bar chart. 1 m of bar = 28.6% of bias; the printed percent is always exact.
const BAR_DIST = 2.75, BAR_DIRS = [-30, 0, 30], BAR_SCALE = 3.5, BAR_MAX = 1.05;
const PAD_DIR = -14, PAD_DIST = 2.15, PAD_H = 2.30;   // a tab directly above the verdict board: the only
                                                      // patch of the summary view nothing else occupies

const CA = 0x59d3c4;             // answer  — teal
const CT = 0xf2b05c;             // truth   — amber
const CE = 0xe8615a;             // error   — red
const CG = 0x585f6a;             // dormant — unlit slate
const CL = 0xa9b2bf;             // live    — the same slate, lit: 'this is the instrument in use'

const MODS = ['distance', 'height', 'angle'];
const SPEC = {
  // Distance targets stay inside 1.5–3.5 m: the circle of valid standing spots around the post then
  // never sweeps the visitor into the plaque, so the thing they must point at stays readable all session.
  distance: { unit: 'm', dec: 1, step: 0.1, bins: [[1.6, 2.2], [2.2, 2.8], [2.8, 3.4]],
              band: ['a short distance', 'a middling distance', 'a long distance'] },
  height:   { unit: 'm', dec: 2, step: 0.05, bins: [[0.60, 1.00], [1.00, 1.40], [1.40, 1.75]],
              band: ['a low mark', 'a middling mark', 'a high mark'] },
  angle:    { unit: 'deg', dec: 0, step: 1, bins: [[25, 42], [42, 58], [58, 75]],
              band: ['a narrow angle', 'a middling angle', 'a wide angle'] },
};
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
             'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth'];

// ── scratch (never allocated inside a handler or frame) ──────────────────────
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();

// ── seeded PRNG (mulberry32) ─────────────────────────────────────────────────
let rngState = 0, rngDraws = 0;
function setSeed(n) { rngState = n | 0; rngDraws = 0; }
function rnd() {
  rngDraws++;
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function snap(v, step, dec) { return +(Math.round(v / step) * step).toFixed(dec); }

// ─────────────────────────────────────────────────────────────────────────────
// LEARNER MODEL
// ─────────────────────────────────────────────────────────────────────────────
const M = {};
function blankMod() {
  return { S: 0, W: 0, Q: 0, n: 0, last: 0, run: 0, runSign: 0, over: 0, under: 0,
           bins: [{ S: 0, W: 0, n: 0 }, { S: 0, W: 0, n: 0 }, { S: 0, W: 0, n: 0 }] };
}
function resetModel() { for (const k of MODS) M[k] = blankMod(); }
function biasOf(m) { return m.W > 0 ? m.S / m.W : 0; }
function spreadOf(m) {
  if (m.W <= 0) return 0;
  const b = m.S / m.W, v = m.Q / m.W - b * b;
  return v > 0 ? Math.sqrt(v) : 0;
}
function scoreOf(m) { return Math.abs(biasOf(m)) + spreadOf(m); }

function learn(mod, rel, bin, index) {
  const m = M[mod];
  m.S = LAM * m.S + (1 - LAM) * rel;
  m.W = LAM * m.W + (1 - LAM);
  m.Q = LAM * m.Q + (1 - LAM) * rel * rel;
  m.n++; m.last = index;
  const b = m.bins[bin], a = Math.abs(rel);
  b.S = LAM * b.S + (1 - LAM) * a;
  b.W = LAM * b.W + (1 - LAM);
  b.n++;
  const s = rel > 0 ? 1 : (rel < 0 ? -1 : 0);
  if (s !== 0 && s === m.runSign) m.run++; else { m.runSign = s; m.run = 1; }
  if (s > 0) m.over++; else if (s < 0) m.under++;
}

// ── the selection rule (deterministic) ───────────────────────────────────────
function chooseModality() {
  let best = MODS[0], bestScore = scoreOf(M[MODS[0]]);
  for (let i = 1; i < MODS.length; i++) {
    const k = MODS[i], s = scoreOf(M[k]);
    if (s > bestScore + EPS) { best = k; bestScore = s; }
    else if (Math.abs(s - bestScore) <= EPS && M[k].last < M[best].last) { best = k; }
  }
  return best;
}
function binScore(k, i) {
  const m = M[k], b = m.bins[i];
  return b.W > 0 ? b.S / b.W : Math.abs(biasOf(m));   // unvisited band inherits the modality's own |bias|
}
function chooseBand(k) {
  const m = M[k];
  let best = 0, bestScore = binScore(k, 0);
  for (let i = 1; i < 3; i++) {
    const s = binScore(k, i);
    if (s > bestScore + EPS) { best = i; bestScore = s; }
    else if (Math.abs(s - bestScore) <= EPS && m.bins[i].n < m.bins[best].n) { best = i; }
  }
  return best;
}
function fmtBand(k, v) { return SPEC[k].dec === 0 ? String(Math.round(v)) : v.toFixed(SPEC[k].dec); }
function explainChoice(k, bin) {
  const m = M[k], sp = SPEC[k], r = sp.bins[bin];
  const table = MODS.map(x => `${x} ${scoreOf(M[x]).toFixed(3)}`).join(' / ');
  return `${k}: |bias| ${Math.abs(biasOf(m)).toFixed(3)} + spread ${spreadOf(m).toFixed(3)} = `
       + `${scoreOf(m).toFixed(3)}, the worst of ${table}. Magnitude drawn from the `
       + `${fmtBand(k, r[0])}-${fmtBand(k, r[1])} ${sp.unit} band, where this learner's mean relative `
       + `error is largest (${binScore(k, bin).toFixed(3)}) over ${m.n} ${k} trials so far.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIAL GENERATION — the only consumer of the PRNG
// ─────────────────────────────────────────────────────────────────────────────
function makeTrial(index) {
  let mod, bin, why = null;
  if (index <= N_CAL) {
    mod = MODS[(index - 1) % 3];                  // fixed sweep: distance, height, angle, twice over
    bin = index <= 3 ? 0 : 2;                     // low band, then high band — brackets each range
  } else {
    mod = chooseModality();
    bin = chooseBand(mod);
    why = explainChoice(mod, bin);
  }
  const sp = SPEC[mod], r = sp.bins[bin];
  const target = snap(r[0] + rnd() * (r[1] - r[0]), sp.step, sp.dec);
  // Where the instrument starts. Randomised and pushed clear of the target, so a fixed park height or
  // needle angle can never become an anchor that answers the question for the visitor.
  let start = 0;
  if (mod === 'height') {
    const side = rnd() < 0.5 ? -1 : 1, mag = 0.30 + rnd() * 0.55;
    let s = target + side * mag;
    if (s < RAIL_LO + 0.02 || s > RAIL_HI - 0.02) s = target - side * mag;
    start = Math.max(RAIL_LO, Math.min(RAIL_HI, s));
  } else if (mod === 'angle') {
    const side = rnd() < 0.5 ? -1 : 1, mag = 22 + rnd() * 55;
    let s = target + mag;
    if (s > 165) s = Math.max(8, target - mag);
    start = side * s;                             // signed: which side of the beacon the pointer parks on
  }
  return { index, phase: index <= N_CAL ? 'calibration' : 'adaptive', modality: mod, band: bin,
           target, unit: sp.unit, start, why };
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STATE
// ─────────────────────────────────────────────────────────────────────────────
let seedVal = 20260831 | 0;
let cur = null;                 // the pending trial
let stage = 'prompt';           // 'prompt' | 'feedback' | 'summary'
let phaseNow = 'calibration';
let history = [];
let lastFeedback = '', lastRec = null;
let silent = false;             // suppress tones while the panel drives ENV_TEST
let dragging = false;
let reveal = 0;                 // 0..1 eased scale on the freshly drawn truth
let lastPlaque = '';
let zeroLocal = 0;              // beacon bearing in rose-local coordinates

function ping(f, d, t) { if (!silent) tone(f, d, t); }

// ── scene handles (all built once) ───────────────────────────────────────────
let plaque, plaqueHit, postG, postShaft, poleG, poleShaft, handle, roseG, roseDisc, needle, needleTip,
    beaconG, beaconCap;
let fbRoot, fbD, fbH, fbA;
let dTapeA, dTapeT, dRingA, dStalkT, dCapT, dRung, dNumHold, dNum;
let hRingA, hRingT, hGap, hNumHold, hNum;
let aGhost, aNumHold, aNum;
const arcSegs = [];
let padG;
const bars = [], barBoxes = [], barLabels = [], billboards = [], tags = [];
const ARC_SEG = 20, ARC_R = ROSE_R * 0.80, NUM_REF = 2.2;   // metres at which a feedback number reads 1:1

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE — every adaptive sentence is spoken from the model, not from the trial
// ─────────────────────────────────────────────────────────────────────────────
function fmtVal(k, v) {
  if (k === 'angle') return `${Math.round(v)}°`;
  return `${v.toFixed(k === 'height' ? 2 : 1)} m`;
}
function fmtSigned(k, v) {
  const s = v >= 0 ? '+' : '-', a = Math.abs(v);
  return k === 'angle' ? `${s}${a.toFixed(0)}°` : `${s}${a.toFixed(2)} m`;
}
function pct(x) { return `${x >= 0 ? '+' : '-'}${Math.abs(Math.round(x * 100))}%`; }

function habitPhrase(k) {
  const b = biasOf(M[k]), p = Math.abs(Math.round(b * 100));
  if (k === 'distance') return b < 0 ? `you compress distance by about ${p}%`
                                     : `you stretch distance by about ${p}%`;
  if (k === 'height') return b < 0 ? `you set heights about ${p}% low`
                                   : `you set heights about ${p}% high`;
  return b < 0 ? `you stop about ${p}% short of the angle asked`
               : `you turn about ${p}% past the angle asked`;
}
function habitWord(k) {
  const b = biasOf(M[k]);
  if (k === 'distance') return b < 0 ? 'near' : 'far';
  if (k === 'height') return b < 0 ? 'low' : 'high';
  return b < 0 ? 'narrow' : 'wide';
}

function feedbackFor(rec) {
  const k = rec.modality, m = M[k];
  const head = `You said ${fmtVal(k, rec.answer)}. It was ${fmtVal(k, rec.target)}.\n`
             + `${fmtSigned(k, rec.signedError)} - that is ${pct(rec.relError)} of the target.`;
  if (rec.phase === 'calibration') return head;   // two samples is not a trend; do not pretend it is

  // adaptive: speak in trends, with the model's own numbers
  const dir = rec.relError < 0 ? 'undershot' : 'overshot';
  const sp = Math.abs(Math.round(spreadOf(m) * 100));
  const sameSign = m.runSign === (rec.relError < 0 ? -1 : 1);
  const trend = (m.run >= 2 && sameSign)
    ? `${ORD[Math.min(m.run, 16)]} time in a row you have ${dir} ${SPEC[k].band[rec.band]}.`
    : `That is ${rec.relError < 0 ? m.under : m.over} of your ${m.n} ${k} trials on the `
      + `${rec.relError < 0 ? 'short' : 'long'} side.`;
  const model = `Across ${m.n} ${k} trials ${habitPhrase(k)}, steady to +/-${sp}%.`;
  return `${head}\n${trend}\n${model}`;
}

function strongestMod() {
  let best = MODS[0];
  for (const k of MODS) if (Math.abs(biasOf(M[k])) > Math.abs(biasOf(M[best]))) best = k;
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAQUE TEXT
// ─────────────────────────────────────────────────────────────────────────────
function promptLine(t) {
  if (t.modality === 'distance') return `Walk to where you think you stand ${fmtVal('distance', t.target)} from the post.`;
  if (t.modality === 'height') return `Raise the marker on the pole to ${fmtVal('height', t.target)} above the floor.`;
  return `Turn the pointer to ${fmtVal('angle', t.target)} from the beacon.`;
}
function plaqueText() {
  if (stage === 'summary') {
    const k = strongestMod();
    return `Your strongest habit is ${k}: ${habitPhrase(k)}.\n`
         + `Your eyes have habits. Now you have met them.\n`
         + `Point at RESTART for a new session.`;
  }
  if (stage === 'feedback' && lastRec) {
    // the header names the trial the visitor just answered — the next one is not on the board yet
    return `Trial ${lastRec.index} of ${N_TRIALS} · ${lastRec.phase}    ${lastRec.modality.toUpperCase()}\n`
         + `${lastFeedback}\nPoint here for the next one.`;
  }
  const t = cur;
  if (!t) return 'Let us find out how your eyes lie to you.';
  const head = `Trial ${t.index} of ${N_TRIALS} · ${t.phase}    ${t.modality.toUpperCase()}`;
  const open = t.index === 1 ? 'Let us find out how your eyes lie to you.\n' : '';
  return `${head}\n${open}${promptLine(t)}\nThen point here and pull the trigger.`;
}
function refreshPlaque() {
  const s = plaqueText();
  if (s !== lastPlaque) { lastPlaque = s; plaque.setText(s); }
}

// ─────────────────────────────────────────────────────────────────────────────
// READING THE BODY — what the visitor's answer actually is, in the trial's unit
// ─────────────────────────────────────────────────────────────────────────────
let ansBearing = 0, bearingFresh = false;   // world bearing post → visitor, kept for drawing the tape
function yawFrom(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }
function clampDeg(x) { return Math.max(-179.5, Math.min(179.5, x)); }
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

function zeroYaw() { roseG.getWorldPosition(_c); beaconG.getWorldPosition(_w); return yawFrom(_c, _w); }
function needleYaw() { roseG.getWorldPosition(_c); needleTip.getWorldPosition(_w); return yawFrom(_c, _w); }

function readWorldAnswer(k) {
  if (k === 'distance') {
    camera.getWorldPosition(_v); postG.getWorldPosition(_w);
    const dx = _v.x - _w.x, dz = _v.z - _w.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    ansBearing = (d > 1e-4) ? Math.atan2(dx, dz) : 0;
    bearingFresh = true;
    return d;
  }
  if (k === 'height') {
    handle.getWorldPosition(_v); poleG.getWorldPosition(_w);
    return _v.y - _w.y;
  }
  return Math.abs(wrapPi(needleYaw() - zeroYaw())) * 180 / Math.PI;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK GEOMETRY — repositioned, never rebuilt. Everything lives in fbRoot,
// parented to the scene and driven from live world positions, so it stays
// correct after the engine rescales the room to the real wearer.
// ─────────────────────────────────────────────────────────────────────────────
function hideFeedback() {
  fbD.visible = false; fbH.visible = false; fbA.visible = false;
  for (let i = 0; i < billboards.length; i++) billboards[i].hold.visible = false;
}
function layTape(box, from, to, y, bearing) {
  const len = Math.max(0.002, Math.abs(to - from)), mid = (from + to) / 2;
  box.scale.set(1, 1, len);
  box.position.set(Math.sin(bearing) * mid, y, Math.cos(bearing) * mid);
  box.rotation.y = bearing;
}

// The visitor is standing ON one end of this measurement, so nothing tall may be drawn at their own
// spot (it would be inside their head) and nothing they must read may be placed at the midpoint (which
// can be 20 cm from their face). Their spot gets a flat footprint ring; the TRUTH gets the standing
// marker and carries the number, so the whole thing reads from where they are, looking at the post.
function drawDistance(rec) {
  postG.getWorldPosition(_c);
  fbD.position.copy(_c);
  const a = rec.answer, t = rec.target, b = ansBearing;
  const px = Math.sin(b), pz = Math.cos(b);
  const qx = Math.cos(b), qz = -Math.sin(b);              // lateral, so the two tapes never overlap
  layTape(dTapeA, 0, a, 0.006, b);
  dTapeA.position.x += qx * 0.07; dTapeA.position.z += qz * 0.07;
  layTape(dTapeT, 0, t, 0.006, b);
  dTapeT.position.x -= qx * 0.07; dTapeT.position.z -= qz * 0.07;
  dRingA.position.set(px * a, 0.012, pz * a);
  dStalkT.position.set(px * t, 0.55, pz * t);
  dCapT.position.set(px * t, 1.12, pz * t);
  layTape(dRung, a, t, 0.075, b);
  dNumHold.position.set(px * t, 1.34, pz * t);
  dNum.setText(`${fmtSigned('distance', rec.signedError)}   ${pct(rec.relError)}`);
  dNumHold.visible = true;
  fbD.visible = true;
}

function drawHeight(rec) {
  poleG.getWorldPosition(_c);
  fbH.position.copy(_c);
  camera.getWorldPosition(_v);
  let ox = _v.x - _c.x, oz = _v.z - _c.z;                 // put the gap bar on the side the visitor sees
  const on = Math.hypot(ox, oz) || 1; ox /= on; oz /= on;
  const sx = -oz, sz = ox;                                // perpendicular to the line of sight
  const a = Math.max(0.02, Math.min(POLE_H, rec.answer)); // rings stay on the pole; the number is exact
  const t = rec.target;
  hRingA.position.y = a;
  hRingT.position.y = t;
  const mid = (a + t) / 2, len = Math.max(0.006, Math.abs(t - a));
  hGap.scale.set(1, len, 1);
  hGap.position.set(sx * 0.19, mid, sz * 0.19);
  hNumHold.position.set(sx * 0.46, Math.max(1.15, Math.min(1.95, mid)), sz * 0.46);
  hNum.setText(`${fmtSigned('height', rec.signedError)}   ${pct(rec.relError)}`);
  hNumHold.visible = true;
  fbH.visible = true;
}

function drawAngle(rec) {
  roseG.getWorldPosition(_c);
  fbA.position.copy(_c);
  const z = zeroYaw();
  const live = wrapPi(needleYaw() - z);
  const side = live >= 0 ? 1 : -1;                         // the side the visitor actually turned to
  const n = z + side * clampDeg(rec.answer) * Math.PI / 180;
  const truth = z + side * clampDeg(rec.target) * Math.PI / 180;
  aGhost.rotation.y = truth;
  // A THREE.Line is one pixel wide at 3 m — useless as the thing the visitor is meant to read. The arc
  // is a chain of short boxes instead: built once, only repositioned, so it costs nothing per trial.
  const span = truth - n, step = span / ARC_SEG;
  const chord = 2 * ARC_R * Math.abs(Math.sin(step / 2)) + 0.008;
  for (let i = 0; i < ARC_SEG; i++) {
    const seg = arcSegs[i], yaw = n + step * (i + 0.5);
    seg.position.set(Math.sin(yaw) * ARC_R, 0.055, Math.cos(yaw) * ARC_R);
    seg.rotation.y = yaw + Math.PI / 2;                    // lie along the tangent, not the radius
    seg.scale.z = Math.max(0.004, chord);
  }
  const midYaw = (n + truth) / 2;
  aNumHold.position.set(Math.sin(midYaw) * ARC_R, 0.58, Math.cos(midYaw) * ARC_R);
  aNum.setText(`${fmtSigned('angle', rec.signedError)}   ${pct(rec.relError)}`);
  aNumHold.visible = true;
  fbA.visible = true;
}

function showFeedback(rec) {
  hideFeedback();
  if (rec.modality === 'distance') drawDistance(rec);
  else if (rec.modality === 'height') drawHeight(rec);
  else drawAngle(rec);
  reveal = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENT STATE
// ─────────────────────────────────────────────────────────────────────────────
function armInstruments() {
  const t = cur;
  handle.position.y = PARK_H;
  needle.rotation.y = zeroLocal + Math.PI;                // 180° off the beacon: neutral, never a hint
  if (t) {
    if (t.modality === 'height') handle.position.y = t.start;
    if (t.modality === 'angle') needle.rotation.y = zeroLocal + t.start * Math.PI / 180;
  }
  // The live station is LIT, not recoloured: teal always means "your answer" and amber always means
  // "the truth", so neither may be spent on saying which instrument is in use.
  const k = t ? t.modality : null;
  postShaft.material.color.setHex(k === 'distance' ? CL : CG);
  poleShaft.material.color.setHex(k === 'height' ? CL : CG);
  roseDisc.material.color.setHex(k === 'angle' ? CL : CG);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function barInfo(k) {
  const b = biasOf(M[k]), raw = Math.abs(b) * BAR_SCALE;
  const capped = raw > BAR_MAX + 1e-9;
  const h = Math.max(0.03, Math.min(BAR_MAX, raw));
  return { bias: b, percent: +(b * 100).toFixed(1), heightM: +h.toFixed(4), capped,
           direction: b < 0 ? 'under' : 'over', n: M[k].n,
           label: `${k}\n${pct(b)} ${habitWord(k)}${capped ? ' (capped)' : ''}` };
}
function setBarsVisible(on) { for (let i = 0; i < bars.length; i++) bars[i].visible = on; }

function enterSummary() {
  for (let i = 0; i < 3; i++) {
    const info = barInfo(MODS[i]);
    barBoxes[i].scale.y = info.heightM;
    barBoxes[i].position.y = info.heightM / 2;
    barBoxes[i].material.color.setHex(info.bias < 0 ? CA : CT);
    barLabels[i].setText(info.label);
    barLabels[i].position.y = info.heightM + 0.20;
  }
  setBarsVisible(true);
  padG.visible = true;
  postG.visible = false; poleG.visible = false; roseG.visible = false; beaconG.visible = false;
  for (let i = 0; i < tags.length; i++) tags[i].visible = false;   // free labels do not ride their group
  hideFeedback();
  ping(392, 0.22, 'sine'); ping(523, 0.30, 'sine');
}
function leaveSummary() {
  setBarsVisible(false);
  padG.visible = false;
  postG.visible = true; poleG.visible = true; roseG.visible = true; beaconG.visible = true;
  for (let i = 0; i < tags.length; i++) tags[i].visible = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION FLOW
// ─────────────────────────────────────────────────────────────────────────────
function startSession(reseed) {
  if (reseed) seedVal = (Math.imul(seedVal ^ 0x9E3779B9, 0x85EBCA6B) | 0);  // walk the seed, still pure
  setSeed(seedVal);
  resetModel();
  history = [];
  lastFeedback = ''; lastRec = null;
  leaveSummary();
  hideFeedback();
  phaseNow = 'calibration';
  stage = 'prompt';
  cur = makeTrial(1);
  armInstruments();
  refreshPlaque();
}

function commit(value) {
  if (!cur) return null;
  const t = cur, err = value - t.target, rel = err / t.target;
  if (t.modality === 'distance' && !bearingFresh) {
    // answered through ENV_TEST rather than with the feet: lay the tape on the bearing the visitor is
    // actually standing on, so the drawing is still a picture of this room and not of nowhere.
    camera.getWorldPosition(_v); postG.getWorldPosition(_w);
    const bx = _v.x - _w.x, bz = _v.z - _w.z;
    ansBearing = (bx * bx + bz * bz > 1e-8) ? Math.atan2(bx, bz) : 0;
  }
  bearingFresh = false;
  learn(t.modality, rel, t.band, t.index);
  const rec = { index: t.index, phase: t.phase, modality: t.modality, band: t.band,
                target: t.target, answer: value, signedError: err, relError: rel };
  const fb = feedbackFor(rec);
  rec.feedbackText = fb;
  lastFeedback = fb; lastRec = rec;
  history.push(rec);
  showFeedback(rec);
  if (t.index >= N_TRIALS) {
    cur = null; phaseNow = 'summary'; stage = 'summary';
    enterSummary();
  } else {
    cur = makeTrial(t.index + 1);       // drawn from the model as it stands NOW, one trial ahead
    phaseNow = cur.phase;
    stage = 'feedback';
    ping(rel < 0 ? 392 : 494, 0.14, 'sine');
  }
  refreshPlaque();
  return { signedError: err, feedbackText: fb, relError: rel, target: t.target, answer: value,
           modality: t.modality, index: t.index, phase: t.phase, band: t.band };
}

function onPlaque() {
  if (stage === 'prompt') { commit(readWorldAnswer(cur.modality)); return; }
  if (stage === 'feedback') {
    stage = 'prompt';
    hideFeedback();
    armInstruments();
    refreshPlaque();
    ping(660, 0.08, 'triangle');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────
function build() {
  sky({ top: '#0d1220', bottom: '#3b4453' });                            // clinic at dusk
  ground({ color: '#33373f', grid: false, arrow: false, radius: 9 });    // NO grid: a grid is a ruler
  input.teleportGuard = () => dragging;
  resetModel();

  // ── the plaque: a free label, so it stays square to the visitor from anywhere on the floor
  plaque = label(' ', { dist: PLAQUE_DIST, dir: PLAQUE_DIR, height: PLAQUE_TOP, anchor: 'top',
                        size: 'large', width: PLAQUE_W, theme: 'dark', accent: '#f2b05c' });
  plaqueHit = shape.hit(1.85, 0.86, 0.06);
  plaqueHit.name = 'plaque';
  place(plaqueHit, { dist: PLAQUE_DIST + 0.02, dir: PLAQUE_DIR, height: 1.66 });
  interactive(plaqueHit, { select: onPlaque });

  // ── the post: the reference you walk away from. No rings on the floor, no marks.
  postG = shape.group(); postG.name = 'the post';
  postShaft = shape.cylinder(0.07, POST_H, CG);
  postShaft.material = mat(CG, {});
  postShaft.position.y = POST_H / 2;
  postG.add(postShaft);
  place(postG, { dist: POST_DIST, dir: POST_DIR, height: 'floor', anchor: 'bottom' });
  const postCap = shape.ball(0.10, CT);
  postCap.position.y = POST_H + 0.06;
  postG.add(postCap);
  const postFoot = shape.cylinder(0.22, 0.03, CG);
  postFoot.position.y = 0.015;
  postG.add(postFoot);
  tags.push(label('the post', { dist: POST_DIST, dir: POST_DIR, height: POST_H + 0.34, size: 'small', bg: false }));

  // ── the pole: a smooth shaft with a grab:'hold' marker. No scale, no ticks — that is the point.
  poleG = shape.group(); poleG.name = 'the pole';
  poleShaft = shape.cylinder(0.045, POLE_H, CG);
  poleShaft.material = mat(CG, {});
  poleShaft.position.y = POLE_H / 2;
  poleG.add(poleShaft);
  place(poleG, { dist: POLE_DIST, dir: POLE_DIR, height: 'floor', anchor: 'bottom' });
  const poleFoot = shape.cylinder(0.20, 0.03, CG);
  poleFoot.position.y = 0.015;
  poleG.add(poleFoot);

  handle = shape.group(); handle.name = 'height marker';
  const ring = shape.torus(0.105, 0.024, CA);
  ring.rotation.x = -Math.PI / 2;
  handle.add(ring);
  const grip = shape.box(0.20, 0.035, 0.05, CA);
  grip.position.set(0.16, 0, 0);
  handle.add(grip);
  handle.add(shape.hit(0.44, 0.26, 0.30));
  handle.position.y = PARK_H;
  poleG.add(handle);
  let hOff = 0;
  interactive(handle, {
    grab: 'hold',
    select: (o, info) => {
      dragging = true;
      hOff = (info && info.point) ? handle.position.y - poleG.worldToLocal(_v.copy(info.point)).y : 0;
      ping(520, 0.05, 'sine');
    },
    drag: (o, info) => {
      if (!info || !info.point) return;                   // no ray this frame: hold, never guess
      const y = poleG.worldToLocal(_v.copy(info.point)).y + hOff;
      handle.position.y = Math.max(RAIL_LO, Math.min(RAIL_HI, y));
    },
    release: () => { dragging = false; },
  });
  tags.push(label('the pole', { dist: POLE_DIST, dir: POLE_DIR, height: POLE_H + 0.20, size: 'small', bg: false }));

  // ── the rose + the beacon: a plain disc and a zero line. No degree marks anywhere.
  roseG = shape.group(); roseG.name = 'the rose';
  roseDisc = shape.cylinder(ROSE_R, 0.012, CG);
  roseDisc.material = mat(CG, {});
  roseDisc.position.y = 0.006;
  roseG.add(roseDisc);
  place(roseG, { dist: ROSE_DIST, dir: ROSE_DIR, height: 'floor', anchor: 'bottom' });

  beaconG = shape.group(); beaconG.name = 'the beacon';
  const beaconShaft = shape.cylinder(0.05, BEACON_H, CG);
  beaconShaft.position.y = BEACON_H / 2;
  beaconG.add(beaconShaft);
  place(beaconG, { dist: BEACON_DIST, dir: BEACON_DIR, height: 'floor', anchor: 'bottom' });
  beaconCap = shape.ball(0.14, CT);
  beaconCap.material = mat(CT, { emissive: CT, emissiveIntensity: 0.9 });
  beaconCap.position.y = BEACON_H + 0.08;
  beaconG.add(beaconCap);
  tags.push(label('the beacon', { dist: BEACON_DIST, dir: BEACON_DIR, height: BEACON_H + 0.40, size: 'small', bg: false }));

  // the beacon's bearing expressed in ROSE-LOCAL coordinates — the frame the needle actually turns in,
  // which survives any yaw the engine's placement rig applies to the room.
  beaconG.getWorldPosition(_w);
  roseG.worldToLocal(_w);
  zeroLocal = Math.atan2(_w.x, _w.z);

  const zeroLine = shape.box(0.022, 0.006, ROSE_R * 0.94, CT);
  zeroLine.position.set(Math.sin(zeroLocal) * ROSE_R * 0.47, 0.014, Math.cos(zeroLocal) * ROSE_R * 0.47);
  zeroLine.rotation.y = zeroLocal;
  roseG.add(zeroLine);
  const hub = shape.cylinder(0.055, 0.05, CT);
  hub.position.y = 0.025;
  roseG.add(hub);
  tags.push(label('the rose', { dist: ROSE_DIST, dir: ROSE_DIR, height: 0.92, size: 'small', bg: false }));

  needle = shape.group(); needle.name = 'the pointer';
  const nShaft = shape.box(0.034, 0.024, NEEDLE_LEN, CA);
  nShaft.position.set(0, 0.038, NEEDLE_LEN / 2 + 0.02);
  needle.add(nShaft);
  needleTip = shape.cone(0.052, 0.11, CA);
  needleTip.rotation.x = Math.PI / 2;
  needleTip.position.set(0, 0.038, NEEDLE_LEN + 0.07);
  needle.add(needleTip);
  const nHit = shape.hit(0.34, 0.46, 0.68);                // a low, thin pointer needs a fat invisible target
  nHit.position.set(0, 0.20, NEEDLE_LEN * 0.55);
  needle.add(nHit);
  needle.position.y = 0.012;
  needle.rotation.y = zeroLocal + Math.PI;
  roseG.add(needle);
  let nOff = 0;
  interactive(needle, {
    grab: 'hold',
    select: (o, info) => {
      nOff = 0;
      dragging = true;
      if (info && info.point) {
        roseG.worldToLocal(_v.copy(info.point));
        nOff = wrapPi(needle.rotation.y - Math.atan2(_v.x, _v.z));
      }
      ping(520, 0.05, 'sine');
    },
    drag: (o, info) => {
      if (!info || !info.point) return;
      roseG.worldToLocal(_v.copy(info.point));
      if (_v.x * _v.x + _v.z * _v.z < 1e-4) return;        // a ray through the hub carries no bearing
      needle.rotation.y = Math.atan2(_v.x, _v.z) + nOff;
    },
    release: () => { dragging = false; },
  });

  // ── feedback rig (world space, driven from live world positions) ───────────
  fbRoot = shape.group(); fbRoot.name = 'feedback';
  scene.add(fbRoot);

  fbD = shape.group(); fbRoot.add(fbD);
  dTapeA = shape.box(0.055, 0.006, 1, CA); fbD.add(dTapeA);
  dTapeT = shape.box(0.055, 0.006, 1, CT); fbD.add(dTapeT);
  dRingA = shape.torus(0.22, 0.026, CA); dRingA.rotation.x = -Math.PI / 2; fbD.add(dRingA);
  dStalkT = shape.cylinder(0.024, 1.10, CT); fbD.add(dStalkT);
  dCapT = shape.ball(0.075, CT); fbD.add(dCapT);
  dRung = shape.box(0.035, 0.035, 1, CE); fbD.add(dRung);
  dNumHold = shape.group(); fbD.add(dNumHold);
  dNum = label(' ', { parent: dNumHold, at: [0, 0, 0], capHeight: 0.050, bg: false });
  billboards.push({ hold: dNumHold, root: fbD });

  fbH = shape.group(); fbRoot.add(fbH);
  hRingA = shape.torus(0.135, 0.016, CA); hRingA.rotation.x = -Math.PI / 2; fbH.add(hRingA);
  hRingT = shape.torus(0.135, 0.016, CT); hRingT.rotation.x = -Math.PI / 2; fbH.add(hRingT);
  hGap = shape.box(0.035, 1, 0.035, CE); fbH.add(hGap);
  hNumHold = shape.group(); fbH.add(hNumHold);
  hNum = label(' ', { parent: hNumHold, at: [0, 0, 0], capHeight: 0.050, bg: false });
  billboards.push({ hold: hNumHold, root: fbH });

  fbA = shape.group(); fbRoot.add(fbA);
  aGhost = shape.group();
  const gShaft = shape.box(0.032, 0.022, NEEDLE_LEN * 1.18, CT);
  gShaft.position.set(0, 0.135, NEEDLE_LEN * 0.59 + 0.02);
  aGhost.add(gShaft);
  const gTip = shape.cone(0.050, 0.11, CT);
  gTip.rotation.x = Math.PI / 2;
  gTip.position.set(0, 0.135, NEEDLE_LEN * 1.18 + 0.07);
  const gStem = shape.cylinder(0.014, 0.135, CT);          // drops to the hub, so the ghost reads as a
  gStem.position.set(0, 0.068, 0);                         // second pointer on the same pivot
  aGhost.add(gStem);
  aGhost.add(gTip);
  fbA.add(aGhost);
  for (let i = 0; i < ARC_SEG; i++) {
    const seg = shape.box(0.040, 0.030, 1, CE);
    fbA.add(seg);
    arcSegs.push(seg);
  }
  aNumHold = shape.group(); fbA.add(aNumHold);
  aNum = label(' ', { parent: aNumHold, at: [0, 0, 0], capHeight: 0.050, bg: false });
  billboards.push({ hold: aNumHold, root: fbA });

  // ── summary bars + restart pad (hidden until the sixteenth answer) ─────────
  for (let i = 0; i < 3; i++) {
    const g = shape.group(); g.name = MODS[i] + ' bias bar';
    const box = shape.box(0.22, 1, 0.22, CA);
    box.material = mat(CA, {});
    box.position.y = 0.5;
    g.add(box);
    // face:true so the parented number turns to the visitor; the bar itself is square, so the yaw
    // it adds is invisible and the drawn height stays exactly |bias| × BAR_SCALE metres.
    place(g, { dist: BAR_DIST, dir: BAR_DIRS[i], height: 'floor', anchor: 'bottom', face: true });
    const plinth = shape.cylinder(0.19, 0.02, CG);
    plinth.position.y = 0.01;
    g.add(plinth);
    const lbl = label(MODS[i], { parent: g, at: [0, 1.20, 0.05], capHeight: 0.052, bg: false });
    g.visible = false;
    bars.push(g); barBoxes.push(box); barLabels.push(lbl);
  }

  padG = shape.group(); padG.name = 'restart';
  const pad = shape.panel(0.36, 0.15, '#243043');
  padG.add(pad);
  place(padG, { dist: PAD_DIST, dir: PAD_DIR, height: PAD_H, face: true });
  label('RESTART', { parent: pad, at: [0, 0, 0.035], capHeight: 0.048, bg: false });
  const padHit = shape.hit(0.44, 0.24, 0.12);
  padHit.name = 'restart pad';
  padG.add(padHit);
  interactive(padHit, { select: () => { ping(700, 0.12, 'triangle'); startSession(true); } });
  padG.visible = false;

  hideFeedback();
  startSession(false);
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAME — one eased reveal scalar and one yaw per visible number. Nothing else.
// ─────────────────────────────────────────────────────────────────────────────
function frame(dt) {
  if (reveal < 1) {
    reveal = Math.min(1, reveal + dt * 3.2);
    const s = 0.35 + 0.65 * (1 - (1 - reveal) * (1 - reveal));
    dStalkT.scale.y = s; dStalkT.position.y = 0.55 * s;
    dCapT.scale.setScalar(s);
    hRingT.scale.setScalar(s);
    aGhost.scale.setScalar(s);
  }
  camera.getWorldPosition(_v);
  for (let i = 0; i < billboards.length; i++) {
    const b = billboards[i];
    if (!b.hold.visible || !b.root.visible) continue;
    b.hold.getWorldPosition(_w);
    b.hold.rotation.y = Math.atan2(_v.x - _w.x, _v.z - _w.z) - b.root.rotation.y;
    // These numbers hang on the measurement itself, so their distance is whatever the visitor's error
    // was — 0.2 m or 4 m. Scaling with range keeps the reading at one visual angle either way, which is
    // exactly how the kit sizes its own free text. Clamped so it never becomes a decal or a billboard.
    const d = _w.distanceTo(_v);
    b.hold.scale.setScalar(Math.min(1.9, Math.max(0.5, d / NUM_REF)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION CONTRACT
//   seed(n) + restart() replay a session exactly. Everything below is a pure read of session state
//   except seed(), restart(), answer(), advance() and restartButton().
// ─────────────────────────────────────────────────────────────────────────────
function modelOne(k) {
  const m = M[k];
  return { bias: biasOf(m), spread: spreadOf(m), n: m.n, score: scoreOf(m), last: m.last,
           over: m.over, under: m.under, run: m.run,
           bands: m.bins.map((b, i) => ({ lo: SPEC[k].bins[i][0], hi: SPEC[k].bins[i][1],
                                          meanAbsRel: binScore(k, i), n: b.n })) };
}
function summaryObj() {
  const d = barInfo('distance'), h = barInfo('height'), a = barInfo('angle'), k = strongestMod();
  return {
    available: phaseNow === 'summary', phase: phaseNow,
    distance: d.bias, height: h.bias, angle: a.bias,        // the three displayed bias numbers
    percent: { distance: d.percent, height: h.percent, angle: a.percent },
    bars: { distance: d, height: h, angle: a },
    strongest: k,
    sentence: `Your strongest habit is ${k}: ${habitPhrase(k)}.`,
    payoff: 'Your eyes have habits. Now you have met them.',
    text: plaqueText(),
  };
}

window.ENV_TEST = {
  seed(n) { seedVal = n | 0; startSession(false); return seedVal; },
  restart() { startSession(false); return true; },
  seedValue: () => seedVal,
  rngDraws: () => rngDraws,

  trial() {
    if (!cur) return { index: N_TRIALS + 1, phase: phaseNow, modality: null, target: null,
                       unit: null, band: null, done: true, stage, total: N_TRIALS };
    return { index: cur.index, phase: cur.phase, modality: cur.modality, target: cur.target,
             unit: cur.unit, band: cur.band, done: false, stage, total: N_TRIALS,
             prompt: promptLine(cur) };
  },

  answer(v) {
    if (!cur) return { done: true, phase: phaseNow, signedError: null, feedbackText: lastFeedback };
    silent = true;
    const r = commit(+v);
    silent = false;
    return r;
  },

  model() {
    return { distance: modelOne('distance'), height: modelOne('height'), angle: modelOne('angle') };
  },

  nextChoiceExplain() {
    // While an adaptive trial is pending this is the verdict that produced it — the model's numbers as
    // they stood at selection time. Otherwise the same rule is run live on the model as it stands now.
    const scores = { distance: scoreOf(M.distance), height: scoreOf(M.height), angle: scoreOf(M.angle) };
    if (cur && cur.phase === 'adaptive') {
      return { modality: cur.modality, why: cur.why, band: cur.band, forTrial: cur.index, scores };
    }
    const k = chooseModality(), b = chooseBand(k);
    return { modality: k, why: explainChoice(k, b), band: b,
             forTrial: cur ? Math.max(cur.index, N_CAL + 1) : null, scores };
  },

  summary() { return summaryObj(); },

  // ── observation helpers (no side effects) ────────────────────────────────
  phase: () => phaseNow,
  stage: () => stage,
  history: () => history.map(r => Object.assign({}, r)),
  plaqueText: () => lastPlaque,
  feedbackText: () => lastFeedback,
  visible: () => ({ bars: bars.map(b => b.visible), pad: padG.visible, post: postG.visible,
                    pole: poleG.visible, rose: roseG.visible, beacon: beaconG.visible,
                    fbDistance: fbD.visible, fbHeight: fbH.visible, fbAngle: fbA.visible }),
  barHeights: () => barBoxes.map(b => +b.scale.y.toFixed(4)),
  barText: () => barLabels.map(l => (l.userData && l.userData.label ? l.userData.label.text : null)),
  instruments: () => ({ handleY: +handle.position.y.toFixed(4),
                        needleDeg: +(Math.abs(wrapPi(needleYaw() - zeroYaw())) * 180 / Math.PI).toFixed(3) }),
  readWorld: (k) => readWorldAnswer(k || (cur ? cur.modality : 'distance')),

  // what the room actually DREW, in the same units as the numbers it printed
  drawn: () => ({
    distance: { shown: fbD.visible, tapeAnswer: +dTapeA.scale.z.toFixed(4),
                tapeTruth: +dTapeT.scale.z.toFixed(4), rung: +dRung.scale.z.toFixed(4) },
    height:   { shown: fbH.visible, ringAnswer: +hRingA.position.y.toFixed(4),
                ringTruth: +hRingT.position.y.toFixed(4), gap: +hGap.scale.y.toFixed(4) },
    angle:    { shown: fbA.visible,
                ghostDeg: +(Math.abs(wrapPi(aGhost.rotation.y - zeroYaw())) * 180 / Math.PI).toFixed(3) },
  }),
  advance() { onPlaque(); return stage; },        // the plaque trigger, exactly as a visitor presses it
  restartButton() { startSession(true); return seedVal; },
};

XR.run({ build, frame });
