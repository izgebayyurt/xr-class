const { THREE, scene, shape, place, label, interactive, tone, mat, ground, ui, geo, H, C, stations } = XR;

// ---- The model (inputs, not results) ----
const N = 12, COST = 0.5, PMIN = 0.5, PMAX = 5;
const money = x => '$' + x.toFixed(2);
const snap = v => Math.round(v * 4) / 4;

// The most each shopper would pay for one cup (spread from cheap-minded to generous).
const limits = [];
for (let i = 0; i < N; i++) {
  const base = 0.8 + 3.7 * i / (N - 1);
  limits.push(Math.round((base + 0.25 * Math.sin(i * 2.7 + 1)) * 4) / 4);
}
limits.sort((a, b) => a - b);

// Everything shown is calculated from these two functions.
const buyersAt = p => limits.filter(l => l >= p - 1e-9).length;
const profitAt = p => buyersAt(p) * (p - COST);

// Which pattern does profit really follow as the price rises? (measured, not assumed)
const CHOICES = ['Always up', 'Up, then down', 'Always down'];
const grid = [];
for (let p = 0.5; p <= 5 + 1e-9; p += 0.5) grid.push(p);
const gridProfit = grid.map(profitAt);
const topIdx = gridProfit.indexOf(Math.max(...gridProfit));
const answerIdx = topIdx === gridProfit.length - 1 ? 0 : (topIdx === 0 ? 2 : 1);
let maxProfit = 0;
for (let p = PMIN; p <= PMAX + 1e-9; p += 0.05) maxProfit = Math.max(maxProfit, profitAt(p));

const INTRO = 'Lemonade stand\nYou sell lemonade; each cup costs you ' + money(COST) + ' to make. ' + N +
  ' shoppers each buy one cup if your price is at or below their limit (a simple model, not real data).\n' +
  'First, a guess: as you keep raising the price, what happens to your profit? Point at an answer below and click.';
const PLAY = 'Lemonade stand\nDrag the price slider. Green shoppers buy, grey ones walk away; point at a shopper to see their limit.\n' +
  'Find your best price, then push it higher and watch the profit.';

let card, stats, plot, legend, slider, sliderLbl, guess, again, boardLbl;
const customers = [];
let ready = false, best = null, lessonDone = false, guessIdx = -1, guessTxt = '', info = '';
let price = 1, cur = { sold: 0, prof: 0 };

function setShown(on) {
  stats.visible = on; plot.visible = on; legend.visible = on;
  slider.visible = on; sliderLbl.visible = on; again.visible = on;
}

function refreshStats() {
  stats.setText('Price: ' + money(price) + ' a cup\n' +
    cur.sold + ' of ' + N + ' shoppers buy, profit ' + money(cur.prof) + '\n' +
    'Best so far: ' + money(best ? best.profit : 0) + ' at ' + money(best ? best.price : price) + '\n' + info);
}

function inspect(c) {
  if (!ready) return;
  info = 'Shopper ' + c.n + ' would pay up to ' + money(c.limit) + ': ' + (c.limit >= price - 1e-9 ? 'buys' : 'walks away');
  refreshStats();
}

function update(v) {
  if (!ready) return;
  price = v;
  const sold = buyersAt(v), prof = profitAt(v);
  cur = { sold, prof };
  for (const c of customers) {
    const buys = c.limit >= v - 1e-9;
    c.body.material.color.setHex(buys ? C.green : C.grey);
    c.cup.visible = buys;
  }
  plot.mark(v);
  boardLbl.setText('LEMONADE\n' + money(v) + ' a cup');
  if (!lessonDone && best && v > best.price && prof < best.profit - 1e-9) {
    lessonDone = true;
    const gain = v - best.price;
    const verdict = guessIdx === answerIdx ? 'correct' : 'not quite';
    card.setText('Lemonade stand\nRaising the price from ' + money(best.price) + ' to ' + money(v) + ' earned ' + money(gain) +
      ' more per cup, but ' + (best.sold - sold) + ' fewer shoppers bought (' + best.sold + ' to ' + sold + '), so profit fell from ' +
      money(best.profit) + ' to ' + money(prof) + '.\n' +
      'You guessed "' + guessTxt + '": ' + verdict + '. Keep sliding, or press Start over.');
    tone(440, 0.25, 'triangle');
  } else if (!best || prof > best.profit) {
    best = { price: v, profit: prof, sold };
  }
  refreshStats();
}

function reveal() {
  ready = true; best = null; lessonDone = false;
  info = 'Point at a shopper to see their limit.';
  setShown(true);
  card.setText(PLAY);
  update(snap(slider.value || 1));
}

function build() {
  ground({ color: 'green', grid: false, arrow: false, radius: 12 });

  // Sun
  const sun = shape.ball(0.9, 'yellow');
  sun.material = mat(C.yellow, { emissive: C.yellow });
  place(sun, { dist: 'far', dir: -22, height: 4.6 });

  // Lemonade stand (built in its own local space, then placed once)
  const stand = shape.group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); stand.add(m); return m; };
  add(shape.box(4.4, 0.9, 1.0, 0xc98b4a), 0, 0.45, 0);
  for (let k = 0; k < 10; k++) {
    const x = -2.07 + k * 0.46;
    const col = k % 2 ? 'white' : 'yellow';
    add(shape.box(0.46, 0.08, 1.6, col), x, 2.95, 0.15);
    add(shape.box(0.46, 0.4, 0.06, col), x, 2.72, 0.95);
  }
  add(shape.cylinder(0.05, 2.9, 'white'), -2.15, 1.45, 0.8);
  add(shape.cylinder(0.05, 2.9, 'white'), 2.15, 1.45, 0.8);
  const lemon = add(shape.ball(0.45, 'yellow'), 0, 3.45, 0.15);
  lemon.scale.set(1.3, 1, 1);
  add(shape.cylinder(0.2, 0.5, 'yellow'), -1.3, 1.15, 0.1);
  for (let k = 0; k < 3; k++) add(shape.cylinder(0.06, 0.12, 'white'), -0.6 + k * 0.15, 0.96, 0.2);
  const board = add(shape.box(1.3, 0.8, 0.05, 'white'), 1.35, 1.3, 0.25);
  boardLbl = label('LEMONADE\nfresh and cold', { parent: board, at: [0, 0, 0.05], capHeight: 0.11, bg: false });
  place(stand, { dist: 'far', dir: 'ahead', height: 0, anchor: 'bottom' });

  // Shoppers: people-sized, gathered on both sides so the card and stand stay clear
  const slots = [];
  for (const s of [-1, 1]) {
    for (const [z, off] of [[-4.2, 0], [-5.0, 0.25]]) {
      for (const x of [2.0, 2.5, 3.0]) slots.push([s * (x + off), z]);
    }
  }
  slots.forEach(([x, z], i) => {
    const lim = limits[(i * 5) % N];
    const g = shape.group();
    const body = shape.cylinder(0.18, 1.45, 'blue');
    body.material = mat(C.blue);
    body.position.y = 0.725;
    const head = shape.ball(0.14, 0xf1c27d);
    head.position.y = 1.59;
    const cup = shape.cylinder(0.07, 0.16, 'yellow');
    cup.position.set(0.24, 1.0, 0.12);
    cup.visible = false;
    const hit = shape.hit(0.8, 1.9, 0.8);
    hit.position.y = 0.95;
    g.add(body); g.add(head); g.add(cup); g.add(hit);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
    const c = { n: i + 1, limit: lim, body, cup };
    customers.push(c);
    interactive(g, { select: () => inspect(c), hover: () => inspect(c) });
  });

  // Card: first thing to read
  card = ui.sign(INTRO, { width: 1.6, dist: 'room', dir: 'ahead', height: 'eye' });

  // Demand curve + profit curve (both computed from the shoppers' limits)
  const ymax = Math.max(N, Math.ceil(maxProfit + 1));
  plot = geo.plot(buyersAt, { xmin: PMIN, xmax: PMAX, ymin: 0, ymax: ymax, dist: 'room', dir: -32, height: 'chest' });
  plot.addCurve(profitAt, C.orange);
  legend = label('Across: price per cup ($).  Orange: your profit ($).  Other line: how many shoppers buy.',
    { above: plot, size: 'small', width: 2 });

  stats = ui.sign('Price\n-\n-\n-', { width: 1.4, dist: 'room', dir: 30, height: 'chest' });

  slider = ui.slider({ min: PMIN, max: PMAX, value: 1, step: 0.25, dist: 'near', dir: 'ahead', height: 'chest',
    onChange: v => update(snap(v)) });
  sliderLbl = label('Price per cup', { above: slider, size: 'small' });

  guess = ui.choices(CHOICES, { dist: 'near', dir: 'ahead', height: 'waist', onPick: (i, t, row) => {
    guessIdx = i; guessTxt = t;
    row.lock();
    guess.visible = false;
    tone(520, 0.1, 'sine');
    reveal();
  } });

  again = ui.button('Start over', { dist: 'near', dir: 'ahead-left', height: 'waist', onPress: () => {
    ready = false; best = null; lessonDone = false; guessIdx = -1;
    setShown(false);
    guess.reset();
    guess.visible = true;
    for (const c of customers) { c.body.material.color.setHex(C.blue); c.cup.visible = false; }
    boardLbl.setText('LEMONADE\nfresh and cold');
    card.setText(INTRO);
  } });

  setShown(false);
}

function frame(dt, t) {
}

XR.run({ build, frame });
