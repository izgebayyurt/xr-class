const { THREE, shape, place, label, interactive, tone, mat, ground, sky, input, onButton } = XR;

/* =====================================================================================
   x1 · COMPASS & STRAIGHTEDGE — Euclid I.1 · Tier X
   -------------------------------------------------------------------------------------
   A dark round drafting workplane a step ahead, waist height. Two given points A and B.
   Three tools: LINE (two points -> a straight edge extended across the table), CIRCLE
   (centre point, then a point it passes through), MOVE (drag a given point).

   THE KERNEL IS THE ASSIGNMENT. Nothing here is drawn from coordinates typed by hand.
   Every curve stores the IDs of its defining points; every derived point stores the two
   parent curve IDs plus a branch index (0/1) that names WHICH of the two algebraic roots
   it is. Geometry is recomputed top-down from that graph on every change (evaluate()),
   in creation order — which is a valid topological order because a node can only ever
   reference nodes that already existed when it was made.

   Consequences that matter:
     · Dragging A re-derives the whole construction every frame. The triangle stays
       equilateral not because anything snaps, but because C IS the intersection of the
       two circles at every instant.
     · Success is detected by DEPENDENCY: solved() looks for a derived point whose two
       parents are circle(centre A, through B) and circle(centre B, through A) — checked
       by node identity, not by measuring side lengths. A hand-fitted near-equilateral
       triangle built from any other curves does not register, ever.
     · The branch index is a stored discrete attribute chosen once at promotion time and
       never re-chosen. There is NO nearest-point matching anywhere in the math path.
       (The only distance test in the file is a 1e-6 display de-dup that stops a marker
       being drawn exactly on top of an existing point — it moves nothing and decides no
       geometry.)

   The kernel obviously generalises: add a curve type + its intersection routine and
   every existing mechanism (promotion, re-derivation, undo, cascade delete) still works.

   Debug hook: window.ENV_TEST — see the bottom of build().
   ===================================================================================== */

/* ------------------------------- layout ------------------------------- */
const TABLE_R    = 0.80;             // 1.6 m workplane
const TABLE_DIST = 1.58;             // centre of the table; you stand at its near rim (0.78 m)
const CLIP_R     = TABLE_R - 0.02;   // curves/markers are drawn/offered inside this
const Y_FILL = 0.002, Y_CURVE = 0.008, Y_MARK = 0.017, Y_PT = 0.026, Y_LBL = 0.034;
const A0 = { x: -0.24, z: 0.00 }, B0 = { x: 0.24, z: 0.00 };
const MAX_NODES  = 40;               // gentle cap on curves + points
const MARKER_MAX = 32;
const COINCIDE   = 1e-6;             // display de-dup only (see header)

const CHALK = 0xe6edf5, TEAL = 0x35d6c4, ORANGE = 0xffa63c, PALE = 0x9fb6cf;

/* ------------------------------ kernel state ------------------------------ */
const P = new Map(), CVS = new Map();   // id -> node
let pts = [], crvs = [], order = [];    // order = every node, in creation order
let hist = [];                          // undo stack
let tool = null, pending = [], msg = '';
let solvedFlag = false, solvedPoint = null;

/* scratch — reused so the hot path allocates nothing */
const _o = { ok: false, x: 0, z: 0 };
const _m = { ok: false, x: 0, z: 0 };
const _v = new THREE.Vector3();

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pointId  = n => n < 26 ? LETTERS[n] : 'P' + (n + 1);
const nodeCount = () => pts.length + crvs.length;

/* --------------------------- curve evaluation --------------------------- */
function evalCurve(c){
  const p = P.get(c.defs[0]), q = P.get(c.defs[1]);
  c.ok = false;
  if (!p || !q || !p.ok || !q.ok) return;
  const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
  if (!Number.isFinite(L) || L < 1e-7) return;   // degenerate: the two points coincide
  if (c.type === 'circle'){
    c.cx = p.x; c.cz = p.z; c.r = L;
    /* AABB of the part of this curve that could ever carry an OFFERED marker: on the curve
       and inside the workplane. Non-overlapping boxes ⇒ no offerable crossing, provably. */
    c.bx0 = Math.max(c.cx - L, -CLIP_R); c.bx1 = Math.min(c.cx + L, CLIP_R);
    c.bz0 = Math.max(c.cz - L, -CLIP_R); c.bz1 = Math.min(c.cz + L, CLIP_R);
    c.hit = true;
  } else {
    c.ax = p.x; c.az = p.z; c.ux = dx / L; c.uz = dz / L; c.len = L;
    const b = c.ax * c.ux + c.az * c.uz;                       // clip the infinite line to the disc
    const disc = b * b - (c.ax * c.ax + c.az * c.az - CLIP_R * CLIP_R);
    c.hit = disc > 1e-9;
    if (!c.hit){ c.bx0 = 1; c.bx1 = -1; c.bz0 = 1; c.bz1 = -1; }
    else {
      const sq = Math.sqrt(disc), t1 = -b - sq, t2 = -b + sq;
      const x1 = c.ax + c.ux * t1, z1 = c.az + c.uz * t1;
      const x2 = c.ax + c.ux * t2, z2 = c.az + c.uz * t2;
      c.cmx = (x1 + x2) / 2; c.cmz = (z1 + z2) / 2; c.clen = t2 - t1;
      c.cang = Math.atan2(-c.uz, c.ux);
      c.bx0 = Math.min(x1, x2); c.bx1 = Math.max(x1, x2);
      c.bz0 = Math.min(z1, z2); c.bz1 = Math.max(z1, z2);
    }
  }
  c.ok = true;
}
function boxesMiss(a, b){
  return a.bx0 > b.bx1 + 1e-9 || b.bx0 > a.bx1 + 1e-9 || a.bz0 > b.bz1 + 1e-9 || b.bz0 > a.bz1 + 1e-9;
}

/* ------------------------- intersection routines -------------------------
   Each writes into `out` and sets out.ok. `branch` names the root, deterministically,
   from the curves' own defining data — never from where anything currently sits.
     line  x line   : one root  (branch 0)
     line  x circle : branch 0 = +h along the line's own direction p1->p2
     circle x circle: branch 0 = +h along the left normal of centre1 -> centre2
   Both rules are continuous in the defining points, so a root keeps its identity while
   you drag; it only ever disappears (ok=false) when the roots genuinely stop existing. */
function xLL(a, b, out){
  const den = a.ux * b.uz - a.uz * b.ux;
  if (Math.abs(den) < 1e-12){ out.ok = false; return out; }   // parallel
  const t = ((b.ax - a.ax) * b.uz - (b.az - a.az) * b.ux) / den;
  out.x = a.ax + a.ux * t; out.z = a.az + a.uz * t; out.ok = true; return out;
}
function xLC(l, c, branch, out){
  const t0 = (c.cx - l.ax) * l.ux + (c.cz - l.az) * l.uz;
  const fx = l.ax + l.ux * t0, fz = l.az + l.uz * t0;      // foot of the perpendicular
  const dx = c.cx - fx, dz = c.cz - fz;
  const h2 = c.r * c.r - (dx * dx + dz * dz);
  if (h2 < 0){ out.ok = false; return out; }
  const h = Math.sqrt(h2), s = branch ? -1 : 1;
  out.x = fx + s * h * l.ux; out.z = fz + s * h * l.uz; out.ok = true; return out;
}
function xCC(a, b, branch, out){
  const dx = b.cx - a.cx, dz = b.cz - a.cz, D = Math.hypot(dx, dz);
  if (D < 1e-9){ out.ok = false; return out; }              // concentric
  const t = (a.r * a.r - b.r * b.r + D * D) / (2 * D);
  const h2 = a.r * a.r - t * t;
  if (h2 < 0){ out.ok = false; return out; }                // apart, or one inside the other
  const h = Math.sqrt(h2), ex = dx / D, ez = dz / D, s = branch ? -1 : 1;
  out.x = a.cx + t * ex + s * h * (-ez);
  out.z = a.cz + t * ez + s * h * ( ex);
  out.ok = true; return out;
}
function intersect(c1, c2, branch, out){
  out.ok = false;
  if (!c1 || !c2 || c1 === c2 || !c1.ok || !c2.ok) return out;
  if (c1.type === 'line' && c2.type === 'line') return branch ? out : xLL(c1, c2, out);
  if (c1.type === 'line')  return xLC(c1, c2, branch, out);
  if (c2.type === 'line')  return xLC(c2, c1, branch, out);
  return xCC(c1, c2, branch, out);
}

/* ------------------------------ evaluate ------------------------------
   The whole point of the room: one top-down pass rebuilds every derived quantity.
   `scope` (optional) is the set of nodes DOWNSTREAM of whatever just changed — everything
   outside it provably still holds the value it had, so it is skipped. `order` is already a
   topological order, so one forward pass is enough either way. */
function evaluate(scope){
  const s0 = solveCount;
  for (let i = 0; i < order.length; i++){
    const n = order[i];
    if (scope && !scope.has(n)) continue;
    if (n.nk === 'c'){ evalCurve(n); continue; }
    if (n.kind === 'given'){ n.ok = true; continue; }
    const c1 = CVS.get(n.parents.curves[0]), c2 = CVS.get(n.parents.curves[1]);
    intersect(c1, c2, n.parents.branch, _o);
    n.ok = _o.ok;
    if (_o.ok){ n.x = _o.x; n.z = _o.z; }
  }
  solvedPoint = null;
  for (let i = 0; i < pts.length; i++){
    if (pts[i].kind === 'derived' && pts[i].ok && isI1(pts[i])){ solvedPoint = pts[i]; break; }
  }
  solvedFlag = !!solvedPoint;
  lastEvalSolves = solveCount - s0;
}

/* Every node that (transitively) depends on `node`, itself included. One forward pass over
   the creation order suffices, because a node can only reference earlier nodes. */
function downstreamOf(node){
  const set = new Set([node]);
  for (let i = 0; i < order.length; i++){
    const n = order[i];
    if (set.has(n)) continue;
    if (n.nk === 'c'){
      if (set.has(P.get(n.defs[0])) || set.has(P.get(n.defs[1]))) set.add(n);
    } else if (n.kind === 'derived'){
      if (set.has(CVS.get(n.parents.curves[0])) || set.has(CVS.get(n.parents.curves[1]))) set.add(n);
    }
  }
  return set;
}

/* Dependency test for Euclid I.1: the point's two parents must BE the two circles
   circle(centre A, through B) and circle(centre B, through A). Identity of nodes and
   of their defining point ids — no lengths are measured here. */
function isI1(p){
  const a = CVS.get(p.parents.curves[0]), b = CVS.get(p.parents.curves[1]);
  if (!a || !b) return false;
  const is = (c, ctr, thr) => c.type === 'circle' && c.defs[0] === ctr && c.defs[1] === thr;
  return (is(a, 'A', 'B') && is(b, 'B', 'A')) || (is(a, 'B', 'A') && is(b, 'A', 'B'));
}

/* ------------------------------ graph mutation ------------------------------ */
function addCurve(type, id1, id2){
  if (nodeCount() >= MAX_NODES){ msg = 'The table holds 40 objects. Undo or Reset to keep constructing.'; return null; }
  if (id1 === id2){ msg = 'A curve needs two different points.'; return null; }
  const c = { nk: 'c', id: 'k' + (crvs.length + 1), type, defs: [id1, id2], ok: false };
  crvs.push(c); CVS.set(c.id, c); order.push(c);
  hist.push({ t: 'curve', id: c.id });
  structuralChange();
  return c;
}
function addDerived(cA, cB, branch){
  if (nodeCount() >= MAX_NODES){ msg = 'The table holds 40 objects. Undo or Reset to keep constructing.'; return null; }
  const p = { nk: 'p', id: pointId(pts.length), kind: 'derived',
              parents: { curves: [cA, cB], branch }, x: 0, z: 0, ok: false };
  pts.push(p); P.set(p.id, p); order.push(p);
  hist.push({ t: 'point', id: p.id });
  structuralChange();
  return p;
}
/* Defensive cascade: drop a node and anything that (transitively) refers to it. LIFO undo
   never actually needs the cascade, but reset/robustness get it for free. */
function dropNodes(victims){
  let grew = true;
  while (grew){
    grew = false;
    for (const n of order){
      if (victims.has(n)) continue;
      const refs = n.nk === 'c' ? n.defs.map(id => P.get(id)) : (n.kind === 'derived' ? n.parents.curves.map(id => CVS.get(id)) : []);
      if (refs.some(r => r && victims.has(r))){ victims.add(n); grew = true; }
    }
  }
  order = order.filter(n => !victims.has(n));
  pts   = pts.filter(n => !victims.has(n));
  crvs  = crvs.filter(n => !victims.has(n));
  for (const v of victims){ (v.nk === 'c' ? CVS : P).delete(v.id); }
  structuralChange();
}

/* ------------------------------ markers ------------------------------
   Every not-yet-promoted intersection of every curve pair that lands on the table.
   Deterministic order: curve-creation order i<j, then branch 0,1. That ordering is what
   `markers()[k]` and `pick(k)` agree on. */
const mk = []; for (let i = 0; i < MARKER_MAX; i++) mk.push({ a: null, b: null, br: 0, x: 0, z: 0 });
let mkN = 0;

/* Intersection cache and promoted-slot flags, both indexed by (curve i, curve j, branch).
   A drag invalidates only the pairs that touch a curve DOWNSTREAM of the point being moved;
   every other pair keeps the root it already had, so it costs nothing to re-offer. The
   promoted flags replace what used to be an O(points) scan per candidate. */
const SLOTS = MAX_NODES * MAX_NODES * 2;
const XC_OK = new Uint8Array(SLOTS), XC_X = new Float64Array(SLOTS), XC_Z = new Float64Array(SLOTS);
const XC_HAVE = new Uint8Array(SLOTS);          // this slot holds a root computed since the last structural change
const XP_ON = new Uint8Array(SLOTS);
let solveCount = 0, lastMarkerSolves = 0, lastEvalSolves = 0, lastPairs = 0;

/* called on every STRUCTURAL change (curve/point added or dropped) — never per frame */
function structuralChange(){
  XC_HAVE.fill(0);
  XP_ON.fill(0);
  const idx = new Map();
  for (let i = 0; i < crvs.length; i++) idx.set(crvs[i].id, i);
  for (let k = 0; k < pts.length; k++){
    const p = pts[k];
    if (p.kind !== 'derived') continue;
    const i = idx.get(p.parents.curves[0]), j = idx.get(p.parents.curves[1]);
    if (i === undefined || j === undefined) continue;
    XP_ON[(i * MAX_NODES + j) * 2 + p.parents.branch] = 1;
  }
}
function coincidesWithPoint(x, z){
  for (let i = 0; i < pts.length; i++){
    const p = pts[i];
    if (p.ok && Math.abs(p.x - x) < COINCIDE && Math.abs(p.z - z) < COINCIDE) return true;
  }
  return false;
}
/* One fused pass. Three things keep it off the frame budget, none of them approximations:
     (a) DEPENDENCY: a pair neither of whose curves is downstream of what just moved keeps the
         root it already had — no solve at all. (In THIS room both givens root the whole graph,
         so a drag dirties everything; the pruning is what lets the same kernel scale when a
         construction has independent parts.)
     (b) EXTENT: two curves whose on-table bounding boxes miss can carry no offerable crossing.
     (c) BUDGET: the offer list is capped at MARKER_MAX, and the solve now lives INSIDE the
         assembly loop, so a dense table stops after ~32 markers instead of grinding through
         every one of the ~400 pairs. Marker order and indices are unchanged by the fusion. */
function computeMarkers(scope){
  const s0 = solveCount, full = !scope;
  lastPairs = 0; mkN = 0;
  for (let i = 0; i < crvs.length && mkN < MARKER_MAX; i++){
    for (let j = i + 1; j < crvs.length && mkN < MARKER_MAX; j++){
      const base = (i * MAX_NODES + j) * 2;
      const clean = !full && XC_HAVE[base] && !scope.has(crvs[i]) && !scope.has(crvs[j]);
      if (!clean){
        lastPairs++; XC_HAVE[base] = 1;
        if (!crvs[i].ok || !crvs[j].ok || boxesMiss(crvs[i], crvs[j])){ XC_OK[base] = 0; XC_OK[base + 1] = 0; }
        else for (let br = 0; br < 2; br++){
          intersect(crvs[i], crvs[j], br, _m); solveCount++;
          XC_OK[base + br] = _m.ok ? 1 : 0; XC_X[base + br] = _m.x; XC_Z[base + br] = _m.z;
        }
      }
      for (let br = 0; br < 2 && mkN < MARKER_MAX; br++){
        if (!XC_OK[base + br]) continue;
        const x = XC_X[base + br], z = XC_Z[base + br];
        /* tangency: the two roots of this same pair have collapsed onto each other — offer one.
           Coincidences BETWEEN pairs are deliberately left alone: two different curve pairs that
           happen to cross at the same spot are two different dependencies, and the room must let
           you promote either one. (This is display bookkeeping; no geometry is decided here.) */
        if (br === 1 && XC_OK[base] && Math.abs(XC_X[base] - x) < COINCIDE && Math.abs(XC_Z[base] - z) < COINCIDE) continue;
        if (Math.hypot(x, z) > CLIP_R) continue;
        if (XP_ON[base + br]) continue;
        if (coincidesWithPoint(x, z)) continue;
        const s = mk[mkN++]; s.a = crvs[i].id; s.b = crvs[j].id; s.br = br; s.x = x; s.z = z;
      }
    }
  }
  lastMarkerSolves = solveCount - s0;
  return mkN;
}

/* ================================ display ================================ */
let tableRoot, fillMesh, fillPos, triEdges = [], payoffLbl, statusLbl, taskLbl, movedOnce = false;
let ptGeo, ringGeo, barGeo, markGeo;
let chalkMat, fillMat, triMat;
const pointSlots = [], circleSlots = [], lineSlots = [], markerSlots = [];
let dragId = null, dragOX = 0, dragOZ = 0, dragScope = null;
let lastStatus = '', lastSolvedSig = null, lastMovedSig = null;

function park(o){ o.visible = false; o.position.set(0, -60, 0); }   // out of every pointer ray

function pointSlot(i){
  if (pointSlots[i]) return pointSlots[i];
  const g = shape.group();
  const m = mat('teal', { emissive: 0x0d7d78, emissiveIntensity: 0.85 });
  const ball = new THREE.Mesh(ptGeo, m);
  g.add(ball);
  g.add(shape.hitball(0.052));
  tableRoot.add(g);
  const lbl = label('?', { parent: tableRoot, at: [0, Y_LBL, 0], capHeight: 0.105, bg: false });
  lbl.rotation.x = -Math.PI / 2;                 // lie flat on the table, reading away from the user
  const s = { g, ball, m, lbl, txt: '?', active: false, id: null, kind: null };
  interactive(g, {
    grab: 'hold',                                 // 'hold' => the engine NEVER moves it; we do, from the graph
    select:  (o, info) => onPointSelect(s, info),
    drag:    (o, info) => onPointDrag(s, info),
    release: () => { dragId = null; dragScope = null; },
  });
  pointSlots[i] = s;
  return s;
}
function markerSlot(i){
  if (markerSlots[i]) return markerSlots[i];
  const g = shape.group();
  const m = mat('white', { emissive: 0x6f8aa8, emissiveIntensity: 0.7, transparent: true, opacity: 0.95 });
  m.color.setHex(PALE);
  g.add(new THREE.Mesh(markGeo, m));
  const h = shape.hitball(0.044); h.position.y = 0.012; g.add(h);
  tableRoot.add(g);
  const s = { g, m, active: false, idx: i };
  interactive(g, { select: () => { if (s.active) promote(s.idx); } });
  markerSlots[i] = s;
  return s;
}
function circleSlot(i){
  if (circleSlots[i]) return circleSlots[i];
  const mesh = new THREE.Mesh(ringGeo, chalkMat);
  mesh.rotation.x = -Math.PI / 2;
  tableRoot.add(mesh); park(mesh);
  circleSlots[i] = mesh; return mesh;
}
function lineSlot(i){
  if (lineSlots[i]) return lineSlots[i];
  const mesh = new THREE.Mesh(barGeo, chalkMat);
  tableRoot.add(mesh); park(mesh);
  lineSlots[i] = mesh; return mesh;
}

/* clip an infinite line to the table disc; returns false if it misses entirely */
const _clip = { mx: 0, mz: 0, len: 0, ang: 0 };
function clipLine(c){                            // the chord was already solved in evalCurve
  if (!c.hit) return false;
  _clip.mx = c.cmx; _clip.mz = c.cmz; _clip.len = c.clen; _clip.ang = c.cang;
  return true;
}

function labelOffset(x, z, out){
  const r = Math.hypot(x, z);
  if (r < 1e-4){ out[0] = x + 0.092; out[1] = z; return; }
  out[0] = x + 0.092 * x / r; out[1] = z + 0.092 * z / r;
}
const _lo = [0, 0];
const _tri = [[null, null], [null, null], [null, null]];   // reused: no per-frame array literals

function refresh(scope){
  /* ---- points ---- */
  for (let i = 0; i < pointSlots.length; i++){
    const s = pointSlots[i];
    if (i < pts.length) continue;
    if (s.active){ s.active = false; s.id = null; park(s.g); s.lbl.visible = false; }
  }
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], s = pointSlot(i);
    s.active = true; s.id = p.id;
    const shown = p.ok && Math.hypot(p.x, p.z) <= TABLE_R + 0.6;
    s.g.visible = shown; s.lbl.visible = shown;
    if (!shown){ s.g.position.set(0, -60, 0); continue; }
    s.g.position.set(p.x, Y_PT, p.z);
    if (s.kind !== p.kind){
      s.kind = p.kind;
      s.m.color.setHex(p.kind === 'given' ? TEAL : ORANGE);
      s.m.emissive.setHex(p.kind === 'given' ? 0x0d7d78 : 0xa8500a);
      s.ball.scale.setScalar(p.kind === 'given' ? 1.18 : 1.0);
    }
    const picked = pending.indexOf(p.id) >= 0;
    s.m.emissiveIntensity = picked ? 2.0 : 0.85;
    if (s.txt !== p.id){ s.lbl.setText(p.id); s.txt = p.id; }
    labelOffset(p.x, p.z, _lo);
    s.lbl.position.set(_lo[0], Y_LBL, _lo[1]);
  }

  /* ---- curves ---- */
  let ci = 0, li = 0;
  for (let i = 0; i < crvs.length; i++){
    const c = crvs[i];
    if (c.type === 'circle'){
      const mesh = circleSlot(ci++);
      if (!c.ok || c.r > 2.4){ park(mesh); continue; }
      mesh.visible = true;
      mesh.position.set(c.cx, Y_CURVE, c.cz);
      mesh.scale.set(c.r, c.r, 1);            // ring radius scales; the tube stays a chalk line
    } else {
      const mesh = lineSlot(li++);
      if (!c.ok || !clipLine(c)){ park(mesh); continue; }
      mesh.visible = true;
      mesh.position.set(_clip.mx, Y_CURVE, _clip.mz);
      mesh.rotation.y = _clip.ang;
      mesh.scale.set(_clip.len, 1, 1);
    }
  }
  for (; ci < circleSlots.length; ci++) park(circleSlots[ci]);
  for (; li < lineSlots.length;   li++) park(lineSlots[li]);

  /* ---- promotable intersection markers ---- */
  computeMarkers(scope);
  for (let i = 0; i < mkN; i++){
    const s = markerSlot(i);
    s.active = true; s.g.visible = true;
    s.g.position.set(mk[i].x, Y_MARK, mk[i].z);
  }
  for (let i = mkN; i < markerSlots.length; i++){
    const s = markerSlots[i];
    if (s.active || s.g.visible){ s.active = false; park(s.g); }
  }

  /* ---- the payoff: triangle ABC, filled and outlined ---- */
  const A = P.get('A'), B = P.get('B');
  if (solvedPoint && A && B){
    const C = solvedPoint;
    fillPos[0] = A.x; fillPos[1] = Y_FILL; fillPos[2] = A.z;
    fillPos[3] = B.x; fillPos[4] = Y_FILL; fillPos[5] = B.z;
    fillPos[6] = C.x; fillPos[7] = Y_FILL; fillPos[8] = C.z;
    fillMesh.geometry.attributes.position.needsUpdate = true;
    fillMesh.geometry.computeVertexNormals();
    fillMesh.visible = true;
    _tri[0][0] = A; _tri[0][1] = B; _tri[1][0] = B; _tri[1][1] = C; _tri[2][0] = C; _tri[2][1] = A;
    for (let e = 0; e < 3; e++){
      const p = _tri[e][0], q = _tri[e][1];
      const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
      const m = triEdges[e];
      m.visible = L > 1e-6;
      if (!m.visible) continue;
      m.position.set((p.x + q.x) / 2, Y_CURVE + 0.004, (p.z + q.z) / 2);
      m.rotation.y = Math.atan2(-dz, dx);
      m.scale.set(L, 1.25, 1.25);
    }
    payoffLbl.visible = true;
  } else {
    fillMesh.visible = false;
    for (let e = 0; e < 3; e++) triEdges[e].visible = false;
    payoffLbl.visible = false;
  }

  /* ---- status ---- */
  /* statusText() builds a string, so it must not run every drag frame. Outside a drag every
     call site is a discrete action and rebuilds; inside one, the wording can only change when
     solved/moved flips (e.g. dragging A onto B collapses the construction), so watch just those. */
  if (dragId === null || solvedFlag !== lastSolvedSig || movedOnce !== lastMovedSig){
    lastSolvedSig = solvedFlag; lastMovedSig = movedOnce;
    const txt = statusText();
    if (txt !== lastStatus){ statusLbl.setText(txt); lastStatus = txt; }
  }
}

function statusText(){
  if (msg) return msg;
  if (solvedFlag && !movedOnce) return 'Triangle ABC is filled. Now pick MOVE and drag A.';
  if (solvedFlag) return 'Still equilateral, at every instant.';
  let t;
  if (!tool) t = 'Pick a tool: LINE, CIRCLE or MOVE.';
  else if (tool === 'MOVE') t = 'Move: grab A or B and drag it across the table.';
  else if (tool === 'CIRCLE') t = pending.length === 0
    ? 'Circle: pick the centre.'
    : `Circle: centred on ${pending[0]} — now pick a point for it to pass through.`;
  else t = pending.length === 0 ? 'Line: pick the first point.' : `Line: from ${pending[0]} — now pick the second point.`;
  /* the one idea a first-timer misses: a crossing is not a point until you claim it */
  if (mkN > 0 && !pts.some(p => p.kind === 'derived')) t += '\nThe curves cross. Point at a small crossing marker to make it a point.';
  return t;
}

/* ================================ actions ================================ */
function selectTool(name){
  const n = String(name || '').toUpperCase();
  if (n !== 'LINE' && n !== 'CIRCLE' && n !== 'MOVE') return false;
  tool = n; pending.length = 0; msg = ''; dragId = null; dragScope = null;
  for (const b of toolBtns) paintBtn(b, b.name === n);
  tone(n === 'MOVE' ? 420 : 560, 0.05, 'sine');
  refresh();
  return true;
}

function pickPoint(id){
  const p = P.get(id);
  if (!p) return false;
  msg = '';
  if (!tool){ msg = 'Pick a tool first: LINE, CIRCLE or MOVE.'; refresh(); return false; }
  if (tool === 'MOVE'){
    if (p.kind !== 'given'){ msg = `${id} is derived — it is computed, not placed. Drag A or B instead.`; refresh(); return false; }
    msg = `Grab ${id} and drag it across the table.`;
    refresh(); return true;
  }
  if (pending.length === 1 && pending[0] === id){ msg = 'Pick a different second point.'; refresh(); return false; }
  pending.push(id);
  if (pending.length === 2){
    const c = addCurve(tool === 'CIRCLE' ? 'circle' : 'line', pending[0], pending[1]);
    pending.length = 0;
    if (c){ evaluate(); tone(tool === 'CIRCLE' ? 700 : 520, 0.07, 'sine'); }
  } else {
    tone(880, 0.04, 'sine');
  }
  refresh();
  checkSolvedChime();
  return true;
}

function promote(index){
  if (!Number.isInteger(index)) return false;
  computeMarkers(null);
  if (!(index >= 0 && index < mkN)) return false;
  const s = mk[index];
  msg = '';
  const p = addDerived(s.a, s.b, s.br);
  if (!p){ refresh(); return false; }
  evaluate();
  tone(980, 0.07, 'triangle');
  /* a marker click is also a point click: if a tool is mid-construction it completes it */
  if (tool && tool !== 'MOVE' && pending.length === 1){
    const c = addCurve(tool === 'CIRCLE' ? 'circle' : 'line', pending[0], p.id);
    pending.length = 0;
    if (c) evaluate();
  }
  refresh();
  checkSolvedChime();
  return p.id;
}

let chimed = false;
function checkSolvedChime(){
  if (solvedFlag && !chimed){
    chimed = true;
    tone(523.25, 0.16, 'sine');
    setTimeout(() => tone(783.99, 0.16, 'sine'), 150);
    setTimeout(() => tone(1046.5, 0.30, 'sine'), 310);
  }
  if (!solvedFlag) chimed = false;
}

/* The ONLY writer of a given point's coordinates. Non-finite input is rejected here rather
   than allowed to propagate: one NaN in a given point would poison every derived node in the
   graph, silently and permanently, since NaN survives every arithmetic path below it. */
function setGiven(id, x, z, scope){
  const p = P.get(id);
  if (!p || p.kind !== 'given') return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  p.x = x; p.z = z;
  const sc = scope || downstreamOf(p);
  evaluate(sc); refresh(sc);
  return true;
}
function movePoint(id, x, z){
  const p = P.get(id);
  if (!p || p.kind !== 'given') return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;   // reject BEFORE touching history
  hist.push({ t: 'move', id, ox: p.x, oz: p.z });
  if (hist.length > 400) hist.splice(0, hist.length - 400);
  movedOnce = true; msg = '';
  return setGiven(id, x, z);
}

function undo(){
  pending.length = 0; msg = ''; dragId = null; dragScope = null;
  const h = hist.pop();
  if (!h){ msg = 'Nothing to undo.'; refresh(); return false; }
  if (h.t === 'move'){
    const p = P.get(h.id); if (p){ p.x = h.ox; p.z = h.oz; }
  } else {
    const node = h.t === 'curve' ? CVS.get(h.id) : P.get(h.id);
    if (node) dropNodes(new Set([node]));
  }
  evaluate(); refresh(); checkSolvedChime();
  tone(300, 0.09, 'sine');
  return true;
}

function reset(){
  const A = P.get('A'), B = P.get('B');
  const victims = new Set(order.filter(n => !(n.nk === 'p' && n.kind === 'given')));
  dropNodes(victims);
  if (A){ A.x = A0.x; A.z = A0.z; }
  if (B){ B.x = B0.x; B.z = B0.z; }
  hist = []; pending.length = 0; tool = null; msg = ''; dragId = null; dragScope = null;
  movedOnce = false; chimed = false;
  for (const b of toolBtns) paintBtn(b, false);
  evaluate(); refresh();
  tone(240, 0.14, 'sine');
  return true;
}

/* -------------------------- pointer handlers -------------------------- */
function onPointSelect(s, info){
  if (!s.active || !s.id) return;
  const p = P.get(s.id);
  if (tool === 'MOVE' && p && p.kind === 'given'){
    dragId = s.id;
    dragScope = downstreamOf(p);      // the graph is static while dragging: solve the scope once

    hist.push({ t: 'move', id: s.id, ox: p.x, oz: p.z });
    if (hist.length > 400) hist.splice(0, hist.length - 400);
    dragOX = 0; dragOZ = 0;
    if (info && info.point){
      tableRoot.worldToLocal(_v.copy(info.point));
      dragOX = p.x - _v.x; dragOZ = p.z - _v.z;   // keep the grab from teleporting the point
    }
    msg = ''; movedOnce = true;
    refresh();
    return;
  }
  dragId = null;
  pickPoint(s.id);
}
function onPointDrag(s, info){
  if (!dragId || dragId !== s.id) return;
  const pt = info && info.point;
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return;
  tableRoot.worldToLocal(_v.copy(pt));
  let x = _v.x + dragOX, z = _v.z + dragOZ;
  const r = Math.hypot(x, z);
  if (r > CLIP_R){ const k = CLIP_R / r; x *= k; z *= k; }   // the drag stays on the workplane
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  setGiven(dragId, x, z, dragScope);
}

/* ------------------------------ buttons ------------------------------ */
const toolBtns = [];
function paintBtn(b, on){
  b.mat.color.setHex(on ? 0x14464a : 0x151d27);
  b.mat.emissive.setHex(on ? 0x0f6d68 : 0x060a0f);
  b.mat.emissiveIntensity = on ? 1.1 : 0.35;
}
function makeBtn(text, dir, height, onSel){
  const panel = shape.panel(0.30, 0.115, 'dark');
  const m = mat('dark', { emissive: 0x060a0f, emissiveIntensity: 0.35 });
  panel.material = m;
  place(panel, { dist: 1.50, dir, height, face: true });
  const lbl = label(text, { parent: panel, at: [0, 0, 0.014], capHeight: 0.05, bg: false });
  interactive(panel, { select: onSel });
  return { name: text, panel, mat: m, lbl };
}

/* ================================= build ================================= */
function build(){
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 'dark', grid: true, arrow: false, radius: 3 });
  input.teleport = 'none';

  /* shared geometry + materials — created once, mutated never */
  ptGeo   = new THREE.SphereGeometry(0.026, 18, 12);
  markGeo = new THREE.OctahedronGeometry(0.019, 0);
  ringGeo = new THREE.TorusGeometry(1, 0.0045, 8, 144);
  barGeo  = new THREE.BoxGeometry(1, 0.009, 0.007);
  chalkMat = mat('white', { emissive: 0x8fa4bb, emissiveIntensity: 0.55 });
  chalkMat.color.setHex(CHALK);

  /* --- the workplane. Placed as a tiny invisible anchor first so that table-local
         (0,0,0) is exactly the placed point and every child can use plain table
         coordinates with y = 0 meaning "on the surface". --- */
  tableRoot = shape.ball(0.001, 'white');
  tableRoot.material = mat('white', { transparent: true, opacity: 0 });
  place(tableRoot, { dist: TABLE_DIST, dir: 'ahead', height: 'waist' });

  const top = shape.cylinder(TABLE_R, 0.03, 'dark');
  top.material = mat('dark', { emissive: 0x070d15, emissiveIntensity: 0.25 });
  top.material.color.setHex(0x111a26);
  top.position.y = -0.016;
  tableRoot.add(top);

  const rim = shape.torus(TABLE_R, 0.014, 'grey');   // steel, not teal — teal is reserved for the given points
  rim.material = mat('grey', { emissive: 0x1d3550, emissiveIntensity: 0.8 });
  rim.material.color.setHex(0x35506b);
  rim.rotation.x = -Math.PI / 2; rim.position.y = -0.002;
  tableRoot.add(rim);

  /* faint drafting rings — blueprint mood, no meaning attached */
  for (const r of [0.2, 0.4, 0.6]){
    const g = shape.torus(r, 0.0022, 'grey');
    g.material = mat('grey', { transparent: true, opacity: 0.28, emissive: 0x2b3a4c, emissiveIntensity: 0.5 });
    g.rotation.x = -Math.PI / 2; g.position.y = 0.0005;
    tableRoot.add(g);
  }

  const stem = shape.cylinder(0.10, 0.99, 'dark');
  stem.material = mat('dark', { emissive: 0x0a1018, emissiveIntensity: 0.3 });
  stem.position.y = -0.03 - 0.495;
  tableRoot.add(stem);
  const foot = shape.cylinder(0.34, 0.04, 'dark');
  foot.material = stem.material;
  foot.position.y = -1.0;
  tableRoot.add(foot);

  /* --- triangle fill + outline (hidden until the dependency test passes) --- */
  fillPos = new Float32Array(9);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
  fillMat = mat('teal', { transparent: true, opacity: 0.45, emissive: 0x1fbfae, emissiveIntensity: 0.9 });
  fillMat.side = THREE.DoubleSide;
  fillMesh = new THREE.Mesh(fg, fillMat);
  fillMesh.frustumCulled = false;
  fillMesh.visible = false;
  tableRoot.add(fillMesh);

  triMat = mat('teal', { emissive: 0x27d9c4, emissiveIntensity: 1.5 });
  triMat.color.setHex(TEAL);
  for (let e = 0; e < 3; e++){
    const m = new THREE.Mesh(barGeo, triMat);
    m.visible = false; tableRoot.add(m); triEdges.push(m);
  }

  /* --- palette: tools on the left, history on the right, both in the front arc --- */
  toolBtns.push(makeBtn('LINE',   -32, 1.47, () => selectTool('LINE')));
  toolBtns.push(makeBtn('CIRCLE', -32, 1.33, () => selectTool('CIRCLE')));
  toolBtns.push(makeBtn('MOVE',   -32, 1.19, () => selectTool('MOVE')));
  for (const b of toolBtns) paintBtn(b, false);
  const bUndo  = makeBtn('UNDO',   32, 1.40, () => undo());
  const bReset = makeBtn('RESET',  32, 1.26, () => reset());
  paintBtn(bUndo, false); paintBtn(bReset, false);
  onButton((n, pressed) => { if (pressed && (n === 'B' || n === 'Y')) undo(); });

  /* --- text: the task above, the running status at eye level ahead --- */
  taskLbl = label('EUCLID I.1\nBuild an equilateral triangle on AB.', {
    dist: 2.5, dir: 'ahead', height: 1.80, size: 'comfortable', width: 1.5,
    theme: 'dark', title: true, accent: '#35d6c4',
  });
  statusLbl = label('Pick a tool: LINE, CIRCLE or MOVE.', {
    dist: 2.5, dir: 'ahead', height: 'eye', size: 'large', width: 1.9,
    theme: 'dark', anchor: 'top',
  });

  /* the payoff line: hidden until the dependency test fires, then it appears right
     above the triangle that just lit up — where the visitor is already looking */
  payoffLbl = label('Not measured. Constructed.\nMove A — it cannot break.', {
    dist: 2.05, dir: 'ahead', height: 1.30, size: 'large', width: 1.3,
    theme: 'dark', accent: '#ffa63c',
  });
  payoffLbl.visible = false;

  /* --- the two given points --- */
  for (const [id, p0] of [['A', A0], ['B', B0]]){
    const p = { nk: 'p', id, kind: 'given', parents: null, x: p0.x, z: p0.z, ok: true };
    pts.push(p); P.set(id, p); order.push(p);
  }
  structuralChange();
  evaluate();
  refresh();

  /* ------------------------- Verification Contract ------------------------- */
  window.ENV_TEST = {
    points: () => pts.map(p => ({
      id: p.id, x: p.x, z: p.z, kind: p.kind, ok: p.ok,
      parents: p.kind === 'derived' ? { curves: p.parents.curves.slice(), branch: p.parents.branch } : null,
    })),
    curves: () => crvs.map(c => ({
      id: c.id, type: c.type, defs: c.defs.slice(), ok: c.ok,
      cx: c.cx, cz: c.cz, r: c.r, ax: c.ax, az: c.az, ux: c.ux, uz: c.uz,
    })),
    markers: () => { computeMarkers(null); return mk.slice(0, mkN).map((s, i) => ({ index: i, x: s.x, z: s.z, curves: [s.a, s.b], branch: s.br })); },
    selectTool,
    pick: (what) => (typeof what === 'number'
      ? (Number.isInteger(what) ? promote(what) : false)          // NaN / 1.5 / Infinity are not indices
      : (typeof what === 'string' ? pickPoint(what) : false)),
    movePoint,
    solved: () => solvedFlag,
    undo,
    reset,
    /* extras (not required by the contract, but they let the panel see the DISPLAY unwind) */
    tool: () => tool,
    pending: () => pending.slice(),
    status: () => statusText(),
    display: () => ({
      points:  pointSlots.filter(s => s.g.visible).map(s => s.id),
      circles: circleSlots.filter(m => m.visible).length,
      lines:   lineSlots.filter(m => m.visible).length,
      markers: markerSlots.filter(s => s.g.visible).length,
      fill:    fillMesh.visible,
      payoff:  payoffLbl.visible,
      labels:  pointSlots.filter(s => s.lbl.visible).map(s => s.txt),
    }),
    solvedPointId: () => (solvedPoint ? solvedPoint.id : null),
    /* cost of the most recent re-derivation, for the frame-budget check */
    stats: () => ({ markerSolves: lastMarkerSolves, derivedSolves: lastEvalSolves,
                    pairsVisited: lastPairs, totalPairs: crvs.length * (crvs.length - 1) / 2,
                    curves: crvs.length, points: pts.length }),
    /* where the DISPLAY currently draws a point — proves the meshes re-derive with the graph */
    meshOf: (id) => { const s = pointSlots.find(k => k.active && k.id === id && k.g.visible);
                      return s ? { x: s.g.position.x, z: s.g.position.z, label: s.txt } : null; },
  };
}

/* frame() does nothing per-frame but breathe the solved fill — every re-derivation is
   event-driven (a pick, a drag callback, a movePoint), never polled. */
function frame(dt, t){
  if (fillMesh && fillMesh.visible){
    fillMat.emissiveIntensity = 0.75 + 0.35 * Math.sin(t * 2.2);
  }
}

XR.run({ build, frame });
