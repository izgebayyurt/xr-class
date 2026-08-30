const { THREE, shape, place, label, interactive, tone, mat, ground, sky, input, H, C } = XR;

// ---- Crank & Slider — round 3 ----
// Round-3 fix (blocker): the crank was inert with no controller registered — round 2 guessed the
// grabbing hand via onController proximity, which is wrong-handed in VR and dead on desktop. Replaced
// with the kit's drag(obj,{point,pointer}) callback, which fires every frame while held with wherever
// the pointer ray currently points, on desktop AND in VR. We project that point onto the crank's own
// plane (rig's local z=0) and read the angle off it — no hand-guessing left at all.
// grab:'hold' now lives on the visible pin itself (enlarged past 'apple' so it needs no separate
// invisible proxy), never on a hidden child — the pin IS the handle users see.
// Also: RUN plate got its face label back (kept the free one above too); readout got a real
// background plate, a corrected z (round 2 had the sign backwards) and moved clear of the rail;
// early/late is now derived from stroke phase, not a difference that's always positive; the "Grab
// the pin" hint moved out from under the payoff plate; graph legends are colour-swatched, moved back
// to 90° (max gap), and separated; all five angle ticks are numbered; frame() skips the linkage
// recompute when nothing is moving.
// Mechanism itself is untouched: pin/piston are still derived from ONE scalar `theta` by formula
// every frame (never by dragging the rod's end), so the joints hold structurally, not by clamping.

const R = 0.12;              // crank radius (pin distance from centre) — must not change
const L = 0.30;              // rod length, end to end — must not change
const STROKE = 2 * R;        // 0.24
const XMID = L;               // 0.30 — midpoint of the stroke
const DEG2RAD = Math.PI / 180;

function pistonX(theta){
  const s = Math.sin(theta);
  return R * Math.cos(theta) + Math.sqrt(Math.max(0, L * L - R * R * s * s));
}
function cosApproxX(theta){ return XMID + R * Math.cos(theta); }
function degOf(theta){ return ((theta * 180 / Math.PI) % 360 + 360) % 360; }
function wrapPi(a){ return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)); } // keeps theta in (-180°,180°] both directions

let rig, pin, rod, piston;
let graph, marker, ghostLine, ghostLbl, ghostSwatch;
let readoutLbl, lastReadoutText = '', lastReadoutT = -10;
let payoffLbl, hintLbl, revealed = false;
let runBtn;
let theta = 50 * DEG2RAD;
let holding = false, running = false, ghostOn = false;

const RAIL_MIN = 0.15, RAIL_MAX = 0.46;
const PW = 1.74, PH = 0.82; // graph plot area — fills most of the 1.9 x 1.05 panel (trimmed slightly from
                             // round 2's 0.87 to leave clean margin for the now-numbered axis ticks below it)

function plotX(deg){ return -PW / 2 + (deg / 360) * PW; }
function plotY(x){ return ((x - XMID) / (STROKE / 2)) * (PH / 2); }

const PROMPT = 'Grab the orange pin and turn the wheel.\nWatch the piston in the rail — and the marker on the graph.';
const PAYOFF = 'Even rotation, uneven motion: at 90°/270° the piston is already 25 mm past halfway.\nFlat top of the curve = piston lingering. Steep middle = piston hurrying.';
function reveal(){ if (revealed) return; revealed = true; payoffLbl.setText(PAYOFF); hintLbl.visible = false; } // hint's plate was covering the payoff line once both were on screen

function toggleRun(){
  running = !running;
  if (running){ holding = false; reveal(); }
  runBtn.material.color.setHex(running ? C.green : C.white);
  tone(running ? 540 : 340, 0.08);
}
function toggleGhost(){
  ghostOn = !ghostOn;
  ghostLine.visible = ghostOn;
  ghostLbl.visible = ghostOn;
  ghostSwatch.visible = ghostOn;
  tone(ghostOn ? 620 : 380, 0.07);
}
function onGrabSelect(){ holding = true; running = false; runBtn.material.color.setHex(C.white); tone(500, 0.05); }
function onGrabRelease(){ holding = false; updateReadout(true); reveal(); } // frame()'s readout update is gated on (running||holding); without this, it goes stale the instant you let go
// drag() fires every frame while held with the pointer ray's current world point — works identically
// for a real controller or the desktop mouse ray. Project it onto the crank's own plane (rig's local
// z=0) and read the angle straight off it: no hand identity, no guessing.
function onDrag(obj, info){
  const p = info && info.point;
  if (!p) return; // no ray this frame — hold theta rather than guess; next frame usually has one
  const local = p.clone();
  rig.worldToLocal(local);
  theta = Math.atan2(local.y, local.x); // nearest point on the crank circle to wherever the ray points
  updateLinkage(); // applied immediately — drag() already fires every held frame, so frame() doesn't need to repeat this
}

function updateReadout(force){
  const x = pistonX(theta), c = cosApproxX(theta);
  const diffMm = Math.round((c - x) * 1000);
  let tail;
  if (diffMm === 0) tail = 'the cosine agrees here';
  else tail = `${diffMm} mm ${Math.sin(theta) >= 0 ? 'early' : 'late'}`; // phase, not the (always-positive) difference sign
  const text = `crank ${Math.round(degOf(theta))}°   piston ${x.toFixed(3)} m\na cosine would say ${c.toFixed(3)} m — ${tail}`;
  if (!force && text === lastReadoutText) return;
  lastReadoutText = text;
  readoutLbl.setText(text);
}

function updateLinkage(){
  const x = pistonX(theta);
  const px = R * Math.cos(theta), py = R * Math.sin(theta);
  pin.position.set(px, py, 0);
  piston.position.set(x, 0, 0);
  const dx = x - px, dy = -py;
  rod.position.set((px + x) / 2, py / 2, 0);
  rod.rotation.z = Math.atan2(dy, dx);
  if (marker) marker.position.set(plotX(degOf(theta)), plotY(x), 0.012);
}

function build(){
  ground({ color: '#eae5da', grid: false, arrow: false });
  sky({ top: '#48586b', bottom: '#eae5da' }); // workshop-toned retint, also hides the hard ground-seam arc
  input.teleport = 'none'; // posture: standing in place, machine stays under the hand

  // ---- the machine ----
  rig = shape.group();
  place(rig, { dist: 'reach', dir: 'ahead', height: 'chest', face: true }); // empty group, safe: non-'floor' height

  // wheel disc sits a little behind the pin/rod/piston plane so nothing embeds in it
  const wheel = shape.cylinder(R + 0.014, 0.02, C.grey); wheel.rotation.x = Math.PI / 2; wheel.position.z = -0.03; rig.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 10, 40), mat('#9a9a9a')); rim.position.z = -0.03; rig.add(rim);
  const hub = shape.ball(0.02, '#3a3a3a'); hub.position.z = -0.03; rig.add(hub);

  rod = shape.box(L, 0.022, 0.022, '#d8d8d8'); rig.add(rod);
  piston = shape.box(0.09, 0.06, 0.05, C.teal); rig.add(piston);

  const rail = shape.box(RAIL_MAX - RAIL_MIN, 0.02, 0.05, '#b9b9b9');
  rail.position.set((RAIL_MIN + RAIL_MAX) / 2, -0.04, 0); // top face at y=-0.03, flush with the piston's underside — no gap
  rig.add(rail);
  const railCap = shape.box(0.015, 0.06, 0.07, C.grey); railCap.position.set(RAIL_MAX, -0.04, 0); rig.add(railCap); // end stop

  // the pin IS the handle: sized past 'apple' (.08) so it needs no invisible hit-proxy, and grab:'hold'
  // lives on it directly (never on a hidden child) — the engine never repositions it; updateLinkage()
  // self-clamps it onto the circle every frame from `theta`, which drag() now drives.
  pin = shape.ball(0.045, C.orange); rig.add(pin);
  interactive(pin, { grab: 'hold', select: onGrabSelect, release: onGrabRelease, drag: onDrag });

  updateLinkage(); // sets pin's real initial position (marker doesn't exist yet — guarded above)
  // parented to `rim` (a real mesh, offset -0.03 in z from rig's origin) — a capHeight label parented
  // straight to `rig` (a geometry-less group) renders wildly oversized. `at` z compensates for rim's
  // own -0.03 offset so this lands at the intended depth relative to the mechanism.
  // own dark plate (bg default) so it reads as a separate element from the payoff caption behind it,
  // rather than the two sharing pixels; kept near the wheel (round 2's low-elevation angle here was
  // clean) rather than dropped further, which would only reintroduce neck-strain.
  hintLbl = label('Grab the orange pin', { parent: rim, at: [pin.position.x + 0.09, pin.position.y + 0.11, 0.05], capHeight: 0.012 });

  // dark plate (bg default, not bg:false) for contrast, moved clear of the rail's y-range and pulled
  // clearly in FRONT of it (rig-local z=+0.03, rail's own z-extent tops out at +0.025) — round 2's z
  // math had the wrong sign and put it 0.06 m *behind* the rig's z=0 plane, so the opaque rail occluded it.
  readoutLbl = label(' ', { parent: rim, at: [0.30, -0.08, 0.06], capHeight: 0.011 });
  updateReadout(true);

  // ---- RUN plate ----
  runBtn = shape.box(0.13, 0.09, 0.02, C.white);
  place(runBtn, { dist: 'reach', dir: 'ahead-right', height: 'waist', face: true });
  label('RUN', { parent: runBtn, at: [0, 0, 0.02 / 2 + 0.03], capHeight: 0.028, bg: false }); // back on the plate face
  label('RUN', { dist: 'reach', dir: 'ahead-right', height: H.waist + 0.30, size: 'comfortable' }); // kept: free label above too
  interactive(runBtn, { select: toggleRun });

  // ---- graph panel ----
  graph = shape.group();
  place(graph, { dist: 'room', dir: 'ahead', height: 'eye', face: true }); // empty group, safe: non-'floor' height

  const bg = shape.panel(1.9, 1.05, '#1c2028'); graph.add(bg);

  // axes
  const AX = '#c7ccd4';
  graph.add(shape.line([[-PW / 2, -PH / 2, 0.003], [PW / 2, -PH / 2, 0.003]], AX));
  graph.add(shape.line([[-PW / 2, -PH / 2, 0.003], [-PW / 2, PH / 2, 0.003]], AX));
  [0, 90, 180, 270, 360].forEach(d => {
    const x = plotX(d);
    graph.add(shape.line([[x, -PH / 2, 0.004], [x, -PH / 2 + 0.035, 0.004]], AX));
    label(String(d) + '°', { parent: bg, at: [x, -PH / 2 - 0.035, 0.03], capHeight: 0.024, bg: false });
  });
  // half-stroke datum — the line the "25 mm past halfway" claim is measured against
  const datum = shape.line([[-PW / 2, 0, 0.0035], [PW / 2, 0, 0.0035]], '#7f8894');
  datum.material = mat('#7f8894', { transparent: true, opacity: 0.55 });
  graph.add(datum);
  label('half stroke · 0.300 m', { parent: bg, at: [PW / 2 - 0.42, 0.045, 0.03], capHeight: 0.028, bg: false });
  // 90° reference — where the gap is largest
  const ninety = shape.line([[plotX(90), -PH / 2, 0.0035], [plotX(90), PH / 2, 0.0035]], '#7f8894');
  ninety.material = mat('#7f8894', { transparent: true, opacity: 0.4 });
  graph.add(ninety);

  const realPts = [];
  for (let d = 0; d <= 360; d += 4){ const th = d * DEG2RAD; realPts.push([plotX(d), plotY(pistonX(th)), 0.006]); }
  const realLine = shape.line(realPts, 'orange'); graph.add(realLine);

  const ghostPts = [];
  for (let d = 0; d <= 360; d += 4){ const th = d * DEG2RAD; ghostPts.push([plotX(d), plotY(cosApproxX(th)), 0.005]); }
  ghostLine = shape.line(ghostPts, 'white');
  ghostLine.material = mat('white', { transparent: true, opacity: 0.8 }); // higher-contrast pale curve
  ghostLine.visible = false;
  graph.add(ghostLine);

  marker = shape.ball(0.024, 'yellow'); graph.add(marker);
  updateLinkage(); // now marker exists too

  label('crank angle 0° → 360°', { parent: bg, at: [0, -PH / 2 - 0.085, 0.03], capHeight: 0.028, bg: false });
  const side = label('piston position', { parent: bg, at: [-PW / 2 - 0.11, 0, 0.03], capHeight: 0.035, bg: false });
  side.rotation.z = Math.PI / 2;
  label('tap the panel to compare with a cosine', { parent: bg, at: [PW / 2 - 0.62, -PH / 2 + 0.05, 0.03], capHeight: 0.024, bg: false });

  // legends: back at 90° (the maximal, most-teaching gap, not 300° where it's smaller), each coloured
  // to its own curve via a swatch, separated well past the curve gap so they never crowd.
  const legendDeg = 90, thL = legendDeg * DEG2RAD;
  const realY = plotY(pistonX(thL)), ghostY = plotY(cosApproxX(thL));
  const lx = plotX(legendDeg) + 0.08;
  const swR = shape.line([[lx - 0.09, realY - 0.05, 0.007], [lx - 0.02, realY - 0.05, 0.007]], 'orange'); graph.add(swR);
  label('real linkage', { parent: bg, at: [lx, realY - 0.05, 0.03], capHeight: 0.03, bg: false });
  ghostSwatch = shape.line([[lx - 0.09, ghostY + 0.06, 0.007], [lx - 0.02, ghostY + 0.06, 0.007]], 'white');
  ghostSwatch.material = mat('white', { transparent: true, opacity: 0.85 }); graph.add(ghostSwatch);
  ghostLbl = label('pure cosine', { parent: bg, at: [lx, ghostY + 0.06, 0.03], capHeight: 0.03, bg: false });
  ghostLbl.visible = false; ghostSwatch.visible = false;

  interactive(bg, { select: toggleGhost });

  label('A wheel turns evenly. The piston does not.',
    { dist: 'room', dir: 'ahead', height: H.eye + 0.78, size: 'large', width: 1.9, title: true }); // clear of the panel's top edge

  payoffLbl = label(PROMPT, { dist: 'room', dir: 'ahead', height: H.eye - 0.68, size: 'comfortable', width: 2.0, title: true, anchor: 'top' });
}

function frame(dt, t){
  // dragging is driven by onDrag() itself (fires every held frame, from the real pointer) — frame()
  // only needs the auto-run animation; updateLinkage() is skipped entirely while the machine is idle.
  if (running){
    theta = wrapPi(theta + 60 * DEG2RAD * dt);
    updateLinkage();
  }
  if ((running || holding) && t - lastReadoutT > 0.22){ updateReadout(); lastReadoutT = t; } // ~4.5 Hz — cheap, only while it can change
}

XR.run({ build, frame });
