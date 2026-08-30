const { THREE, shape, place, fit, label, interactive, tone, mat, remove, ground, sky, C } = XR;

// "The Gap at Your Feet" — regular n-gon tiles fanned edge-to-edge around one shared corner.
// Only shapes whose corner angle divides 360° evenly can close the ring: triangle 60°(x6),
// square 90°(x4), hexagon 120°(x3). Pentagon's 108° leaves a real 36° wedge open.

const EDGE = 0.8;
const ROSETTE_DIST = 2.0; // ~38° below eye level from here — a natural downward glance, not a neck-breaker
const TILE_COLOR = 0xcfc9ba, OUTLINE = 0x2a2823;
const SHAPES = [ { n: 3, name: 'TRIANGLE' }, { n: 4, name: 'SQUARE' }, { n: 5, name: 'PENTAGON' }, { n: 6, name: 'HEXAGON' } ];
const cornerDeg = n => Math.round((n - 2) * 180 / n);
const cornerRad = n => (n - 2) * Math.PI / n;

// Build one regular n-gon flat in the XZ plane with vertex 0 (the pivot corner) at the local origin,
// symmetric about local -Z. Every copy of the same n-gon rotated by k*cornerRad(n) about Y shares
// that corner and its adjacent edge with the previous copy — real edge-to-edge fit, no faking.
function polyGeom(n, edge){
  const half = cornerRad(n) / 2, ext = Math.PI * 2 / n;
  const pts = [new THREE.Vector3(0, 0, 0)];
  let cur = new THREE.Vector3(0, 0, 0), ang = -half;
  for (let k = 0; k < n - 1; k++){
    cur = cur.clone().add(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)).multiplyScalar(edge));
    pts.push(cur); ang += ext;
  }
  const geo = new THREE.BufferGeometry();
  const v = []; pts.forEach(p => v.push(p.x, p.y, p.z));
  const idx = []; for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// A filled pie-slice from the same pivot, same angle convention (0 = -Z, + = toward +X).
function sectorGeom(radius, startDeg, sweepDeg, segs){
  const s0 = THREE.MathUtils.degToRad(startDeg), step = THREE.MathUtils.degToRad(sweepDeg) / segs;
  const v = [0, 0.003, 0];
  for (let i = 0; i <= segs; i++){ const a = s0 + step * i; v.push(Math.sin(a) * radius, 0.003, -Math.cos(a) * radius); }
  const idx = []; for (let i = 1; i <= segs; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// Local (x,z) offset at (angleDeg, radius) around the marker, in floorGroup's own space — same
// sin/cos convention as the tiles, ticks and wedge, so a chip parented here sits exactly where it says.
function localXZ(angleDeg, radius){
  const a = THREE.MathUtils.degToRad(angleDeg);
  return { x: Math.sin(a) * radius, z: -Math.cos(a) * radius };
}
// A number/readout chip lying flat on the floor plane, parented to floorGroup — reads like chalk on
// the tile, not a sign standing off it, and moves with the rosette instead of being aimed from the user.
function flatChip(text, angleDeg, radius, capHeight){
  const { x, z } = localXZ(angleDeg, radius);
  const l = label(text, { parent: floorGroup, at: [x, 0.05, z], capHeight, bg: false, width: 0.9 });
  l.rotation.x = -Math.PI / 2;
  return l;
}

let floorGroup, tilesGroup, protractorGroup, protractorOn = false;
let currentN = 6, picked = false, reveal = [], runningSum = 0, simT = 0;
let signLbl, gapLbl, sumLbl, cardinalLbls = [];

function statsFor(n){ const c = cornerDeg(n); const count = Math.floor(360 / c + 1e-6); return { c, count, leftover: Math.round(360 - count * c) }; }
function nameFor(n){ return SHAPES.find(s => s.n === n).name; }

function updateSign(){
  const { c, count, leftover } = statsFor(currentN);
  const tail = leftover > 0 ? `${leftover}° left over` : `0° left over — this one closes`;
  signLbl.setText(`Only three shapes tile a floor.\n${nameFor(currentN)} · corner ${c}° · ${count} fit · ${count} × ${c}° = ${count * c}° · ${tail}`);
}
function clearProtractor(){
  if (protractorGroup){ remove(protractorGroup); protractorGroup = null; }
  if (gapLbl) gapLbl.visible = false;
  cardinalLbls.forEach(l => l.visible = false);
  protractorOn = false;
}
function showTile(n){
  const m = new THREE.Mesh(polyGeom(n, EDGE), mat(TILE_COLOR, { side: THREE.DoubleSide }));
  m.position.y = 0.002;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), mat(OUTLINE));
  m.add(outline);
  tilesGroup.add(m);
  return m;
}
function pickShape(n){
  clearProtractor();
  if (tilesGroup) remove(tilesGroup);
  tilesGroup = shape.group(); floorGroup.add(tilesGroup);
  currentN = n; picked = true;
  const { count, c } = statsFor(n);
  runningSum = 0; sumLbl.setText('0°'); sumLbl.visible = true;
  reveal = [];
  for (let i = 0; i < count; i++){
    const mesh = showTile(n);
    mesh.visible = false;
    const toRot = i * cornerRad(n), fromRot = (i - 1) * cornerRad(n);
    mesh.rotation.y = fromRot;
    reveal.push({ mesh, cDeg: c, at: simT + 0.15 + i * 0.3, started: false, done: false, startT: 0, fromRot, toRot });
  }
  updateSign();
}
function toggleProtractor(){
  if (!picked){ tone(220, 0.05); return; } // nothing fanned yet — measuring an unpicked shape is a category error
  if (protractorOn){ clearProtractor(); tone(320, 0.06); return; }
  protractorOn = true;
  const { c, count, leftover } = statsFor(currentN);
  protractorGroup = shape.group(); floorGroup.add(protractorGroup);
  const ring = new THREE.Mesh(new THREE.RingGeometry(EDGE * 0.97, EDGE * 1.02, 48), mat(C.dark, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.008;
  protractorGroup.add(ring);
  for (let k = 0; k < 36; k++){
    const a = THREE.MathUtils.degToRad(k * 10);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.05), mat(C.dark));
    tick.position.set(Math.sin(a) * EDGE * 1.06, 0.01, -Math.cos(a) * EDGE * 1.06);
    tick.rotation.y = a;
    protractorGroup.add(tick);
  }
  cardinalLbls.forEach(l => l.visible = true); // built once in build() — never recreated per toggle
  let startDeg = 0, midDeg = 0;
  if (leftover > 0.5){
    startDeg = c / 2; // the true gap sits at [c/2, c/2+leftover] — NOT [count*c-c/2, ...], which mirrors onto a solid tile
    const wedge = new THREE.Mesh(sectorGeom(EDGE, startDeg, leftover, 10), mat(C.orange, { side: THREE.DoubleSide }));
    protractorGroup.add(wedge);
    midDeg = startDeg + leftover / 2;
  }
  tone(560, 0.08);
  // gapLbl now actually uses midDeg: it moves onto the wedge (or dead-centre when there is none) instead
  // of sitting parked over tile 0. This is also the payoff — the causal sentence, gated on this interaction.
  const gp = leftover > 0.5 ? localXZ(midDeg, EDGE * 0.55) : localXZ(0, EDGE * 0.15);
  gapLbl.position.set(gp.x, 0.05, gp.z);
  gapLbl.setText(leftover > 0.5
    ? `${leftover}° left over\n${c}° doesn't divide evenly into 360°`
    : `0° left over — closes\n${c}° divides evenly into 360° (×${count})`);
  gapLbl.visible = true;
}

function build(){
  ground({ color: 0x45433e, grid: false, arrow: false });
  sky({ top: 'black', bottom: 'dark' }); // was ~50% daylight blue in frame — retint to the workshop mood

  floorGroup = shape.group();
  place(floorGroup, { dist: ROSETTE_DIST, dir: 'ahead', height: 0 }); // numeric: an empty group has no bounding box to anchor 'floor' against
  tilesGroup = shape.group(); floorGroup.add(tilesGroup);
  showTile(currentN); // one flat hexagon lying there, untouched — rotation 0 is exactly copy-index 0's resting spot

  const marker = shape.ball(0.035, C.yellow);
  place(marker, { dist: ROSETTE_DIST, dir: 'ahead', height: 0.035 });
  const markerHit = shape.hitball(0.1);
  place(markerHit, { dist: ROSETTE_DIST, dir: 'ahead', height: 0.12 });
  interactive(markerHit, { select: toggleProtractor });

  signLbl = label('Only three shapes tile a floor.\nPick a tile to begin.', { dist: 'room', dir: 'ahead', height: 'eye', size: 'large', width: 2.2, title: true });
  // gap readout, running total and cardinal numbers now lie flat on the floor, parented to floorGroup,
  // instead of standing off it as free-floating chips — reads like the tiles, not signage over them.
  gapLbl = flatChip('', 0, EDGE * 0.15, 0.05);
  gapLbl.visible = false;
  sumLbl = flatChip('0°', -45, EDGE * 1.15, 0.05); // pushed out to the ring's radius, clear of the wedge/cardinals
  sumLbl.visible = false;
  for (let k = 0; k < 4; k++){ // protractor cardinal numbers — built once, only toggled, never recreated
    const l = flatChip(String(k * 90) + '°', k * 90, EDGE * 1.18, 0.04);
    l.visible = false;
    cardinalLbls.push(l);
  }

  // sample row: four hand-sized tiles floating to the right, compressed into a tight, reachable arc,
  // now inside the start view (was 22–58°, clipping PENTAGON/HEXAGON off the right edge).
  SHAPES.forEach((s, i) => {
    const dir = 14 + i * 10, dist = 1.8;
    const geo = polyGeom(s.n, EDGE); geo.center();
    const sample = new THREE.Mesh(geo, mat(TILE_COLOR, { side: THREE.DoubleSide }));
    sample.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat(OUTLINE)));
    place(sample, { dist, dir, height: 'waist' });
    sample.rotation.set(Math.PI / 2, 0, 0);
    fit(sample, 0.13);
    const hit = shape.hitball(0.11);
    place(hit, { dist, dir, height: 'waist' });
    interactive(hit, { select: () => pickShape(s.n) });
    label(s.name, { above: sample, size: 'comfortable', width: 0.5 });
  });
  label('Pick a tile to fan it around the dot.\nPoint at the dot to measure the gap left over.', { dist: 1.8, dir: 28, height: 1.32, size: 'comfortable', width: 1.3 });
}

function frame(dt, t){
  simT = t;
  for (const r of reveal){
    if (r.done) continue;
    if (!r.started){
      if (simT < r.at) continue;
      r.mesh.visible = true; r.started = true; r.startT = simT; tone(520, 0.05, 'triangle');
    }
    const k = Math.min(1, (simT - r.startT) / 0.3);
    const e = 1 - Math.pow(1 - k, 3);
    r.mesh.rotation.y = r.fromRot + (r.toRot - r.fromRot) * e;
    if (k >= 1){
      r.mesh.rotation.y = r.toRot; // exact terminal angle every time — no window to freeze inside of
      r.done = true;
      runningSum += r.cDeg;
      sumLbl.setText(`${runningSum}°`);
    }
  }
}

XR.run({ build, frame });
