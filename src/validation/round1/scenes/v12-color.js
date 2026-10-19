const { THREE, place, label, interactive, sky, ground, ui } = XR;

const LAMPS = [
  { name:'red',   light:[1,0,0], paint:[0.85,0.12,0.10], cx:0.37, cy:0.46, lx:0.25, ly:0.36 },
  { name:'green', light:[0,1,0], paint:[0.15,0.65,0.20], cx:0.63, cy:0.46, lx:0.75, ly:0.36 },
  { name:'blue',  light:[0,0,1], paint:[0.10,0.20,0.80], cx:0.50, cy:0.68, lx:0.50, ly:0.84 }
];
const RAD = 0.2, N = 200, SIZE = 0.9, SHORT = ['R', 'G', 'B'];
const START_TEXT = 'Mixing light vs paint\nA red lamp and a green lamp shine on the same spot.\nWhat colour is the overlap? Point at your guess and click.';
const lv = [1, 1, 0];                       // lamp / pigment amounts, set by the sliders
let mode = 'light', step = 0, ready = false, lastProbe = [0.5, 0.46];

// ---- colour model (everything shown is computed from lv and these rules) ----
function mixInto(out, m, a){
  if (m === 'light') {                      // light ADDS
    out[0] = 0; out[1] = 0; out[2] = 0;
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) out[k] += LAMPS[i].light[k] * a[i];
    for (let k = 0; k < 3; k++) out[k] = Math.min(1, out[k]);
  } else {                                  // paint SUBTRACTS: each pigment keeps a share of the light
    out[0] = 0.96; out[1] = 0.95; out[2] = 0.92;
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) out[k] *= 1 - a[i] * (1 - LAMPS[i].paint[k]);
  }
}
function lum(c){ return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; }
function colourName(c){
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn;
  const v = mx, s = mx > 0 ? d / mx : 0;
  if (v < 0.06) return 'black';
  if (s < 0.18) return v > 0.85 ? 'white' : (v > 0.5 ? 'grey' : 'dark grey');
  let h;
  if (mx === c[0]) h = 60 * (((c[1] - c[2]) / d) % 6);
  else if (mx === c[1]) h = 60 * ((c[2] - c[0]) / d + 2);
  else h = 60 * ((c[0] - c[1]) / d + 4);
  if (h < 0) h += 360;
  if (h >= 15 && h < 70 && v < 0.55) return 'brown';
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'cyan';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}
function cover(i, u, v){
  const L = LAMPS[i];
  const d = Math.hypot(u - L.cx, v - L.cy);
  return Math.min(1, Math.max(0, (RAD - d) / 0.008));
}

function build(){
  sky({ top:'black', bottom:'black' });
  ground({ color:'dark', grid:false, arrow:false });

  // ---- card ----
  const card = ui.sign(START_TEXT, { width:1.5, dist:'room', dir:'ahead', height:'eye' });

  // ---- the screen: a canvas painted pixel by pixel from the mixing rules ----
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  place(screen, { dist:'room', dir:22, height:'chest', anchor:'center', face:true });
  const titleLbl = label('LIGHT on a dark wall', { parent: screen, at:[0, 0.34, 0.03], capHeight: 0.045, bg:false });

  const a = [0, 0, 0], c = [0, 0, 0], t2 = [0, 0, 0];
  function draw(){
    const data = img.data;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N, v = (y + 0.5) / N;
        for (let i = 0; i < 3; i++) a[i] = cover(i, u, v) * lv[i];
        mixInto(c, mode, a);
        const idx = (y * N + x) * 4;
        data[idx] = c[0] * 255; data[idx + 1] = c[1] * 255; data[idx + 2] = c[2] * 255; data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      ctx.strokeText(SHORT[i], LAMPS[i].lx * N, LAMPS[i].ly * N);
      ctx.fillText(SHORT[i], LAMPS[i].lx * N, LAMPS[i].ly * N);
    }
    tex.needsUpdate = true;
  }

  // ---- probe: click a spot, the card shows the sum/product behind its colour ----
  function probeAt(u, v, prefix){
    lastProbe = [u, v];
    const parts = [];
    for (let i = 0; i < 3; i++) { a[i] = cover(i, u, v) * lv[i]; if (a[i] > 0.02) parts.push(i); }
    const lines = ['Mixing light vs paint'];
    if (prefix) lines.push(prefix);
    if (!parts.length) {
      lines.push(mode === 'light' ? 'No light reaches this spot, so it is dark.' : 'Bare white paper.');
      lines.push(mode === 'light' ? 'Click an overlap, move a slider, or press Show paint.' : 'Click an overlap, or press Show light.');
      card.setText(lines.join('\n'));
      return;
    }
    mixInto(c, mode, a);
    if (mode === 'light') {
      lines.push(parts.map(i => LAMPS[i].name + ' ' + a[i].toFixed(2)).join(' + ') +
        '  =  R ' + c[0].toFixed(2) + '  G ' + c[1].toFixed(2) + '  B ' + c[2].toFixed(2) + '  =  ' + colourName(c));
    } else {
      lines.push(parts.map(i => LAMPS[i].name + ' paint').join(' x ') + '  =  ' + colourName(c));
    }
    if (parts.length >= 2) {
      const singles = parts.map(i => { const s = [0, 0, 0]; s[i] = a[i]; mixInto(t2, mode, s); return lum(t2); });
      const here = lum(c);
      const other = [0, 0, 0];
      mixInto(other, mode === 'light' ? 'paint' : 'light', a);
      if (mode === 'light') {
        lines.push((here > Math.max.apply(null, singles) + 0.02 ? 'Light adds: the overlap is brighter than either lamp alone.' : 'Light adds, so overlaps only get brighter.') +
          ' As paint this overlap would be ' + colourName(other) + '.');
      } else {
        lines.push((here < Math.min.apply(null, singles) - 0.02 ? 'Paint subtracts: each pigment absorbs light, so the mix is darker than either paint.' : 'Paint subtracts light, so mixes get darker.') +
          ' As light this overlap is ' + colourName(other) + '.');
      }
    } else {
      lines.push('Click where two circles overlap.');
    }
    lines.push(mode === 'light' ? 'Click a spot, move a slider, or press Show paint.' : 'Click a spot, or press Show light.');
    card.setText(lines.join('\n'));
  }

  interactive(screen, {
    hover(){}, unhover(){},
    select(o, e){
      if (step !== 1 || !e || !e.point) return;
      screen.updateMatrixWorld(true);
      const p = screen.worldToLocal(e.point.clone());
      probeAt(p.x / SIZE + 0.5, 0.5 - p.y / SIZE);
    }
  });

  // ---- sliders (left) with labels made once ----
  const sliders = [], slabels = [];
  const heights = ['eye', 'chest', 'waist'];
  function labelText(i){
    return LAMPS[i].name.charAt(0).toUpperCase() + LAMPS[i].name.slice(1) + (mode === 'light' ? ' light ' : ' paint ') + lv[i].toFixed(2);
  }
  function refreshLabels(){ for (let i = 0; i < 3; i++) slabels[i].setText(labelText(i)); }
  for (let i = 0; i < 3; i++) {
    const idx = i;
    const s = ui.slider({ min:0, max:1, value:lv[i], step:0.05, dist:1.8, dir:-26, height:heights[i],
      onChange: v => {
        lv[idx] = v;
        if (!ready) return;
        refreshLabels();
        draw();
        if (step === 1) probeAt(lastProbe[0], lastProbe[1]);
      } });
    sliders.push(s);
    slabels.push(label(labelText(i), { above: s, size:'small' }));
  }

  // ---- mode buttons ----
  function setMode(m){
    mode = m;
    titleLbl.setText(m === 'light' ? 'LIGHT on a dark wall' : 'PAINT on white paper (a model)');
    btnPaint.visible = (m === 'light');
    btnLight.visible = (m === 'paint');
    refreshLabels();
    draw();
    probeAt(0.5, 0.46, m === 'paint' ? 'Model: each pigment keeps a share of the light and absorbs the rest.' : '');
  }
  const btnPaint = ui.button('Show paint', { dist:'near', dir:0, height:'waist', onPress: () => { if (step === 1) setMode('paint'); } });
  const btnLight = ui.button('Show light', { dist:'near', dir:0, height:'waist', onPress: () => { if (step === 1) setMode('light'); } });
  const again = ui.button('Start over', { dist:'near', dir:24, height:'waist', onPress: () => {
    step = 0; mode = 'light';
    titleLbl.setText('LIGHT on a dark wall');
    draw();
    screen.visible = false;
    sliders.forEach(s => { s.visible = false; });
    slabels.forEach(l => { l.visible = false; });
    btnPaint.visible = false; btnLight.visible = false; again.visible = false;
    guess.reset(); guess.visible = true;
    card.setText(START_TEXT);
  } });

  // ---- the guess ----
  const options = [
    { text:'Brown',  rgb:[0.45, 0.27, 0.10] },
    { text:'Yellow', rgb:[1, 1, 0] },
    { text:'White',  rgb:[1, 1, 1] }
  ];
  const guess = ui.choices(options.map(o => o.text), { dist:'near', dir:'ahead', height:'waist', onPick: (i, text, row) => {
    row.lock();
    step = 1;
    guess.visible = false;
    screen.visible = true;
    sliders.forEach(s => { s.visible = true; });
    slabels.forEach(l => { l.visible = true; });
    btnPaint.visible = true; btnLight.visible = false; again.visible = true;
    mode = 'light';
    titleLbl.setText('LIGHT on a dark wall');
    refreshLabels();
    draw();
    probeAt(0.5, 0.46, 'You guessed ' + text + '.');
  } });

  // start state: only the card and the guess are visible
  screen.visible = false;
  sliders.forEach(s => { s.visible = false; });
  slabels.forEach(l => { l.visible = false; });
  btnPaint.visible = false; btnLight.visible = false; again.visible = false;
  draw();
  ready = true;
}

function frame(dt, t){
}

XR.run({ build, frame });
