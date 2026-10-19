const { THREE, scene, shape, place, interactive, tone, mat, sky, ground, ui, H, input } = XR;

// ONE scale for sizes AND distances: the Sun is a 22 cm ball. Everything else follows from real numbers (km).
const SUN_KM = 1391400, SUN_D = 0.22;
const KM_PER_M = SUN_KM / SUN_D;                 // 1 m in the room = 6.3 million km
const toM = km => km / KM_PER_M;
const AU = 149.6e6, LIGHT = 299792.458, EARTH_KM = 12742;
const ARRIVE = 1.8, START_Z = -2.2, MAG_R = 0.12;

const BODIES = [
  { name:'Mercury', a:57.9e6, dia:4879, col:0x9a9a9a, note:'The smallest planet. It has no moons.', moons:[] },
  { name:'Venus', a:108.2e6, dia:12104, col:0xe6c88a, note:'The hottest planet, under thick clouds. No moons.', moons:[] },
  { name:'Earth', a:149.6e6, dia:12742, col:0x3b7be0, note:'Home. The Moon is our only natural moon.',
    moons:[{ name:'The Moon', a:384400, r:1737.4, ph:35 }] },
  { name:'Mars', a:227.9e6, dia:6779, col:0xc1502e, note:'Red from rusty dust. Its two tiny moons are too small to show here.', moons:[] },
  { name:'Belt', belt:true, a:2.7 * AU },
  { name:'Jupiter', a:778.5e6, dia:142984, col:0xd9a066, note:'The biggest planet. These are its four largest moons.',
    moons:[{ name:'Io', a:421700, r:1821.6, ph:20 }, { name:'Europa', a:671100, r:1560.8, ph:150 },
           { name:'Ganymede', a:1070400, r:2634.1, ph:70 }, { name:'Callisto', a:1882700, r:2410.3, ph:215 }] },
  { name:'Saturn', a:1432e6, dia:120536, col:0xe3cf9a, ring:true, note:'Its rings are mostly water ice. Titan is its largest moon.',
    moons:[{ name:'Titan', a:1221900, r:2574.7, ph:40 }] },
  { name:'Uranus', a:2867e6, dia:51118, col:0x9fe0e3, note:'It spins tipped on its side. Titania is its largest moon.',
    moons:[{ name:'Titania', a:436300, r:788.9, ph:120 }] },
  { name:'Neptune', a:4495e6, dia:49528, col:0x3f5fd9, note:'The farthest planet; one year there lasts about 165 Earth years. Triton is its largest moon.',
    moons:[{ name:'Triton', a:354800, r:1353.4, ph:300 }] },
];
const GUESS = [0.5, 3, 25];     // metres: the three answers offered
const START_TEXT = 'Real-scale solar system\n' +
  'The Sun is the ' + Math.round(SUN_D * 100) + ' cm ball on your left. Sizes and distances all use one scale: 1 m = ' + (KM_PER_M / 1e6).toFixed(1) + ' million km.\n' +
  'First, a guess: Earth is a tiny grain at this scale. How far from the Sun is it? Point at an answer and click.';

const fmt = n => Math.round(n).toLocaleString('en-US');
const mkm = km => { const v = km / 1e6; return v >= 1000 ? fmt(v) : v.toFixed(1); };
const lenStr = m => m < 0.001 ? (m * 1000).toFixed(2) + ' mm' : m < 0.01 ? (m * 1000).toFixed(1) + ' mm'
  : m < 1 ? (m * 100).toFixed(1) + ' cm' : m.toFixed(1) + ' m';
const lightTime = km => { const s = Math.round(km / LIGHT); return s < 3600 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : (s / 3600).toFixed(1) + ' h'; };
const sunDeg = km => 2 * Math.atan((SUN_KM / 2) / km) * 180 / Math.PI;

let world, card, caption, guess, nav, startBtn;
let flying = false, fromZ = 0, toZ = 0, tFly = 0, dur = 1, target = -1, acc = 0, current = -1;
const visited = new Set();

function saturnRing(r, col) {
  const ring = shape.torus(r * 1.78, r * 0.54, col);     // inner ~1.24 r, outer ~2.32 r
  ring.scale.z = 0.03; ring.rotation.x = 1.0; ring.rotation.z = 0.3;
  return ring;
}

function build() {
  sky({ top:'black', bottom:'dark' });
  ground({ color:'dark', grid:false, arrow:false });
  input.teleport = 'none';

  // stars (decoration only)
  const sp = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.05 + Math.random() * 1.45;
    sp.push(40 * Math.cos(e) * Math.cos(a), 40 * Math.sin(e), 40 * Math.cos(e) * Math.sin(a));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:2, sizeAttenuation:false }));
  stars.frustumCulled = false; scene.add(stars);

  // rig sits to your left; the whole model slides along it when you "fly"
  const rig = shape.group(); rig.add(shape.hitball(0.01));
  place(rig, { dist:0.9, dir:-90, height:H.eye - 0.08, anchor:'center' });
  world = shape.group(); rig.add(world); world.position.z = START_Z;

  const sun = shape.ball(SUN_D / 2, 'yellow');
  sun.material = mat(0xffc12e, { emissive:0xffa000 });
  world.add(sun);

  BODIES.forEach(b => { b.d = toM(b.a); });
  const neptune = BODIES[BODIES.length - 1];

  // one dot per Sun-width, from the Sun out to Neptune: count them
  const nDots = Math.floor(neptune.d / SUN_D);
  const dp = new Float32Array(nDots * 3);
  for (let k = 0; k < nDots; k++) dp[k * 3 + 2] = -(k + 1) * SUN_D;
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dots = new THREE.Points(dg, new THREE.PointsMaterial({ color:0x5aa9ff, size:2, sizeAttenuation:false }));
  dots.frustumCulled = false; world.add(dots);

  // asteroid belt: 2,500 exaggerated stand-in dots between 2.2 and 3.2 AU
  const bp = [];
  for (let i = 0; i < 2500; i++) {
    const r = toM((2.2 + Math.random()) * AU), a = Math.random() * Math.PI * 2;
    bp.push(Math.cos(a) * r, (Math.random() - 0.5) * toM(0.3 * AU), Math.sin(a) * r);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  const belt = new THREE.Points(bg, new THREE.PointsMaterial({ color:0x9c9488, size:2.5, sizeAttenuation:false }));
  belt.frustumCulled = false; world.add(belt);

  // planets at true size and true distance
  BODIES.forEach(b => {
    if (b.belt) return;
    const g = shape.group(); g.position.set(0, 0, -b.d); world.add(g);
    const r = toM(b.dia) / 2;
    b.r = r;
    g.add(shape.ball(r, b.col));
    if (b.ring) g.add(saturnRing(r, b.col));
    b.locator = shape.torus(0.03, 0.0012, 'yellow'); b.locator.visible = false; g.add(b.locator);
    b.moonGroup = shape.group(); b.moonGroup.visible = false; g.add(b.moonGroup);
    b.moons.forEach(m => {
      const mg = shape.group(), d = toM(m.a), th = m.ph * Math.PI / 180;
      mg.position.set(d * Math.cos(th), d * Math.sin(th), 0);
      mg.add(shape.ball(toM(m.r), 0xc9c4bb));
      mg.add(shape.torus(0.012, 0.0007, 'teal'));
      mg.add(shape.hitball(0.02));
      b.moonGroup.add(mg);
      interactive(mg, { select: () => { caption.setText(moonText(b, m)); caption.visible = true; tone(520, 0.1, 'sine'); } });
    });
    // magnified copy at head size (fixed in front of you, right side)
    const mr = b.ring ? MAG_R / 2.32 : MAG_R;
    b.magx = mr / r;
    b.mag = shape.group();
    b.mag.add(shape.ball(mr, b.col));
    if (b.ring) b.mag.add(saturnRing(mr, b.col));
    place(b.mag, { dist:1.8, dir:27, height:1.62, anchor:'center' });
    b.mag.visible = false;
  });

  card = ui.sign(START_TEXT, { width:1.7, dist:'room', dir:'ahead', height:1.72 });
  caption = ui.sign(' ', { width:0.7, dist:1.8, dir:27, height:1.2 });
  caption.visible = false;

  guess = ui.choices(['About 50 cm', 'About 3 m', 'About 25 m'], { dist:'near', dir:'ahead', height:'waist', onPick:onGuess });
  nav = ui.choices(BODIES.map(b => b.name), { dist:'room', dir:'ahead', height:'waist',
    onPick:(i, t, row) => { row.reset(); fly(i); } });
  nav.visible = false;
  startBtn = ui.button('Start over', { dist:1.8, dir:27, height:'waist', onPress: reset });
  startBtn.visible = false;
}

function onGuess(i, t, row) {
  const real = BODIES[2].d;                                   // Earth's distance, in metres here
  let best = 0;
  GUESS.forEach((g, k) => { if (Math.abs(Math.log(g / real)) < Math.abs(Math.log(GUESS[best] / real))) best = k; });
  row.lock(); row.mark(best, 'right'); if (i !== best) row.mark(i, 'wrong');
  card.setText((i === best ? 'Right.' : 'Not quite.') + ' Earth is ' + real.toFixed(1) + ' m from the Sun\n' +
    '= ' + Math.round(real / SUN_D) + ' Sun-widths. Each blue dot on the line is one Sun-width. Earth itself is a ' + lenStr(toM(EARTH_KM)) + ' grain.\n' +
    'Pick a place below to fly there. (Planets are lined up for the trip; their distances from the Sun are real averages.)');
  nav.visible = true; startBtn.visible = true;
  tone(440, 0.12, 'sine');
}

function hideDetail() {
  BODIES.forEach(b => { if (b.locator) { b.locator.visible = false; b.moonGroup.visible = false; b.mag.visible = false; } });
  caption.visible = false;
}

function fly(i) {
  if (flying || i === current) return;
  hideDetail();
  target = i; fromZ = world.position.z; toZ = BODIES[i].d - ARRIVE;
  tFly = 0; acc = 0; dur = 2 + 1.2 * Math.log10(1 + Math.abs(toZ - fromZ));
  flying = true; current = -1;
  flyText(fromZ);
}

function flyText(z) {
  const b = BODIES[target];
  card.setText('Flying to ' + (b.belt ? 'the asteroid belt' : b.name) + '...\n' + mkm(Math.max(0, z) * KM_PER_M) + ' million km from the Sun');
}

function bodyText(b) {
  const sw = Math.round(b.d / SUN_D), deg = sunDeg(b.a);
  let s = b.name + '\n' +
    mkm(b.a) + ' million km from the Sun · light takes ' + lightTime(b.a) + '\n' +
    fmt(b.dia) + ' km across · from here the Sun looks ' + (deg >= 1 ? deg.toFixed(2) : deg.toFixed(3)) + '° wide\n' +
    b.note + '\n' +
    'Lesson: ' + b.name + ' is ' + fmt(sw) + ' Sun-widths from the Sun (' + b.d.toFixed(1) + ' m here) and only ' + lenStr(b.r * 2) + ' wide. Planets are specks in huge empty space.\n';
  s += b.moons.length ? 'Click a teal ring to meet a moon (distances real, spot on the orbit arbitrary). Or pick another place.' : 'Pick another place below.';
  if (visited.size === 8) s += '\nAll 8 planets visited: Neptune is ' + fmt(neptuneSW()) + ' Sun-widths out.';
  return s;
}
const neptuneSW = () => BODIES[BODIES.length - 1].d / SUN_D;

function beltText() {
  const ceres = toM(940);
  return 'Asteroid belt\n' +
    'Between Mars and Jupiter, about 2.2 to 3.2 AU from the Sun (' + Math.round(toM(2.2 * AU)) + ' to ' + Math.round(toM(3.2 * AU)) + ' m here).\n' +
    'These 2,500 grey dots are stand-ins, drawn far too big. There are about a million asteroids wider than 1 km.\n' +
    'Lesson: the biggest, Ceres (about 940 km), is only ' + lenStr(ceres) + ' wide here. The belt is mostly empty space.\n' +
    'Pick another place below.';
}

function moonText(b, m) {
  return m.name + '\n' + fmt(m.a) + ' km from ' + b.name + ' = ' + (m.a / b.dia).toFixed(1) + ' ' + b.name + '-widths; here ' + lenStr(toM(m.a)) +
    '\n' + fmt(m.r * 2) + ' km wide; here ' + lenStr(toM(m.r * 2));
}

function arrive(i) {
  const b = BODIES[i];
  current = i;
  if (b.belt) {
    card.setText(beltText());
    caption.setText('The grey dots around you are the belt, shown far larger than real asteroids.');
    caption.visible = true;
  } else {
    visited.add(i);
    b.locator.visible = true; b.moonGroup.visible = true; b.mag.visible = true;
    caption.setText('Magnified x' + Math.round(b.magx) + ' so you can see it.\nThe real ' + b.name + ' is the speck inside the yellow ring.');
    caption.visible = true;
    card.setText(bodyText(b));
  }
  tone(660, 0.15, 'sine');
}

function reset() {
  flying = false; current = -1; visited.clear();
  world.position.z = START_Z;
  hideDetail();
  guess.reset(); guess.visible = true; nav.visible = false; startBtn.visible = false;
  card.setText(START_TEXT);
}

function frame(dt, t) {
  if (!flying) return;
  tFly += dt;
  const u = Math.min(1, tFly / dur), e = u * u * (3 - 2 * u);
  const z = fromZ + (toZ - fromZ) * e;
  world.position.z = z;
  acc += dt;
  if (u < 1 && acc > 0.25) { acc = 0; flyText(z); }
  if (u >= 1) { flying = false; arrive(target); }
}

XR.run({ build, frame });
