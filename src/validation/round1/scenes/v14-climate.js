const { THREE, scene, shape, place, interactive, mat, ui, C } = XR;

const COLS = 8, ROWS = 6, N = COLS * ROWS;
const PITCH = 0.2;              // model size of one city block (m)
const S = 0.025;                // scale: 1 m of sea level = 2.5 cm in the model
const QUESTION_LEVEL = 4;       // the rise we ask the visitor to guess about
const BLUE = (C && C.blue) || 0x2f6fd0;

const hash = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };

const lots = [];
let water, card, info, result, guess, slider, again;
let level = 0, revealed = false;

const START_CARD = 'Rising sea, model city\nIf the sea rose 4 m, how many of these 48 buildings would flood?\nPoint at a guess below and click.';
const START_INFO = 'Scale model with invented land heights (1 m of sea = 2.5 cm).\nRule: a building floods when the sea is as high as its ground.\nClick a block to read its ground height.';

const count = L => lots.filter(l => l.elev <= L).length;

function setWater(L) {
  const h = (1 + L) * S;
  water.scale.y = h;
  water.position.y = h / 2;
}

function apply(L) {
  level = L;
  setWater(L);
  for (const l of lots) {
    const wet = l.elev <= L;
    l.bld.material.color.setHex(wet ? C.red : C.white);
    l.land.material.color.setHex(wet ? C.teal : C.green);
  }
  const n = count(L), prev = count(L - 1);
  let txt = 'Sea level +' + L.toFixed(1) + ' m\n' + n + ' of ' + N + ' buildings flooded (' + Math.round(100 * n / N) + '%)';
  if (L >= 1) txt += '\nThe last metre alone flooded ' + (n - prev) + ' of them.';
  result.setText(txt);
}

function build() {
  const W = COLS * PITCH, D = ROWS * PITCH;
  const city = shape.group();

  // Land rises away from the sea (row 0 is at the shore). Heights are computed once from a fixed rule.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const elev = Math.round((0.4 + r * 1.3 + hash(r, c) * 1.2) * 10) / 10;   // metres above today's sea
      const x = -W / 2 + (c + 0.5) * PITCH;
      const z = D / 2 - (r + 0.5) * PITCH;
      const topY = (1 + elev) * S;
      const land = shape.box(PITCH * 0.94, topY, PITCH * 0.94, C.green);
      land.position.set(x, topY / 2, z);
      const bh = 0.07 + hash(c + 3, r + 7) * 0.1;
      const bw = 0.11 + hash(r + 5, c + 1) * 0.04;
      const bld = shape.box(bw, bh, bw, C.white);
      bld.position.set(x, topY + bh / 2, z);
      city.add(land);
      city.add(bld);
      lots.push({ r, c, elev, land, bld });
    }
  }

  // The sea: a translucent block whose height is (1 + level) * S, so it starts at today's sea level.
  water = shape.box(W + 0.3, 1, D + 0.7, BLUE);
  water.material = mat(BLUE, { opacity: 0.5, transparent: true, depthWrite: false });
  water.position.z = 0.35;
  city.add(water);
  setWater(0);

  place(city, { dist: 'room', dir: 'ahead', height: 'waist', anchor: 'bottom' });

  // Card: first thing visible.
  card = ui.sign(START_CARD, { dist: 'room', dir: 'ahead', height: 'eye', width: 1.4 });

  // Side signs.
  info = ui.sign(START_INFO, { dist: 'room', dir: -35, height: 'chest', width: 0.9 });
  result = ui.sign('', { dist: 'room', dir: 35, height: 'chest', width: 0.9 });
  result.visible = false;

  // Inspect any block: its own ground height is the reason it floods or not.
  for (const l of lots) {
    interactive(l.land, {
      select: () => {
        const e = l.elev.toFixed(1);
        info.setText('Ground here: +' + e + ' m above today\'s sea\n' +
          (l.elev <= level ? 'Under water now.' : 'Dry now.') +
          ' It floods once the sea reaches +' + e + ' m.');
      }
    });
  }

  // Guess first.
  const choices = ['Few (<15%)', 'Some (15-40%)', 'Many (>40%)'];
  guess = ui.choices(choices, {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, text, row) => {
      const n = count(QUESTION_LEVEL);
      const frac = n / N;
      const right = frac < 0.15 ? 0 : (frac < 0.4 ? 1 : 2);
      row.lock();
      row.mark(right, 'right');
      if (i !== right) row.mark(i, 'wrong');
      revealed = true;
      apply(QUESTION_LEVEL);
      const sorted = lots.map(l => l.elev).sort((a, b) => a - b);
      const half = sorted[N / 2 - 1];
      card.setText('Rising sea, model city\nAt +' + QUESTION_LEVEL + ' m, ' + n + ' of ' + N + ' buildings (' + Math.round(100 * frac) +
        '%) flood. Half of all buildings flood by +' + half.toFixed(1) + ' m.\nDrag the knob to change the sea. Click a block to see why.');
      result.visible = true;
      slider.visible = true;
      again.visible = true;
    }
  });

  slider = ui.slider({
    min: 0, max: 10, value: QUESTION_LEVEL, step: 0.5,
    dist: 'near', dir: 'ahead', height: 'chest',
    onChange: v => { if (revealed) apply(v); }
  });
  slider.visible = false;

  again = ui.button('Start over', {
    dist: 'near', dir: 'ahead-left', height: 'waist',
    onPress: () => {
      revealed = false;
      apply(0);
      guess.reset();
      slider.visible = false;
      result.visible = false;
      again.visible = false;
      try { slider.value = QUESTION_LEVEL; } catch (e) {}
      card.setText(START_CARD);
      info.setText(START_INFO);
    }
  });
  again.visible = false;
}

function frame(dt, t) {}

XR.run({ build, frame });
