const { shape, place, label, interactive, tone, mat, sky, ground, ui, C, bob } = XR;

const SENSES = {
  sight:   { c: C.yellow, f: 523, verb: 'see' },
  hearing: { c: C.blue,   f: 392, verb: 'hear' },
  touch:   { c: C.orange, f: 330, verb: 'feel' },
  smell:   { c: C.green,  f: 440, verb: 'smell' },
  taste:   { c: C.pink,   f: 587, verb: 'taste' }
};

// The poem: six fragments, read left to right. Each is tagged with the sense it calls on.
const ITEMS = [
  { phrase: 'gold lamplight',        sense: 'sight',   plain: 'light' },
  { phrase: "the kettle's low hum",  sense: 'hearing', plain: 'a noise' },
  { phrase: 'cold glass in my palm', sense: 'touch',   plain: 'a window' },
  { phrase: 'cinnamon on the air',   sense: 'smell',   plain: 'a scent' },
  { phrase: 'honey on warm bread',   sense: 'taste',   plain: 'food' },
  { phrase: 'rain ticking on tin',   sense: 'hearing', plain: 'weather' }
];
const DIRS = [-35, -21, -7, 7, 21, 35];

const GUESSES = [
  { t: 'Most: 4-6',  lo: 4, hi: 6 },
  { t: 'Some: 2-3',  lo: 2, hi: 3 },
  { t: 'Few: 0-1',   lo: 0, hi: 1 }
];

const INTRO = 'Inside a poem\nSix images drift around you. Imagery is language that calls up a sense.\nHow many of the six are about seeing? Point at a pad and click.';

function build() {
  sky({ top: 'dark', bottom: 'purple' });
  ground({ color: 'dark', grid: false, arrow: false });

  // Dreamy drifting motes, kept out of the front arc.
  for (let i = 0; i < 14; i++) {
    const m = shape.ball(0.03, 'white');
    m.material = mat(C.white, { transparent: true, opacity: 0.55, emissive: C.white, emissiveIntensity: 0.6 });
    place(m, { dist: 'far', dir: 55 + i * 19, height: 0.9 + (i % 4) * 0.45, anchor: 'center' });
    bob(m, 0.15, 3 + (i % 3));
  }

  let guess = -1;
  const seen = new Set();

  const card = ui.sign(INTRO, { width: 1.8, dist: 'room', dir: 'ahead', height: 'eye' });

  const glow = (hex, k) => mat(hex, { transparent: true, opacity: 0.85, emissive: hex, emissiveIntensity: k });

  const orbs = [];
  const labels = [];
  ITEMS.forEach((it, i) => {
    const orb = shape.ball(0.12, 'white');
    orb.material = glow(C.white, 0.3);
    place(orb, { dist: 'room', dir: DIRS[i], height: 'waist', anchor: 'center' });
    bob(orb, 0.04, 4 + (i % 3));
    labels.push(label(it.phrase, { above: orb, size: 'small', width: 0.5, theme: 'glass' }));
    orbs.push(orb);
    interactive(orb, { select: () => tap(i) });
  });

  const guessRow = ui.choices(GUESSES.map(g => g.t), {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, text, row) => {
      guess = i;
      row.lock();
      card.setText('Inside a poem\nGuess locked in.\nNow point at each floating phrase and click. Which sense does it call on?\n0 of ' + ITEMS.length + ' tapped');
    }
  });

  const again = ui.button('Start over', {
    dist: 'near', dir: -30, height: 'chest',
    onPress: () => {
      guess = -1;
      seen.clear();
      guessRow.reset();
      orbs.forEach((o, i) => { o.material = glow(C.white, 0.3); labels[i].setText(ITEMS[i].phrase); });
      again.visible = false;
      card.setText(INTRO);
    }
  });
  again.visible = false;

  function tap(i) {
    if (guess < 0) {
      card.setText('Inside a poem\nGuess first: point at one of the three pads below and click.');
      return;
    }
    const it = ITEMS[i];
    const s = SENSES[it.sense];
    if (!seen.has(i)) {
      seen.add(i);
      orbs[i].material = glow(s.c, 0.55);
      labels[i].setText(it.phrase + '\n(' + it.sense + ')');
      tone(s.f, 0.6, 'sine');
    }
    if (seen.size < ITEMS.length) {
      card.setText(
        'Inside a poem\n"' + it.phrase + '" calls on ' + it.sense + '.\n' +
        'Plain version: "' + it.plain + '". The image lets you ' + s.verb + ' it; the plain words only name it.\n' +
        seen.size + ' of ' + ITEMS.length + ' tapped'
      );
      return;
    }
    finish();
  }

  function finish() {
    // Everything below is counted from the tags on the six phrases.
    const counts = {};
    Object.keys(SENSES).forEach(k => { counts[k] = ITEMS.filter(it => it.sense === k).length; });
    const sight = counts.sight;
    const total = ITEMS.length;
    const right = GUESSES.findIndex(g => sight >= g.lo && sight <= g.hi);
    guessRow.mark(right, 'right');
    if (guess !== right) guessRow.mark(guess, 'wrong');
    const tally = Object.keys(SENSES).map(k => k + ' ' + counts[k]).join('  |  ');
    card.setText(
      'Inside a poem\n' + tally + '\n' +
      (guess === right ? 'Your guess held. ' : 'Not quite. ') +
      sight + ' of ' + total + ' images are for the eyes; ' + (total - sight) + ' call on other senses.\n' +
      'Imagery is language that calls up any sense, not only pictures.'
    );
    again.visible = true;
  }
}

function frame(dt, t) {
}

XR.run({ build, frame });
