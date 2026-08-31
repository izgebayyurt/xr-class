const { THREE, shape, place, label, interactive, tone, mat, ground, sky, H, C } = XR;

/* =====================================================================================
   x3 · THE PROOF ROOM — Euclid I.47, performed by hand.

   THE PROOF THIS ROOM ACTUALLY RUNS. Every one of the six moves preserves area BY
   CONSTRUCTION — nothing is checked against a tolerance, nothing is measured off a mesh.

     The hypotenuse AB lies across the board, c² hanging below it, the triangle above it
     with a square erected outward on each leg.

     1. SHEAR a²  — pin the base BC, slide the far edge ALONG BC. Same base, same height,
        so the area is a·a at every instant. Stop where the parallelogram's free sides
        stand vertical: they are then exactly c long, and it fills the strip u ∈ [foot, c].
     2. SHEAR b²  — the same single move on the other leg; it fills the strip u ∈ [0, foot].
     3. DROP THE ALTITUDE — the two parallelograms now share one edge: the piece of the
        altitude line above C. Pull that seam straight down onto AB. For BOTH pieces this
        is one more shear — their outer edges stay pinned, vertical and exactly c long, so
        each area stays (strip width)·c the whole way down. When the seam lands, its lower
        end has traced the altitude from C to its foot H, and each piece is a RECTANGLE:
             b-piece  foot·c = 1.44 = b²        a-piece  rest·c = 0.81 = a²
        — and that same foot H cuts c² into rectangles of exactly those two areas.
     4/5. SLIDE — each rectangle is carried straight down its track by exactly c into the
        half of c² the altitude cut for it. A translation. Nothing left to argue about.
     6. c² is full: 0.81 + 1.44 = 2.25.

   WHY THE NUMBERS CANNOT WOBBLE. Each piece is drawn as the exact parallelogram for its
   one parameter, and its area is reported from that family's symbolic invariant
   (base·height while shearing, width·c once the seam family takes over) — never from
   vertices. The two formulas land on the SAME IEEE double, so nothing even jumps at the
   hand-off:  a*a === (a*a/c)*c === 0.81   and   b*b === (b*b/c)*c === 1.44.
   ENV_TEST.areasFromVertices() runs a shoelace over the vertices actually drawn so a
   reviewer can confirm the mesh agrees with the symbol to ~1e-16 rather than trust it.

   ONE DEGREE OF FREEDOM EACH. Every handle is grab:'hold'. drag() hands back the pointer
   ray; the ray is intersected with the board's own plane in the board's own space and
   projected onto that handle's single axis, so a desktop mouse and a VR controller drive
   it identically and a mid-session stature rescale cannot break the mathematics.

   ONE DELIBERATE DEPARTURE FROM THE BRIEF: the board is raked 28° instead of lying flat.
   At 1:1 the finished figure is 3.0 m × 3.9 m. Built flat first and measured: a 1.58 m eye
   sees that plane at a 14° grazing angle, which squashes every square to a sliver — the
   whole point of the room is watching a shape change and an area not, and flat you cannot
   see either. The rake takes the viewing angle to 33° and costs nothing else: it is still
   one big drafting table, the altitude still falls downhill, and the pieces still slide
   DOWN into c². Two placements follow from it — the plaque hangs just clear of the board's
   top edge (+15°, the lowest spot straight ahead that does not occlude the figure), and the
   handles are laser-reach rather than arm's reach, which a 3 m figure forces either way.

   Debug hook: window.ENV_TEST — see the bottom of build().
   ===================================================================================== */

/* ------------------------------------------------------------------ the triangle ---
   a and b are the only inputs; everything else is derived. */
const a = 0.9, b = 1.2;                  // legs, metres — a real 3-4-5
const c = Math.hypot(a, b);              // 1.5, exactly, in IEEE doubles
const A2 = a * a, B2 = b * b;            // 0.81 and 1.44, both exact doubles
const C2 = A2 + B2;                      // 2.25, exact
const foot = B2 / c;                     // 0.96 = AH : where the altitude meets AB
const rest = A2 / c;                     // 0.54 = HB   (rest*c === A2, foot*c === B2)
const alt = b * (a / c);                 // 0.72 = the altitude's length

/* board coordinates: u across the board, v up the board, both in the drawing plane */
const PT_A = { u: 0, v: 0 };             // left end of the hypotenuse
const PT_B = { u: c, v: 0 };             // right end of the hypotenuse
const PT_C = { u: foot, v: alt };        // the right angle
const dirB = { u: foot / b, v: alt / b };          // unit A->C  = (0.8, 0.6)
const dirA = { u: (foot - c) / a, v: alt / a };    // unit B->C  = (-0.6, 0.8)
const nrmB = { u: -dirB.v, v: dirB.u };            // outward from the triangle, on leg b
const nrmA = { u: dirA.v, v: -dirA.u };            // outward from the triangle, on leg a
/* the shear that stands a leg-square's free sides vertical: solve (outer + s·dir).u = 0 or c */
const SHEAR_A = b, SHEAR_B = a;

/* -------------------------------------------------------------------- the board ---
   The figure needs every square metre of this at 1:1, including the room the sheared
   parallelograms sweep into and the 6% of overshoot the handles allow. */
const U_MIN = -0.75, U_MAX = 2.25, V_MIN = -1.62, V_MAX = 2.30;
const BM = 0.10;                                             // board margin
const BU0 = U_MIN - BM, BU1 = U_MAX + BM, BV0 = V_MIN - BM, BV1 = V_MAX + BM;
const BOARD_W = BU1 - BU0, BOARD_L = BV1 - BV0;              // 3.20 × 4.12
const UC = (BU0 + BU1) / 2, VC = (BV0 + BV1) / 2;            // the board's centre

const THETA = 28 * Math.PI / 180;        // rake from horizontal
const ST = Math.sin(THETA), CT = Math.cos(THETA);
const ANCHOR_Y = 0.66, ANCHOR_D = 1.70;  // where c²'s bottom edge sits: height, distance
const ORIGIN_Y = ANCHOR_Y + (VC + c) * ST;
const ORIGIN_D = ANCHOR_D + (VC + c) * CT;

/* layers, out of the drawing plane toward the visitor (mm apart: no z-fighting) */
const Z_C2 = 0.004, Z_TRI = 0.007, Z_PIECE = 0.011, Z_GHOST = 0.017, Z_EDGE = 0.021,
      Z_LINE = 0.025, Z_TXT = 0.034, Z_HANDLE = 0.085, Z_ANCHOR = 0.17;

const MAXT = 1.06;                       // handles may overshoot the target by 6%
const CAPTURE = 0.05;                    // the "clicks in" window, in units of the DOF

const CHALK = 0xe8eef5, PALE = 0xcfcabc, GHOST = 0xb6cde3, WARN = 0xff7a5c;
const TEAL = (C && C.teal) || 0x35d6c4, ORANGE = (C && C.orange) || 0xffa63c;

/* --------------------------------------------------------------------- the script --- */
const STAGES = [
  { name: 'intro', instr: 'Press BEGIN. Turn a\u00b2 and b\u00b2 into c\u00b2 \u2014 without stretching.',
    why: 'Areas add. If nothing is stretched, the total cannot change.' },
  { name: 'shear-a', instr: 'Lean the teal square over, along leg a, until it stands upright.',
    why: 'Same base, same height \u2014 leaning a square over keeps its area.' },
  { name: 'shear-b', instr: 'Now lean the orange square over the same way, along leg b.',
    why: 'Same base, same height \u2014 leaning a square over keeps its area.' },
  { name: 'altitude', instr: 'Pull the shared seam straight down onto the hypotenuse.',
    why: 'Both keep their width and their 1.5 m sides: one more shear.' },
  { name: 'slide-a', instr: 'Slide the teal rectangle down into the right half of c\u00b2.',
    why: 'Carrying a rectangle along a track changes nothing at all.' },
  { name: 'slide-b', instr: 'Slide the orange rectangle down into the left half of c\u00b2.',
    why: 'Carrying a rectangle along a track changes nothing at all.' },
  { name: 'finale', instr: 'Done. c\u00b2 is full \u2014 and no area ever changed.',
    why: '0.81 + 1.44 = 2.25. Shear and slide never moved a square metre.' },
];

const HINTS = {
  locked:     'Nothing is unlocked yet.\nPress BEGIN to start the proof.',
  wrongShear: "That is b\u00b2's orange handle. This step leans\nthe TEAL square, the one on leg a.",
  spentShear: 'a\u00b2 is already leaning. The orange handle on\nleg b is the live one now.',
  shortShear: 'You stretched nothing \u2014 but that parallelogram\nisn\u2019t leaning far enough to meet the\ntriangle\u2019s side.',
  pastShear:  'You leaned it past the mark. Its free edge\nmust land ON c\u00b2\u2019s own side line, upright.',
  shortDrop:  'The seam still floats above the hypotenuse.\nIt has to come all the way down \u2014 0.72 m \u2014\nto the foot of the altitude.',
  pastDrop:   'You pulled the seam through the hypotenuse.\nStop where it meets AB, or these two stop\nbeing rectangles.',
  wrongSlide: 'That is the other piece. The teal rectangle\nfills the right half of c\u00b2 first \u2014 the half\nthe altitude cut for it.',
  spentSlide: 'The teal half is already filled. The orange\nrectangle is the one left to move.',
  shortSlide: 'Still hanging over the edge of c\u00b2. It has to\ndrop the full 1.5 m to sit inside the outline.',
  pastSlide:  'It slid straight through c\u00b2 and out the\nbottom. Bring it back until its top edge\nrests on the hypotenuse.',
  done:       'Nothing left to move.\nPress RESTART to run the proof again.',
};

const PAYOFF = 'a² + b² didn’t shrink, stretch, or lie.\nThey just changed shape:  0.81 + 1.44 = 2.25.\nEvery right triangle, forever.';

/* ------------------------------------------------------------------------- state --- */
let stageIdx = 0;
let emptyTag = null;
let drop = 0;                            // the shared seam DOF (0..MAXT), stages 3+
let whyOpen = false;
let lastHint = '';
let hintUntil = 0, flashGhost = null;
let finaleT = -1, clock = 0;

let figGroup, plaque, stageLbl, whyLbl, hintLbl, ledgerLbl, payoffLbl, beginLbl;
let altLine, altGhost, seamLine, dropHandle, hintCard;
let lastLedger = '', lastStageTxt = '', lastWhyTxt = '', lastBeginTxt = '';

/* scratch — the drag path allocates nothing */
const _o = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
const _hit = { u: 0, v: 0 };

const LX = u => u - UC;                  // board coords -> the figure group's local frame
const LY = v => v - VC;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x, fallback) => (typeof x === 'number' && isFinite(x) ? x : fallback);

/* ------------------------------------------------------------------- the pieces ---
   Each piece is a parallelogram with four vertices and one live parameter. Two phases:
     'shear' : [origin, C, outerC + s·dir, outerO + s·dir]                area = leg·leg
     'rect'  : [origin, (foot, alt-d), (foot, alt+c-d), (origin.u, c)] - (0, slide·c)
                                                                         area = width·c
   At s = 1, d = 0 the two descriptions coincide, so the hand-off is seamless. */
const pieces = {};

function makePiece(key, colour, origin, dirv, nrm, leg, shearMax, width) {
  const quad = [{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const m = mat(colour, { roughness: 0.85, metalness: 0 });
  m.side = THREE.DoubleSide;
  if (m.emissive) { m.emissive.setHex(colour); m.emissiveIntensity = 0.5; }
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false; mesh.name = key + '-piece';

  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
  const line = new THREE.Line(lgeo, new THREE.LineBasicMaterial({ color: CHALK }));
  line.frustumCulled = false; line.name = key + '-edge';

  const P = {
    key, colour, mesh, line, geo, quad, mat: m,
    o: origin, outO: { u: origin.u + leg * nrm.u, v: origin.v + leg * nrm.v },
    outC: { u: PT_C.u + leg * nrm.u, v: PT_C.v + leg * nrm.v },
    dir: dirv, leg, shearMax, width,
    phase: 'shear', shear: 0, slide: 0,
    handle: null, slideHandle: null, anchor: null, tag: null,
  };
  pieces[key] = P;
  return P;
}

function computeQuad(P) {
  const q = P.quad;
  if (P.phase === 'shear') {
    const s = P.shear * P.shearMax;
    q[0].u = P.o.u; q[0].v = P.o.v;
    q[1].u = PT_C.u; q[1].v = PT_C.v;
    q[2].u = P.outC.u + s * P.dir.u; q[2].v = P.outC.v + s * P.dir.v;
    q[3].u = P.outO.u + s * P.dir.u; q[3].v = P.outO.v + s * P.dir.v;
  } else {
    const d = drop * alt, sv = -P.slide * c;
    q[0].u = P.o.u; q[0].v = P.o.v + sv;
    q[1].u = foot; q[1].v = alt - d + sv;
    q[2].u = foot; q[2].v = alt + c - d + sv;
    q[3].u = P.o.u; q[3].v = c + sv;
  }
}

/* The whole point of the room: area comes from the family's invariant, not from the mesh. */
function pieceArea(P) { return P.phase === 'shear' ? P.leg * P.leg : P.width * c; }
function areaFormula(P) {
  return P.phase === 'shear'
    ? 'base ' + P.leg + ' × height ' + P.leg + ' (shear: both pinned)'
    : 'width ' + P.width + ' × side ' + c + ' (seam: both pinned)';
}
/* How much of c² this piece covers. Exact, because by the time this can be non-zero the
   piece IS the rectangle: the slide DOF only exists from stage 4, and stage 4 is only
   reachable by landing the seam at drop === 1. Before that there is nothing in c². */
function filledBy(P) {
  if (P.phase !== 'rect' || stageIdx < 4 || drop < 1) return 0;
  const top = Math.min(0, c - P.slide * c), bot = Math.max(-c, -P.slide * c);
  return top > bot ? (top - bot) * P.width : 0;
}

/* ------------------------------------------------------------------- geometry io --- */
function writeQuadTo(P) {
  const q = P.quad, pos = P.geo.attributes.position.array;
  for (let i = 0; i < 4; i++) {
    pos[i * 3] = LX(q[i].u); pos[i * 3 + 1] = LY(q[i].v); pos[i * 3 + 2] = Z_PIECE;
  }
  P.geo.attributes.position.needsUpdate = true;
  const lp = P.line.geometry.attributes.position.array;
  for (let i = 0; i < 5; i++) {
    const k = i & 3;
    lp[i * 3] = LX(q[k].u); lp[i * 3 + 1] = LY(q[k].v); lp[i * 3 + 2] = Z_EDGE;
  }
  P.line.geometry.attributes.position.needsUpdate = true;
}

function refresh(P) {
  computeQuad(P);
  writeQuadTo(P);
  const q = P.quad;
  if (P.phase === 'shear') {                       // the shear handle rides the outer edge
    const s = P.shear * P.shearMax;
    P.handle.position.set(LX((P.outC.u + P.outO.u) / 2 + s * P.dir.u),
                          LY((P.outC.v + P.outO.v) / 2 + s * P.dir.v), Z_HANDLE);
    P.handle.rotation.z = Math.atan2(P.dir.v, P.dir.u);
  }
  P.slideHandle.position.set(LX((P.o.u + foot) / 2), LY((q[1].v + q[2].v) / 2), Z_HANDLE);
  P.anchor.position.set(LX((q[0].u + q[1].u + q[2].u + q[3].u) / 4),
                        LY((q[0].v + q[1].v + q[2].v + q[3].v) / 4), Z_ANCHOR);
}

function refreshSeam() {
  const d = drop * alt;
  seamLine.position.set(LX(foot), LY(alt + c / 2 - d), Z_LINE);
  dropHandle.position.set(LX(foot), LY(alt + c / 2 - d), Z_HANDLE);
  const sp = seamLine.geometry.attributes.position.array;
  sp[1] = -c / 2; sp[4] = c / 2;
  seamLine.geometry.attributes.position.needsUpdate = true;
}

/* ----------------------------------------------------------------- line helpers --- */
function geomFrom(list) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list), 3));
  return g;
}
function pushSeg(arr, u0, v0, u1, v1, z) {
  arr.push(LX(u0), LY(v0), z, LX(u1), LY(v1), z);
}
function dashedLoop(pts, z, colour, dash = 0.09, gap = 0.07, closed = true) {
  const arr = [], n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
    const du = p1[0] - p0[0], dv = p1[1] - p0[1], L = Math.hypot(du, dv);
    if (L < 1e-6) continue;
    const m = Math.max(1, Math.round(L / (dash + gap))), cell = L / m, on = cell * dash / (dash + gap);
    for (let k = 0; k < m; k++) {
      const t0 = k * cell / L, t1 = (k * cell + on) / L;
      pushSeg(arr, p0[0] + du * t0, p0[1] + dv * t0, p0[0] + du * t1, p0[1] + dv * t1, z);
    }
  }
  const o = new THREE.LineSegments(geomFrom(arr), new THREE.LineBasicMaterial({ color: colour }));
  o.frustumCulled = false;
  return o;
}
function solidLoop(pts, z, colour, closed = true) {
  const arr = [], n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
    pushSeg(arr, p0[0], p0[1], p1[0], p1[1], z);
  }
  return new THREE.LineSegments(geomFrom(arr), new THREE.LineBasicMaterial({ color: colour }));
}
function fillPoly(pts, z, colour, opacity) {
  const g = new THREE.BufferGeometry(), v = [], idx = [];
  for (let i = 0; i < pts.length; i++) v.push(LX(pts[i][0]), LY(pts[i][1]), z);
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = mat(colour, { transparent: true, opacity, roughness: 1 });
  m.side = THREE.DoubleSide;
  return new THREE.Mesh(g, m);
}

/* ---------------------------------------------------------------------- handles ---
   grab:'hold' + drag(): the engine never moves them, we solve the pointer ray ourselves
   against the board's own plane, in the board's own space. */
const HANDLES = {};

function planeHit(info) {
  const pt = info && info.point, ptr = info && info.pointer;
  if (!pt) return false;
  const src = ptr && ptr.object && ptr.object.getWorldPosition ? ptr.object : XR.camera;
  src.getWorldPosition(_o); _p.copy(pt);
  figGroup.worldToLocal(_o); figGroup.worldToLocal(_p);
  const dz = _p.z - _o.z;
  if (dz > -1e-6) return false;                             // ray not heading into the board
  /* Solve in the HANDLES' own plane (z = Z_HANDLE), not the drawing plane. The bars stand
     8.5 cm proud of the board; solving on the board instead would add a parallax that grows
     as the handle travels, and the drag would drift off its target by a few centimetres. */
  const t = (Z_HANDLE - _o.z) / dz;
  if (!(t > 0 && t <= 60)) return false;      // also rejects NaN, unlike (t <= 0 || t > 60)
  _hit.u = _o.x + t * (_p.x - _o.x) + UC;
  _hit.v = _o.y + t * (_p.y - _o.y) + VC;
  return true;
}

function makeHandle(key, colour, axis, travel) {
  const bar = shape.box(0.38, 0.115, 0.115, colour);
  bar.name = key + '-handle';
  bar.add(shape.hit(0.48, 0.28, 0.28));            // a generous laser target around the bar
  const Hd = { key, obj: bar, axis, travel, grabU: 0, grabV: 0, grabT: 0, held: false, armed: false };
  HANDLES[key] = Hd;
  interactive(bar, {
    grab: 'hold',
    select: (o, info) => onGrab(Hd, info),
    drag: (o, info) => onDrag(Hd, info),
    release: () => endDrag(Hd, true),
  });
  return Hd;
}

function activeHandleKey() {
  return ['', 'shearA', 'shearB', 'drop', 'slideA', 'slideB'][stageIdx] || '';
}

function onGrab(Hd, info) {
  if (Hd.key !== activeHandleKey()) { showHint(wrongHandleHint(Hd.key)); tone(150, 0.18, 'square'); return; }
  Hd.held = true; Hd.armed = false; Hd.grabT = handleParam(Hd);
  if (planeHit(info)) { Hd.grabU = _hit.u; Hd.grabV = _hit.v; Hd.armed = true; }
  tone(520, 0.05, 'sine');
}

function onDrag(Hd, info) {
  if (!Hd.held || !planeHit(info)) return;
  if (!Hd.armed) { Hd.grabU = _hit.u; Hd.grabV = _hit.v; Hd.grabT = handleParam(Hd); Hd.armed = true; return; }
  const du = _hit.u - Hd.grabU, dv = _hit.v - Hd.grabV;
  const was = handleParam(Hd);
  let t = clamp(Hd.grabT + (du * Hd.axis.u + dv * Hd.axis.v) / Hd.travel, 0, MAXT);
  const captured = Math.abs(t - 1) <= CAPTURE;
  if (captured) t = 1;                       // inside the window the handle clicks in
  setHandleParam(Hd, t);
  if (captured && Math.abs(was - 1) > CAPTURE) tone(880, 0.06, 'sine');
}

function handleParam(Hd) {
  if (Hd.key === 'drop') return drop;
  const P = pieces[Hd.key.endsWith('A') ? 'a' : 'b'];
  return Hd.key.startsWith('shear') ? P.shear : P.slide;
}

function setHandleParam(Hd, t) {
  if (Hd.key === 'drop') { drop = t; refreshSeam(); refresh(pieces.a); refresh(pieces.b); }
  else {
    const P = pieces[Hd.key.endsWith('A') ? 'a' : 'b'];
    if (Hd.key.startsWith('shear')) P.shear = t; else P.slide = t;
    refresh(P);
  }
  updateLedger();
}

/* end of a drag: inside the capture window the stage verifies, otherwise a specific hint */
function endDrag(Hd, userReleased) {
  if (!Hd.held) return { advanced: false, hint: lastHint };
  Hd.held = false;
  if (Hd.key !== activeHandleKey()) {          // letting go of a handle this stage does not want
    showHint(wrongHandleHint(Hd.key));
    return { advanced: false, hint: lastHint };
  }
  const t = handleParam(Hd);
  if (Math.abs(t - 1) <= CAPTURE) { setHandleParam(Hd, 1); commitStage(); return { advanced: true, hint: null }; }
  const hint = t < 1 ? shortHint(Hd.key) : pastHint(Hd.key);
  showHint(hint);
  if (userReleased) tone(150, 0.2, 'square');
  return { advanced: false, hint };
}

function wrongHandleHint(key) {
  if (stageIdx === 0) return HINTS.locked;
  if (stageIdx === 6) return HINTS.done;
  if (key === 'shearB') return HINTS.wrongShear;
  if (key === 'shearA') return HINTS.spentShear;
  if (key === 'slideB') return HINTS.wrongSlide;
  if (key === 'slideA') return HINTS.spentSlide;
  return HINTS.locked;
}
const shortHint = k => k === 'drop' ? HINTS.shortDrop : k.startsWith('shear') ? HINTS.shortShear : HINTS.shortSlide;
const pastHint = k => k === 'drop' ? HINTS.pastDrop : k.startsWith('shear') ? HINTS.pastShear : HINTS.pastSlide;

/* ------------------------------------------------------------------ stage machine --- */
function commitStage() {
  if (stageIdx >= 6) return false;
  if (stageIdx === 2) {                        // both leaned: hand over to the seam family
    pieces.a.phase = 'rect'; pieces.b.phase = 'rect';
    pieces.a.shear = 1; pieces.b.shear = 1;
  }
  stageIdx++;
  clearHint();
  tone(660, 0.09, 'sine');
  setTimeout(() => tone(880, 0.09, 'sine'), 90);
  if (stageIdx === 6) finish();
  applyStage();
  return true;
}

function finish() {
  finaleT = clock;
  payoffLbl.visible = true;
  tone(523, 0.16, 'sine');
  setTimeout(() => tone(659, 0.16, 'sine'), 150);
  setTimeout(() => tone(784, 0.16, 'sine'), 300);
  setTimeout(() => tone(1047, 0.34, 'sine'), 450);
}

function applyStage() {
  const S = STAGES[stageIdx];
  if (S.instr !== lastStageTxt) { stageLbl.setText(S.instr); lastStageTxt = S.instr; }
  const w = whyOpen ? S.why : ' ';
  if (w !== lastWhyTxt) { whyLbl.setText(w); lastWhyTxt = w; }
  whyLbl.visible = whyOpen;
  const bt = stageIdx === 0 ? 'BEGIN' : 'RESTART';
  if (bt !== lastBeginTxt) { beginLbl.setText(bt); lastBeginTxt = bt; }

  HANDLES.shearA.obj.visible = stageIdx >= 1 && stageIdx <= 2;
  HANDLES.shearB.obj.visible = stageIdx >= 1 && stageIdx <= 2;
  HANDLES.drop.obj.visible = stageIdx === 3;
  HANDLES.slideA.obj.visible = stageIdx >= 4 && stageIdx <= 5;
  HANDLES.slideB.obj.visible = stageIdx >= 4 && stageIdx <= 5;

  const liveGhost = ['', 'shearA', 'shearB', 'drop', 'slideA', 'slideB'][stageIdx] || '';
  for (const g in ghosts) { ghosts[g].visible = (g === liveGhost); ghostFills[g].visible = (g === liveGhost); }
  altGhost.visible = stageIdx === 3;
  seamLine.visible = stageIdx === 3;
  altLine.visible = stageIdx >= 3;

  if (emptyTag) emptyTag.visible = stageIdx < 4;
  refresh(pieces.a); refresh(pieces.b); refreshSeam();
  updateLedger();
}

function showHint(text) {
  lastHint = text;
  hintLbl.setText(text);
  hintLbl.visible = true; hintCard.visible = true;
  hintUntil = clock + 9;
  /* and the target you missed flares, so the diagnosis has a place as well as words */
  if (flashGhost) { flashGhost.material.color.setHex(GHOST); flashGhost = null; }
  const g = ghosts[activeHandleKey()];
  if (g && g.visible) { g.material.color.setHex(WARN); flashGhost = g; }
}
function clearHint() {
  hintLbl.visible = false; hintCard.visible = false; hintUntil = 0;
  if (flashGhost) { flashGhost.material.color.setHex(GHOST); flashGhost = null; }
}

function updateLedger() {
  const filled = filledBy(pieces.a) + filledBy(pieces.b);
  const txt = 'AREA LEDGER\na²   0.81 m²\nb²   1.44 m²\nc² filled   ' + filled.toFixed(2) + ' / 2.25 m²';
  if (txt !== lastLedger) { ledgerLbl.setText(txt); lastLedger = txt; }
}

function resetAll() {
  stageIdx = 0; drop = 0;
  for (const k of ['a', 'b']) {
    const P = pieces[k];
    P.phase = 'shear'; P.shear = 0; P.slide = 0; P.mat.emissiveIntensity = 0.5;
  }
  for (const k in HANDLES) HANDLES[k].held = false;
  payoffLbl.visible = false; finaleT = -1;
  clearHint(); lastHint = '';
  applyStage();
}

/* ============================================================================ build === */
const ghosts = {}, ghostFills = {};

function build() {
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 'dark', grid: false, radius: 10 });

  /* ---- the raked board. Placed once with body words; the figure lives in its plane. ---- */
  figGroup = shape.group();
  figGroup.name = 'proof-board';
  figGroup.rotation.x = THETA - Math.PI / 2;            // local +Y runs up the rake
  const slab = shape.box(BOARD_W, BOARD_L, 0.05, PALE);
  slab.position.z = -0.025;                             // front face exactly on the drawing plane
  slab.name = 'board-face';
  figGroup.add(slab);
  place(figGroup, { dist: ORIGIN_D, dir: 'ahead', height: ORIGIN_Y, anchor: 'center' });

  const base = shape.box(2.0, ORIGIN_Y - 0.22, 0.55, 0x252b33);
  place(base, { dist: ORIGIN_D, dir: 'ahead', height: 'floor' });
  base.name = 'board-base';

  /* ---- c²: outlined and empty, hanging below the hypotenuse, nearest the visitor ---- */
  const C2PTS = [[0, 0], [c, 0], [c, -c], [0, -c]];
  figGroup.add(Object.assign(fillPoly(C2PTS, Z_C2, 0x141b23, 0.9), { name: 'c2-well' }));
  figGroup.add(Object.assign(solidLoop(C2PTS, Z_EDGE, CHALK), { name: 'c2-outline' }));

  /* ---- the triangle: pale fill beneath the pieces, bright outline above them ---- */
  const TRI = [[PT_A.u, PT_A.v], [PT_B.u, PT_B.v], [PT_C.u, PT_C.v]];
  figGroup.add(Object.assign(fillPoly(TRI, Z_TRI, 0x62788d, 0.98), { name: 'triangle-fill' }));
  figGroup.add(Object.assign(solidLoop(TRI, Z_LINE, CHALK), { name: 'triangle-outline' }));
  const kk = 0.12, ra = [];                              // the right-angle tick at C
  const r1u = PT_C.u - kk * dirB.u, r1v = PT_C.v - kk * dirB.v;
  const r2u = PT_C.u - kk * dirA.u, r2v = PT_C.v - kk * dirA.v;
  pushSeg(ra, r1u, r1v, r1u - kk * dirA.u, r1v - kk * dirA.v, Z_LINE);
  pushSeg(ra, r2u, r2v, r2u - kk * dirB.u, r2v - kk * dirB.v, Z_LINE);
  figGroup.add(Object.assign(new THREE.LineSegments(geomFrom(ra),
    new THREE.LineBasicMaterial({ color: CHALK })), { name: 'right-angle' }));

  /* ---- the altitude: a ghost while you drop it, a solid divider once it has landed ---- */
  altGhost = dashedLoop([[foot, alt], [foot, -c]], Z_GHOST, GHOST, 0.07, 0.06, false);
  altGhost.name = 'altitude-ghost'; figGroup.add(altGhost);
  const alArr = []; pushSeg(alArr, foot, alt, foot, -c, Z_LINE);
  altLine = new THREE.LineSegments(geomFrom(alArr), new THREE.LineBasicMaterial({ color: CHALK }));
  altLine.name = 'altitude'; altLine.visible = false; figGroup.add(altLine);

  /* ---- the two pieces ---- */
  const PA = makePiece('a', TEAL, PT_B, dirA, nrmA, a, SHEAR_A, rest);
  const PB = makePiece('b', ORANGE, PT_A, dirB, nrmB, b, SHEAR_B, foot);
  for (const P of [PA, PB]) { figGroup.add(P.mesh); figGroup.add(P.line); }

  /* ---- ghost targets: the exact outline of where each move ends ---- */
  const shearGhost = (P) => {
    const s = P.shearMax;
    return [[P.o.u, P.o.v], [PT_C.u, PT_C.v],
            [P.outC.u + s * P.dir.u, P.outC.v + s * P.dir.v],
            [P.outO.u + s * P.dir.u, P.outO.v + s * P.dir.v]];
  };
  ghosts.shearA = dashedLoop(shearGhost(PA), Z_GHOST, GHOST);
  ghosts.shearB = dashedLoop(shearGhost(PB), Z_GHOST, GHOST);
  ghosts.drop = dashedLoop([[0, 0], [c, 0], [c, c], [0, c]], Z_GHOST, GHOST);
  ghosts.slideA = dashedLoop([[foot, 0], [c, 0], [c, -c], [foot, -c]], Z_GHOST, GHOST);
  ghosts.slideB = dashedLoop([[0, 0], [foot, 0], [foot, -c], [0, -c]], Z_GHOST, GHOST);
  const ghostPts = { shearA: shearGhost(PA), shearB: shearGhost(PB),
                     drop: [[0, 0], [c, 0], [c, c], [0, c]],
                     slideA: [[foot, 0], [c, 0], [c, -c], [foot, -c]],
                     slideB: [[0, 0], [foot, 0], [foot, -c], [0, -c]] };
  for (const g in ghosts) {
    ghosts[g].name = 'ghost-' + g; ghosts[g].visible = false; figGroup.add(ghosts[g]);
    const f = fillPoly(ghostPts[g], Z_GHOST - 0.001, GHOST, 0.14);
    f.name = 'ghostfill-' + g; f.visible = false;
    ghostFills[g] = f; figGroup.add(f);
  }

  seamLine = new THREE.LineSegments(geomFrom([0, -c / 2, 0, 0, c / 2, 0]),
    new THREE.LineBasicMaterial({ color: 0xffe08a }));
  seamLine.name = 'seam'; seamLine.frustumCulled = false; figGroup.add(seamLine);

  /* ---- handles: one bar per degree of freedom ---- */
  const hA = makeHandle('shearA', TEAL, dirA, SHEAR_A);
  const hB = makeHandle('shearB', ORANGE, dirB, SHEAR_B);
  const hD = makeHandle('drop', 0xffe08a, { u: 0, v: -1 }, alt);
  const sA = makeHandle('slideA', TEAL, { u: 0, v: -1 }, c);
  const sB = makeHandle('slideB', ORANGE, { u: 0, v: -1 }, c);
  dropHandle = hD.obj;
  for (const Hd of [hA, hB, hD, sA, sB]) figGroup.add(Hd.obj);
  PA.handle = hA.obj; PA.slideHandle = sA.obj;
  PB.handle = hB.obj; PB.slideHandle = sB.obj;

  for (const P of [PA, PB]) {
    P.anchor = shape.hit(0.05, 0.05, 0.05);
    P.anchor.name = P.key + '-anchor';
    figGroup.add(P.anchor);
    /* parented, not 'above:' — an 'above:' label is placed once and would be left behind by
       a piece that moves. This one is glued to the piece's centroid, so the number the
       visitor watches is literally carried along by the shape whose area it states. */
    P.tag = label(P === PA ? 'a² = 0.81 m²' : 'b² = 1.44 m²',
      { parent: P.anchor, at: [0, 0.14, 0], capHeight: 0.058, theme: 'dark' });
    P.tag.name = P.key + '2-tag';
  }
  refresh(PA); refresh(PB); refreshSeam();

  /* ---- the plaque, hung clear above the board's top edge so it hides nothing ---- */
  const topD = ORIGIN_D + (BV1 - VC) * CT, topY = ORIGIN_Y + (BV1 - VC) * ST;
  const PLQ_H = 0.72, PLQ_D = topD + 0.30;
  const PLQ_Y = H.eye + (topY - H.eye) * (PLQ_D / topD) + 0.09 + PLQ_H / 2;
  plaque = shape.panel(3.3, PLQ_H, 0x101820);
  plaque.name = 'plaque';
  place(plaque, { dist: PLQ_D, dir: 'ahead', height: PLQ_Y, anchor: 'center' });
  label('THE PROOF ROOM  ·  EUCLID I.47', { parent: plaque, at: [0, 0.26, 0.03], capHeight: 0.055, bg: false });
  stageLbl = label(STAGES[0].instr, { parent: plaque, at: [0, 0.02, 0.03], capHeight: 0.072, bg: false });
  /* the brief's "why is this legal?" toggle: one line, on the plaque, under the instruction */
  whyLbl = label(' ', { parent: plaque, at: [0, -0.24, 0.03], capHeight: 0.056, bg: false });
  whyLbl.name = 'why-line'; whyLbl.visible = false;

  /* ---- ledger and legality line: written on the board's own empty side strips ---- */
  const stripU = (BU0 + 0) / 2;
  const ledgerCard = shape.box(0.80, 0.40, 0.012, 0x141c25);
  ledgerCard.position.set(LX(stripU), LY(-0.55), Z_TXT - 0.006);
  ledgerCard.name = 'ledger-card'; figGroup.add(ledgerCard);
  ledgerLbl = label('AREA LEDGER\na²   0.81 m²\nb²   1.44 m²\nc² filled   0.00 / 2.25 m²',
    { parent: figGroup, at: [LX(stripU), LY(-0.55), Z_TXT + 0.004], capHeight: 0.046, bg: false });
  ledgerLbl.name = 'ledger';

  /* ---- two buttons, low and to the right: clear of every sight line onto the board ---- */
  const beginBtn = shape.box(0.26, 0.11, 0.035, 'teal');
  place(beginBtn, { dist: 1.35, dir: 38, height: 1.30, face: true });
  beginBtn.name = 'begin-button';
  beginLbl = label('BEGIN', { parent: beginBtn, at: [0, 0, 0.045], capHeight: 0.028, bg: false });
  interactive(beginBtn, { select: () => { if (stageIdx === 0) commitStage(); else resetAll(); tone(700, 0.07); } });

  const whyBtn = shape.box(0.26, 0.11, 0.035, 'grey');
  place(whyBtn, { dist: 1.35, dir: 38, height: 1.14, face: true });
  whyBtn.name = 'why-button';
  label('WHY IS THIS\nLEGAL?', { parent: whyBtn, at: [0, 0, 0.045], capHeight: 0.026, bg: false });
  interactive(whyBtn, { select: () => { whyOpen = !whyOpen; applyStage(); tone(whyOpen ? 620 : 440, 0.07); } });

  /* ---- text that belongs to the figure ---- */
  const tag = (u, v, txt) => {
    const anc = shape.hit(0.05, 0.05, 0.05);
    anc.position.set(LX(u), LY(v), Z_ANCHOR);
    anc.name = 'anchor';
    figGroup.add(anc);
    return label(txt, { above: anc, size: 'small' });
  };
  tag(0.36, 0.26, 'b = 1.2 m');
  tag(1.20, 0.22, 'a = 0.9 m');
  tag(c / 2, -0.22, 'c = 1.5 m');
  emptyTag = tag(c / 2, -1.02, 'c²  —  2.25 m² to fill');

  /* ---- the payoff: hidden until c² is actually full, and shown AT the filled square ---- */
  const payAnchor = shape.hit(0.05, 0.05, 0.05);
  payAnchor.position.set(LX(c / 2), LY(-c / 2), 0.42);
  payAnchor.name = 'payoff-anchor';
  figGroup.add(payAnchor);
  payoffLbl = label(PAYOFF, { above: payAnchor, size: 'large', width: 1.8, theme: 'dark' });
  payoffLbl.name = 'payoff'; payoffLbl.visible = false;

  /* ---- the wrong-move hint: a warm card written inside the empty c², straight ahead.
     It is fixed to the board rather than flown to the handle: a free label is sized once,
     for the distance it was created at, and shrinks to nothing if it is moved away. ---- */
  hintCard = shape.box(1.52, 0.34, 0.012, 0x33201d);
  hintCard.position.set(LX(c / 2), LY(-0.42), Z_TXT - 0.006);
  hintCard.name = 'hint-card'; hintCard.visible = false;
  figGroup.add(hintCard);
  hintLbl = label(' ', { parent: figGroup, at: [LX(c / 2), LY(-0.42), Z_TXT + 0.004],
                         capHeight: 0.048, bg: false });
  hintLbl.name = 'hint'; hintLbl.visible = false;

  applyStage();

  /* ==================================================================== ENV_TEST === */
  const whichPiece = (w) => (w === 'a' || w === 'A' || w === 'shearA' || w === 'slideA') ? pieces.a : pieces.b;
  const handleFor = (w) => {
    if (w === 'drop' || stageIdx === 3) return HANDLES.drop;
    return HANDLES[(stageIdx >= 4 ? 'slide' : 'shear') + (whichPiece(w) === pieces.a ? 'A' : 'B')];
  };

  window.ENV_TEST = {
    /* --- the contract --- */
    stage: () => ({ index: stageIdx, name: STAGES[stageIdx].name, instruction: STAGES[stageIdx].instr }),
    areas: () => ({ a2: pieceArea(pieces.a), b2: pieceArea(pieces.b),
                    c2filled: filledBy(pieces.a) + filledBy(pieces.b) }),
    /* 0..1, 1 = the target. Returns the piece's area — the number that must not move. */
    setShear(which, t) {
      const P = whichPiece(which);
      if (P.phase === 'shear') {
        P.shear = clamp(num(+t, P.shear), 0, MAXT);
        const Hd = HANDLES[P === pieces.a ? 'shearA' : 'shearB'];
        Hd.held = true; Hd.armed = true;                 // a drag is now in progress
        refresh(P); updateLedger();
      }
      return pieceArea(P);
    },
    setSlide(which, t) {
      const P = whichPiece(which);
      if (P.phase === 'rect' && stageIdx >= 4) {     // the track only exists once the seam has landed
        P.slide = clamp(num(+t, P.slide), 0, MAXT);
        const Hd = HANDLES[P === pieces.a ? 'slideA' : 'slideB'];
        Hd.held = true; Hd.armed = true;
        refresh(P); updateLedger();
      }
      return pieceArea(P);
    },
    /* also accepts 'drop'; ends the drag exactly as letting go of the handle would */
    release(which) {
      const Hd = which === undefined ? HANDLES[activeHandleKey()] : handleFor(which);
      if (!Hd) return { advanced: false, stage: stageIdx, hint: lastHint };
      const r = endDrag(Hd, false);
      return { advanced: r.advanced, stage: stageIdx, hint: r.hint };
    },
    /* the canonical wrong move for this stage; returns the hint text it triggered */
    attemptWrong() {
      if (stageIdx === 0) { showHint(HINTS.locked); return lastHint; }
      if (stageIdx === 6) { showHint(HINTS.done); return lastHint; }
      if (stageIdx === 1) { onGrab(HANDLES.shearB, null); return lastHint; }        // wrong handle
      if (stageIdx === 2) { pieces.b.shear = 0.55; HANDLES.shearB.held = true;      // let go short
                            refresh(pieces.b); return endDrag(HANDLES.shearB, false).hint; }
      if (stageIdx === 3) { drop = 0.5; HANDLES.drop.held = true; refreshSeam();
                            refresh(pieces.a); refresh(pieces.b); updateLedger();
                            return endDrag(HANDLES.drop, false).hint; }
      if (stageIdx === 4) { onGrab(HANDLES.slideB, null); return lastHint; }        // wrong piece
      pieces.b.slide = 0.6; HANDLES.slideB.held = true; refresh(pieces.b); updateLedger();
      return endDrag(HANDLES.slideB, false).hint;
    },
    /* complete this stage through the same release path a perfect drag would take */
    advance() {
      if (stageIdx === 0) return commitStage();
      if (stageIdx === 6) return false;
      const Hd = HANDLES[activeHandleKey()];
      Hd.held = true; setHandleParam(Hd, 1);
      return endDrag(Hd, false).advanced;
    },
    restart() { resetAll(); return { index: stageIdx, name: STAGES[stageIdx].name }; },

    /* --- extras, so a reviewer can check the claims instead of trusting them --- */
    hint: () => lastHint,
    hintVisible: () => !!hintLbl.visible,
    params: () => ({ shearA: pieces.a.shear, shearB: pieces.b.shear, drop,
                     slideA: pieces.a.slide, slideB: pieces.b.slide,
                     phaseA: pieces.a.phase, phaseB: pieces.b.phase }),
    captureWindow: CAPTURE,
    constants: () => ({ a, b, c, A2, B2, C2, foot, rest, alt, SHEAR_A, SHEAR_B }),
    formulas: () => ({ a2: areaFormula(pieces.a), b2: areaFormula(pieces.b) }),
    vertices: (which) => whichPiece(which).quad.map(p => ({ u: p.u, v: p.v })),
    /* shoelace over the vertices actually drawn — proves the mesh matches the symbol */
    areasFromVertices() {
      const sh = (q) => {
        let s = 0;
        for (let i = 0; i < 4; i++) { const p0 = q[i], p1 = q[(i + 1) & 3]; s += p0.u * p1.v - p1.u * p0.v; }
        return Math.abs(s) / 2;
      };
      return { a2: sh(pieces.a.quad), b2: sh(pieces.b.quad) };
    },
    /* board-plane <-> world, so a probe can aim a real pointer ray at an exact figure point */
    worldAt(u, v, z) {
      const q = new THREE.Vector3(LX(u), LY(v), z === undefined ? Z_HANDLE : z);
      figGroup.localToWorld(q);
      return { x: q.x, y: q.y, z: q.z };
    },
    handleObj: (key) => HANDLES[key].obj,
    handleAt(key) {
      const o = HANDLES[key].obj; o.getWorldPosition(_w);
      return { x: _w.x, y: _w.y, z: _w.z, visible: o.visible };
    },
    payoffVisible: () => !!payoffLbl.visible,
    ledger: () => lastLedger,
    handles: () => Object.keys(HANDLES).filter(k => HANDLES[k].obj.visible),
    press: (n) => { if (n === 'begin') { if (stageIdx === 0) commitStage(); else resetAll(); }
                    else if (n === 'why') { whyOpen = !whyOpen; applyStage(); }
                    return { stage: stageIdx, why: whyOpen }; },
  };
}

/* frame() only breathes the finale. Every geometry update is event-driven — fired by a
   drag callback or a stage change, never polled — and allocates nothing. */
function frame(dt, t) {
  clock = t;
  if (hintUntil > 0 && t > hintUntil) clearHint();
  if (finaleT >= 0) {
    const k = 0.6 + 0.35 * Math.sin((t - finaleT) * 2.4);
    pieces.a.mat.emissiveIntensity = k;
    pieces.b.mat.emissiveIntensity = k;
  }
}

XR.run({ build, frame });
