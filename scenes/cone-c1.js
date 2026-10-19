const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

// Base size of the two vessels (metres). The sliders rescale these.
const R0 = 0.075, H0 = 0.20;
const POUR_SECONDS = 1.4;

let rCm = 7.5, hCm = 20;          // current radius and height in cm (set by the sliders)
let HC = 0.9;                      // counter height
let stage, cylG, coneG, cylLiq, coneLiq, stream, card;
const rings = [];
const homeP = new THREE.Vector3(), overP = new THREE.Vector3();

let state = 'guess';               // guess -> ready
let phase = 'idle', ph = 0, built = false;
let guessN = 0, pours = 0;
let vCyl = 1, vCone = 1, vIn = 0, vConeLeft = 1;   // volumes in m^3

const ease = x => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };

// Volume of the cone, measured by adding up thin round slices from the tip to the base.
function sliceVolume(r, h, n){
  let v = 0;
  for (let i = 0; i < n; i++){
    const y = (i + 0.5) / n * h;      // height above the tip
    const rad = r * y / h;            // radius of the slice at that height
    v += Math.PI * rad * rad * (h / n);
  }
  return v;
}

function sizeText(){ return 'r = ' + rCm.toFixed(1) + ' cm, h = ' + hCm.toFixed(0) + ' cm'; }
const RULES = 'Rules: cone and cylinder share r and h. One pour = one full cone. Sliders change r and h.';

function startText(){
  return 'Cone into cylinder\nSame base, same height. How many cones of liquid fill the cylinder?\nPoint at your guess and pull the trigger.\n' + RULES;
}
function readyText(){
  return 'Your guess: ' + guessN + ' cones\nPoint at Pour and pull the trigger.\n' + sizeText() + '\n' + RULES;
}

// Fill levels are computed from the volumes, never set by hand.
function paint(){
  const f = Math.min(vIn / vCyl, 1);
  cylLiq.visible = f > 0.001;
  cylLiq.scale.y = Math.max(f * H0, 0.0001);
  const s = Math.cbrt(Math.max(vConeLeft, 0) / vCone);   // liquid in the cone is a smaller copy of the cone
  coneLiq.visible = s > 0.001;
  coneLiq.scale.setScalar(Math.max(s, 0.0001));
}

function emptyCylinder(){
  vIn = 0; pours = 0;
  rings.forEach(r => { r.visible = false; });
  paint();
}

function sizesChanged(){
  const r = rCm / 100, h = hCm / 100;
  cylG.scale.set(r / R0, h / H0, r / R0);
  coneG.scale.set(r / R0, h / H0, r / R0);
  vCyl = Math.PI * r * r * h;
  vCone = sliceVolume(r, h, 400);
  homeP.set(-0.42, HC + 0.10, 0);
  overP.set(0.42, HC + h + 0.09, 0);
  phase = 'idle'; ph = 0;
  stream.visible = false;
  vConeLeft = vCone;
  coneG.position.copy(homeP);
  emptyCylinder();
}

function streamUpdate(){
  const yTip = coneG.position.y;
  const ySurf = HC + Math.min(vIn / vCyl, 1) * (hCm / 100);
  const L = Math.max(yTip - ySurf, 0.01);
  stream.position.set(coneG.position.x, ySurf + L / 2, 0);
  stream.scale.y = L;
}

// Called the moment one cone has finished pouring.
function poured(){
  pours++;
  const f = vIn / vCyl;
  const ring = rings[Math.min(pours - 1, rings.length - 1)];
  ring.position.y = f * H0;
  ring.visible = true;
  tone(500 + 110 * pours, 0.2, 'sine');
  if (vIn >= vCyl * 0.999){
    const k = vCyl / vCone;                 // how many cones fit in the cylinder
    const d = Math.round(k);
    const g = guessN === d ? 'You guessed ' + guessN + ': right.' : 'You guessed ' + guessN + '. It takes ' + d + '.';
    card.setText(k.toFixed(2) + ' cones fill the cylinder\n' + g +
      '\nSo one cone is 1/' + d + ' of the cylinder: V = 1/' + d + ' πr²h' +
      '\n' + sizeText() + '. Change r or h and pour again: still ' + d + '.');
    tone(784, 0.3, 'triangle'); tone(988, 0.4, 'triangle');
  } else {
    card.setText('Pour ' + pours + ': the cylinder is ' + Math.round(f * 100) + '% full\n' +
      (vIn / vCone).toFixed(2) + ' cones so far.\nPoint at Pour for the next cone.\n' + sizeText());
  }
}

function pourPressed(){
  if (state !== 'ready'){ tone(180, 0.15, 'square'); return; }
  if (phase !== 'idle') return;
  if (vIn >= vCyl * 0.999) emptyCylinder();
  phase = 'up'; ph = 0;
  tone(440, 0.1, 'sine');
}

function build(){
  sky({ top:'purple', bottom:'pink' });
  ground({ color:'teal', grid:false, arrow:false });
  HC = H.hip;

  stage = shape.group();
  const counter = shape.box(1.5, HC, 0.5, 'dark');
  counter.position.set(0, HC / 2, 0);
  stage.add(counter);

  const glassMat = (c, o) => mat(c, { opacity:o, transparent:true, depthWrite:false, side:THREE.DoubleSide });

  // Cylinder (right): glass can with the liquid inside it.
  cylG = shape.group();
  const cg = new THREE.CylinderGeometry(R0 * 1.04, R0 * 1.04, H0 + 0.01, 48);
  cg.translate(0, H0 / 2, 0);
  const cylGlass = new THREE.Mesh(cg, glassMat('blue', 0.28));
  cylGlass.renderOrder = 2;
  cylG.add(cylGlass);
  const lg = new THREE.CylinderGeometry(R0, R0, 1, 48);
  lg.translate(0, 0.5, 0);
  cylLiq = new THREE.Mesh(lg, mat('orange', {}));
  cylLiq.visible = false;
  cylG.add(cylLiq);
  for (let i = 0; i < 6; i++){
    const tg = new THREE.TorusGeometry(R0 * 1.06, 0.004, 8, 48);
    tg.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(tg, mat('white', {}));
    ring.visible = false;
    rings.push(ring);
    cylG.add(ring);
  }
  cylG.position.set(0.42, HC, 0);
  stage.add(cylG);

  // Cone (left): tip down, so it can pour out of its tip. Group origin = the tip.
  const pole = shape.cylinder(0.012, 0.10, 'grey');
  pole.position.set(-0.42, HC + 0.05, 0);
  stage.add(pole);
  coneG = shape.group();
  const kg = new THREE.ConeGeometry(R0, H0, 48);
  kg.rotateX(Math.PI);
  kg.translate(0, H0 / 2, 0);
  const coneGlass = new THREE.Mesh(kg, glassMat('purple', 0.3));
  coneGlass.scale.setScalar(1.04);
  coneGlass.renderOrder = 2;
  coneG.add(coneGlass);
  coneLiq = new THREE.Mesh(kg, mat('orange', {}));
  coneG.add(coneLiq);
  stage.add(coneG);

  stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), mat('orange', {}));
  stream.visible = false;
  stage.add(stream);

  sizesChanged();
  place(stage, { dist:'near', dir:'ahead', height:'floor', anchor:'bottom' });

  // Opening card: what this is, the rules, and the first thing to do.
  card = label(startText(), { dist:'room', dir:'ahead', height:'eye', width:1.5, size:'comfortable', theme:'dark', title:true, accent:'#f28b82' });

  // Guess first.
  ui.choices(['2 cones', '3 cones', '4 cones'], {
    dist:'near', dir:'ahead', height:'shoulder',
    onPick: (i, text, row) => {
      if (state !== 'guess') return;
      guessN = parseInt(text, 10);
      state = 'ready';
      row.lock();
      row.visible = false;
      card.setText(readyText());
      tone(600, 0.12, 'sine');
    }
  });

  // The one button.
  ui.button('Pour', { color:'orange', dist:'reach', dir:'ahead', height:'waist', onPress: pourPressed });

  // Change the size: the answer stays the same.
  const rS = ui.slider({ min:5, max:12, value:rCm, step:0.5, dist:'reach', dir:'ahead-left', height:'hip',
    onChange: v => { if (!built) return; rCm = v; sizesChanged(); if (state === 'ready') card.setText(readyText()); } });
  label('radius', { above: rS, size:'small' });
  const hS = ui.slider({ min:12, max:28, value:hCm, step:1, dist:'reach', dir:'ahead-right', height:'hip',
    onChange: v => { if (!built) return; hCm = v; sizesChanged(); if (state === 'ready') card.setText(readyText()); } });
  label('height', { above: hS, size:'small' });

  built = true;
}

function frame(dt, t){
  if (phase === 'idle') return;
  ph += dt;
  if (phase === 'up'){
    const e = ease(ph / 0.5);
    coneG.position.set(homeP.x, homeP.y + (overP.y - homeP.y) * e, 0);
    if (ph >= 0.5){ phase = 'slide'; ph = 0; }
  } else if (phase === 'slide'){
    const e = ease(ph / 0.6);
    coneG.position.set(homeP.x + (overP.x - homeP.x) * e, overP.y, 0);
    if (ph >= 0.6){ phase = 'pour'; ph = 0; stream.visible = true; tone(330, 0.15, 'triangle'); }
  } else if (phase === 'pour'){
    const dv = Math.min(vCone / POUR_SECONDS * dt, vConeLeft);
    vConeLeft -= dv; vIn += dv;
    paint(); streamUpdate();
    if (vConeLeft <= 1e-12){
      vConeLeft = 0; paint();
      stream.visible = false;
      poured();
      phase = 'hold'; ph = 0;
    }
  } else if (phase === 'hold'){
    if (ph >= 0.3){ phase = 'back'; ph = 0; }
  } else if (phase === 'back'){
    const e = ease(ph / 0.6);
    coneG.position.set(overP.x + (homeP.x - overP.x) * e, overP.y, 0);
    if (ph >= 0.6){ phase = 'down'; ph = 0; }
  } else if (phase === 'down'){
    const e = ease(ph / 0.6);
    coneG.position.set(homeP.x, overP.y + (homeP.y - overP.y) * e, 0);
    vConeLeft = vCone * e; paint();
    if (ph >= 0.6){ vConeLeft = vCone; paint(); phase = 'idle'; }
  }
}

XR.run({ build, frame });
