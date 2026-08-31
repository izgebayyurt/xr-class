const { THREE, shape, place, label, interactive, tone, H, ground, sky, input, mat, remove, spread } = XR;

// x1 · Compass & Straightedge · Tier X
//
// A dependency-graph geometry kernel, not a distance-snapping toy. Every point stores its parents
// (nothing, or the two curves + intersection branch that made it); every curve stores the point ids
// that define it. All coordinates are recomputed top-down, in creation order, from that graph alone —
// so MOVE just edits a given point's (x,z) and calls recomputeAll(); nothing else changes by hand.
// solved() is a structural check on the graph (which curve ids feed which point), never a distance
// comparison, so a decoy triangle built some other way can never trip it.
//
// Table-local coordinate frame: tableRig's own origin sits on the floor under the table's center
// (place()d with height:'floor', anchor:'bottom'); every point/curve/marker is a direct child of
// tableRig, positioned at local (x, TABLE_Y[+lift], z) — so table-local (x,z) IS the construction
// plane, no extra transform needed anywhere in the math.

// ---------- constants ----------
const TABLE_DISC_R = 0.72;      // visible tabletop radius (~1.44 m across; brief asks ~1.6 m round)
const TABLE_USABLE_R = 0.58;    // MOVE-tool clamp, keeps circles from running off the edge
const TABLE_THICK = 0.05;
const TABLE_Y = H.waist;        // local height of the tabletop surface
const LIFT_TRI = 0.002, LIFT_LINE = 0.006, LIFT_CIRCLE = 0.009, LIFT_MARKER = 0.014, LIFT_POINT = 0.02;
const CAP = 40;                 // curve+point count cap (brief: "~40 with a gentle message")
const ORIGIN_A = { x: -0.16, z: 0 }, ORIGIN_B = { x: 0.16, z: 0 };
const MARKER_POOL = 24;

// ---------- state (the whole construction graph) ----------
let points = [];                // [{id,x,z,kind:'given'|'derived',parents:null|{curveA,curveB,branch}, group,ball,hit,lbl}]
let curves = [];                // [{id,type:'line'|'circle',defs:[id1,id2], mesh}]
let entities = [];              // creation-ordered list of {kind:'point'|'curve', ref} — a valid topo order for free
let actions = [];                // undo stack: {type:'point'|'curve', id}
let markersArr = [];            // current unpromoted intersections
const pointsById = new Map(), curvesById = new Map();
let letterIdx = 0, curveCounter = 0;
let currentTool = null;         // 'LINE' | 'CIRCLE' | 'MOVE' | null
let pendingPicks = [];
let movingId = null;
let solvedFlag = false, solvedPointId = null;
let capShowing = false, capMsgUntil = -1, nowT = 0;
let lastStatusText = '';

// ---------- scene refs, set in build() ----------
let tableRig, markerPool = [], toolBtns = [], statusLbl, payoffLbl, triMesh, triMat;

// ================= geometry kernel =================
function getPoint(id) { return pointsById.get(id); }
function circleParams(curve) {
  const c = getPoint(curve.defs[0]), p = getPoint(curve.defs[1]);
  return { cx: c.x, cz: c.z, r: Math.hypot(p.x - c.x, p.z - c.z) };
}
function lineParams(curve) {
  const p1 = getPoint(curve.defs[0]), p2 = getPoint(curve.defs[1]);
  return { x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z };
}

function intersectLL(a, b) {
  const A = lineParams(a), B = lineParams(b);
  const dax = A.x2 - A.x1, daz = A.z2 - A.z1, dbx = B.x2 - B.x1, dbz = B.z2 - B.z1;
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 1e-12) return [];
  const t = ((B.x1 - A.x1) * dbz - (B.z1 - A.z1) * dbx) / denom;
  return [{ x: A.x1 + t * dax, z: A.z1 + t * daz, branch: 0 }];
}
function intersectLC(line, circle) {
  const L = lineParams(line), Ci = circleParams(circle);
  const dx = L.x2 - L.x1, dz = L.z2 - L.z1;
  const fx = L.x1 - Ci.cx, fz = L.z1 - Ci.cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return [];
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - Ci.r * Ci.r;
  const disc = Math.max(b * b - 4 * a * c, 0);
  if (b * b - 4 * a * c < 0) return [];
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  const p1 = { x: L.x1 + t1 * dx, z: L.z1 + t1 * dz, branch: 0 };
  if (sq < 1e-9) return [p1];
  return [p1, { x: L.x1 + t2 * dx, z: L.z1 + t2 * dz, branch: 1 }];
}
function intersectCC(c1, c2) {
  const A = circleParams(c1), B = circleParams(c2);
  const dx = B.cx - A.cx, dz = B.cz - A.cz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) return [];
  if (d > A.r + B.r + 1e-9) return [];
  if (d < Math.abs(A.r - B.r) - 1e-9) return [];
  const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(A.r * A.r - a * a, 0));
  const mx = A.cx + a * dx / d, mz = A.cz + a * dz / d;
  const px = -dz / d, pz = dx / d;
  const p1 = { x: mx + h * px, z: mz + h * pz, branch: 0 };
  if (h < 1e-9) return [p1];
  return [p1, { x: mx - h * px, z: mz - h * pz, branch: 1 }];
}
function intersect(a, b) {
  if (a.type === 'line' && b.type === 'line') return intersectLL(a, b);
  if (a.type === 'circle' && b.type === 'circle') return intersectCC(a, b);
  if (a.type === 'line') return intersectLC(a, b);
  return intersectLC(b, a);
}
function clipLineToTable(x1, z1, x2, z2, R) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  if (len < 1e-9) return [[x1, z1], [x1, z1]];
  const ux = dx / len, uz = dz / len;
  const b = 2 * (x1 * ux + z1 * uz), c = x1 * x1 + z1 * z1 - R * R;
  const disc = Math.max(b * b - 4 * c, 0), sq = Math.sqrt(disc);
  const s1 = (-b - sq) / 2, s2 = (-b + sq) / 2;
  return [[x1 + s1 * ux, z1 + s1 * uz], [x1 + s2 * ux, z1 + s2 * uz]];
}

// recompute every point/curve, in creation order, from the graph alone — a valid topo order for free
// since nothing can reference an entity that doesn't exist yet.
function recomputeAll() {
  for (const e of entities) {
    if (e.kind === 'point') {
      const p = e.ref;
      if (p.kind === 'derived') {
        const ca = curvesById.get(p.parents.curveA), cb = curvesById.get(p.parents.curveB);
        if (ca && cb) {
          const pts = intersect(ca, cb);
          const chosen = pts[p.parents.branch] ?? pts[0];
          if (chosen) { p.x = chosen.x; p.z = chosen.z; }
        }
      }
      updatePointMesh(p);
    } else {
      updateCurveMesh(e.ref);
    }
  }
  if (solvedFlag) updateTriangle();
}
function recomputeMarkers() {
  const arr = [];
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const A = curves[i], B = curves[j];
      for (const ip of intersect(A, B)) {
        const exists = points.some(p => p.kind === 'derived' && p.parents.curveA === A.id && p.parents.curveB === B.id && p.parents.branch === ip.branch);
        if (!exists) arr.push({ x: ip.x, z: ip.z, curveA: A.id, curveB: B.id, branch: ip.branch });
      }
    }
  }
  arr.forEach((m, idx) => m.index = idx);
  markersArr = arr;
  renderMarkers();
}

// ================= mesh builders / updaters =================
function updatePointMesh(p) { p.group.position.set(p.x, TABLE_Y, p.z); }
function buildPointMesh(p) {
  const group = shape.group();
  const color = p.kind === 'given' ? 'teal' : 'orange';
  const ball = shape.ball(0.022, color);
  ball.material = mat(color, { emissive: 0x000000, emissiveIntensity: 0 });
  ball.position.y = LIFT_POINT;
  group.add(ball);
  const hit = shape.hitball(0.07);
  hit.position.y = LIFT_POINT;
  group.add(hit);
  // table-surface label: parented (rotates with its never-rotating parent, i.e. stays put) and turned
  // flat so it reads lying on the table, not standing up like a sign.
  const lbl = label(p.id, { parent: group, at: [0.055, LIFT_POINT + 0.03, -0.01], capHeight: 0.042, bg: false });
  lbl.rotation.x = -Math.PI / 2;
  tableRig.add(group);
  p.group = group; p.ball = ball; p.hit = hit; p.lbl = lbl;
  updatePointMesh(p);
  if (p.kind === 'given') {
    // grab:'hold' on the larger invisible hit-proxy: the engine never repositions it, WE drive the
    // small visible ball via drag() -> movePointInternal(), so an invisible proxy is safe here (unlike
    // grab:true, which must live on the thing the user sees).
    interactive(hit, {
      grab: 'hold',
      select: () => onPointActivate(p.id),
      drag: (obj, info) => onPointDrag(p.id, info.point),
      release: () => { if (movingId === p.id) movingId = null; },
    });
  } else {
    interactive(hit, { select: () => onPointActivate(p.id) });
  }
}
function addGivenPoint(id, x, z) {
  const p = { id, x, z, kind: 'given', parents: null };
  points.push(p); pointsById.set(id, p);
  entities.push({ kind: 'point', ref: p });
  buildPointMesh(p);
  return p;
}

function buildCurveMesh(curve) {
  let mesh;
  if (curve.type === 'line') {
    mesh = shape.line([[0, 0, 0], [0, 0, 0]], 'white');
  } else {
    mesh = shape.torus(1, 0.0055, 'white'); // unit ring, scaled to radius r every recompute (no geometry rebuild)
    mesh.rotation.x = Math.PI / 2;          // lie flat on the table
  }
  tableRig.add(mesh);
  curve.mesh = mesh;
  updateCurveMesh(curve);
}
function updateCurveMesh(curve) {
  if (curve.type === 'line') {
    const p1 = getPoint(curve.defs[0]), p2 = getPoint(curve.defs[1]);
    const [e1, e2] = clipLineToTable(p1.x, p1.z, p2.x, p2.z, TABLE_DISC_R - 0.02);
    const pos = curve.mesh.geometry.attributes.position;
    pos.setXYZ(0, e1[0], TABLE_Y + LIFT_LINE, e1[1]);
    pos.setXYZ(1, e2[0], TABLE_Y + LIFT_LINE, e2[1]);
    pos.needsUpdate = true;
  } else {
    const { cx, cz, r } = circleParams(curve);
    curve.mesh.position.set(cx, TABLE_Y + LIFT_CIRCLE, cz);
    curve.mesh.scale.set(r, r, r);
  }
}

function buildMarkerPool() {
  for (let i = 0; i < MARKER_POOL; i++) {
    const group = shape.group();
    const dot = shape.ball(0.017, 'yellow');
    dot.material = mat('yellow', { transparent: true, opacity: 0.85 });
    dot.position.y = LIFT_MARKER;
    group.add(dot);
    const hit = shape.hitball(0.075);
    hit.position.y = LIFT_MARKER;
    group.add(hit);
    // parked at the table center, scaled to a speck, until it holds a real marker — never moved far
    // away (that would blow up the tableRig bounding box), and onMarkerSelect() itself is a no-op for
    // any slot without a live markersArr[i] entry, so an inactive slot is harmless even if "hit".
    group.position.set(0, TABLE_Y, 0);
    group.scale.setScalar(0.001);
    group.visible = false;
    tableRig.add(group);
    interactive(hit, { select: () => onMarkerSelect(i) });
    markerPool.push(group);
  }
}
function renderMarkers() {
  for (let i = 0; i < markerPool.length; i++) {
    const g = markerPool[i], m = markersArr[i];
    if (m) { g.position.set(m.x, TABLE_Y, m.z); g.scale.setScalar(1); g.visible = true; }
    else { g.position.set(0, TABLE_Y, 0); g.scale.setScalar(0.001); g.visible = false; }
  }
}

// ================= core ops =================
function nextLetter() {
  const BASE = 'CDEFGHIJKLMNOPQRSTUVWXYZ';
  const n = letterIdx++;
  return n < BASE.length ? BASE[n] : BASE[n % BASE.length] + Math.floor(n / BASE.length + 1);
}
function setPickHighlight(id, on) {
  const p = pointsById.get(id);
  if (!p) return;
  p.ball.material.emissive.setHex(0xffffff);
  p.ball.material.emissiveIntensity = on ? 1 : 0;
}
function showCapMessage() { capShowing = true; capMsgUntil = nowT + 3; updateStatus(); }

function addCurve(type, id1, id2) {
  if (entities.length >= CAP) { showCapMessage(); return null; }
  const cid = 'k' + (curveCounter++);
  const curve = { id: cid, type, defs: [id1, id2] };
  curves.push(curve); curvesById.set(cid, curve);
  entities.push({ kind: 'curve', ref: curve });
  actions.push({ type: 'curve', id: cid });
  buildCurveMesh(curve);
  recomputeMarkers();
  tone(type === 'line' ? 480 : 560, 0.09, 'sine');
  updateStatus();
  return curve;
}
function promoteMarker(i) {
  const m = markersArr[i];
  if (!m) return null;
  if (entities.length >= CAP) { showCapMessage(); return null; }
  const id = nextLetter();
  const p = { id, x: m.x, z: m.z, kind: 'derived', parents: { curveA: m.curveA, curveB: m.curveB, branch: m.branch } };
  points.push(p); pointsById.set(id, p);
  entities.push({ kind: 'point', ref: p });
  actions.push({ type: 'point', id });
  buildPointMesh(p);
  recomputeMarkers();
  checkSolved();
  tone(700, 0.12, 'triangle');
  updateStatus();
  return p;
}
function pickPoint(id) {
  if (!currentTool || currentTool === 'MOVE') return;
  if (!pointsById.has(id) || pendingPicks.includes(id)) return;
  pendingPicks.push(id);
  setPickHighlight(id, true);
  tone(370, 0.05, 'sine');
  if (pendingPicks.length === 2) {
    addCurve(currentTool === 'LINE' ? 'line' : 'circle', pendingPicks[0], pendingPicks[1]);
    pendingPicks.forEach(pid => setPickHighlight(pid, false));
    pendingPicks = [];
  }
  updateStatus();
}
function onPointActivate(id) {
  const p = pointsById.get(id);
  if (currentTool === 'MOVE') { if (p.kind === 'given') movingId = id; return; }
  pickPoint(id);
}
function onPointDrag(id, worldPoint) {
  if (currentTool !== 'MOVE' || movingId !== id) return;
  const local = tableRig.worldToLocal(worldPoint.clone());
  movePointInternal(id, local.x, local.z);
}
function onMarkerSelect(i) {
  const p = promoteMarker(i);
  if (p) pickPoint(p.id);
}
function movePointInternal(id, x, z) {
  const p = pointsById.get(id);
  if (!p || p.kind !== 'given') return false;
  const d = Math.hypot(x, z);
  if (d > TABLE_USABLE_R) { const k = TABLE_USABLE_R / d; x *= k; z *= k; }
  p.x = x; p.z = z;
  recomputeAll();
  recomputeMarkers();
  checkSolved();
  return true;
}

function checkSolved() {
  const match = points.find(p => {
    if (p.kind !== 'derived') return false;
    const ca = curvesById.get(p.parents.curveA), cb = curvesById.get(p.parents.curveB);
    if (!ca || !cb || ca.type !== 'circle' || cb.type !== 'circle') return false;
    const s = c => c.defs.join(',');
    return (s(ca) === 'A,B' && s(cb) === 'B,A') || (s(ca) === 'B,A' && s(cb) === 'A,B');
  });
  const was = solvedFlag;
  solvedFlag = !!match;
  solvedPointId = match ? match.id : null;
  if (solvedFlag && !was) triggerPayoff();
  if (!solvedFlag && was) hidePayoff();
  if (!solvedFlag) updateStatus();
}
function updateTriangle() {
  const A = getPoint('A'), B = getPoint('B'), C = getPoint(solvedPointId);
  if (!A || !B || !C) return;
  const pos = triMesh.geometry.attributes.position;
  pos.setXYZ(0, A.x, TABLE_Y + LIFT_TRI, A.z);
  pos.setXYZ(1, B.x, TABLE_Y + LIFT_TRI, B.z);
  pos.setXYZ(2, C.x, TABLE_Y + LIFT_TRI, C.z);
  pos.needsUpdate = true;
  const cx = (A.x + B.x + C.x) / 3, cz = (A.z + B.z + C.z) / 3;
  payoffLbl.position.set(cx, TABLE_Y + 0.16, cz);
}
function triggerPayoff() {
  triMesh.visible = true;
  updateTriangle();
  payoffLbl.setText('Not measured. Constructed. Move A — it cannot break.');
  payoffLbl.visible = true;
  tone(660, 0.16, 'sine');
  tone(990, 0.22, 'sine');
  updateStatus();
}
function hidePayoff() { triMesh.visible = false; payoffLbl.visible = false; }

function undo() {
  const last = actions.pop();
  if (!last) return false;
  if (last.type === 'curve') {
    const curve = curvesById.get(last.id);
    if (curve) {
      remove(curve.mesh);
      curves.splice(curves.indexOf(curve), 1);
      curvesById.delete(curve.id);
      const ei = entities.findIndex(e => e.kind === 'curve' && e.ref === curve);
      if (ei >= 0) entities.splice(ei, 1);
    }
  } else {
    const p = pointsById.get(last.id);
    if (p) {
      remove(p.group);
      points.splice(points.indexOf(p), 1);
      pointsById.delete(p.id);
      const ei = entities.findIndex(e => e.kind === 'point' && e.ref === p);
      if (ei >= 0) entities.splice(ei, 1);
    }
  }
  pendingPicks = pendingPicks.filter(id => pointsById.has(id));
  recomputeMarkers();
  checkSolved();
  updateStatus();
  return true;
}
function reset() {
  for (let i = curves.length - 1; i >= 0; i--) remove(curves[i].mesh);
  curves.length = 0; curvesById.clear();
  for (let i = points.length - 1; i >= 0; i--) if (points[i].kind === 'derived') remove(points[i].group);
  points = points.filter(p => p.kind === 'given');
  entities = entities.filter(e => e.kind === 'point' && e.ref.kind === 'given');
  actions.length = 0;
  pendingPicks = []; currentTool = null; movingId = null;
  solvedFlag = false; solvedPointId = null;
  hidePayoff();
  getPoint('A').x = ORIGIN_A.x; getPoint('A').z = ORIGIN_A.z;
  getPoint('B').x = ORIGIN_B.x; getPoint('B').z = ORIGIN_B.z;
  recomputeAll();
  recomputeMarkers();
  highlightToolButtons();
  updateStatus();
}

// ================= UI =================
function selectTool(name) {
  if (!['LINE', 'CIRCLE', 'MOVE'].includes(name)) return;
  currentTool = name;
  pendingPicks.forEach(id => setPickHighlight(id, false));
  pendingPicks = [];
  movingId = null;
  highlightToolButtons();
  updateStatus();
}
function highlightToolButtons() {
  toolBtns.forEach(b => {
    const on = b.name === currentTool;
    b.mesh.material.color.setHex(on ? 0x2dd4bf : 0x8b8d98);
    b.mesh.material.emissive.setHex(on ? 0x0f766e : 0x000000);
    b.mesh.material.emissiveIntensity = on ? 0.8 : 0;
  });
}
function updateStatus() {
  let text;
  if (capShowing) text = 'Construction limit reached (40). Press RESET to continue.';
  else if (!currentTool) text = solvedFlag ? 'Constructed. Try MOVE — drag A or B.' : 'Choose a tool: LINE, CIRCLE, or MOVE.';
  else if (currentTool === 'MOVE') text = 'MOVE: point at A or B and hold the trigger to drag it.';
  else if (currentTool === 'LINE') text = pendingPicks.length === 0 ? 'LINE: pick the first point.' : 'LINE: pick the second point.';
  else text = pendingPicks.length === 0 ? 'CIRCLE: pick the center.' : 'CIRCLE: pick the point to open the compass to.';
  if (text !== lastStatusText) { statusLbl.setText(text); lastStatusText = text; }
}
function makeButton(text, w, h, d) {
  const g = shape.box(w, h, d, 'grey');
  const lbl = label(text, { parent: g, at: [0, 0, d / 2 + 0.03], capHeight: 0.026, bg: false });
  return { mesh: g, lbl };
}

// ================= build / frame =================
function build() {
  ground({ color: 'dark', grid: false, arrow: false });
  sky({ top: 'black', bottom: 'dark' });
  input.teleport = 'none'; // standing at the drafting table the whole time

  tableRig = shape.group();
  const top = shape.cylinder(TABLE_DISC_R, TABLE_THICK, 'dark');
  top.position.y = TABLE_Y - TABLE_THICK / 2;
  tableRig.add(top);
  const rim = shape.torus(TABLE_DISC_R, 0.012, 'grey');
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_Y;
  tableRig.add(rim);
  const stand = shape.cylinder(0.08, TABLE_Y - TABLE_THICK, 'grey');
  stand.position.y = (TABLE_Y - TABLE_THICK) / 2;
  tableRig.add(stand);
  place(tableRig, { dist: 'near', dir: 'ahead', height: 'floor', anchor: 'bottom' });

  buildMarkerPool();

  // payoff triangle: flat fill, hidden until I.1 is dependency-detected
  const triGeom = new THREE.BufferGeometry();
  triGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  triGeom.setIndex([0, 1, 2]);
  triMat = mat(0x2dd4bf, { transparent: true, opacity: 0.55, emissive: 0x2dd4bf, emissiveIntensity: 1.1 });
  triMat.side = THREE.DoubleSide;
  triMesh = new THREE.Mesh(triGeom, triMat);
  triMesh.visible = false;
  tableRig.add(triMesh);

  payoffLbl = label(' ', { parent: tableRig, at: [0, TABLE_Y + 0.16, 0], capHeight: 0.05, bg: false });
  payoffLbl.rotation.x = -Math.PI / 2;
  payoffLbl.visible = false;

  addGivenPoint('A', ORIGIN_A.x, ORIGIN_A.z);
  addGivenPoint('B', ORIGIN_B.x, ORIGIN_B.z);

  // tool palette
  const lineBtn = makeButton('LINE', 0.16, 0.075, 0.03);
  const circleBtn = makeButton('CIRCLE', 0.16, 0.075, 0.03);
  const moveBtn = makeButton('MOVE', 0.16, 0.075, 0.03);
  toolBtns = [{ name: 'LINE', ...lineBtn }, { name: 'CIRCLE', ...circleBtn }, { name: 'MOVE', ...moveBtn }];
  spread(toolBtns.map(b => b.mesh), { dist: 0.9, height: H.chest, dir: 'ahead', span: 46 });
  toolBtns.forEach(b => interactive(b.mesh, { select: () => selectTool(b.name) }));

  const undoBtn = makeButton('UNDO', 0.14, 0.065, 0.025);
  const resetBtn = makeButton('RESET', 0.14, 0.065, 0.025);
  spread([undoBtn.mesh, resetBtn.mesh], { dist: 0.85, height: H.chest - 0.19, dir: 'ahead', span: 18 });
  interactive(undoBtn.mesh, { select: () => undo() });
  interactive(resetBtn.mesh, { select: () => reset() });

  statusLbl = label(' ', { dist: 'room', dir: 'ahead', height: 'eye', size: 'large', width: 1.8, anchor: 'top', theme: 'dark' });
  highlightToolButtons();
  updateStatus();

  // ---- Verification Contract ----
  window.ENV_TEST = {
    points: () => points.map(p => ({ id: p.id, x: p.x, z: p.z, kind: p.kind, parents: p.parents })),
    curves: () => curves.map(c => ({ id: c.id, type: c.type, defs: c.defs.slice() })),
    selectTool,
    pick: (idOrIdx) => {
      if (typeof idOrIdx === 'number') { const p = promoteMarker(idOrIdx); if (p) pickPoint(p.id); }
      else pickPoint(idOrIdx);
    },
    markers: () => markersArr.map(m => ({ index: m.index, x: m.x, z: m.z })),
    movePoint: (id, x, z) => movePointInternal(id, x, z),
    solved: () => solvedFlag,
    undo,
    reset,
  };
}

function frame(dt, t) {
  nowT = t;
  if (capShowing && t > capMsgUntil) { capShowing = false; updateStatus(); }
  if (triMesh.visible) triMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(t * 2.2);
}

XR.run({ build, frame });
