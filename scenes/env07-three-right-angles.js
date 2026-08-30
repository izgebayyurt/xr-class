const { THREE, shape, place, label, interactive, tone, mat, ground, H, C, stations } = XR;

// ---- Three Right Angles (round 3) ----
// Octant spherical triangle: pole + two orthogonal equator points -> every angle/area claim below
// is exact. Ball centre lowered (0.85 m) + rig tilted 15 deg (rigid, nothing computed disturbed)
// so the pole is visible too. tiltRig (fixed tilt) > spinner (yaw child; quarter-turns).

const R = 0.6;                     // ball radius -> ~1.2 m across
const CENTER_H = 0.85, DIST = 'room', TILT = 15, LAMB = 9;   // LAMB: B's longitude offset from dead-ahead
const S_MAX = 0.82;                // dial's max shrink: sum -> ~182 deg, never quite 180
const ARC_N = 28, FILL_N = 16, TUBE_R = 0.007;
const ARC_LIFT = 0.010, FILL_LIFT = 0.014, MARK_LIFT = 0.017, DOT_R = 0.035, DOT_LIFT = DOT_R + 0.012;
const D2R = Math.PI / 180;
function vLam(deg){ const l = deg * D2R; return new THREE.Vector3(-Math.sin(l), 0, Math.cos(l)); }
const A0 = new THREE.Vector3(0, 1, 0), B0 = vLam(LAMB), C0 = vLam(LAMB + 90);
function slideToPole(u, s){ const a = s * Math.PI / 2; return u.clone().multiplyScalar(Math.cos(a)).add(A0.clone().multiplyScalar(Math.sin(a))); }
function pointOnArc(P, Q, f){
  const th = P.angleTo(Q); if (th < 1e-6) return P.clone();
  const a = Math.sin((1 - f) * th) / Math.sin(th), b = Math.sin(f * th) / Math.sin(th);
  return P.clone().multiplyScalar(a).add(Q.clone().multiplyScalar(b));
}
function angleAt(V, P, Q){
  const tp = P.clone().addScaledVector(V, -V.dot(P)).normalize();
  const tq = Q.clone().addScaledVector(V, -V.dot(Q)).normalize();
  return Math.acos(THREE.MathUtils.clamp(tp.dot(tq), -1, 1)) / D2R;
}

// ---- dynamic arc: hand-rolled tube (LineBasicMaterial ignores linewidth on every real renderer).
// Fixed-topology ring mesh, position buffer rewritten in place every frame — a fresh
// TubeGeometry/CatmullRomCurve3 per frame measured ~120ms EACH (froze the page); this uses each
// sample's own radial direction as a stable frame (smooth 90 deg geodesics, never a cusp) instead.
const RSEG = 6;
const _arT = new THREE.Vector3(), _arN = new THREE.Vector3(), _arB = new THREE.Vector3();
function makeArcMesh(){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_N + 1) * RSEG * 3), 3));
  const idx = [];
  for (let i = 0; i < ARC_N; i++) for (let j = 0; j < RSEG; j++){
    const a = i * RSEG + j, b = i * RSEG + (j + 1) % RSEG, c = (i + 1) * RSEG + j, d = (i + 1) * RSEG + (j + 1) % RSEG;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  return new THREE.Mesh(g, mat(C.orange, {}));
}
function updateArcMesh(mesh, P, Q){
  const arr = mesh.geometry.attributes.position.array;
  const pts = []; for (let i = 0; i <= ARC_N; i++) pts.push(pointOnArc(P, Q, i / ARC_N).multiplyScalar(R + ARC_LIFT));
  for (let i = 0; i <= ARC_N; i++){
    const p = pts[i], next = pts[Math.min(i + 1, ARC_N)], prev = pts[Math.max(i - 1, 0)];
    _arT.copy(next).sub(prev); if (_arT.lengthSq() < 1e-10) _arT.set(1, 0, 0); _arT.normalize();
    _arN.copy(p).normalize();
    _arB.crossVectors(_arN, _arT).normalize();
    _arN.crossVectors(_arT, _arB).normalize();
    for (let j = 0; j < RSEG; j++){
      const ang = j / RSEG * Math.PI * 2, ox = Math.cos(ang) * TUBE_R, oy = Math.sin(ang) * TUBE_R;
      const b = (i * RSEG + j) * 3;
      arr[b] = p.x + _arN.x * ox + _arB.x * oy;
      arr[b + 1] = p.y + _arN.y * ox + _arB.y * oy;
      arr[b + 2] = p.z + _arN.z * ox + _arB.z * oy;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

// ---- dynamic fill: fine barycentric grid, lifted clear, no depth-write (no shredded-lattice look) ----
const FILL_VERTS = []; { const n = FILL_N; for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) FILL_VERTS.push([i, j]); }
function makeFill(){
  const n = FILL_N, idx = new Map();
  FILL_VERTS.forEach((v, k) => idx.set(v[0] + '_' + v[1], k));
  const indices = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++){
    const a = idx.get(i + '_' + j), b = idx.get((i + 1) + '_' + j), c = idx.get(i + '_' + (j + 1));
    indices.push(a, b, c);
    if (j < n - i - 1) indices.push(b, idx.get((i + 1) + '_' + (j + 1)), c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FILL_VERTS.length * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(FILL_VERTS.length * 3), 3));
  g.setIndex(indices);
  return new THREE.Mesh(g, mat(C.orange, { transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
}
function updateFill(meshObj, A, B, C_){
  const n = FILL_N, posArr = meshObj.geometry.attributes.position.array, nrmArr = meshObj.geometry.attributes.normal.array;
  FILL_VERTS.forEach(([i, j], k) => {
    const u = i / n, v = j / n, w = 1 - u - v;
    const dir = A.clone().multiplyScalar(u).add(B.clone().multiplyScalar(v)).add(C_.clone().multiplyScalar(w)).normalize(); // = outward normal too
    const p = dir.clone().multiplyScalar(R + FILL_LIFT);
    posArr[k * 3] = p.x; posArr[k * 3 + 1] = p.y; posArr[k * 3 + 2] = p.z;
    nrmArr[k * 3] = dir.x; nrmArr[k * 3 + 1] = dir.y; nrmArr[k * 3 + 2] = dir.z;
  });
  meshObj.geometry.attributes.position.needsUpdate = true;
  meshObj.geometry.attributes.normal.needsUpdate = true;
  meshObj.geometry.computeBoundingSphere();
}

// ---- right-angle mark: a small filled SQUARE (two orthonormal tangents = a true square, not a V) ----
function markQuadPts(V, P, Q){
  const tp = P.clone().addScaledVector(V, -V.dot(P)).normalize();
  const tq = Q.clone().addScaledVector(V, -V.dot(Q)).normalize();
  const base = V.clone().multiplyScalar(R + MARK_LIFT), s = 0.065;
  return [base, base.clone().addScaledVector(tp, s), base.clone().addScaledVector(tp, s).addScaledVector(tq, s), base.clone().addScaledVector(tq, s)];
}
function makeMark(){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return new THREE.Mesh(g, mat(C.white, { side: THREE.DoubleSide, depthWrite: false }));
}
function setMark(meshObj, V, P, Q){
  const pts = markQuadPts(V, P, Q), arr = meshObj.geometry.attributes.position.array;
  pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
  meshObj.geometry.attributes.position.needsUpdate = true;
  meshObj.geometry.computeBoundingSphere();
}

const TITLE = 'Three right angles. One triangle.';
const SUBLINE = "You can't see all three corners from one place. Walk.";
const RULE = 'How far over 180° you go is exactly proportional to how much surface the triangle covers: one eighth of the ball is 90° over, one eighth of that is 11.25° over.';
const PAYOFF = 'Shrink the triangle enough and the excess vanishes — that is why a flat sheet of paper is just a very small piece of a very large sphere.';

let tiltRig, spinner, arcAB, arcBC, arcCA, fillMesh, dot, markA, markB, markC;
let mainSign, lastSignShown = null, rail, knob;
let s = 0, yawTarget = 0, walkedOnce = false, walk = null; // walk: { leg, from, to, phase, t, total }
const LEG = 3.2, PAUSE = 1.4, RAIL = 0.15;
function currentBC(){ return [slideToPole(B0, s), slideToPole(C0, s)]; }

function refreshGeometry(){
  const [B, Cc] = currentBC();
  updateArcMesh(arcAB, A0, B); updateArcMesh(arcBC, B, Cc); updateArcMesh(arcCA, Cc, A0);
  updateFill(fillMesh, A0, B, Cc);
  if (markB.visible) setMark(markB, B, A0, Cc);
  if (markC.visible) setMark(markC, Cc, A0, B);
  if (markA.visible) setMark(markA, A0, B, Cc);
}
function liveText(){
  const [B, Cc] = currentBC();
  const aA = angleAt(A0, B, Cc), aB = angleAt(B, A0, Cc), aC = angleAt(Cc, A0, B);
  const sum = aA + aB + aC, excess = sum - 180;
  const line3 = `${aA.toFixed(1)}° + ${aB.toFixed(1)}° + ${aC.toFixed(1)}° = ${sum.toFixed(1)}°`;
  const pct = excess / 720 * 100;
  const line4 = `${excess.toFixed(1)}° over 180° · covers 1/${Math.round(720 / excess)} of the ball (${pct.toFixed(2)}%)`;
  let text = `${TITLE}\n${SUBLINE}\n${line3}\n${line4}`;
  if (walkedOnce) text += `\n${PAYOFF}`;
  return text;
}
function setSign(text, force){
  if (!force && text === lastSignShown) return;
  lastSignShown = text;
  mainSign.setText(text);
}

const WALK_TO = ['B', 'C', 'A'];   // corner visited at each leg, in order
function startWalk(){
  if (walk) return;
  [markA, markB, markC].forEach(m => m.visible = false);
  walk = { leg: 0, from: 'A', to: 'B', phase: 'travel', t: 0, total: 0 };
  tone(420, 0.1, 'sine');
}

function build(){
  ground({ color: '#0a0e18', grid: false, arrow: false });

  tiltRig = shape.group();
  place(tiltRig, { dist: DIST, dir: 'ahead', height: CENTER_H });
  tiltRig.rotation.x = TILT * D2R;                // fixed tilt: leans the pole toward the viewer
  spinner = shape.group(); tiltRig.add(spinner);  // yaw-only child: quarter-turns spin the ball on its own tilted axis

  const ball = shape.ball(R, C.dark);
  ball.material = mat('#182648', { emissive: '#060c1c', emissiveIntensity: 0.5, roughness: 0.75 });
  spinner.add(ball);
  const ballHit = shape.hitball(R); spinner.add(ballHit);
  interactive(ballHit, { select: () => { yawTarget += Math.PI / 2; tone(500, 0.08, 'square'); } });
  // faint lat/long "wire cage"
  const gp = (th, phi) => [R * 1.002 * Math.sin(th) * Math.cos(phi), R * 1.002 * Math.cos(th), R * 1.002 * Math.sin(th) * Math.sin(phi)];
  function gridLine(n, fn){
    const pts = []; for (let t = 0; t <= n; t++) pts.push(fn(t / n));
    const gl = shape.line(pts, 'white'); gl.material = mat(C.white, { transparent: true, opacity: 0.16 });
    spinner.add(gl);
  }
  for (let i = 0; i < 8; i++){ const phi = i * 45 * D2R; gridLine(24, u => gp(u * Math.PI, phi)); }
  for (let k = 1; k <= 5; k++){ const th = k / 6 * Math.PI; gridLine(32, u => gp(th, u * Math.PI * 2)); }

  arcAB = makeArcMesh(); arcBC = makeArcMesh(); arcCA = makeArcMesh();
  spinner.add(arcAB, arcBC, arcCA);
  fillMesh = makeFill(); spinner.add(fillMesh);
  dot = shape.ball(DOT_R, C.yellow); dot.position.copy(A0).multiplyScalar(R + DOT_LIFT); spinner.add(dot);
  markA = makeMark(); markB = makeMark(); markC = makeMark();
  [markA, markB, markC].forEach(m => { m.visible = false; spinner.add(m); });
  refreshGeometry();
  // console: rail + knob (resize) + WALK IT button, symmetric about the group origin, dir 20, reach.
  const console_ = shape.group();
  place(console_, { dist: 'reach', dir: 20, height: 'waist', face: true });
  rail = shape.box(0.26, 0.015, 0.015, 'grey'); rail.position.x = -0.15; console_.add(rail);
  knob = shape.ball(0.035, 'orange'); rail.add(knob); knob.position.x = -RAIL;
  const knobHit = shape.hitball(0.075); knob.add(knobHit); // bigger ray target — grab goes on knob (below), never this child
  interactive(knob, {
    grab: 'hold',
    release: () => { walkedOnce = true; knobHit.position.set(0, 0, 0); setSign(liveText(), true); },
    drag: (obj, { point }) => {
      if (walk) return;                              // freeze the dial while WALK IT is running
      const v = rail.worldToLocal(point.clone());
      knob.position.x = THREE.MathUtils.clamp(v.x, -RAIL, RAIL);
      s = THREE.MathUtils.clamp((knob.position.x / RAIL + 1) / 2, 0, 1) * S_MAX;
      refreshGeometry(); setSign(liveText());
    },
  });
  const btn = shape.box(0.2, 0.12, 0.03, '#e8eef4'); btn.position.x = 0.15; console_.add(btn);
  label('WALK IT', { parent: btn, at: [0, 0, 0.03 / 2 + 0.03], capHeight: 0.03, bg: false });
  const btnHit = shape.hit(0.28, 0.2, 0.12); btn.add(btnHit);
  interactive(btnHit, { select: startWalk });
  // instruction, decoupled from the low waist-height console so it reads in the opening view
  label('Grab the knob (below) to resize the triangle.\nThe button beside it plays WALK IT.',
    { dist: 'near', dir: 20, height: 'chest', size: 'comfortable', width: 0.95 });

  mainSign = label(liveText(), { dist: 2.6, dir: -30, height: 'eye', size: 'large', width: 1.1, title: true, theme: 'dark', accent: '#ff8a3d' });
  lastSignShown = liveText();
  label(RULE, { dist: 2.6, dir: -30, height: H.eye - 0.95, size: 'comfortable', width: 1.4, theme: 'dark' });
  stations.push([-1.6, -0.6, 40]);
}

function frame(dt){
  const yawDiff = yawTarget - spinner.rotation.y;
  if (Math.abs(yawDiff) > 0.001) spinner.rotation.y += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), dt * 3.2);

  if (walk){
    const [B, Cc] = currentBC();
    const pts = { A: A0, B, C: Cc }, marks = { A: markA, B: markB, C: markC };
    walk.t += dt;
    if (walk.phase === 'travel'){
      dot.position.copy(pointOnArc(pts[walk.from], pts[walk.to], Math.min(1, walk.t / LEG))).multiplyScalar(R + DOT_LIFT);
      if (walk.t >= LEG){
        walk.phase = 'pause'; walk.t = 0;
        const V = pts[walk.to], others = 'ABC'.replace(walk.to, '').split('');
        setMark(marks[walk.to], V, pts[others[0]], pts[others[1]]);
        marks[walk.to].visible = true;
        walk.total += angleAt(V, pts[others[0]], pts[others[1]]);
        setSign(`${TITLE}\n${SUBLINE}\n${Math.round(walk.total)}°`, true);
        tone(walk.leg < 2 ? 600 : 700, walk.leg < 2 ? 0.1 : 0.14, 'sine');
      }
    } else if (walk.t >= PAUSE){
      walk.leg++;
      if (walk.leg >= 3){ walk = null; walkedOnce = true; setSign(liveText(), true); }
      else { walk.from = walk.to; walk.to = WALK_TO[walk.leg]; walk.phase = 'travel'; walk.t = 0; }
    }
  }
}

XR.run({ build, frame });
