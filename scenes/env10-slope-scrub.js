const { THREE, shape, place, label, interactive, tone, mat, ground, input } = XR;

// "Slope Scrub" — a puck on a waist-high rail maps straight onto x in [-2,2]. A dot rides the curve
// f(x)=x^3/3-x at (x,f(x)); a forearm-length bar sits on the dot and tips to the REAL angle atan(f'(x)),
// which only means "slope" because the curve graph uses identical cm-per-unit on both its axes.
// A second, squashed-scale graph above collects a dot at (x, f'(x)) as you sweep — by the end it is the
// parabola f'(x)=x^2-1, touching zero exactly at x=-1 and x=+1 (the only two zeros of that parabola).
//
// Round 2 (panel review fixes): frustumCulled on the InstancedMesh trail, shape.hit for the invisible
// clear-target (correct depthWrite), a single setText()'d readout instead of remove+recreate (was
// leaking a canvas per frame during the sweep), grab:'hold' on the puck itself (no more split
// invisible-proxy/visible-puck pair — it self-clamps every frame, so the engine can't walk it off the
// rail whether or not it attaches the object), raised slope graph + shorter bar so the tangent no longer
// crosses into the derivative plot or the readout, a live guide dot+line tying the two graphs together,
// tick numbers along the slope graph's own zero line, an inset caption, a floor-to-panel plinth, and a
// caption pointing down at the rail. stations.push([0,0,0]) removed — it was masking real audit checks.
//
// Round 3 (panel review fixes): the onController proximity guess is gone — replaced by the kit's new
// drag(obj,{point,pointer}) callback, which fires every frame while held with the pointer ray's current
// point, on desktop AND in VR, so the puck is no longer inert without a registered controller. A
// grabOffset captured at select time (not the raw ray hit) stops a mis-aimed grab from teleporting the
// puck and firing a false zero-crossing tone. The payoff sentence is now gated behind ~3/4 of a sweep
// instead of showing before the interaction that earns it (anchor:'top' so it grows downward, not up
// past the panel's own ceiling). Panel/slope-graph height brought back under "a hand above eye" (SSCALE
// 0.08->0.05). Trail drop density doubled (DROP_STEP 0.05->0.03) and the instance index now caps instead
// of wrapping, so a long trail no longer eats its own start. "Point + trigger" caption re-centred under
// the slope graph instead of sitting off to one side.
//
// FLAGGED BRIEF CONFLICT (item 4): "a 70 cm rail" and "my hand looks like it is under the point it
// controls" cannot both hold at dist:reach (0.55 m) vs the panel's dist:1.3 m — matching visual angle
// forces RAIL_SCALE = SCALE * (0.55/1.3). Alignment carries the room's title, so the rail shortens to
// ~0.37 m instead of 0.70 m; pushing the panel out to ~2 m was the alternative but reflows every other
// number on it, so this is the smaller change.

const CURVE_DIST = 1.3, RAIL_DIST = 0.55;      // 'reach'
const SCALE = 0.22;      // m per unit, BOTH axes of the curve graph — this is what makes the bar's tilt real
const SSCALE = 0.05;     // m per unit, slope-graph vertical axis only (squashed: it spans -1..3) — cut
                          // from 0.08 so the graph top clears room for its own caption under the panel ceiling
const RAIL_SCALE = SCALE * RAIL_DIST / CURVE_DIST;             // see flagged conflict above
const RAIL_HALF = RAIL_SCALE * 2, RAIL_LEN = RAIL_HALF * 2;    // x=+-2 -> rail edges (~0.37 m)
const BAR_LEN = 0.25, DOT_R = 0.022;
const READOUT_Y = -0.26;
const SLOPE_BASE_Y = 0.34;      // where slope-value -1 sits (bottom of the slope graph) — raised clear of the bar
const SLOPE_TOP_Y = SLOPE_BASE_Y + SSCALE * 4;   // slope value +3 (world ~1.60 m: comfortably under eye+hand)
const SLOPE_ZERO_Y = SLOPE_BASE_Y + SSCALE * 1;  // slope value 0
const PANEL_BOTTOM = -0.38, PANEL_TOP = 0.64, PANEL_W = 1.3;   // world top ~1.66 m, under "a hand above eye" (~1.68)
const DROP_STEP = 0.03, FLAT_EPS = 0.05, MAX_DOTS = 300;
const PAYOFF_DROPS = 100;   // ~3/4 of a full sweep (4 units / DROP_STEP) — the payoff shows once you've mostly swept
const DOT_Z = 0.01, BAR_Z = 0.014, LEFTDOT_Z = 0.006, GUIDE_Z = 0.008;

const fOf = x => x * x * x / 3 - x;
const fpOf = x => x * x - 1;
const _v = new THREE.Vector3();   // scratch, reused by select/drag to avoid a per-frame allocation

let board, dot, bar, puck, rail, leftDots, slopeDot, guideLine, readoutLabel, axisCaption, lastReadoutText = '';
let currentX = 0, dragging = false, dropIdx = 0, lastDropX = null, prevSign = 0, grabOffset = 0, payoffShown = false;

function setX(x){
  currentX = Math.max(-2, Math.min(2, x));
  const lx = currentX * SCALE, ly = fOf(currentX) * SCALE, slope = fpOf(currentX);
  dot.position.set(lx, ly, DOT_Z);
  bar.position.set(lx, ly, BAR_Z);
  bar.rotation.z = Math.atan(slope);
  puck.position.set(currentX * RAIL_SCALE, 0, 0);   // self-clamp: this is the ONLY place the puck's x is set

  const sy = SLOPE_BASE_Y + SSCALE * (slope + 1);
  slopeDot.position.set(lx, sy, LEFTDOT_Z);
  const gp = guideLine.geometry.attributes.position.array;
  gp[0] = lx; gp[1] = ly; gp[2] = GUIDE_Z; gp[3] = lx; gp[4] = sy; gp[5] = GUIDE_Z;
  guideLine.geometry.attributes.position.needsUpdate = true;

  let text = `x = ${currentX.toFixed(2)}   f(x) = ${fOf(currentX).toFixed(2)}   slope = ${slope.toFixed(2)}`;
  if (Math.abs(slope) < FLAT_EPS) text += '\nFlat. The slope is zero here.';
  if (text !== lastReadoutText){ readoutLabel.setText(text); lastReadoutText = text; }

  const sgn = slope > FLAT_EPS ? 1 : (slope < -FLAT_EPS ? -1 : 0);
  if (sgn !== 0 && prevSign !== 0 && sgn !== prevSign) tone(1100, 0.06, 'sine');
  if (sgn !== 0) prevSign = sgn;

  if (dragging && (lastDropX === null || Math.abs(currentX - lastDropX) >= DROP_STEP)){
    const i = Math.min(dropIdx, MAX_DOTS - 1);      // cap, don't wrap — a long trail keeps its start
    leftDots.setMatrixAt(i, new THREE.Matrix4().makeTranslation(lx, sy, LEFTDOT_Z));
    dropIdx = Math.min(dropIdx + 1, MAX_DOTS); leftDots.count = dropIdx;
    leftDots.instanceMatrix.needsUpdate = true;
    lastDropX = currentX;
    if (!payoffShown && dropIdx >= PAYOFF_DROPS){   // payoff appears once the sweep has mostly happened —
      payoffShown = true;                            // never as a standing caption shown before it
      axisCaption.setText("slope f'(x)  (squashed scale)\nSweep once - the trail becomes f'(x) = x² - 1.");
    }
  }
}

function clearDots(){ dropIdx = 0; lastDropX = null; leftDots.count = 0; tone(300, 0.12, 'sine'); }

function tickRow(xs, y, len){ xs.forEach(v => board.add(shape.line([[v * SCALE, y - len, 0], [v * SCALE, y + len, 0]], 'white'))); }
function numRow(xs, y){ xs.forEach(v => label(String(v), { parent: board, at: [v * SCALE, y, 0.003], capHeight: 0.024, bg: false })); }

function build(){
  ground({ color: 'dark', grid: false, arrow: false, radius: 4 });
  input.teleport = 'none';

  // origin marker: a tiny solid ball placed FIRST (it has real geometry, so its bbox is well-defined —
  // never place() an empty group). Everything else is added as its child afterward, in its local frame,
  // so local (0,0,0) == world (dist 1.3 ahead, waist height) exactly, with no further place() calls needed.
  board = shape.ball(0.001, 'white');
  board.material = mat('white', { transparent: true, opacity: 0 });
  place(board, { dist: CURVE_DIST, dir: 'ahead', height: 'waist' });

  const panel = shape.panel(PANEL_W, PANEL_TOP - PANEL_BOTTOM, '#1b1f24');
  panel.material.transparent = true; panel.material.opacity = 0.93;
  panel.position.set(0, (PANEL_TOP + PANEL_BOTTOM) / 2, -0.03);
  board.add(panel);
  label('Your hand is the input.', { above: panel, size: 'large' });

  // a plinth so the panel doesn't read as a slab hanging in the air
  [-0.5, 0.5].forEach(x => {
    const leg = shape.box(0.04, PANEL_BOTTOM - (-1.02), 0.04, 'grey');
    leg.position.set(x, (PANEL_BOTTOM + -1.02) / 2, -0.04);
    board.add(leg);
  });

  // --- curve graph: x-axis, ticks, curve, dot, bar ---
  board.add(shape.line([[-0.5, 0, 0], [0.5, 0, 0]], 'white'));
  tickRow([-2, -1, 0, 1, 2], 0, 0.015);
  numRow([-2, -1, 0, 1, 2], -0.05);

  const pts = []; for (let i = 0; i <= 80; i++){ const x = -2 + i * 0.05; pts.push([x * SCALE, fOf(x) * SCALE, 0]); }
  board.add(shape.line(pts, 'teal'));

  dot = shape.ball(DOT_R, 'orange'); dot.material = mat('orange', { emissive: '#c85a00', emissiveIntensity: 0.6 }); board.add(dot);
  bar = shape.box(BAR_LEN, 0.014, 0.014, 'orange'); board.add(bar);

  // --- slope graph: vertical axis (-1..3), zero line + its own x-ticks, live guide, trail, clear target ---
  board.add(shape.line([[-0.5, SLOPE_BASE_Y, 0], [-0.5, SLOPE_TOP_Y, 0]], 'white'));
  [-1, 0, 1, 2, 3].forEach(v => {
    const y = SLOPE_BASE_Y + SSCALE * (v + 1);
    board.add(shape.line([[-0.52, y, 0], [-0.48, y, 0]], 'white'));
    label(String(v), { parent: board, at: [-0.6, y, 0.003], capHeight: 0.024, bg: false });
  });
  board.add(shape.line([[-0.5, SLOPE_ZERO_Y, 0], [0.5, SLOPE_ZERO_Y, 0]], 'white'));
  tickRow([-2, -1, 0, 1, 2], SLOPE_ZERO_Y, 0.015);
  numRow([-2, -1, 0, 1, 2], SLOPE_ZERO_Y - 0.035);
  // payoff sentence is added later via setText once the sweep has mostly happened (see PAYOFF_DROPS) —
  // anchor:'top' keeps the top edge fixed so the added line grows downward, not up past the panel ceiling
  axisCaption = label("slope f'(x)  (squashed scale)",
    { parent: board, at: [-0.28, SLOPE_TOP_Y + 0.06, 0.003], capHeight: 0.018, bg: false, anchor: 'top' });

  guideLine = shape.line([[0, 0, 0], [0, 0, 0]], 'white');
  guideLine.material = mat('white', { transparent: true, opacity: 0.35 });
  board.add(guideLine);
  slopeDot = shape.ball(0.016, 'orange'); slopeDot.material = mat('orange', { emissive: '#c85a00', emissiveIntensity: 0.5 });
  board.add(slopeDot);

  const dotGeo = new THREE.SphereGeometry(0.014, 8, 6);
  const dotMat = mat('orange', { emissive: '#c85a00', emissiveIntensity: 0.5 });
  leftDots = new THREE.InstancedMesh(dotGeo, dotMat, MAX_DOTS);
  leftDots.count = 0; leftDots.frustumCulled = false;   // an InstancedMesh with count 0 caches a degenerate
  board.add(leftDots);                                   // bounding sphere and self-culls forever otherwise

  const wipeHit = shape.hit(1.0, SLOPE_TOP_Y - SLOPE_BASE_Y + 0.05, 0.08);
  wipeHit.position.set(0, (SLOPE_BASE_Y + SLOPE_TOP_Y) / 2, 0.02);
  board.add(wipeHit);
  interactive(wipeHit, { select: clearDots });
  label('Point + trigger here to clear', { parent: board, at: [0, SLOPE_BASE_Y - 0.05, 0.003], capHeight: 0.02, bg: false });

  label('↓ your hand is on the rail below ↓', { parent: board, at: [0, PANEL_BOTTOM + 0.05, 0.003], capHeight: 0.022, bg: false });

  readoutLabel = label('', { parent: board, at: [0, READOUT_Y, 0.01], capHeight: 0.026, bg: false });

  // --- rail + puck, arm's reach in front, waist height. grab:'hold' — the engine doesn't drive the
  // puck's transform for us, so it can never leave the rail; setX() is the only thing that ever moves
  // it, self-clamped every call. Position comes from the kit's drag(obj,{point,pointer}) callback, which
  // fires every frame while held with the pointer ray's current point on desktop AND in VR — no more
  // guessing which hand grabbed via onController (wrong-hand risk, and dead when nothing has connected).
  rail = shape.group();
  const rod = shape.box(RAIL_LEN, 0.014, 0.014, 'white'); rod.material = mat('white', { transparent: true, opacity: 0.45 }); rail.add(rod);
  puck = shape.ball(0.05, 'orange'); rail.add(puck);
  place(rail, { dist: 'reach', dir: 'ahead', height: 'waist' });
  interactive(puck, {
    grab: 'hold',
    select: (obj, info) => {
      dragging = true;
      const p = info && info.point;
      // grabOffset preserves the puck's position relative to where the ray actually hit, so a laser that
      // merely grazes the ball 10-15 cm off-axis doesn't snap-teleport the puck (and can't fire a false
      // zero-crossing tone). If this particular select had no point (a stale hover-latched ray), fall
      // back to zero offset — the very next drag() frame corrects it.
      grabOffset = p ? currentX * RAIL_SCALE - rail.worldToLocal(_v.copy(p)).x : 0;
    },
    drag: (obj, info) => {
      const p = info && info.point;
      if (!p) return;   // no ray this frame — hold position rather than guess; next frame usually has one
      const lx = Math.max(-RAIL_HALF, Math.min(RAIL_HALF, rail.worldToLocal(_v.copy(p)).x + grabOffset));
      setX(lx / RAIL_SCALE);
    },
    release: () => { dragging = false; setX(currentX); },
  });
  puck.userData.role = 'puck'; dot.userData.role = 'dot'; bar.userData.role = 'bar';
  leftDots.userData.role = 'leftDots'; wipeHit.userData.role = 'wipeHit'; slopeDot.userData.role = 'slopeDot';

  setX(0);
}

function frame(){}

XR.run({ build, frame });
