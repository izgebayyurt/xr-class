const { THREE, scene, shape, place, label, interactive, tone, mat, sky, ground, ui, geo, template, H, C, input, onButton, stations } = XR;

const TITLE = 'Two dice, one sum';
const COLW = 0.095, BH = 0.065, HB = BH * 6;
const START_AT = 30;                       // rolls before the "ways" blocks appear

// All 36 ways two dice can land, grouped by sum (computed, not typed in)
const combos = Array.from({ length: 11 }, () => []);
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) combos[a + b - 2].push([a, b]);
const ways = combos.map(c => c.length);
const best = ways.indexOf(Math.max(...ways)) + 2;
const colX = i => (i - 5) * COLW;

const GUESS_TEXT = ['all sums equally likely', 'a sum of 2', 'a sum of 7', 'a sum of 12'];
const GUESS_SUM = [null, 2, 7, 12];

let phase = 0;                             // 0 guess, 1 rolling, 2 ways revealed
let N = 0, sel = -1, guessIdx = -1, anim = null;
const counts = new Array(11).fill(0);
const lastCount = new Array(11).fill(-1);
let card, guess, dice, dieA, dieB, numA, numB, diceLbl;
let tally, waysChart, tallyTitle, tallyNote;
const btns = [], bars = [], marks = [], countLbls = [], waysBlocks = [];

const d6 = () => 1 + Math.floor(Math.random() * 6);
const pct = x => (x * 100).toFixed(1) + '%';
const plural = n => (n > 1 ? 'ways' : 'way');
const say = s => card.setText(TITLE + '\n' + s);

function makeChart(dir) {
  const g = shape.group();
  const base = shape.box(COLW * 11, 0.01, 0.04, 'grey');
  base.position.y = 0.005;
  g.add(base);
  place(g, { dist: 'room', dir, height: 'waist', anchor: 'bottom', face: true });
  return g;
}

function updateCard() {
  if (phase === 0) {
    say('Roll two dice and add them up. Which sum comes up most often?\nPoint at a guess and click.');
    return;
  }
  if (phase === 1) {
    say(`Your guess: ${GUESS_TEXT[guessIdx]}.\nClick Roll 1, then Roll 100. (Computer model: each die gives 1-6 with equal chance.)\nRolls so far: ${N}`);
    return;
  }
  if (sel < 0) {
    let top = 0, low = 0;
    counts.forEach((c, i) => { if (c > counts[top]) top = i; if (c < counts[low]) low = i; });
    say(`After ${N} rolls the most common sum is ${top + 2} (${counts[top]} times); the rarest is ${low + 2} (${counts[low]}).\nWhy? Each block is one way the dice can land (red + blue). Click a column of blocks.`);
    return;
  }
  const i = sel - 2, w = ways[i];
  const list = combos[i].map(p => p[0] + '+' + p[1]).join(', ');
  let lesson;
  if (sel === best) {
    let extra;
    if (guessIdx === 0) extra = ' So the sums are not equally likely.';
    else if (GUESS_SUM[guessIdx] === best) extra = ' You guessed it.';
    else {
      const g = GUESS_SUM[guessIdx];
      extra = ` Your guess, ${g}, has only ${ways[g - 2]} ${plural(ways[g - 2])}.`;
    }
    lesson = `More ways means more rolls: ${best} has the most ways (${w} of 36), so it comes up most.` + extra;
  } else {
    const r = ways[best - 2] / w;
    lesson = `${sel} has ${w} ${plural(w)}, ${best} has ${ways[best - 2]}: expect ${best} about ${+r.toFixed(1)}x as often.`;
  }
  say(`Sum ${sel}: ${w} of 36 ways (${pct(w / 36)}): ${list}\nYour rolls: ${counts[i]} of ${N} (${pct(N ? counts[i] / N : 0)}).\n${lesson}`);
}

function refresh() {
  const expected = ways.map(w => N * w / 36);
  const maxVal = Math.max(5, ...counts, ...(phase === 2 ? expected : [0]));
  for (let i = 0; i < 11; i++) {
    const h = Math.max(0.003, counts[i] / maxVal * HB);
    bars[i].scale.y = h;
    bars[i].position.y = h / 2 + 0.01;
    if (lastCount[i] !== counts[i]) { countLbls[i].setText(String(counts[i])); lastCount[i] = counts[i]; }
    marks[i].position.y = expected[i] / maxVal * HB + 0.01;
    marks[i].visible = phase === 2 && N > 0;
  }
  tallyTitle.setText('Your rolls: ' + N);
  tallyNote.visible = phase === 2;
  updateCard();
}

function setStage() {
  const playing = phase >= 1;
  guess.visible = !playing;
  dice.visible = playing;
  diceLbl.visible = playing;
  tally.visible = playing;
  waysChart.visible = phase === 2;
  btns.forEach(b => { b.visible = playing; });
}

function recolor() {
  for (let i = 0; i < 11; i++) {
    const c = (i + 2 === sel) ? C.orange : C.teal;
    bars[i].material.color.setHex(c);
    waysBlocks[i].forEach(b => b.material.color.setHex(c));
  }
}

function pickSum(s) {
  if (phase !== 2) return;
  sel = s;
  recolor();
  tone(400 + s * 30, 0.12, 'sine');
  updateCard();
}

function record(a, b) { counts[a + b - 2]++; N++; }

function showDice(a, b) {
  numA.setText(String(a));
  numB.setText(String(b));
  numA.visible = true;
  numB.visible = true;
  diceLbl.setText(`${a} + ${b} = ${a + b}`);
}

function afterRolls() {
  if (phase === 1 && N >= START_AT) phase = 2;
  setStage();
  refresh();
}

function rollMany(n) {
  if (phase < 1 || anim) return;
  let a = 1, b = 1;
  for (let k = 0; k < n; k++) { a = d6(); b = d6(); record(a, b); }
  showDice(a, b);
  tone(300, 0.06, 'square');
  afterRolls();
}

function rollOne() {
  if (phase < 1 || anim) return;
  anim = { t: 0, a: d6(), b: d6() };
  numA.visible = false;
  numB.visible = false;
  diceLbl.setText('rolling...');
  tone(200, 0.15, 'square');
}

function startOver() {
  if (phase === 0) return;
  anim = null;
  dieA.rotation.set(0, 0, 0);
  dieB.rotation.set(0, 0, 0);
  counts.fill(0);
  N = 0; sel = -1; phase = 0; guessIdx = -1;
  numA.setText('?'); numB.setText('?');
  numA.visible = true; numB.visible = true;
  diceLbl.setText('Roll the dice');
  recolor();
  guess.reset();
  setStage();
  refresh();
}

function build() {
  sky({ top: 'black', bottom: 'dark' });
  ground({ color: 'dark', grid: false, arrow: false });

  card = ui.sign(TITLE + '\nloading', { width: 1.1, dist: 'room', dir: 'ahead', height: 'eye' });

  guess = ui.choices(['All equal', 'Sum 2', 'Sum 7', 'Sum 12'], {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, t, row) => {
      if (phase !== 0) return;
      guessIdx = i;
      row.lock();
      phase = 1;
      tone(520, 0.1, 'sine');
      setStage();
      refresh();
    }
  });

  // the two dice (red + blue so the pairs can be told apart)
  dieA = shape.box(0.13, 0.13, 0.13, 'red');
  dieA.position.x = -0.1;
  dieB = shape.box(0.13, 0.13, 0.13, 'blue');
  dieB.position.x = 0.1;
  dice = shape.group();
  dice.add(dieA);
  dice.add(dieB);
  place(dice, { dist: 'near', dir: 'ahead', height: 'chest', anchor: 'center' });
  numA = label('?', { parent: dieA, at: [0, 0, 0.1], capHeight: 0.07, bg: false });
  numB = label('?', { parent: dieB, at: [0, 0, 0.1], capHeight: 0.07, bg: false });
  diceLbl = label('Roll the dice', { above: dice });

  // left: what your rolls produced.  right: the ways each sum can happen.
  tally = makeChart(-23);
  waysChart = makeChart(23);

  for (let i = 0; i < 11; i++) {
    const s = i + 2, x = colX(i);

    label(String(s), { parent: tally, at: [x, -0.04, 0.03], capHeight: 0.035, bg: false });
    label(String(s), { parent: waysChart, at: [x, -0.04, 0.03], capHeight: 0.035, bg: false });

    const bar = shape.box(COLW - 0.01, 1, 0.03, 'teal');
    bar.material = bar.material.clone();
    bar.position.set(x, 0.0115, 0.02);
    bar.scale.y = 0.003;
    tally.add(bar);
    bars.push(bar);

    const mk = shape.box(COLW, 0.008, 0.045, 'white');
    mk.position.set(x, 0.01, 0.02);
    mk.visible = false;
    tally.add(mk);
    marks.push(mk);

    countLbls.push(label('0', { parent: tally, at: [x, HB + 0.04, 0.03], capHeight: 0.035, bg: false }));

    waysBlocks[i] = combos[i].map((p, j) => {
      const blk = shape.box(COLW - 0.01, BH - 0.006, 0.02, 'teal');
      blk.material = blk.material.clone();
      blk.position.set(x, 0.01 + (j + 0.5) * BH, 0.015);
      waysChart.add(blk);
      label(p[0] + '+' + p[1], { parent: blk, at: [0, 0, 0.04], capHeight: 0.028, bg: false });
      return blk;
    });
    label(String(ways[i]), { parent: waysChart, at: [x, HB + 0.04, 0.03], capHeight: 0.035, bg: false });

    const hit = shape.hit(COLW, HB + 0.05, 0.06);
    hit.position.set(x, (HB + 0.05) / 2, 0.02);
    waysChart.add(hit);
    interactive(hit, { select: () => pickSum(s) });
  }

  tallyTitle = label('Your rolls: 0', { parent: tally, at: [0, HB + 0.11, 0.03], capHeight: 0.04, bg: false });
  tallyNote = label('white line = expected from the ways', { parent: tally, at: [0, -0.1, 0.03], capHeight: 0.03, bg: false });
  label('Ways to make each sum (of 36)', { parent: waysChart, at: [0, HB + 0.11, 0.03], capHeight: 0.04, bg: false });

  const mkBtn = (txt, dir, color, fn) => {
    const b = ui.button(txt, { dist: 'near', dir, height: 'waist', color, onPress: fn });
    btns.push(b);
    return b;
  };
  mkBtn('Roll 1', -27, 'teal', rollOne);
  mkBtn('Roll 100', -9, 'teal', () => rollMany(100));
  mkBtn('Roll 1000', 9, 'teal', () => rollMany(1000));
  mkBtn('Start over', 27, 'grey', startOver);

  recolor();
  setStage();
  refresh();
}

function frame(dt, t) {
  if (!anim) return;
  anim.t += dt;
  dieA.rotation.x += dt * 14;
  dieA.rotation.y += dt * 9;
  dieB.rotation.x -= dt * 11;
  dieB.rotation.z += dt * 12;
  if (anim.t >= 0.7) {
    dieA.rotation.set(0, 0, 0);
    dieB.rotation.set(0, 0, 0);
    const { a, b } = anim;
    anim = null;
    record(a, b);
    showDice(a, b);
    afterRolls();
  }
}

XR.run({ build, frame });
