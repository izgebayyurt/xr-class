const { THREE, shape, place, label, interactive, tone, mat, sky, ground, ui, C } = XR;

const R = 0.18, HT = 0.36, MAXL = 20;            // same base radius and same height for cone and cylinder
const TITLE = 'Cone and cylinder';
const PAL = [C.pink, C.orange, C.yellow, C.green, C.teal, C.blue, C.purple];

// Volumes are measured by adding up thin round slices, not typed in.
function sliceVolume(radiusAt, n){
  let v = 0; const dy = HT / n;
  for (let i = 0; i < n; i++){ const r = radiusAt((i + 0.5) * dy); v += Math.PI * r * r * dy; }
  return v;
}
const V_CYL = sliceVolume(() => R, 2000);
const V_CONE = sliceVolume(y => R * y / HT, 2000);   // cone with its tip down: radius grows with height

let card, guess, startBtn, layersBtn, slider, cylLabel, coneLabel;
let cylG, coneG, sandCyl, sandPivot;
const cylDisc = [], coneDisc = [];
let stage = 'guess', guessN = 0, poured = 0, target = 0, level = 0, pourT = 0;
let full = false, revealed = false, layersOn = false, layerN = 8, touched = false, lastKey = '';

const T0 = TITLE + '\nSame base, same height. How many cones of sand will fill the cylinder? Click your guess.';
const T_POUR = TITLE + "\nClick the cone to pour its sand into the cylinder. Model: each pour adds one cone's volume of sand; the level is volume / base area.";

// Cut both solids into n equal layers. Returns (cone layers total) / (cylinder layers total), computed from the discs themselves.
function setLayers(n){
  const dh = HT / n; let vCyl = 0, vCone = 0;
  for (let i = 0; i < MAXL; i++){
    const on = i < n;
    cylDisc[i].visible = on && layersOn;
    coneDisc[i].visible = on && layersOn;
    if (!on) continue;
    const rc = R * 0.97, rk = R * 0.97 * (i + 0.5) / n;
    cylDisc[i].scale.set(rc, dh, rc);  cylDisc[i].position.y = (i + 0.5) * dh;
    coneDisc[i].scale.set(rk, dh, rk); coneDisc[i].position.y = (i + 0.5) * dh;
    vCyl += Math.PI * rc * rc * dh;
    vCone += Math.PI * rk * rk * dh;
  }
  return vCone / vCyl;
}

function updateLayersUI(){
  const ratio = setLayers(layerN);
  cylLabel.setText(`${layerN} layers: cone = ${ratio.toFixed(3)} of cylinder`);
  if (touched){
    card.setText(`${TITLE}\nWith ${layerN} layers the cone holds ${ratio.toFixed(3)} of the cylinder, close to 1/3. Thinner layers get closer. That is the 1/3 in V = 1/3 x base area x height.`);
  } else {
    card.setText(`${TITLE}\nBoth are cut into equal layers. The cone's layers shrink toward the tip. Drag the knob to change how many layers.`);
  }
}

function onCone(){
  if (stage !== 'pour' || pourT > 0 || full) return;
  poured++;
  target = Math.min(1, poured * V_CONE / V_CYL);
  if (target >= 0.999){ target = 1; full = true; coneLabel.visible = false; }
  pourT = 1.2;
  tone(300 + 80 * poured, 0.25, 'sine');
}

function reveal(){
  revealed = true;
  const k = poured, ok = guessN === k;
  guess.mark(guessN - 1, ok ? 'right' : 'wrong');
  if (!ok && k >= 1 && k <= 4) guess.mark(k - 1, 'right');
  card.setText(`${TITLE}\nIt took ${k} cones to fill the cylinder, so one cone is 1/${k} of it. ${ok ? 'Your guess was right.' : 'You guessed ' + guessN + '.'} Why? Click "Show layers".`);
  layersBtn.visible = true;
  tone(660, 0.25, 'triangle');
}

function restart(){
  stage = 'guess'; guessN = 0; poured = 0; target = 0; level = 0; pourT = 0;
  full = false; revealed = false; touched = false; layersOn = false; lastKey = '';
  guess.reset(); guess.visible = true;
  slider.visible = false; layersBtn.visible = false; startBtn.visible = false;
  coneLabel.visible = false; cylLabel.visible = false;
  sandPivot.scale.setScalar(1); sandPivot.visible = true;
  sandCyl.visible = false;
  setLayers(layerN);
  card.setText(T0);
}

function build(){
  sky({ top: 'blue', bottom: 'pink' });
  ground({ color: 'teal', grid: false, arrow: false });

  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 40);
  const discMats = PAL.map(c => mat(c));
  const sandMat = mat(C.yellow);

  // Cylinder (glass) with a line marking the top
  cylG = shape.group();
  const cylShell = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, HT, 40),
    mat(C.teal, { opacity: 0.22, transparent: true, depthWrite: false })
  );
  cylShell.position.y = HT / 2;
  cylG.add(cylShell);
  const ring = [];
  for (let i = 0; i <= 48; i++){ const a = i / 48 * Math.PI * 2; ring.push([R * Math.cos(a), HT, R * Math.sin(a)]); }
  cylG.add(shape.line(ring, 'white'));

  // Cone (glass funnel, tip down)
  coneG = shape.group();
  const coneShell = new THREE.Mesh(
    new THREE.ConeGeometry(R, HT, 40),
    mat(C.purple, { opacity: 0.22, transparent: true, depthWrite: false })
  );
  coneShell.rotation.x = Math.PI;
  coneShell.position.y = HT / 2;
  coneG.add(coneShell);

  place(cylG, { dist: 'room', dir: 30, height: 'waist', anchor: 'bottom' });
  place(coneG, { dist: 'room', dir: -30, height: 'waist', anchor: 'bottom' });

  // Everything below sits inside the shells, so it is added after placing.
  sandCyl = new THREE.Mesh(unitCyl, sandMat);
  sandCyl.scale.set(R * 0.97, 0.001, R * 0.97);
  sandCyl.visible = false;
  cylG.add(sandCyl);

  sandPivot = shape.group();
  const coneSand = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, HT * 0.95, 40), sandMat);
  coneSand.rotation.x = Math.PI;
  coneSand.position.y = HT * 0.95 / 2;
  sandPivot.add(coneSand);
  coneG.add(sandPivot);

  for (let i = 0; i < MAXL; i++){
    const a = new THREE.Mesh(unitCyl, discMats[i % PAL.length]);
    const b = new THREE.Mesh(unitCyl, discMats[i % PAL.length]);
    a.visible = false; b.visible = false;
    cylG.add(a); coneG.add(b);
    cylDisc.push(a); coneDisc.push(b);
  }
  setLayers(layerN);

  cylLabel = label('Empty', { above: cylG, size: 'comfortable', width: 0.9 });
  coneLabel = label('Click to pour', { above: coneG, size: 'comfortable', width: 0.9 });
  cylLabel.visible = false; coneLabel.visible = false;

  interactive(coneG, { select: onCone });

  card = ui.sign(T0, { width: 1.3, dist: 'room', dir: 'ahead', height: 'eye' });

  guess = ui.choices(['1 cone', '2 cones', '3 cones', '4 cones'], {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, text, row) => {
      guessN = i + 1;
      row.lock();
      stage = 'pour';
      card.setText(T_POUR);
      coneLabel.visible = true;
      cylLabel.setText('Empty'); cylLabel.visible = true;
      sandCyl.visible = true;
      startBtn.visible = true;
    }
  });

  startBtn = ui.button('Start over', { dist: 'room', dir: -12, height: 'waist', onPress: restart });
  startBtn.visible = false;

  layersBtn = ui.button('Show layers', {
    dist: 'room', dir: 12, height: 'waist',
    onPress: () => {
      stage = 'layers'; layersOn = true; touched = false;
      guess.visible = false; layersBtn.visible = false;
      sandCyl.visible = false; sandPivot.visible = false; coneLabel.visible = false;
      layerN = Math.max(3, Math.min(MAXL, Math.round(slider.value)));
      slider.visible = true;
      cylLabel.visible = true;
      updateLayersUI();
    }
  });
  layersBtn.visible = false;

  slider = ui.slider({
    min: 3, max: MAXL, value: 8, step: 1,
    dist: 'near', dir: 'ahead', height: 'waist',
    onChange: v => {
      if (stage !== 'layers') return;
      v = Math.round(v);
      if (v === layerN) return;
      touched = true; layerN = v;
      updateLayersUI();
    }
  });
  slider.visible = false;
}

function frame(dt, t){
  if (stage !== 'pour') return;
  if (pourT > 0) pourT = Math.max(0, pourT - dt);

  // cone sand empties while the cylinder level rises
  let s = 1;
  if (pourT > 0.6) s = (pourT - 0.6) / 0.6;
  else if (full) s = 0;
  else if (pourT > 0) s = 1 - pourT / 0.6;
  sandPivot.scale.setScalar(Math.max(s, 0.001));
  sandPivot.visible = s > 0.02;

  level += (target - level) * Math.min(1, dt * 4);
  if (Math.abs(target - level) < 0.004) level = target;
  const h = level * HT;
  sandCyl.visible = h > 0.002;
  sandCyl.scale.set(R * 0.97, Math.max(h, 0.001), R * 0.97);
  sandCyl.position.y = h / 2;

  const pct = Math.round(level * 100);
  const key = poured + '|' + pct;
  if (key !== lastKey){
    lastKey = key;
    cylLabel.setText(poured === 0 ? 'Empty' : `Poured ${poured} · ${pct}% full`);
  }

  if (full && !revealed && pourT === 0 && level === target) reveal();
}

XR.run({ build, frame });
