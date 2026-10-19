const { THREE, shape, place, label, interactive, tone, C, ui } = XR;

const NAMES  = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'high C'];
const RATIOS = [[1,1],[9,8],[5,4],[4,3],[3,2],[5,3],[15,8],[2,1]];   // exact ratios above C (just intonation)
const BASE = 261.63;                                                 // C4 in Hz
const freq = i => BASE * RATIOS[i][0] / RATIOS[i][1];
const gcd = (a, b) => b ? gcd(b, a % b) : a;

const XC = 8;        // cycles of the low note drawn
const N = 480;       // points per wave
const SPAN = 2.0;    // drawn width in metres

const INTRO = 'Do some notes just sound better together?\nOr is it only taste? Click any key to hear it, then pick your guess on the pads below.';

let keys = [], rowLabels = [], tr = {};
let card, guess, again, scope, back, marks, markPos, markGeo, markAttr;
let guessed = false, root = -1, done = false, seenSmooth = null, seenRough = null;

function pairRatio(lo, hi) {
  const a = RATIOS[hi][0] * RATIOS[lo][1];
  const b = RATIOS[hi][1] * RATIOS[lo][0];
  const g = gcd(a, b);
  return [a / g, b / g];            // high : low, in lowest terms
}

function paint(i, hex) { keys[i].material.color.setHex(hex); }
function clearPaint() { keys.forEach(k => k.material.color.setHex(C.white)); }

function makeTrace(hex, y) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i*3] = -SPAN/2 + SPAN * i / (N - 1); pos[i*3+2] = 0.02; }
  const attr = new THREE.BufferAttribute(pos, 3);
  g.setAttribute('position', attr);
  const m = new THREE.LineBasicMaterial({ color: hex });
  [-0.004, 0, 0.004].forEach(o => {            // three copies = a thicker line
    const l = new THREE.Line(g, m);
    l.position.y = y + o;
    l.frustumCulled = false;
    scope.add(l);
  });
  return { pos, attr };
}

function drawTrace(t, fn, amp) {
  for (let i = 0; i < N; i++) t.pos[i*3+1] = fn(XC * i / (N - 1)) * amp;
  t.attr.needsUpdate = true;
}

function setMarks(b) {
  let n = 0;
  for (let k = 0; k * b <= XC; k++) {
    const x = -SPAN/2 + SPAN * (k * b) / XC;
    markPos.set([x, -0.36, 0.01, x, 0.36, 0.01], n * 6);
    n++;
  }
  markGeo.setDrawRange(0, n * 2);
  markAttr.needsUpdate = true;
}

function press(i) {
  if (!guessed) { tone(freq(i), 1.0, 'sine'); return; }

  if (root < 0 || done) {                       // first key of a pair
    clearPaint();
    scope.visible = false;
    done = false;
    root = i;
    paint(i, C.yellow);
    tone(freq(i), 1.0, 'sine');
    card.setText('First key: ' + NAMES[i] + '\nNow click a second key to hear the two together.');
    return;
  }

  const lo = Math.min(root, i), hi = Math.max(root, i);
  const [a, b] = pairRatio(lo, hi);
  const f1 = freq(lo), f2 = freq(hi);
  const r = a / b;

  tone(f1, 1.6, 'sine');
  tone(f2, 1.6, 'sine');
  clearPaint();
  paint(lo, C.blue);
  paint(hi, C.orange);

  drawTrace(tr.low,  x => Math.sin(2 * Math.PI * x), 0.1);
  drawTrace(tr.high, x => Math.sin(2 * Math.PI * r * x), 0.1);
  drawTrace(tr.sum,  x => Math.sin(2 * Math.PI * x) + Math.sin(2 * Math.PI * r * x), 0.05);
  setMarks(b);
  rowLabels[0].setText(NAMES[lo] + '  ' + Math.round(f1) + ' Hz');
  rowLabels[1].setText(NAMES[hi] + '  ' + Math.round(f2) + ' Hz');
  scope.visible = true;

  if (lo !== hi) {
    if (b <= 4) seenSmooth = { a, b };
    else if (b >= 8) seenRough = { a, b };
  }

  const cyc = b === 1 ? 'cycle' : 'cycles';
  let verdict;
  if (b <= 4) verdict = 'Simple ratio: the waves line up often, so it sounds smooth.';
  else if (b >= 8) verdict = 'Complex ratio: the waves rarely line up, so it sounds rough.';
  else verdict = 'In between: the waves line up, but not often.';

  let cmp = '';
  if (seenSmooth && seenRough) {
    cmp = '\nCompare ' + seenSmooth.a + ':' + seenSmooth.b + ' (lines up every ' + seenSmooth.b + ') with ' +
          seenRough.a + ':' + seenRough.b + ' (every ' + seenRough.b + '). The simpler ratio sounds smoother, so part of it is physics, not just taste.';
  }

  done = true;
  card.setText(NAMES[lo] + ' + ' + NAMES[hi] + ':  ' + a + ':' + b +
    '\n' + Math.round(f2) + ' Hz to ' + Math.round(f1) + ' Hz. The waves line up every ' + b + ' ' + cyc + ' of the low note (white lines).' +
    '\n' + verdict + cmp +
    '\nClick any key to start a new pair.');
}

function reset() {
  guessed = false; root = -1; done = false; seenSmooth = null; seenRough = null;
  clearPaint();
  scope.visible = false;
  guess.reset();
  guess.visible = true;
  again.visible = false;
  card.setText(INTRO);
}

function build() {
  // giant keys, standing up from the floor in an arc
  for (let i = 0; i < 8; i++) {
    const k = shape.box(0.26, 1.0, 0.3, 'white');
    place(k, { dist: 'room', dir: (i - 3.5) * 6.5, height: 0.001, anchor: 'bottom', face: true });
    interactive(k, { select: () => press(i) });
    keys.push(k);
    label(NAMES[i], { above: k, size: 'comfortable' });
  }

  // wave scope (hidden until a pair is played)
  scope = shape.group();
  back = shape.panel(2.4, 1.0, 'dark');
  scope.add(back);
  tr.low  = makeTrace(C.blue,   0.3);
  tr.high = makeTrace(C.orange, 0.0);
  tr.sum  = makeTrace(C.white, -0.3);

  markPos = new Float32Array(9 * 2 * 3);
  markGeo = new THREE.BufferGeometry();
  markAttr = new THREE.BufferAttribute(markPos, 3);
  markGeo.setAttribute('position', markAttr);
  const markMat = new THREE.LineBasicMaterial({ color: C.teal });
  marks = new THREE.LineSegments(markGeo, markMat);
  marks.frustumCulled = false;
  scope.add(marks);
  const marks2 = new THREE.LineSegments(markGeo, markMat);
  marks2.position.x = 0.004;
  marks2.frustumCulled = false;
  scope.add(marks2);

  rowLabels.push(label('low', { parent: back, at: [-0.65, 0.46, 0.03], capHeight: 0.055, bg: false }));
  rowLabels.push(label('high', { parent: back, at: [-0.65, 0.16, 0.03], capHeight: 0.055, bg: false }));
  label('both together', { parent: back, at: [-0.65, -0.14, 0.03], capHeight: 0.055, bg: false });
  label('Waves drawn from the two frequencies (a model)', { parent: back, at: [0, -0.46, 0.03], capHeight: 0.045, bg: false });

  place(scope, { dist: 'room', dir: 'ahead', height: 2.4, anchor: 'center' });
  scope.visible = false;

  // opening card
  card = ui.sign(INTRO, { width: 1.8, dist: 'room', dir: 'ahead', height: 'eye' });

  // guess first
  guess = ui.choices(['Just taste', 'Learned habit', 'Sound waves'], {
    dist: 'near', dir: 'ahead', height: 'chest',
    onPick: (i, t, row) => {
      guessed = true;
      row.lock();
      guess.visible = false;
      again.visible = true;
      card.setText('Test it with waves\nYou guessed: ' + t + '. Click a first key, then a second one: you will hear both and see their waves.\nTry C then G, then F then B.');
    }
  });

  again = ui.button('Start over', { dist: 'near', dir: 'ahead-left', height: 'waist', onPress: reset });
  again.visible = false;
}

function frame(dt, t) {
}

XR.run({ build, frame });
