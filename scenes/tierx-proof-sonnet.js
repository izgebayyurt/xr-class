const { THREE, shape, place, label, interactive, tone, mat, C, ground, sky, input } = XR;

// ─────────────────────────────────────────────────────────────────────────────
// x3 · THE PROOF ROOM (Euclid I.47) · Tier X
//
// A fixed 3-4-5 right triangle (legs a=0.9 b=1.2, hyp c derived) with its three squares, walked
// through the classic "shear" proof of a²+b²=c² as a 7-state gated machine (intro + 6 stages).
//
// GEOMETRY. Everything lives in one flat local plane ("board" group, meters, undisplayed scale
// applied only to the group transform so on-screen size is comfortable while every length used in
// the proof stays the true a/b/c). A = (0,0), B = (c,0) — the hypotenuse is the local x-axis — and
// the right-angle apex C sits directly above the foot of its own altitude: C = (AH, ALT) where
// AH = a²/c, ALT = ab/c (both classic similar-triangle identities, derived from a,b — never typed
// as literals). That single choice makes the altitude a vertical line and the two pieces the
// altitude cuts c² into into true axis-aligned rectangles.
//
// SHEAR. Each leg-square is a quad with its BASE FIXED on the leg (both endpoints pinned to the
// triangle) and its far edge free to slide parallel to that base — the textbook shear: base length
// and perpendicular height never change, so area = base × height is invariant *by construction*,
// not by measurement. The target shear is the unique offset where the square's side edges swing
// around to run parallel to the hypotenuse ("aligning with the triangle's side") — solved once per
// leg from the leg's own outward normal and direction, again no hardcoded angle.
//
// SLIDE. Once a shear is captured, that exact parallelogram (frozen shape) gets ONE more DOF: a
// straight-line translation from where the shear left it to its rectangle's home inside c². The
// translation vector is centroid(rectangle) − centroid(sheared shape) — derived from the two shapes,
// not guessed. On capture the quad's four vertices are swapped for the rectangle's own four corners
// (a discrete "click home", exactly the language the brief uses for the shear capture too) and the
// piece becomes, in place, the flood-fill of that rectangle — no separate fill mesh needed.
//
// AREAS. a² and b² are report as LEG_A*LEG_A / LEG_B*LEG_B — plain constants, never read off a mesh,
// so they cannot wobble while a shape is mid-drag. c2filled is 0 / a² / c² depending on how many
// rectangles are currently the exact locked shape — also a parameter count, not a measurement.
//
// STATE MACHINE. STAGES[0..6] = intro, shear-a, shear-b, drop-altitude, slide-a, slide-b, finale.
// advance() performs the *current* stage's canonical manipulation through the same commit function a
// real capture uses, then moves on — so a scripted advance() walk and a hand-driven walk are provably
// the same code path. release(which) / attemptWrong() share that same commit/hint logic, so "released
// short" and "advance()" can never disagree about what counts as capture.
// ─────────────────────────────────────────────────────────────────────────────

// ── triangle + derived constants (meters; all derived from LEG_A/LEG_B, no other magic numbers) ──
const LEG_A = 0.9, LEG_B = 1.2;
const HYP = Math.hypot(LEG_A, LEG_B);                 // = 1.5, derived
const AH = (LEG_A * LEG_A) / HYP;                     // foot-of-altitude distance from A (similar triangles)
const HB = (LEG_B * LEG_B) / HYP;                     // = HYP - AH
const ALT = (LEG_A * LEG_B) / HYP;                    // altitude length (apex height above AB)
const A2 = LEG_A * LEG_A, B2 = LEG_B * LEG_B, C2 = HYP * HYP;

const A_PT = [0, 0], B_PT = [HYP, 0], C_PT = [AH, ALT], H_PT = [AH, 0];

const DISPLAY_SCALE = 0.5;      // visual-only zoom on the whole board; every length above stays true
const T_MAX = 1.55;             // shear/slide DOF clamps (allows a visible "overshoot" for wrong moves)
const TOL = 0.08;               // capture window half-width around t=1 / u=1
const ZB = { tri: 0.0006, sq: 0.0016, ghost: 0.0032, alt: 0.0026, handle: 0.006 };

// ── small 2D vector helpers (module scope; never allocated per frame) ──
const v2 = (x, y) => [x, y];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vadd = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];
const vlen = a => Math.hypot(a[0], a[1]);
const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l]; };
const vscale = (a, s) => [a[0] * s, a[1] * s];
const vmid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const rot90 = a => [-a[1], a[0]];    // +90°
const rotm90 = a => [a[1], -a[0]];   // -90°

// ── per-leg-square static geometry: base, outward normal, target shear offset ──
// n = unit outward normal (away from the triangle interior); d = unit base direction (base0→base1).
// side(t) = n*h + d*(t*sTarget); the shear's ONLY free coordinate is t.
function buildPiece(base0, base1, apex3rd, h, color) {
  const d = vnorm(vsub(base1, base0));
  const mid = vmid(base0, base1);
  const toApex = vnorm(vsub(apex3rd, mid));
  let n = rot90(d);
  if (n[0] * toApex[0] + n[1] * toApex[1] > 0) n = rotm90(d);   // n must point AWAY from the 3rd vertex
  // target: side vector (n*h + t*sTarget*d) has zero component along AB's direction (1,0) ⇒ parallel to AB.
  const abDir = [1, 0];
  const nDotAB = n[0], dDotAB = d[0];
  const sTarget = dDotAB !== 0 ? -(h * nDotAB) / dDotAB : 0;
  return { base0, base1, d, n, h, sTarget, color };
}
const PIECE_A = buildPiece(A_PT, C_PT, B_PT, LEG_A, 'teal');   // base = leg CA, 3rd vertex B (interior side)
const PIECE_B = buildPiece(C_PT, B_PT, A_PT, LEG_B, 'orange'); // base = leg CB, 3rd vertex A

function pieceQuadAt(piece, t) {
  const side = vadd(vscale(piece.n, piece.h), piece.d, t * piece.sTarget);
  return [piece.base0, piece.base1, vadd(piece.base1, side), vadd(piece.base0, side)];
}
function centroidOf(q) { return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4]; }

// rectangle homes inside c² (axis-aligned since AB is the local x-axis)
const RECT1 = [[0, 0], [AH, 0], [AH, -HYP], [0, -HYP]];       // area = AH*HYP = a²
const RECT2 = [[AH, 0], [HYP, 0], [HYP, -HYP], [AH, -HYP]];   // area = HB*HYP = b²
const RECT_OF = { a: RECT1, b: RECT2 };
const PIECE_OF = { a: PIECE_A, b: PIECE_B };

// ── state machine ──
const STAGES = [
  { name: 'intro', instr: 'Welcome to the Proof Room. Pull the trigger on the glowing lever to begin.',
    why: '' },
  { name: 'shear-a', instr: 'Grab the teal handle on a² and slide it sideways until the ghost outline lights up, then let go.',
    why: 'Shear = same base, same height ⇒ the area never changes, no matter how far it leans.' },
  { name: 'shear-b', instr: 'Same move on the orange b² handle — slide it until its ghost lights up.',
    why: 'Same rule, other leg: base and height are untouched, only the lean changes.' },
  { name: 'drop-altitude', instr: 'Pull the lever to drop the altitude — it splits c² into two honest rectangles.',
    why: 'The altitude meets the hypotenuse at a right angle by definition, so it cuts two true rectangles, not two guesses.' },
  { name: 'slide-a', instr: 'Grab the sheared a² and slide it along its track into the left rectangle.',
    why: 'A slide is a pure translation — translation never changes area.' },
  { name: 'slide-b', instr: 'Grab the sheared b² and slide it along its track into the right rectangle.',
    why: 'Same reason: sliding it does not stretch it, so its area is still exactly b².' },
  { name: 'finale', instr: 'a² + b² = c². Press RESTART to watch it again.', why: '' },
];
let stageIdx = 0;
let whyOn = false;

// per-piece runtime state
const pieces = {
  a: { t: 0, u: 0, phase: 'square', mesh: null, handle: null, ghost: null, quadCur: null },
  b: { t: 0, u: 0, phase: 'square', mesh: null, handle: null, ghost: null, quadCur: null },
};
let dragging = null;      // {which, kind:'shear'|'slide', grabLocalOffset}
let hintText = '', hintUntil = -999, nowT = 0;
let altShown = false, altAnim = 0;
let payoffShown = false;

// scene refs (assigned in build)
let board, plaqueLbl, whyBtn, ledgerLbl, restartBtn, dropLever, altLine, altLineFull, triLine, payoffLbl;
let rect1Ghost, rect2Ghost;
let lastPlaque = '', lastLedger = '';

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY MESH HELPERS — one pre-allocated quad buffer per shape, mutated in place (never rebuilt)
// ─────────────────────────────────────────────────────────────────────────────
function makeQuadMesh(color, z, opts) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(geo, mat(color, Object.assign({ side: THREE.DoubleSide }, opts)));
  m.frustumCulled = false;
  m.userData.z = z;
  return m;
}
function setQuad(mesh, q) {
  const p = mesh.geometry.attributes.position, z = mesh.userData.z;
  for (let i = 0; i < 4; i++) p.setXYZ(i, q[i][0], q[i][1], z);
  p.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
function makeLoopLine(color, z, opts) {
  const l = shape.line([[0, 0, z], [0, 0, z], [0, 0, z], [0, 0, z], [0, 0, z]], color);
  if (opts) Object.assign(l.material, opts);
  l.frustumCulled = false;
  return l;
}
function setLoop(line, q, z) {
  const pos = line.geometry.attributes.position;
  const pts = [q[0], q[1], q[2], q[3], q[0]];
  for (let i = 0; i < 5; i++) pos.setXYZ(i, pts[i][0], pts[i][1], z);
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD
// ─────────────────────────────────────────────────────────────────────────────
function build() {
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 'dark', grid: false, arrow: false });
  input.teleport = 'none';

  board = shape.group();
  board.name = 'proof board';

  // pale table backdrop, sized to the whole figure with margin
  const back = shape.panel(3.6, 3.9, 0xe9e4d6);
  back.material = mat(0xe9e4d6, { opacity: 0.94, transparent: true, side: THREE.DoubleSide });
  back.position.set((A_PT[0] + B_PT[0]) / 2 + 0.15, -0.15, -0.01);
  board.add(back);

  // triangle outline
  triLine = makeLoopLine('white', ZB.tri);
  setLoop(triLine, [A_PT, B_PT, C_PT, C_PT], ZB.tri);
  // (loop line uses 5 pts incl. repeat of first; a 3-gon needs its own setter)
  (function setTri() {
    const pos = triLine.geometry.attributes.position;
    const pts = [A_PT, B_PT, C_PT, A_PT, A_PT];
    for (let i = 0; i < 5; i++) pos.setXYZ(i, pts[i][0], pts[i][1], ZB.tri);
    pos.needsUpdate = true;
    triLine.geometry.computeBoundingSphere();
  })();
  board.add(triLine);

  // c² outline (always visible, empty until pieces land)
  const c2Outline = makeLoopLine('white', ZB.sq, { transparent: true, opacity: 0.7 });
  setLoop(c2Outline, RECT1.length ? [A_PT, B_PT, [HYP, -HYP], [0, -HYP]] : null, ZB.sq);
  board.add(c2Outline);

  // altitude (short, inside triangle) + its drop-extension into c² (hidden until stage 3)
  altLine = makeLoopLine('yellow', ZB.alt);
  board.add(altLine);
  altLineFull = shape.line([[AH, 0, ZB.alt], [AH, 0, ZB.alt]], 'yellow');
  altLineFull.frustumCulled = false;
  altLineFull.visible = false;
  board.add(altLineFull);

  // ghost outlines for the rectangle homes (dashed-feel via low opacity), shown from drop-altitude on
  rect1Ghost = makeLoopLine(0x2fb8a6, ZB.ghost, { transparent: true, opacity: 0.55 });
  rect2Ghost = makeLoopLine(0xe08a2b, ZB.ghost, { transparent: true, opacity: 0.55 });
  setLoop(rect1Ghost, RECT1, ZB.ghost); setLoop(rect2Ghost, RECT2, ZB.ghost);
  rect1Ghost.visible = false; rect2Ghost.visible = false;
  board.add(rect1Ghost); board.add(rect2Ghost);

  // the two leg-square pieces + their shear-target ghosts + handles
  for (const which of ['a', 'b']) {
    const piece = PIECE_OF[which];
    const st = pieces[which];
    st.mesh = makeQuadMesh(piece.color, ZB.sq, { emissive: piece.color, emissiveIntensity: 0.12 });
    board.add(st.mesh);
    setQuad(st.mesh, pieceQuadAt(piece, 0));

    st.ghost = makeLoopLine(piece.color, ZB.ghost, { transparent: true, opacity: 0.5 });
    setLoop(st.ghost, pieceQuadAt(piece, 1), ZB.ghost);
    st.ghost.visible = false;
    board.add(st.ghost);

    const hg = shape.group();
    const knob = shape.ball(0.05, piece.color);
    knob.material = mat(piece.color, { emissive: piece.color, emissiveIntensity: 0.4 });
    hg.add(knob);
    hg.add(shape.hitball(0.09));
    hg.scale.setScalar(1 / DISPLAY_SCALE);   // keep handles a comfortable, constant WORLD size
    board.add(hg);
    st.handle = hg;
    interactive(hg, {
      grab: 'hold',
      select: () => onHandleSelect(which),
      drag: (obj, info) => onHandleDrag(which, info),
      release: () => onHandleRelease(which),
    });
  }
  layoutHandles();

  // drop-altitude lever
  dropLever = shape.group();
  const leverBall = shape.ball(0.05, 'yellow');
  leverBall.material = mat('yellow', { emissive: 0xd8c23a, emissiveIntensity: 0.5 });
  dropLever.add(leverBall);
  dropLever.add(shape.hitball(0.09));
  dropLever.position.set(HYP / 2, -HYP - 0.35, 0.02);
  dropLever.scale.setScalar(1 / DISPLAY_SCALE);
  board.add(dropLever);
  interactive(dropLever, { select: () => onDropLeverSelect() });

  board.scale.setScalar(DISPLAY_SCALE);
  place(board, { dist: 1.85, dir: 'ahead', height: 1.12, anchor: 'center' });

  // "above" labels are created only now, AFTER the board (their parent chain) has its final world
  // transform — an above-label snapshots world position at creation time, so creating it before the
  // group is placed/scaled bakes in the wrong spot.
  label('shear a²', { above: pieces.a.handle, size: 'small' });
  label('shear b²', { above: pieces.b.handle, size: 'small' });
  label('drop the altitude', { above: dropLever, size: 'small' });

  // free (user-facing) UI: stage plaque, why-toggle, area ledger, restart
  plaqueLbl = label(' ', { dist: 1.55, dir: 'ahead', height: 'eye', size: 'comfortable', width: 1.5, theme: 'dark', anchor: 'top' });

  whyBtn = shape.box(0.09, 0.09, 0.03, 'purple');
  place(whyBtn, { dist: 1.55, dir: 'ahead-right', height: 'chest' });
  interactive(whyBtn, { select: () => { whyOn = !whyOn; refreshPlaque(true); tone(520, 0.05, 'triangle'); } });
  label('why legal?', { above: whyBtn, size: 'small' });

  ledgerLbl = label(' ', { dist: 1.55, dir: 'ahead-left', height: 'chest', size: 'small', width: 0.85, theme: 'glass', anchor: 'top' });

  restartBtn = shape.box(0.09, 0.09, 0.03, 'red');
  place(restartBtn, { dist: 1.6, dir: -52, height: 'waist' });
  interactive(restartBtn, { select: () => doRestart() });
  label('RESTART', { above: restartBtn, size: 'small' });

  payoffLbl = label(' ', { dist: 1.45, dir: 'ahead', height: 1.02, size: 'large', width: 1.7, theme: 'dark', accent: '#f2a25c' });
  payoffLbl.visible = false;

  refreshPlaque(true);
  refreshLedger(true);
}

function layoutHandles() {
  for (const which of ['a', 'b']) {
    const st = pieces[which], piece = PIECE_OF[which];
    positionHandleForPiece(which, st, piece);
  }
  positionAndShapePieces();
}
function positionHandleForPiece(which, st, piece) {
  const q = st.phase === 'square' || st.phase === 'shearing' ? pieceQuadAt(piece, st.t)
          : st.quadCur || pieceQuadAt(piece, 1);
  const mid = vmid(q[2], q[3]);   // top-edge midpoint (the free edge)
  st.handle.position.set(mid[0], mid[1], ZB.handle);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION — shear + slide share one handle-drag pipeline; `phase` on each piece disambiguates.
// ─────────────────────────────────────────────────────────────────────────────
function expectedStageFor(which, kind) {
  if (kind === 'shear') return which === 'a' ? 1 : 2;
  return which === 'a' ? 4 : 5;   // slide
}
function currentKindFor(which) {
  const st = pieces[which];
  return (st.phase === 'square' || st.phase === 'shearing') ? 'shear'
       : (st.phase === 'sheared' || st.phase === 'sliding') ? 'slide' : 'locked';
}

function onHandleSelect(which) {
  const kind = currentKindFor(which);
  if (kind === 'locked') return;   // already placed; nothing to grab
  const need = expectedStageFor(which, kind);
  if (stageIdx !== need) { setHint(wrongHandleHint(which, kind)); tone(180, 0.12, 'square'); return; }
  dragging = { which, kind };
  const st = pieces[which];
  st.dragStartVal = kind === 'shear' ? st.t : st.u;
}
function onHandleDrag(which, info) {
  if (!dragging || dragging.which !== which) return;
  const p = info && info.point;
  if (!p) return;
  const st = pieces[which], piece = PIECE_OF[which];
  const local = board.worldToLocal(_v.copy(p));
  if (dragging.kind === 'shear') {
    const rel = vsub([local.x, local.y], piece.base0);
    const raw = (rel[0] * piece.d[0] + rel[1] * piece.d[1] - (piece.h * piece.n[0] * piece.d[0] + piece.h * piece.n[1] * piece.d[1])) / piece.sTarget;
    st.t = Math.max(0, Math.min(T_MAX, raw));
    st.phase = 'shearing';
    setQuad(st.mesh, pieceQuadAt(piece, st.t));
    positionHandleForPiece(which, st, piece);
  } else {
    const rect = RECT_OF[which];
    const startCentroid = centroidOf(st.lockedQuad);
    const targetCentroid = centroidOf(rect);
    const V = vsub(targetCentroid, startCentroid);
    const along = vlen(V) > 1e-6 ? vnorm(V) : [0, -1];
    const rel = vsub([local.x, local.y], startCentroid);
    const raw = (rel[0] * along[0] + rel[1] * along[1]) / vlen(V);
    st.u = Math.max(0, Math.min(T_MAX, raw));
    st.phase = 'sliding';
    const q = st.lockedQuad.map(pt => vadd(pt, V, st.u));
    setQuad(st.mesh, q);
    const mid = vmid(q[2], q[3]);
    st.handle.position.set(mid[0], mid[1], ZB.handle);
  }
}
function onHandleRelease(which) {
  if (!dragging || dragging.which !== which) return;
  const kind = dragging.kind;
  dragging = null;
  tryCommit(which, kind, true);
}

function tryCommit(which, kind, isRelease) {
  const st = pieces[which], piece = PIECE_OF[which];
  const val = kind === 'shear' ? st.t : st.u;
  const captured = Math.abs(val - 1) <= TOL;
  if (!captured) {
    if (isRelease) setHint(missedHint(which, kind));
    return false;
  }
  if (kind === 'shear') {
    st.t = 1; st.phase = 'sheared';
    st.lockedQuad = pieceQuadAt(piece, 1);
    setQuad(st.mesh, st.lockedQuad);
    positionHandleForPiece(which, st, piece);
    st.ghost.visible = false;
    tone(660, 0.12, 'sine');
    if (stageIdx === expectedStageFor(which, 'shear')) advanceStage();
  } else {
    st.u = 1; st.phase = 'locked';
    st.quadCur = RECT_OF[which];
    setQuad(st.mesh, st.quadCur);
    st.handle.visible = false;
    (which === 'a' ? rect1Ghost : rect2Ghost).visible = false;
    tone(880, 0.16, 'sine');
    if (stageIdx === expectedStageFor(which, 'slide')) advanceStage();
  }
  return true;
}

function onDropLeverSelect() {
  if (stageIdx !== 3) { setHint(wrongLeverHint()); tone(180, 0.12, 'square'); return; }
  commitDropAltitude();
}
function commitDropAltitude() {
  altShown = true; altAnim = 0;
  altLineFull.visible = true;
  rect1Ghost.visible = true; rect2Ghost.visible = true;
  pieces.a.handle.visible = true; pieces.b.handle.visible = true;
  layoutHandles();
  tone(300, 0.2, 'sine');
  if (stageIdx === 3) advanceStage();
}

const _v = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────
// STAGE ADVANCE / HINTS
// ─────────────────────────────────────────────────────────────────────────────
function advanceStage() {
  stageIdx = Math.min(STAGES.length - 1, stageIdx + 1);
  if (stageIdx === 6) doFinale();
  refreshPlaque(true);
  refreshLedger(true);
}
function setHint(text) { hintText = text; hintUntil = nowT + 4; refreshPlaque(true); }
function wrongHandleHint(which, kind) {
  const otherReady = kind === 'shear' ? (which === 'a' ? 'b² hasn’t sheared yet — finish a² first.' : 'a² is already sheared — this stage is b²’s.')
    : (which === 'a' ? 'the altitude has to drop before anything slides.' : 'a² slides home before b² does.');
  return `That’s not this stage’s handle — ${otherReady}`;
}
function wrongLeverHint() { return 'Both squares still have to be sheared before the altitude can drop.'; }
function missedHint(which, kind) {
  if (kind === 'shear') {
    return which === 'a'
      ? 'You stretched nothing — but that parallelogram isn’t leaning far enough to meet the triangle’s side.'
      : 'Same idea on b²: keep leaning it until its slanted edge runs parallel with the hypotenuse.';
  }
  return which === 'a'
    ? 'Right piece, wrong stop — slide a² further along the track until it drops into its rectangle.'
    : 'Close — b²’s rectangle is further along the track. Keep sliding.';
}

function doFinale() {
  payoffShown = true;
  payoffLbl.visible = true;
  payoffLbl.setText(`a² + b² didn’t shrink, stretch, or lie. They just changed shape:\n${A2.toFixed(2)} + ${B2.toFixed(2)} = ${C2.toFixed(2)}. Every right triangle, forever.`);
  tone(523, 0.22, 'sine'); tone(784, 0.32, 'sine');
}

// ─────────────────────────────────────────────────────────────────────────────
// UI TEXT
// ─────────────────────────────────────────────────────────────────────────────
function refreshPlaque(force) {
  const s = STAGES[stageIdx];
  let txt = s.instr;
  if (whyOn && s.why) txt += '\n' + s.why;
  if (nowT < hintUntil) txt += '\n⚠ ' + hintText;
  if (force || txt !== lastPlaque) { lastPlaque = txt; plaqueLbl.setText(txt); }
}
function filledFraction() {
  let area = 0;
  if (pieces.a.phase === 'locked') area += A2;
  if (pieces.b.phase === 'locked') area += B2;
  return area;
}
function refreshLedger(force) {
  const filled = filledFraction();
  const pct = Math.round((filled / C2) * 100);
  const txt = `AREA LEDGER\na² = ${A2.toFixed(2)}\nb² = ${B2.toFixed(2)}\nc² filled: ${pct}%  (${filled.toFixed(2)} / ${C2.toFixed(2)})`;
  if (force || txt !== lastLedger) { lastLedger = txt; ledgerLbl.setText(txt); }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTART
// ─────────────────────────────────────────────────────────────────────────────
function doRestart() {
  stageIdx = 0; whyOn = false; dragging = null; hintUntil = -999; payoffShown = false;
  altShown = false; altAnim = 0;
  altLineFull.visible = false;
  rect1Ghost.visible = false; rect2Ghost.visible = false;
  payoffLbl.visible = false;
  for (const which of ['a', 'b']) {
    const st = pieces[which], piece = PIECE_OF[which];
    st.t = 0; st.u = 0; st.phase = 'square'; st.lockedQuad = null; st.quadCur = null;
    setQuad(st.mesh, pieceQuadAt(piece, 0));
    st.ghost.visible = false;
    st.handle.visible = true;
    positionHandleForPiece(which, st, piece);
  }
  refreshPlaque(true);
  refreshLedger(true);
  tone(220, 0.18, 'triangle');
}

function positionAndShapePieces() {
  for (const which of ['a', 'b']) {
    const st = pieces[which], piece = PIECE_OF[which];
    setQuad(st.mesh, pieceQuadAt(piece, st.t));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAME
// ─────────────────────────────────────────────────────────────────────────────
function frame(dt, t) {
  nowT = t;
  if (nowT >= hintUntil && lastPlaque.indexOf('⚠') >= 0) refreshPlaque(true);   // hint expired, redraw plain
  if (altShown && altAnim < 1) {
    altAnim = Math.min(1, altAnim + dt * 2.2);
    const y = -HYP * altAnim;
    setLoop(altLineFull, [[AH, 0], [AH, y], [AH, y], [AH, y]], ZB.alt);
  }
  // ghost visibility follows the stage that owns it
  pieces.a.ghost.visible = (stageIdx === 1 && pieces.a.phase !== 'sheared' && pieces.a.phase !== 'locked');
  pieces.b.ghost.visible = (stageIdx === 2 && pieces.b.phase !== 'sheared' && pieces.b.phase !== 'locked');
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
window.ENV_TEST = {
  stage() { const s = STAGES[stageIdx]; return { index: stageIdx, name: s.name, instruction: s.instr }; },
  areas() { return { a2: A2, b2: B2, c2filled: filledFraction() }; },

  setShear(which, tVal) {
    const st = pieces[which], piece = PIECE_OF[which];
    if (st.phase === 'locked') return false;
    st.t = Math.max(0, Math.min(T_MAX, +tVal));
    st.phase = 'shearing';
    setQuad(st.mesh, pieceQuadAt(piece, st.t));
    positionHandleForPiece(which, st, piece);
    return st.t;
  },
  setSlide(which, uVal) {
    const st = pieces[which];
    if (st.phase !== 'sheared' && st.phase !== 'sliding' && st.phase !== 'locked') return false;
    if (!st.lockedQuad) return false;
    const rect = RECT_OF[which];
    const V = vsub(centroidOf(rect), centroidOf(st.lockedQuad));
    st.u = Math.max(0, Math.min(T_MAX, +uVal));
    st.phase = 'sliding';
    const q = st.lockedQuad.map(pt => vadd(pt, V, st.u));
    setQuad(st.mesh, q);
    return st.u;
  },
  release(which) {
    if (dragging && dragging.which === which) { const kind = dragging.kind; dragging = null; return tryCommit(which, kind, true); }
    const kind = currentKindFor(which);
    if (kind === 'locked') return false;
    return tryCommit(which, kind, true);
  },
  attemptWrong() {
    const s = STAGES[stageIdx];
    if (s.name === 'shear-a' || s.name === 'shear-b') {
      const which = s.name === 'shear-a' ? 'a' : 'b';
      this.setShear(which, 0.4);
      return tryCommit(which, 'shear', true) ? '' : hintTextNow();
    }
    if (s.name === 'slide-a' || s.name === 'slide-b') {
      const which = s.name === 'slide-a' ? 'a' : 'b';
      this.setSlide(which, 0.3);
      return tryCommit(which, 'slide', true) ? '' : hintTextNow();
    }
    if (s.name === 'drop-altitude') { onHandleSelect('a'); return hintTextNow(); }
    if (s.name === 'intro') { setHint('Nothing to get wrong yet — pull the lever to start.'); return hintTextNow(); }
    setHint('The proof is finished — press RESTART to try again.'); return hintTextNow();
  },
  advance() {
    const s = STAGES[stageIdx];
    if (s.name === 'intro') { advanceStage(); return true; }
    if (s.name === 'shear-a') { this.setShear('a', 1); return tryCommit('a', 'shear', true); }
    if (s.name === 'shear-b') { this.setShear('b', 1); return tryCommit('b', 'shear', true); }
    if (s.name === 'drop-altitude') { commitDropAltitude(); return true; }
    if (s.name === 'slide-a') { this.setSlide('a', 1); return tryCommit('a', 'slide', true); }
    if (s.name === 'slide-b') { this.setSlide('b', 1); return tryCommit('b', 'slide', true); }
    return false;   // finale: nothing further to advance
  },
  restart() { doRestart(); },

  // debug/inspection extras (not required by the contract, harmless if unused)
  hint: () => (nowT < hintUntil ? hintText : ''),
  payoff: () => payoffShown,
  piecePhase: which => pieces[which].phase,
};
function hintTextNow() { return hintText; }

XR.run({ build, frame });
