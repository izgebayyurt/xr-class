const { THREE, scene, shape, place, spread, label, interactive, tone, remove, mat, H, C, ground, camera } = XR;

// "Draw It With Your Feet" — the floor lights up under you exactly when your position obeys the
// current rule (a distance test done fresh every frame from the real head position). Walk it
// right and you leave a breadcrumb trail; the trail IS the curve, drawn by the rule, not by hand.

const TOL = 0.15;            // "within 15 cm" — same real-world corridor width for all three rules
const DROP_SPACING = 0.05;   // metres between breadcrumbs — close enough to read as a drawn line
const MAX_CRUMBS = 800;

const LAYOUT = {
  ONE:  { aX: 0,    aZ: -2.4 },                              // single post, out where it fills the opening view
  TWO:  { aX: -1.5, aZ: -2.2, bX: 1.5, bZ: -2.2 },            // two posts, 3.0 m apart
  LINE: { aX: 0,    aZ: -2.3, lineZ: -3.3 },                  // post 1.0 m from the painted line
};
const RULE_TEXT = {
  ONE:  'Stay 2.0 m from the post.',
  TWO:  'Stay the same distance from both posts.',
  LINE: 'Stay as far from the post as you are from the line.',
};
// the payoff: stated outright once the visitor asks to see it, never left for them to infer
const PAYOFF = {
  ONE:  'This is a circle: every point exactly 2.0 m from the post.',
  TWO:  'This is a straight line: every point the same distance from both posts.',
  LINE: 'This is a parabola: every point as far from the post as from the line.',
};
const MOTTO = 'The shape is just the rule, seen from above.';
const PAD_DEFS = [ { m: 'ONE', t: 'ONE POST' }, { m: 'TWO', t: 'TWO POSTS' }, { m: 'LINE', t: 'POST AND LINE' } ];

let postA, postB, directrix, footDisc, crumbs;
let hintLine = null, trueLine = null, signLabel;
let padMeshes = [];
let mode = 'ONE', trueCurveOn = false, lineZ = -3.3;
let crumbIdx = 0, lastDrop = null;
let sweptAngle = 0, lastAngle = null; // for the lap-closes chime on the circle
const _v = new THREE.Vector3();

// place an object at an exact (x, z) by converting to the word-based dist/dir the audit can see,
// instead of scene.add()-ing it as untracked geometry
function placeAt(obj, x, z, opts){
  const dist = Math.max(0.02, Math.hypot(x, z));
  const dir = THREE.MathUtils.radToDeg(Math.atan2(x, -z));
  place(obj, Object.assign({ dist, dir }, opts));
}

function deviation(x, z){
  if (mode === 'ONE'){
    return Math.abs(Math.hypot(x - postA.position.x, z - postA.position.z) - 2.0);
  }
  if (mode === 'TWO'){
    const midX = (postA.position.x + postB.position.x) / 2;
    return Math.abs(x - midX);
  }
  // parabola: |d_post - d_line| is the defining residual, but it is NOT the perpendicular
  // distance to the curve (it runs ~2x too tight near the vertex) — divide by the local
  // gradient magnitude |∇(d_post - d_line)| so 0.15 m means the same real distance everywhere.
  const dx = x - postA.position.x, dz = z - postA.position.z;
  const dPost = Math.hypot(dx, dz) || 1e-6;
  const uz = dz / dPost;
  const nz = (z - lineZ) >= 0 ? 1 : -1;
  const dLine = Math.abs(z - lineZ);
  const grad = Math.sqrt(Math.max(1e-4, 2 * (1 - uz * nz)));
  return Math.abs(dPost - dLine) / grad;
}

function curvePoints(){
  const pts = [];
  if (mode === 'ONE'){
    for (let i = 0; i <= 64; i++){
      const a = (i / 64) * Math.PI * 2;
      pts.push([postA.position.x + 2.0 * Math.sin(a), 0.004, postA.position.z + 2.0 * Math.cos(a)]);
    }
  } else if (mode === 'TWO'){
    const midX = (postA.position.x + postB.position.x) / 2, z0 = postA.position.z;
    pts.push([midX, 0.004, z0 - 3], [midX, 0.004, z0 + 3]);
  } else {
    const focusZ = postA.position.z, dist = Math.abs(focusZ - lineZ), vertexZ = (focusZ + lineZ) / 2;
    for (let i = -40; i <= 40; i++){
      const x = (i / 40) * 2.0;
      pts.push([x, 0.004, vertexZ + (x * x) / (2 * dist)]);
    }
  }
  return pts;
}

function rebuildCurveLines(){
  if (hintLine) remove(hintLine);
  if (trueLine) remove(trueLine);
  const pts = curvePoints();
  // the faint "can't quite make out yet" hint only belongs to the opening one-post view —
  // showing a ghost of the line or the parabola gives the other two answers away early
  hintLine = shape.line(pts, 'white');
  hintLine.material.transparent = true; hintLine.material.opacity = 0.07;
  hintLine.visible = (mode === 'ONE');

  trueLine = shape.line(pts, 'yellow');
  // dashed, so the reveal doesn't paint over the crumbs it's meant to be compared against
  trueLine.material = new THREE.LineDashedMaterial({ color: C.yellow, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.95 });
  trueLine.computeLineDistances();
  trueLine.visible = trueCurveOn;

  scene.add(hintLine, trueLine);
}

function clearBreadcrumbs(){
  crumbs.count = 0; crumbIdx = 0; lastDrop = null;
  sweptAngle = 0; lastAngle = null;
}

function dropCrumb(x, z){
  const i = crumbIdx % MAX_CRUMBS;
  crumbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.007, z));
  crumbIdx++;
  crumbs.count = Math.min(MAX_CRUMBS, crumbIdx);
  crumbs.instanceMatrix.needsUpdate = true;
}

function signText(){
  let text = RULE_TEXT[mode] + '\n' + MOTTO;
  if (trueCurveOn) text += '\n' + PAYOFF[mode];
  return text;
}

function onSignSelect(){
  trueCurveOn = !trueCurveOn;
  trueLine.visible = trueCurveOn;
  tone(trueCurveOn ? 720 : 340, 0.15, 'triangle');
  signLabel.setText(signText());
}

function highlightPads(){
  padMeshes.forEach((m, i) => m.material.color.setHex(PAD_DEFS[i].m === mode ? C.yellow : 0x3a3a3a));
}

function setRule(newMode, silent){
  mode = newMode;
  const L = LAYOUT[mode];
  placeAt(postA, L.aX, L.aZ, { height: 'floor', anchor: 'bottom' });
  postB.visible = (mode === 'TWO');
  if (mode === 'TWO') placeAt(postB, L.bX, L.bZ, { height: 'floor', anchor: 'bottom' });
  directrix.visible = (mode === 'LINE');
  if (mode === 'LINE'){ lineZ = L.lineZ; placeAt(directrix, 0, lineZ, { height: 'floor', anchor: 'bottom' }); }
  trueCurveOn = false;             // decide this BEFORE rebuilding, so the new curve starts hidden
  rebuildCurveLines();
  clearBreadcrumbs();
  highlightPads();
  signLabel.setText(signText());
  if (!silent) tone(500, 0.12, 'sine');
}

function makePost(){
  const p = shape.cylinder(0.045, H.knee, 'yellow');
  p.material = mat('yellow', { emissive: 0xccaa00, emissiveIntensity: 0.7 });
  return p;
}

function build(){
  ground({ color: 'dark', grid: false, arrow: false, radius: 9 });

  postA = makePost(); postB = makePost();
  directrix = shape.box(5.2, 0.006, 0.05, 'yellow');
  directrix.material = mat('yellow', { emissive: 0xccaa00, emissiveIntensity: 0.5 });

  footDisc = shape.cylinder(0.15, 0.01, 'grey');
  place(footDisc, { dist: 'near', dir: 'ahead', height: 'floor', anchor: 'bottom' });

  // dynamic trail: one InstancedMesh, one draw call. Its own transform stays at the origin —
  // each instance carries its own absolute world position — so it is scene.add()ed, not place()d.
  const crumbGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.006, 8);
  const crumbMat = mat('green', { emissive: 0x2f7a2f, emissiveIntensity: 0.5 });
  crumbs = new THREE.InstancedMesh(crumbGeo, crumbMat, MAX_CRUMBS);
  crumbs.count = 0;
  crumbs.frustumCulled = false; // an empty InstancedMesh caches a degenerate bounding sphere forever otherwise
  scene.add(crumbs);

  padMeshes = PAD_DEFS.map(() => shape.panel(0.34, 0.16, '#3a3a3a'));
  spread(padMeshes, { dist: 1.4, height: 'waist', dir: 'ahead-right', span: 30 }); // 20° / 35° / 50° — all three in the front arc
  padMeshes.forEach((pm, i) => {
    label(PAD_DEFS[i].t, { parent: pm, at: [0, 0, 0.03], capHeight: 0.032, bg: false });
    interactive(pm, { select: () => setRule(PAD_DEFS[i].m) });
    // a stand, so the pad reads as mounted on the floor rather than floating
    const stand = shape.cylinder(0.02, pm.position.y, '#26262c');
    placeAt(stand, pm.position.x, pm.position.z, { height: 'floor', anchor: 'bottom' });
  });

  signLabel = label(signText(), { dist: 6, dir: 'ahead', height: 'eye', size: 'large', width: 3.2, title: true, theme: 'dark', accent: '#e8c547' });
  interactive(signLabel, { select: onSignSelect });

  setRule('ONE', true);
}

function frame(dt){
  camera.getWorldPosition(_v);
  const x = _v.x, z = _v.z;
  const ok = deviation(x, z) <= TOL;
  footDisc.position.x = x; footDisc.position.z = z;
  footDisc.material.color.setHex(ok ? C.green : C.grey);

  if (ok){
    if (!lastDrop || Math.hypot(x - lastDrop.x, z - lastDrop.z) >= DROP_SPACING){
      dropCrumb(x, z);
      lastDrop = { x, z };
      tone(880, 0.05, 'sine');
    }
    if (mode === 'ONE'){                              // a quiet chime the moment a full lap closes
      const a = Math.atan2(x - postA.position.x, z - postA.position.z);
      if (lastAngle !== null){
        let d = a - lastAngle;
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        sweptAngle += Math.abs(d);
        if (sweptAngle >= Math.PI * 2){ sweptAngle -= Math.PI * 2; tone(1040, 0.3, 'sine'); }
      }
      lastAngle = a;
    }
  } else {
    lastDrop = null;
  }
}

XR.run({ build, frame });
