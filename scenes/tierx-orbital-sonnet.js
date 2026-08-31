const { THREE, scene, shape, place, spread, remove, label, interactive, tone, spin, mat, col, ground, sky } = XR;

// ---------------------------------------------------------------------------
// Orbital Sandbox — a fixed star, thrown moons, real inverse-square gravity.
// Physics is integrated with velocity Verlet (symplectic, fixed substep,
// accumulator pattern) so bound-orbit energy does not drift over time.
// Coordinates for the ENV_TEST hook are STAR-RELATIVE (no starPos() getter
// exists in the contract, so px,py,pz / bodies()[].p are offsets from the
// star — velocities are the same in either frame since the star is fixed).
// ---------------------------------------------------------------------------

// ---- constants ----
const MU = 2.2;                 // a ~1 m toss orbits with T = 2π√(r³/μ) ≈ 4.2 s at r=1
const STAR_R = 0.12;
const MOON_R = 0.06;
const ABSORB_R = STAR_R + MOON_R;
const ESCAPE_R = 12;
const SUBSTEP = 1 / 400;        // fixed physics substep (seconds); same magnitude for live and step()
const TRAIL_N = 400;            // ring-buffer capacity per trail (positions), pre-allocated once
const TRAIL_INTERVAL = 0.03;    // sim-seconds between trail samples (frame-rate independent)
const SAMPLE_N = 16;            // hand-position samples kept while a moon is held (~last 100-250 ms)
const NEAR_PARABOLA_EPS = 0.05; // |ε| below this reads as "near-parabola"
const MAX_THROW_SPEED = 6;      // clamp on velocity derived from hand motion (m/s)
const CLEANUP_DELAY = 0.35;     // seconds a body lingers (shrinking) after absorb/escape before cleanup
const STAR_DIST = 1.3;          // "two steps ahead"
const WARP_MIN = 0.25, WARP_MAX = 4;
const RAIL_LEN = 0.3;

// ---- scratch (reused every substep — no per-frame allocation) ----
const _rel = new THREE.Vector3();
const _acc0 = new THREE.Vector3();
const _acc1 = new THREE.Vector3();
const _relPos = new THREE.Vector3();
const _h = new THREE.Vector3();
const _nowPos = new THREE.Vector3();

// ---- state ----
let star = null, rail = null, knob = null, readoutLabel = null, payoffLabel = null;
const bodies = [];                // every moon ever created (rack pool + test-spawned), any state
let nextId = 1;
let warpFactor = 1;
let accumulator = 0, simClock = 0;
let clockT = 0;                   // last frame's real elapsed time (for hand-speed sampling)
let lastThrownId = null;
let payoffShown = false;
let lastReadoutText = '';
let starFlashUntil = -1;

// ---------------------------------------------------------------------------
// physics
// ---------------------------------------------------------------------------
function accel(pos, out) {
  _rel.subVectors(pos, star.position);
  const r2 = Math.max(_rel.lengthSq(), 1e-6);
  const r = Math.sqrt(r2);
  out.copy(_rel).multiplyScalar(-MU / (r2 * r));
  return out;
}

function checkBounds(body, tNow) {
  if (body.state !== 'orbit') return;
  const r = body.mesh.position.distanceTo(star.position);
  if (r < ABSORB_R) {
    body.state = 'absorbed'; body.cleanupAt = tNow + CLEANUP_DELAY;
    starFlashUntil = tNow + 0.25; tone(200, 0.3, 'sine', 0.15);
  } else if (r > ESCAPE_R) {
    body.state = 'escaped'; body.cleanupAt = tNow + CLEANUP_DELAY;
    tone(300, 0.2, 'triangle', 0.1);
  }
}

// velocity Verlet — symplectic, energy error stays bounded (no secular drift)
function substep(body, dt, tNow) {
  accel(body.mesh.position, _acc0);
  body.mesh.position.addScaledVector(body.vel, dt).addScaledVector(_acc0, 0.5 * dt * dt);
  accel(body.mesh.position, _acc1);
  body.vel.addScaledVector(_acc0, 0.5 * dt).addScaledVector(_acc1, 0.5 * dt);
  checkBounds(body, tNow);
}

function specificEnergy(body) {
  _relPos.subVectors(body.mesh.position, star.position);
  const r = Math.max(_relPos.length(), 1e-6);
  return body.vel.lengthSq() / 2 - MU / r;
}

function computeElements(body) {
  _relPos.subVectors(body.mesh.position, star.position);
  const r = Math.max(_relPos.length(), 1e-6);
  const eps = body.vel.lengthSq() / 2 - MU / r;
  if (eps < -NEAR_PARABOLA_EPS) {
    const a = -MU / (2 * eps);
    _h.crossVectors(_relPos, body.vel);
    const ecc = Math.sqrt(Math.max(0, 1 - _h.lengthSq() / (MU * a)));
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / MU);
    return { ecc, period, eps, classification: 'ellipse' };
  }
  if (eps > NEAR_PARABOLA_EPS) return { ecc: null, period: null, eps, classification: 'hyperbola' };
  return { ecc: null, period: null, eps, classification: 'near-parabola' };
}

// ---------------------------------------------------------------------------
// trails — fixed Float32Array, shifted in place with copyWithin (no allocation)
// ---------------------------------------------------------------------------
function makeTrail(color) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(TRAIL_N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: 0.8 }));
  line.frustumCulled = false;
  scene.add(line);
  return { line, geo, arr, filled: 0, acc: 0 };
}
function trailPush(trail, pos) {
  const arr = trail.arr;
  if (trail.filled < TRAIL_N) {
    const i = trail.filled * 3; arr[i] = pos.x; arr[i + 1] = pos.y; arr[i + 2] = pos.z; trail.filled++;
  } else {
    arr.copyWithin(0, 3, TRAIL_N * 3);
    const i = (TRAIL_N - 1) * 3; arr[i] = pos.x; arr[i + 1] = pos.y; arr[i + 2] = pos.z;
  }
  trail.geo.attributes.position.needsUpdate = true;
  trail.geo.setDrawRange(0, trail.filled);
}
function trailReset(trail) { trail.filled = 0; trail.acc = 0; trail.geo.setDrawRange(0, 0); }

// ---------------------------------------------------------------------------
// bodies (moons) — one factory for both the rack pool and ENV_TEST.spawn()
// ---------------------------------------------------------------------------
function makeSamples() { const s = []; for (let i = 0; i < SAMPLE_N; i++) s.push({ t: -1, pos: new THREE.Vector3() }); return s; }

function spawnBody(color, pooled) {
  const mesh = shape.ball(MOON_R, color);
  scene.add(mesh);
  const trail = makeTrail(color);
  const body = {
    id: nextId++, mesh, trail, vel: new THREE.Vector3(), state: pooled ? 'rack' : 'orbit',
    pooled, color, restPos: new THREE.Vector3(), samples: makeSamples(), sampleIdx: 0, sampleCount: 0,
    cleanupAt: 0, thrownAt: undefined,
  };
  interactive(mesh, {
    grab: true,
    select: () => onGrabStart(body),
    release: () => onRelease(body),
  });
  mesh.userData._body = body; // debug/introspection only — not used by gameplay logic
  bodies.push(body);
  return body;
}

function onGrabStart(body) {
  body.state = 'held'; body.sampleIdx = 0; body.sampleCount = 0;
  trailReset(body.trail);
  tone(420, 0.05, 'sine', 0.1);
}

function recordSample(body, t) {
  const slot = body.samples[body.sampleIdx];
  body.mesh.getWorldPosition(slot.pos); slot.t = t;
  body.sampleIdx = (body.sampleIdx + 1) % SAMPLE_N;
  body.sampleCount = Math.min(body.sampleCount + 1, SAMPLE_N);
}

function onRelease(body) {
  body.mesh.getWorldPosition(_nowPos);
  let vel = null;
  if (body.sampleCount > 0) {
    const oldestIdx = body.sampleCount < SAMPLE_N ? 0 : body.sampleIdx;
    const old = body.samples[oldestIdx];
    const dtReal = Math.max(clockT - old.t, 1 / 240);
    vel = _nowPos.clone().sub(old.pos).divideScalar(dtReal);
    if (vel.length() > MAX_THROW_SPEED) vel.setLength(MAX_THROW_SPEED);
  }
  body.vel.copy(vel ?? new THREE.Vector3());
  body.state = 'orbit'; body.thrownAt = simClock;
  lastThrownId = body.id;
  checkBounds(body, simClock);
  tone(560, 0.08, 'triangle', 0.12);
}

function resetToRack(body) {
  body.mesh.position.copy(body.restPos);
  body.mesh.scale.setScalar(1);
  body.vel.set(0, 0, 0);
  body.state = 'rack'; body.thrownAt = undefined;
  trailReset(body.trail);
}

function disposeBody(body) { remove(body.mesh); remove(body.trail.line); }

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------
function build() {
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 0x11141b, grid: false, radius: 15 });

  star = shape.ball(STAR_R, mat('orange', { emissive: 0xff7a1a, emissiveIntensity: 0.9, roughness: 0.35 }));
  place(star, { dist: STAR_DIST, dir: 'ahead', height: 'chest' });
  const starLight = new THREE.PointLight(0xffa64d, 1.4, 6, 2);
  starLight.position.copy(star.position);
  scene.add(starLight);
  spin(star, 18, 'y');

  label('A star hangs here.\nGrab a moon and throw it —\ngently for an orbit, hard to escape.\nHold the slider knob to warp time.',
    { dist: 'room', dir: 55, height: 'eye', size: 'comfortable', width: 1.5, theme: 'dark' });

  // rack of 5 grabbable moons
  const colors = ['red', 'teal', 'purple', 'pink', 'yellow'];
  const rackBodies = colors.map(c => spawnBody(c, true));
  const rackMeshes = rackBodies.map(b => b.mesh);
  spread(rackMeshes, { dist: 0.85, height: 'chest', dir: -30, span: 50 });
  rackBodies.forEach((b, i) => { b.restPos.copy(b.mesh.position); b.mesh.name = 'moon-' + colors[i]; b.trail.line.name = 'trail-' + colors[i]; });

  // time-warp slider (grab:'hold' — the engine never repositions it; we drive it via drag())
  rail = shape.box(RAIL_LEN, 0.02, 0.02, 'grey');
  place(rail, { dist: 0.55, dir: 35, height: 'chest' });
  knob = shape.ball(0.045, 'white');
  knob.position.set(rail.position.x + warpToX(1), rail.position.y + 0.035, rail.position.z);
  scene.add(knob);
  interactive(knob, {
    grab: 'hold',
    select: () => tone(500, 0.05),
    drag: (obj, { point }) => {
      const x = THREE.MathUtils.clamp(point.x - rail.position.x, -RAIL_LEN / 2, RAIL_LEN / 2);
      knob.position.x = rail.position.x + x;
      warpFactor = xToWarp(x);
    },
  });
  label('Time-warp', { above: knob, size: 'small', gap: 0.05 });

  readoutLabel = label('Throw a moon to see its orbit.', {
    dist: 'near', dir: 30, height: 'shoulder', size: 'comfortable', width: 0.9, theme: 'dark', anchor: 'top',
  });

  payoffLabel = label(
    "It keeps missing.\nThat's all an orbit is — falling, and missing.\nε < 0 and it must return.",
    { above: star, size: 'large', width: 1.7, theme: 'dark', gap: 0.16 });
  payoffLabel.visible = false;

  window.ENV_TEST = {
    spawn(px, py, pz, vx, vy, vz) {
      const body = spawnBody(0xffffff, false);
      body.mesh.position.set(star.position.x + px, star.position.y + py, star.position.z + pz);
      body.vel.set(vx, vy, vz);
      body.thrownAt = simClock;
      checkBounds(body, simClock);
      return body.id;
    },
    bodies() {
      return bodies
        .filter(b => b.state === 'orbit' || b.state === 'absorbed' || b.state === 'escaped')
        .map(b => ({
          id: b.id,
          p: [b.mesh.position.x - star.position.x, b.mesh.position.y - star.position.y, b.mesh.position.z - star.position.z],
          v: [b.vel.x, b.vel.y, b.vel.z],
          state: b.state,
        }));
    },
    energy(id) { const b = bodies.find(x => x.id === id); return b ? specificEnergy(b) : null; },
    elements(id) {
      const b = bodies.find(x => x.id === id); if (!b) return null;
      const e = computeElements(b); return { ecc: e.ecc, period: e.period };
    },
    mu() { return MU; },
    step(seconds) {
      let remaining = Math.max(0, seconds);
      while (remaining > 1e-9) {
        const dt = Math.min(SUBSTEP, remaining);
        for (const b of bodies) if (b.state === 'orbit') substep(b, dt, simClock);
        simClock += dt; remaining -= dt;
      }
    },
    timeWarp(x) { warpFactor = THREE.MathUtils.clamp(x, WARP_MIN, WARP_MAX); },
    clear() {
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (b.pooled) resetToRack(b); else { disposeBody(b); bodies.splice(i, 1); }
      }
      lastThrownId = null; lastReadoutText = '';
    },
  };
}

// ---------------------------------------------------------------------------
// slider mapping (log scale over WARP_MIN..WARP_MAX)
// ---------------------------------------------------------------------------
function warpToX(w) {
  const t = (Math.log(w) - Math.log(WARP_MIN)) / (Math.log(WARP_MAX) - Math.log(WARP_MIN));
  return THREE.MathUtils.clamp(t, 0, 1) * RAIL_LEN - RAIL_LEN / 2;
}
function xToWarp(x) {
  const t = THREE.MathUtils.clamp((x + RAIL_LEN / 2) / RAIL_LEN, 0, 1);
  return Math.exp(Math.log(WARP_MIN) + t * (Math.log(WARP_MAX) - Math.log(WARP_MIN)));
}

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------
function updateReadout() {
  const body = bodies.find(b => b.id === lastThrownId);
  let text;
  if (!body || (body.state !== 'orbit' && body.state !== 'held')) {
    text = 'Throw a moon to see its orbit.';
  } else {
    const eps = specificEnergy(body);
    const els = computeElements(body);
    const line2 = els.classification === 'ellipse'
      ? `ellipse · e=${els.ecc.toFixed(2)} · T=${els.period.toFixed(1)}s`
      : els.classification === 'hyperbola' ? 'hyperbola — escaping' : 'near-parabola';
    text = `ε = ${eps.toFixed(2)} m²/s²\n${line2}`;
  }
  text += `\nTime ×${warpFactor.toFixed(2)}`;
  if (text !== lastReadoutText) { readoutLabel.setText(text); lastReadoutText = text; }
}

function checkPayoff() {
  if (payoffShown) return;
  for (const b of bodies) {
    if (b.state !== 'orbit' || b.thrownAt === undefined) continue;
    const els = computeElements(b);
    if (els.classification === 'ellipse' && (simClock - b.thrownAt) >= els.period) {
      payoffShown = true; payoffLabel.visible = true; tone(880, 0.25, 'sine', 0.18);
      break;
    }
  }
}

function frame(dt, t) {
  clockT = t;
  for (const b of bodies) if (b.state === 'held') recordSample(b, t);

  const simDt = Math.min(dt, 0.1) * warpFactor;
  accumulator += simDt;
  let guard = 0;
  while (accumulator >= SUBSTEP && guard < 500) {
    for (const b of bodies) if (b.state === 'orbit') substep(b, SUBSTEP, simClock);
    simClock += SUBSTEP; accumulator -= SUBSTEP; guard++;
  }

  for (const b of bodies) {
    if (b.state !== 'orbit') continue;
    b.trail.acc += simDt;
    while (b.trail.acc >= TRAIL_INTERVAL) { trailPush(b.trail, b.mesh.position); b.trail.acc -= TRAIL_INTERVAL; }
  }

  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.state === 'absorbed' || b.state === 'escaped') {
      const k = THREE.MathUtils.clamp(1 - (b.cleanupAt - simClock) / CLEANUP_DELAY, 0, 1);
      b.mesh.scale.setScalar(1 - k);
      if (simClock >= b.cleanupAt) {
        if (b.pooled) resetToRack(b);
        else { disposeBody(b); bodies.splice(i, 1); }
        if (lastThrownId === b.id) lastThrownId = null;
      }
    }
  }

  if (t < starFlashUntil) { const k = 1 - (starFlashUntil - t) / 0.25; star.scale.setScalar(1 + 0.6 * Math.sin(k * Math.PI)); }
  else if (star.scale.x !== 1) star.scale.setScalar(1);

  if (knob) knob.position.x = rail.position.x + warpToX(warpFactor);

  updateReadout();
  checkPayoff();
}

XR.run({ build, frame });
