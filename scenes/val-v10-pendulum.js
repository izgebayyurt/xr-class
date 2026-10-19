const { THREE, scene, shape, place, label, interactive, tone, mat, sky, ground, ui, geo, template, H, C, input, onButton, stations } = XR;

const G = 9.81, STEP = 1 / 480, THETA0 = 20 * Math.PI / 180;
const INIT = 'Pendulum race\nTwo pendulums are held back 20° with strings of the same length. A (blue) is heavy, 2 kg. B (orange) is light, 0.5 kg. Which one swings faster? Point at your guess and click.\n(Simulation of an ideal pendulum: no air, no friction.)';
const RUNNING = 'Released. Counting swings (ideal pendulum model, no air or friction).';

const P = [
  { name: 'A', cname: 'blue',   m: 2,   L: 0.4, color: 'blue',   dir: -30, tick: 330 },
  { name: 'B', cname: 'orange', m: 0.5, L: 0.4, color: 'orange', dir: 30,  tick: 494 }
];

let phase = 'guess', running = false, reported = false, ready = false;
let simT = 0, accT = 0, guessPick = -1;
let card, guess, massA, massB, slA, slB, startBtn, overBtn;

function bobRadius(p) { return 0.05 * Math.cbrt(p.m); }

function layout(p) {
  p.rod.scale.y = p.L;
  p.rod.position.y = -p.L / 2;
  p.bob.scale.setScalar(bobRadius(p));
  p.bob.position.y = -p.L;
}

function pose() {
  for (const p of P) p.swing.rotation.z = p.th;
}

function hold() {
  running = false; reported = false; simT = 0; accT = 0;
  for (const p of P) { p.th = THETA0; p.om = 0; p.cross = []; }
  pose();
}

// period = average time between successive downward crossings of the hanging position
function period(p) {
  const n = p.cross.length;
  return n >= 2 ? (p.cross[n - 1] - p.cross[0]) / (n - 1) : null;
}

function lines() {
  return P.map(p => {
    const T = period(p);
    return `${p.name} (${p.cname})   ${p.m} kg   string ${p.L.toFixed(2)} m   period ${T ? T.toFixed(2) + ' s' : (running ? 'measuring...' : '-')}`;
  }).join('\n');
}

function say(msg, extra) {
  card.setText(`Pendulum race\n${msg}\n${lines()}${extra ? '\n' + extra : ''}`);
}

function whyLine() {
  const parts = P.map(p => {
    const f = p.m * G * Math.sin(THETA0);
    return `${p.name}: ${f.toFixed(1)} N ÷ ${p.m} kg = ${(f / p.m).toFixed(1)} m/s²`;
  });
  return `Why (pull along the arc at release ÷ mass = acceleration)\n${parts.join('    ')}`;
}

function lesson(TA, TB, same) {
  const mHi = Math.max(P[0].m, P[1].m), mLo = Math.min(P[0].m, P[1].m);
  const lHi = Math.max(P[0].L, P[1].L), lLo = Math.min(P[0].L, P[1].L);
  const dm = mHi / mLo > 1.01, dl = lHi / lLo > 1.01;
  if (!dl && !dm) return 'Identical pendulums swing in step. Change one thing, then press Start.';
  if (!dl) {
    return same
      ? `Mass differs ${+(mHi / mLo).toFixed(1)}x, yet the periods match (${TA.toFixed(2)} s and ${TB.toFixed(2)} s): the period does not depend on mass.`
      : `The periods differ (${TA.toFixed(2)} s and ${TB.toFixed(2)} s).`;
  }
  const long = P[0].L > P[1].L ? 0 : 1;
  const Tl = long === 0 ? TA : TB, Ts = long === 0 ? TB : TA;
  const tr = Tl / Ts, sq = Math.sqrt(lHi / lLo);
  return `The longer string has the longer period: ${Tl.toFixed(2)} s vs ${Ts.toFixed(2)} s. Period ratio ${tr.toFixed(2)}; square root of the length ratio ${sq.toFixed(2)}.`
    + (dm ? ' The masses differ too, but length is what sets the period.' : '');
}

function showExplore(v) {
  for (const w of [massA, massB, slA, slB, startBtn]) w.visible = v;
}

function report() {
  reported = true;
  const TA = period(P[0]), TB = period(P[1]);
  const same = Math.abs(TA - TB) < 0.01 * (TA + TB) / 2;
  const actual = same ? 2 : (TA < TB ? 0 : 1);
  let head = '';
  const first = guessPick >= 0;
  if (first) {
    head = `You guessed ${['A faster', 'B faster', 'the same'][guessPick]}: ${guessPick === actual ? 'correct.' : 'not what happened.'} `;
    guessPick = -1;
  }
  phase = 'explore';
  showExplore(true);
  say(head + lesson(TA, TB, same),
    whyLine() + (first ? '\nNow test it: pick light or heavy for each, drag the length sliders, press Start.' : '\nChange something and press Start.'));
}

function release() {
  hold();
  running = true;
  say(RUNNING);
}

function changed(p) {
  layout(p);
  hold();
  phase = 'explore';
  say('Ready. Press Start to release both.');
}

function restart() {
  ready = false;
  P[0].m = 2; P[1].m = 0.5;
  for (const p of P) { p.L = 0.4; layout(p); }
  try { slA.value = 0.4; slB.value = 0.4; } catch (e) { }
  massA.reset(); massA.mark(1, 'right');
  massB.reset(); massB.mark(0, 'right');
  guess.reset(); guess.visible = true; guessPick = -1;
  showExplore(false); overBtn.visible = false;
  phase = 'guess';
  hold();
  card.setText(INIT);
  ready = true;
}

function build() {
  for (const p of P) {
    const mount = shape.box(0.2, 0.03, 0.03, 'dark');
    place(mount, { dist: 'room', dir: p.dir, height: 'eye', anchor: 'center' });
    p.swing = shape.group();
    scene.add(p.swing);
    p.swing.position.copy(mount.position);
    p.rod = shape.cylinder(0.006, 1, 'grey');
    p.bob = shape.ball(1, p.color);
    p.swing.add(p.rod, p.bob);
    label(p.name, { above: mount, size: 'large' });
    layout(p);
  }
  hold();

  card = ui.sign(INIT, { width: 1.3, dist: 'room', dir: 'ahead', height: 'eye', anchor: 'top' });

  guess = ui.choices(['A faster', 'B faster', 'Same'], {
    dist: 'near', dir: 'ahead', height: 'waist',
    onPick: (i, t, row) => {
      row.lock();
      guessPick = i;
      phase = 'run';
      guess.visible = false;
      overBtn.visible = true;
      release();
    }
  });

  const massPad = (idx, p) => ui.choices([`${p.name} light`, `${p.name} heavy`], {
    dist: 'near', dir: idx ? 27 : -27, height: 'chest',
    onPick: (i, t, row) => {
      p.m = i ? 2 : 0.5;
      row.reset(); row.mark(i, 'right');
      if (ready) changed(p);
    }
  });
  const lenSlider = (idx, p) => ui.slider({
    min: 0.25, max: 0.5, value: 0.4, step: 0.01,
    dist: 'near', dir: idx ? 27 : -27, height: 'waist',
    onChange: v => { if (!ready) return; p.L = v; changed(p); }
  });

  massA = massPad(0, P[0]); massB = massPad(1, P[1]);
  massA.mark(1, 'right'); massB.mark(0, 'right');
  slA = lenSlider(0, P[0]); slB = lenSlider(1, P[1]);

  startBtn = ui.button('Start', {
    dist: 'near', dir: 'ahead', height: 'waist', color: 'green',
    onPress: () => { if (phase === 'explore') release(); }
  });
  overBtn = ui.button('Start over', {
    dist: 'near', dir: 'ahead', height: 'chest',
    onPress: restart
  });

  showExplore(false);
  overBtn.visible = false;
  ready = true;
}

function frame(dt, t) {
  if (!running) return;
  accT += Math.min(dt, 0.05);
  let crossed = false;
  while (accT >= STEP) {
    accT -= STEP;
    for (const p of P) {
      const pull = -p.m * G * Math.sin(p.th);     // force along the arc
      p.om += (pull / p.m / p.L) * STEP;          // acceleration = force / mass, then / string length for the angle
      const before = p.th;
      p.th += p.om * STEP;
      if (before > 0 && p.th <= 0) {
        p.cross.push(simT + STEP * before / (before - p.th));
        crossed = true;
        if (p.cross.length <= 4) tone(p.tick, 0.06, 'sine');
      }
    }
    simT += STEP;
  }
  pose();
  if (crossed && !reported) {
    if (P[0].cross.length >= 3 && P[1].cross.length >= 3) report();
    else say(RUNNING);
  }
}

XR.run({ build, frame });
