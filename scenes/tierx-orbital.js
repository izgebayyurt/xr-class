const { THREE, shape, place, label, interactive, tone, mat, C, ground, sky, input } = XR;

// ─────────────────────────────────────────────────────────────────────────────
// x2 · ORBITAL SANDBOX (Tier X)
//
// A fixed star hangs two steps ahead at just above eye height. Moons live in a rack at your chest.
// Grab one, carry it, let go — and it falls. Thrown sideways it misses, and keeps missing: an ellipse
// that closes on itself and overdraws its own trail. Thrown hard it leaves on a hyperbola and is gone.
//
// ARCHITECTURE
//   • All physics lives in the STAR-CENTRED frame: the group `sys` is place()d at the star, and every
//     body's (p, v) is expressed in sys-local metres. That keeps the kernel free of world offsets and
//     makes the ENV_TEST contract's coordinates mean exactly what a reader expects (r = |p|).
//   • Integrator: velocity Verlet (kick–drift–kick), FIXED substep HSUB, driven by an accumulator.
//     Symplectic ⇒ bounded energy error, no secular drift. Live time and ENV_TEST.step() run the SAME
//     substep through the SAME function, so a headless step(60) and 60 s of play are the same physics.
//     A frame-time spike clamps the live accumulator: simulation time falls behind, energy never blows up.
//   • Angle swept uses the exact two-body identity θ̇ = h/r² (h = |p×v|, conserved) — no trig per substep.
//   • Trails: one preallocated Float32Array per moon, written as a true ring buffer with a mirrored
//     second half, so the drawn range is always a contiguous, chronologically-ordered window. Zero
//     allocation per frame or per sample; geometry/texture counts are constant for the life of the page.
//   • Fixed pool of 5 moons. A moon is a rack ornament, a held object, or a body — never a new object.
//     Nothing is ever created or disposed after build(), so renderer.info is flat forever.
//   • Throw velocity comes from the moon's own recent WORLD motion (ring of samples, last ~100 ms),
//     which is identical work for a VR hand and a desktop mouse-carry — one code path, both devices.
//
// DETERMINISM CONTRACT: touching ENV_TEST.spawn/step puts the room in MANUAL mode — the render loop
// stops advancing physics so the panel's step(seconds) is the only clock. A real grab, or
// ENV_TEST.live(true), hands time back to the render loop. Without this a few render frames between
// spawn() and step(60) would smear the phase and no "returns to start each period" test could pass.
// ─────────────────────────────────────────────────────────────────────────────

// ── tuning ───────────────────────────────────────────────────────────────────
const MU = 2.0;              // m³/s² — a 0.8 m circular orbit has v = 1.58 m/s and T = 3.18 s
const HSUB = 1 / 600;        // fixed substep, seconds of simulation time
const MAX_LIVE_ACC = 0.30;   // s of sim time a single frame may ever ask for (spike guard)
const ABSORB_R = 0.17;       // inside this the star swallows the moon
const ESCAPE_R = 12.0;       // past this it is gone
const STAR_DIST = 2.0, STAR_H = 1.70;
const N_MOON = 5;
const TRAIL_N = 700;         // ring capacity, points
const TRAIL_D2 = 0.02 * 0.02; // resample after 2 cm of travel — uniform in path length, not in time
const RACK_DIST = 0.70, RACK_H = 1.27, RACK_GAP = 0.155;
const MOON_R = 0.05, MOON_HIT = 0.072;
const WARP_MIN = 0.25, WARP_MAX = 4, WARP_SPAN = WARP_MAX / WARP_MIN; // ×16 across the rail
const SL_HALF = 0.14;        // slider rail half-length
const MOON_COL = [C.teal, C.purple, C.pink, C.yellow, C.blue];

// ── scratch (module scope: never allocated inside frame/substep) ─────────────
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

// ── state ────────────────────────────────────────────────────────────────────
let sys, star, glow, halo, rack, sliderRig, knob;
let readoutLbl, checkLbl, payoffLbl, warpLbl;
let slots = [], bodies = [], nextId = 1;
let warp = 1, liveAcc = 0, testAcc = 0, manual = false;
let lastId = 0, grabOffset = 0;
let flash = 0, payoffShown = false, eventMsg = '', eventUntil = 0, uiClock = 0, readoutTimer = 0;
let lastReadout = '', lastCheck = '', lastWarpTxt = '';
let lastThrow = null, lastBaseAge = 0;
const goals = { closed: false, escaped: false, absorbed: false, circle: false, longEllipse: false };

// ─────────────────────────────────────────────────────────────────────────────
// ORBITAL MATHS  (all in the star-centred frame; the star is the only source of gravity)
// ─────────────────────────────────────────────────────────────────────────────
function specificEnergy(b) {
  const r = Math.sqrt(b.px * b.px + b.py * b.py + b.pz * b.pz);
  return (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) / 2 - MU / r;
}

// Full element set from the state vector — exact, not integrated, so it is right on any frame.
function elementsOf(b) {
  const px = b.px, py = b.py, pz = b.pz, vx = b.vx, vy = b.vy, vz = b.vz;
  const r = Math.sqrt(px * px + py * py + pz * pz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const eps = v2 / 2 - MU / r;
  const hx = py * vz - pz * vy, hy = pz * vx - px * vz, hz = px * vy - py * vx;   // h = p × v
  const ex = (vy * hz - vz * hy) / MU - px / r;                                    // e = (v × h)/μ − r̂
  const ey = (vz * hx - vx * hz) / MU - py / r;
  const ez = (vx * hy - vy * hx) / MU - pz / r;
  const ecc = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const a = -MU / (2 * eps);                       // semi-major axis (negative ⇒ hyperbola)
  const bound = eps < 0;
  return {
    eps, ecc, a, bound, r, speed: Math.sqrt(v2),
    h: Math.sqrt(hx * hx + hy * hy + hz * hz),
    period: bound ? 2 * Math.PI * Math.sqrt(a * a * a / MU) : null,
    peri: a * (1 - ecc), apo: bound ? a * (1 + ecc) : null,
  };
}

// Eccentricity is the scale-free invariant, so classification never flickers along an orbit.
function classOf(eps, ecc) {
  if (Math.abs(ecc - 1) <= 0.02) return 'near-parabola';
  return eps < 0 ? 'ellipse' : 'hyperbola';
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAILS — mirrored ring buffer, contiguous draw window, zero per-frame allocation
// ─────────────────────────────────────────────────────────────────────────────
function makeTrail(hex) {
  const arr = new Float32Array(TRAIL_N * 2 * 3);
  const attr = new THREE.BufferAttribute(arr, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', attr);
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.8 }));
  line.frustumCulled = false;   // the bounding sphere never follows a mutated buffer — never let it cull
  line.name = 'orbit trail';
  return { line, arr, attr, geo, head: 0, dirty: false, lx: 0, ly: 0, lz: 0, has: false };
}

// Every sample is written twice — at w and at w+N — so [head%N, head%N + N) is always one contiguous
// run holding the last N samples in order. No wrap-around chord, no copying, O(1) per sample.
function trailPush(t, x, y, z) {
  const w = t.head % TRAIL_N;
  let i = w * 3;
  t.arr[i] = x; t.arr[i + 1] = y; t.arr[i + 2] = z;
  i = (w + TRAIL_N) * 3;
  t.arr[i] = x; t.arr[i + 1] = y; t.arr[i + 2] = z;
  t.head++;
  if (t.head <= TRAIL_N) t.geo.setDrawRange(0, t.head);
  else t.geo.setDrawRange(t.head % TRAIL_N, TRAIL_N);
  t.lx = x; t.ly = y; t.lz = z; t.has = true;
  t.dirty = true;
}
function trailClear(t) { t.head = 0; t.has = false; t.geo.setDrawRange(0, 0); t.dirty = true; }
function trailFlush() {
  for (let i = 0; i < slots.length; i++) {
    const t = slots[i].trail;
    if (t.dirty) { t.attr.needsUpdate = true; t.dirty = false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BODIES
// ─────────────────────────────────────────────────────────────────────────────
function freeSlot() {
  for (let i = 0; i < slots.length; i++) if (slots[i].mode === 'racked') return slots[i];
  for (let i = 0; i < slots.length; i++) if (slots[i].mode === 'flying') { retire(slots[i]); return slots[i]; }
  return null;                                  // every moon is in a hand — refuse rather than fake one
}

// Detach a flying moon from its body (re-grab, or recycled by spawn) and drop the body record.
function retire(slot) {
  const b = slot.body;
  if (b) { const k = bodies.indexOf(b); if (k >= 0) bodies.splice(k, 1); b.slot = null; slot.body = null; }
  trailClear(slot.trail);
}

function addBody(slot, px, py, pz, vx, vy, vz, thrown) {
  const b = {
    id: nextId++, slot, thrown, state: 'orbit',
    px, py, pz, vx, vy, vz, ax: 0, ay: 0, az: 0,
    sweep: 0, hmag: 0, laps: 0,
  };
  const hx = py * vz - pz * vy, hy = pz * vx - px * vz, hz = px * vy - py * vx;
  b.hmag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const r2 = px * px + py * py + pz * pz, r = Math.sqrt(r2), k = -MU / (r2 * r);
  b.ax = k * px; b.ay = k * py; b.az = k * pz;
  slot.body = b; slot.mode = 'flying';
  slot.g.visible = true;
  trailClear(slot.trail);
  trailPush(slot.trail, px, py, pz);
  bodies.push(b);
  if (bodies.length > 48) bodies.splice(0, bodies.length - 48);   // history cap; live bodies are ≤ 5
  lastId = b.id;
  if (r < ABSORB_R) finish(b, 'absorbed');                        // spawned inside the star? swallowed now
  return b.id;
}

// A finished body keeps its record (so bodies() can report 'absorbed' / 'escaped') but stops
// integrating and gives its moon back to the rack, ready to be thrown again.
function finish(b, how) {
  if (b.state !== 'orbit') return;
  b.state = how;
  const slot = b.slot;
  if (slot) {
    slot.body = null; b.slot = null;
    slot.mode = 'racked';
    slot.cradle.add(slot.g);
    slot.g.position.set(0, MOON_R * 0.6, 0);
    slot.g.rotation.set(0, 0, 0);
    slot.g.visible = true;
    if (how === 'absorbed') trailClear(slot.trail);              // eaten: its path is gone with it
  }
  if (how === 'absorbed') { flash = 1; goals.absorbed = true; setEvent('the star swallowed it'); if (!manual) tone(150, 0.35, 'sine'); }
  else { goals.escaped = true; setEvent('escaped — past 12 m, never coming back'); if (!manual) tone(320, 0.3, 'triangle'); }
}

function setEvent(msg) { eventMsg = msg; eventUntil = uiClock + 3.5; }

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATOR — velocity Verlet, one fixed substep. This is the only place p and v ever change.
// ─────────────────────────────────────────────────────────────────────────────
function substepAll() {
  const h = HSUB, hh = 0.5 * HSUB;
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.state !== 'orbit' || !b.slot) continue;

    // kick (half) · drift (full) · kick (half) — accelerations carried across substeps
    b.vx += hh * b.ax; b.vy += hh * b.ay; b.vz += hh * b.az;
    b.px += h * b.vx;  b.py += h * b.vy;  b.pz += h * b.vz;
    let r2 = b.px * b.px + b.py * b.py + b.pz * b.pz;
    if (r2 < 1e-8) r2 = 1e-8;                                    // singularity floor; absorption fires first
    const r = Math.sqrt(r2), k = -MU / (r2 * r);
    b.ax = k * b.px; b.ay = k * b.py; b.az = k * b.pz;
    b.vx += hh * b.ax; b.vy += hh * b.ay; b.vz += hh * b.az;

    // swept angle, exactly: r²θ̇ = h for any two-body orbit. No atan2, no accumulation error.
    b.sweep += (b.hmag / r2) * h;
    if (b.sweep >= 2 * Math.PI * (b.laps + 1)) { b.laps++; onLap(b); }

    if (r < ABSORB_R) { finish(b, 'absorbed'); continue; }
    if (r > ESCAPE_R) { finish(b, 'escaped'); continue; }

    const t = b.slot.trail;
    if (!t.has) trailPush(t, b.px, b.py, b.pz);
    else {
      const dx = b.px - t.lx, dy = b.py - t.ly, dz = b.pz - t.lz;
      if (dx * dx + dy * dy + dz * dz >= TRAIL_D2) trailPush(t, b.px, b.py, b.pz);
    }
  }
}

// A full 2π of swept angle on a bound orbit means it came back to where it started. That is the moment
// the room exists for, so that is where the lesson is stated — right under the star being circled.
function onLap(b) {
  const el = elementsOf(b);
  if (!el.bound) return;
  if (b.laps === 1 && b.thrown) {
    if (!payoffShown) {
      payoffShown = true;
      payoffLbl.visible = true;
      if (!manual) { tone(523, 0.22, 'sine'); tone(784, 0.3, 'sine'); }
    }
    goals.closed = true;
    if (el.ecc < 0.10) goals.circle = true;
    if (el.ecc > 0.60) goals.longEllipse = true;
    setEvent(`closed orbit ${b.laps} · it came back`);
  } else if (b.thrown) {
    if (el.ecc < 0.10) goals.circle = true;
    if (el.ecc > 0.60) goals.longEllipse = true;
    setEvent(`same path, lap ${b.laps} · it came back`);
  }
  if (b.slot) {                                                  // brief brightening: "same path, again"
    b.slot.trail.line.material.opacity = 1;
    b.slot.pulse = 0.5;
  }
}

function runSubsteps(n) { for (let i = 0; i < n; i++) substepAll(); }

function advanceLive(dtReal) {
  liveAcc += dtReal * warp;
  if (liveAcc > MAX_LIVE_ACC) liveAcc = MAX_LIVE_ACC;            // spike ⇒ fall behind, never explode
  const n = Math.floor(liveAcc / HSUB);
  if (n > 0) { liveAcc -= n * HSUB; runSubsteps(n); }
}
function advanceTest(sec) {
  testAcc += sec;
  const n = Math.floor(testAcc / HSUB + 1e-9);
  if (n > 0) { testAcc -= n * HSUB; runSubsteps(n); }
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// THROWING — one path for the VR hand and the desktop mouse-carry: sample the moon's own world
// position while it is carried, differentiate over the last ~100 ms at release.
// ─────────────────────────────────────────────────────────────────────────────
const SAMP_N = 24;
function sampleHeld(slot, tNow) {
  slot.g.getWorldPosition(_v);
  const i = slot.sHead % SAMP_N;
  slot.samp[i * 4] = _v.x; slot.samp[i * 4 + 1] = _v.y; slot.samp[i * 4 + 2] = _v.z; slot.samp[i * 4 + 3] = tNow;
  slot.sHead++;
}
// Differentiate between two SAMPLED frames, never between a sample and "now": the engine only moves a
// held object on a render frame, so "now" is always a stale duplicate of the newest sample and would
// report a zero throw. Averaging over the last ~130 ms smooths hand jitter at 72–90 Hz, and the pair
// (newest, previous) is still a correct estimate if the frame rate collapses.
function throwVelocity(slot, out) {
  const n = Math.min(slot.sHead, SAMP_N);
  if (n < 2) { lastBaseAge = 0; out.set(0, 0, 0); return; }
  const idx = j => ((slot.sHead - 1 - j) % SAMP_N + SAMP_N) % SAMP_N;   // j = 0 is the newest
  const i0 = idx(0), t0 = slot.samp[i0 * 4 + 3];
  const x0 = slot.samp[i0 * 4], y0 = slot.samp[i0 * 4 + 1], z0 = slot.samp[i0 * 4 + 2];
  // Prefer the oldest sample inside a ~110 ms window that shows real travel — that is the brief's
  // "last ~100 ms of hand motion", and at 72–90 Hz it is always available. If the frame rate has
  // collapsed, consecutive frames can repeat a position (no pointer update landed between them), so
  // fall back to the youngest sample further back that does show travel rather than report a zero throw.
  let best = -1, bestAge = 0, fall = -1, fallAge = 0;
  for (let j = 1; j < n; j++) {
    const i = idx(j), age = (t0 - slot.samp[i * 4 + 3]) / 1000;
    if (age > 0.60) break;
    const dx = x0 - slot.samp[i * 4], dy = y0 - slot.samp[i * 4 + 1], dz = z0 - slot.samp[i * 4 + 2];
    if (dx * dx + dy * dy + dz * dz <= 1e-6) continue;             // a repeated position carries no motion
    if (age <= 0.11) { best = i; bestAge = age; }                  // keep extending to the oldest in-window
    else if (fall < 0) { fall = i; fallAge = age; }                // youngest usable sample past the window
  }
  // A window shorter than ~40 ms divides a hand-tremor-sized displacement by a tiny dt and reports a
  // wild speed, so a longer sample is always preferred when one exists.
  let base = best, baseAge = bestAge;
  if ((base < 0 || baseAge < 0.04) && fall >= 0) { base = fall; baseAge = fallAge; }
  lastBaseAge = baseAge;
  if (base < 0 || baseAge < 0.008) { out.set(0, 0, 0); return; }        // a flick with no travel is a drop
  out.set(x0 - slot.samp[base * 4], y0 - slot.samp[base * 4 + 1], z0 - slot.samp[base * 4 + 2]).divideScalar(baseAge);
  if (out.length() > 6) out.setLength(6);                               // no relativistic elbows
}

function onGrab(slot) {
  manual = false;                                                 // a real hand always takes time back
  if (slot.mode === 'flying') retire(slot);
  else trailClear(slot.trail);
  slot.mode = 'held';
  slot.sHead = 0;
  slot.g.visible = true;
  tone(560, 0.06, 'sine');
}

function onRelease(slot) {
  if (slot.mode !== 'held') return;
  // NOTE: do not sample again here. The engine only moves a held object on a render frame, so a
  // release-time read is a duplicate of the newest sample and would cancel the measured motion.
  throwVelocity(slot, _w);
  lastThrow = { samples: Math.min(slot.sHead, SAMP_N), baseAge: lastBaseAge, speed: _w.length(),
                world: [_w.x, _w.y, _w.z] };
  _w.applyQuaternion(sysQInv());                                   // world m/s → star-frame m/s
  slot.g.getWorldPosition(_v);
  sys.worldToLocal(_v);
  if (_v.lengthSq() < 1e-6) _v.set(0.01, 0, 0);                    // never spawn exactly on the singularity
  sys.add(slot.g);
  slot.g.rotation.set(0, 0, 0);
  slot.g.position.copy(_v);
  addBody(slot, _v.x, _v.y, _v.z, _w.x, _w.y, _w.z, true);
  tone(700, 0.07, 'triangle');
}
function sysQInv() { sys.getWorldQuaternion(_q); return _q.invert(); }

// ─────────────────────────────────────────────────────────────────────────────
// READOUT / CHECKLIST — built once, setText only when the string actually changes
// ─────────────────────────────────────────────────────────────────────────────
function bodyById(id) { for (let i = 0; i < bodies.length; i++) if (bodies[i].id === id) return bodies[i]; return null; }

function readoutText() {
  const b = bodyById(lastId);
  let s = `this star:  μ = ${MU.toFixed(2)} m³/s²`;
  if (!b) return s + '\n\nthrow a moon —\nits orbit is read out here';
  const el = elementsOf(b);
  const cls = classOf(el.eps, el.ecc);
  s += `\nmoon #${b.id}   ε = ${el.eps >= 0 ? '+' : ''}${el.eps.toFixed(2)} m²/s²`;
  if (b.state === 'absorbed') s += '\nABSORBED — it fell in';
  else if (b.state === 'escaped') s += '\nESCAPED — gone past 12 m';
  else if (cls === 'ellipse') s += `\nELLIPSE  ε < 0  ·  it must return\ne = ${el.ecc.toFixed(2)}   T = ${el.period.toFixed(2)} s   a = ${el.a.toFixed(2)} m`;
  else if (cls === 'hyperbola') s += `\nHYPERBOLA  ε > 0  ·  it never returns\ne = ${el.ecc.toFixed(2)}   leaving at ${el.speed.toFixed(2)} m/s`;
  else s += `\nNEAR-PARABOLA  ε ≈ 0  ·  the knife edge\ne = ${el.ecc.toFixed(2)}   just barely free`;
  if (uiClock < eventUntil) s += `\n${eventMsg}`;
  return s;
}
function checkText() {
  const m = k => (goals[k] ? '✓' : '·');
  return 'THINGS TO MAKE HAPPEN\n'
    + `${m('closed')} one orbit that closes on itself\n`
    + `${m('circle')} a near-circle    e < 0.10\n`
    + `${m('longEllipse')} a long ellipse   e > 0.60\n`
    + `${m('escaped')} a throw that never comes back\n`
    + `${m('absorbed')} a throw that falls into the star`;
}
let uiFrozen = false;
function refreshUI(force) {
  if (uiFrozen && !force) return;
  const r = readoutText();
  if (force || r !== lastReadout) { lastReadout = r; readoutLbl.setText(r); }
  const c = checkText();
  if (force || c !== lastCheck) { lastCheck = c; checkLbl.setText(c); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME WARP
// ─────────────────────────────────────────────────────────────────────────────
function warpFromX(lx) { return WARP_MIN * Math.pow(WARP_SPAN, (lx + SL_HALF) / (2 * SL_HALF)); }
function xFromWarp(w) { return (Math.log(w / WARP_MIN) / Math.log(WARP_SPAN)) * 2 * SL_HALF - SL_HALF; }
function setWarp(w, moveKnob) {
  w = Math.max(WARP_MIN, Math.min(WARP_MAX, w));
  if (Math.abs(w - 1) < 0.06) w = 1;                              // a detent at real time
  warp = w;
  if (moveKnob) knob.position.x = xFromWarp(w);
  const txt = `time × ${warp.toFixed(2)}`;
  if (txt !== lastWarpTxt) { lastWarpTxt = txt; warpLbl.setText(txt); }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────
function build() {
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 'dark', grid: false, arrow: false });
  input.teleport = 'none';                                        // you stand still; the sky does the moving

  // --- the star. `sys` is placed while it holds only the star (centred on its own origin), so the
  // group's origin lands exactly on the star and every child coordinate afterwards IS a physics vector.
  sys = shape.group();
  sys.name = 'star and orbits';
  star = shape.ball(0.12, 'orange');
  star.material = mat('orange', { emissive: 0xff7a1a, emissiveIntensity: 1.6 });
  sys.add(star);
  place(sys, { dist: STAR_DIST, dir: 'ahead', height: STAR_H, anchor: 'center' });

  glow = shape.ball(0.20, 'orange');
  glow.material = mat('orange', { transparent: true, opacity: 0.38, emissive: 0xffa040, emissiveIntensity: 1.0 });
  glow.material.blending = THREE.AdditiveBlending;                 // light adds; it does not paint a brown shell
  glow.material.side = THREE.BackSide;                             // only the far shell draws, so the corona is
  glow.material.depthWrite = false;                                // a ring around the star, never a wash over it
  sys.add(glow);

  halo = shape.ball(0.34, 'orange');                         // a second, fainter shell: two-step falloff
  halo.material = mat('orange', { transparent: true, opacity: 0.13, emissive: 0xffb060, emissiveIntensity: 1.0 });
  halo.material.blending = THREE.AdditiveBlending;
  halo.material.side = THREE.BackSide;
  halo.material.depthWrite = false;
  sys.add(halo);

  // --- rack: placed holding only its centred bar, then dressed, so no parked child offset can shift it
  rack = shape.group();
  rack.name = 'moon rack';
  const bar = shape.box(RACK_GAP * (N_MOON - 1) + 0.14, 0.02, 0.07, 'grey');
  rack.add(bar);
  place(rack, { dist: RACK_DIST, dir: 'ahead', height: RACK_H, face: true });

  const plate = shape.panel(0.62, 0.10, 'dark');
  plate.position.set(0, -0.105, 0.02);
  rack.add(plate);
  label('Grab a moon and throw it sideways past the star.\nLet go while your hand is still moving.',
    { parent: plate, at: [0, 0, 0.03], capHeight: 0.021, bg: false });

  for (let i = 0; i < N_MOON; i++) {
    const x = (i - (N_MOON - 1) / 2) * RACK_GAP;
    const cradle = shape.group();
    cradle.position.set(x, 0.028, 0);
    rack.add(cradle);
    const ring = shape.torus(0.055, 0.007, 'grey');
    ring.rotation.x = -Math.PI / 2;
    cradle.add(ring);

    const g = shape.group();
    g.name = 'moon ' + (i + 1);
    const ball = shape.ball(MOON_R, MOON_COL[i]);
    ball.material = mat(MOON_COL[i], { emissive: MOON_COL[i], emissiveIntensity: 0.35 });
    g.add(ball);
    g.add(shape.hitball(MOON_HIT));                                // fat, invisible target for a moon in flight
    cradle.add(g);
    g.position.set(0, MOON_R * 0.6, 0);

    const slot = {
      i, g, ball, cradle, mode: 'racked', body: null, pulse: 0,
      trail: makeTrail(MOON_COL[i]),
      samp: new Float32Array(SAMP_N * 4), sHead: 0,
    };
    sys.add(slot.trail.line);
    slots.push(slot);
    // grab:true on the visible handle itself — the engine carries it, we only read where it has been.
    interactive(g, { grab: true, select: () => onGrab(slot), release: () => onRelease(slot) });
  }

  // --- time-warp slider: grab:'hold' + drag(), so the knob can never leave its rail on any device
  sliderRig = shape.group();
  sliderRig.name = 'time warp';
  const rod = shape.box(2 * SL_HALF + 0.04, 0.012, 0.012, 'white');
  rod.material = mat('white', { transparent: true, opacity: 0.5 });
  sliderRig.add(rod);
  place(sliderRig, { dist: 0.88, dir: 34, height: 1.18, face: true });

  for (let k = 0; k <= 4; k++) {
    const tick = shape.box(0.006, 0.045, 0.006, 'grey');
    tick.position.set(-SL_HALF + k * (SL_HALF / 2), 0, 0);
    sliderRig.add(tick);
  }
  knob = shape.group();
  const knobBall = shape.ball(0.032, 'teal');
  knob.add(knobBall);
  knob.add(shape.hitball(0.075));
  sliderRig.add(knob);
  const sPlate = shape.panel(0.26, 0.072, 'dark');
  sPlate.position.set(0, -0.10, -0.005);
  sliderRig.add(sPlate);
  warpLbl = label('time × 1.00', { parent: sPlate, at: [0, 0, 0.03], capHeight: 0.026, bg: false });
  label('0.25×', { parent: sliderRig, at: [-SL_HALF, 0.055, 0], capHeight: 0.018, bg: false });
  label('4×', { parent: sliderRig, at: [SL_HALF, 0.055, 0], capHeight: 0.018, bg: false });
  knob.position.x = xFromWarp(1);
  interactive(knob, {
    grab: 'hold',
    select: (obj, info) => {
      const p = info && info.point;
      grabOffset = p ? knob.position.x - sliderRig.worldToLocal(_v.copy(p)).x : 0;
    },
    drag: (obj, info) => {
      const p = info && info.point;
      if (!p) return;                                              // no ray this frame — hold, don't guess
      const lx = Math.max(-SL_HALF, Math.min(SL_HALF, sliderRig.worldToLocal(_v.copy(p)).x + grabOffset));
      knob.position.x = lx;
      setWarp(warpFromX(lx), false);
    },
    release: () => setWarp(warp, true),
  });

  // --- readouts, one each side of the star, at eye height and clear of a 1.4 m orbit
  readoutLbl = label(' ', { dist: 2.6, dir: 'ahead-right', height: 'eye', size: 'comfortable', width: 1.5, theme: 'dark', anchor: 'top' });
  checkLbl = label(' ', { dist: 2.6, dir: 'ahead-left', height: 'eye', size: 'small', width: 1.5, theme: 'glass', anchor: 'top' });

  // --- the payoff. Hidden until a moon the visitor threw comes all the way back around, then it
  // appears directly under the star they are already watching.
  payoffLbl = label('It keeps missing.\nThat\'s all an orbit is — falling, and missing.\nε < 0, and it must return.',
    { dist: STAR_DIST + 0.10, dir: 'ahead', height: 1.22, size: 'large', width: 1.7, theme: 'dark', accent: '#f2a25c' });
  payoffLbl.visible = false;

  // --- one moon already up, on a tilted circular orbit, so the room explains itself on sight.
  // thrown:false ⇒ it can never fire the payoff; only a moon the visitor threw can do that.
  const dm = slots[N_MOON - 1];
  dm.mode = 'flying';
  sys.add(dm.g);
  const r0 = 0.80, vc = Math.sqrt(MU / r0);
  addBody(dm, r0, 0, 0, 0, vc * 0.287, vc * 0.958, false);
  dm.g.position.set(r0, 0, 0);

  setWarp(1, true);
  refreshUI(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAME
// ─────────────────────────────────────────────────────────────────────────────
// Push physics state onto the meshes and upload any trail edits. Called from frame() and again at the
// end of ENV_TEST.step(), so a headless step leaves the scene visually consistent with the simulation.
function syncMoons(dt) {
  const now = performance.now();
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.mode === 'held') { sampleHeld(s, now); continue; }       // the engine owns its transform now
    if (s.mode === 'flying') {
      const b = s.body;
      if (b) {
        if (s.g.parent !== sys) sys.add(s.g);                      // self-heal after the engine's release
        s.g.position.set(b.px, b.py, b.pz);
      }
    } else if (s.g.parent !== s.cradle) {
      s.cradle.add(s.g);
      s.g.position.set(0, MOON_R * 0.6, 0);
      s.g.rotation.set(0, 0, 0);
    }
    if (s.pulse > 0 && dt > 0) {                                   // lap flash on the trail, then settle
      s.pulse -= dt;
      s.trail.line.material.opacity = s.pulse > 0 ? 0.8 + 0.2 * (s.pulse / 0.5) : 0.8;
    }
  }
  trailFlush();
}

function frame(dt) {
  uiClock += dt;
  if (!manual) advanceLive(dt);

  syncMoons(dt);

  if (flash > 0) {                                                 // the star's swallow flash
    flash = Math.max(0, flash - dt * 2.8);
    const k = 1 + 0.9 * flash;
    star.scale.setScalar(k); glow.scale.setScalar(1 + 1.4 * flash); halo.scale.setScalar(1 + 0.8 * flash);
    star.material.emissiveIntensity = 1.6 + 3.5 * flash;
  }

  readoutTimer += dt;
  if (readoutTimer >= 0.15) { readoutTimer = 0; refreshUI(false); }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION CONTRACT
// Vectors come back array-like AND {x,y,z} so either spelling works, before or after JSON transport.
// ─────────────────────────────────────────────────────────────────────────────
function vec3(x, y, z) { return { 0: x, 1: y, 2: z, x, y, z, length: 3 }; }

window.ENV_TEST = {
  mu: () => MU,
  substep: () => HSUB,
  starRadius: () => ABSORB_R,
  escapeRadius: () => ESCAPE_R,

  // Star-centred metres and metres/second. Returns the new body's id.
  spawn(px, py, pz, vx, vy, vz) {
    manual = true;                                                 // the panel's clock, not the render loop's
    const slot = freeSlot();
    if (!slot) return -1;
    if (slot.mode === 'racked') { sys.add(slot.g); }
    slot.g.rotation.set(0, 0, 0);
    slot.g.position.set(px, py, pz);
    return addBody(slot, px, py, pz, vx, vy, vz, true);
  },

  bodies() {
    return bodies.map(b => ({
      id: b.id, state: b.state, cls: classOf(specificEnergy(b), elementsOf(b).ecc),
      p: vec3(b.px, b.py, b.pz), v: vec3(b.vx, b.vy, b.vz),
      px: b.px, py: b.py, pz: b.pz, vx: b.vx, vy: b.vy, vz: b.vz,
      r: Math.sqrt(b.px * b.px + b.py * b.py + b.pz * b.pz), laps: b.laps,
    }));
  },

  energy(id) { const b = bodyById(id); return b ? specificEnergy(b) : null; },

  elements(id) {
    const b = bodyById(id);
    if (!b) return null;
    const el = elementsOf(b);
    return { ecc: el.ecc, period: el.period, a: el.a, energy: el.eps, bound: el.bound,
             periapsis: el.peri, apoapsis: el.apo, angularMomentum: el.h, class: classOf(el.eps, el.ecc) };
  },

  // Deterministic, off the render loop, same fixed substep as live play.
  step(seconds) {
    manual = true;
    const n = advanceTest(Math.max(0, Math.min(600, +seconds || 0)));
    syncMoons(0);                                                  // leave the scene consistent with the sim
    return n;
  },

  timeWarp(x) { setWarp(+x, true); return warp; },

  clear() {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.mode === 'flying') { retire(s); }
      if (s.mode !== 'held') {
        s.mode = 'racked';
        s.cradle.add(s.g);
        s.g.position.set(0, MOON_R * 0.6, 0);
        s.g.rotation.set(0, 0, 0);
      }
      trailClear(s.trail);
    }
    trailFlush();
    bodies.length = 0; lastId = 0; liveAcc = 0; testAcc = 0;
    refreshUI(true);
  },

  // escape hatches for a live demo after a scripted test
  live(on) { manual = !(on === undefined ? true : !!on); return !manual; },
  mode: () => (manual ? 'manual' : 'live'),
  warp: () => warp,
  payoff: () => payoffShown,
  goals: () => Object.assign({}, goals),
  readout: () => lastReadout,
  freezeUI(on) { uiFrozen = (on === undefined ? true : !!on); return uiFrozen; },
  lastThrow: () => lastThrow,
  trailPoints: () => slots.map(s => Math.min(s.trail.head, TRAIL_N)),
  trailGeoIds: () => slots.map(s => s.trail.geo.uuid),
  slotModes: () => slots.map(s => s.mode + ':' + (s.g.parent ? s.g.parent.type : 'none') + ':' + s.sHead),
  trailBytes: () => slots.map(s => s.trail.arr.byteLength),
};

XR.run({ build, frame });
