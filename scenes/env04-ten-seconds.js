const { shape, place, label, interactive, tone, mat, C, H, input, stations } = XR;

// "Ten Seconds Long" — round 2 fixes: grab:'hold' so the pad never relocates after one use (was the
// blocker); the fill hides while holding so the visitor can't just watch the answer grow next to the
// known-length reference; the readout now names the error, not just the raw number (the payoff line);
// dial and pad are joined onto one scale. Timing is untouched: RATE and the dial's 10.00 s sweep are
// pure dt-accumulation, never wall-clock.

const BAR_W = 1.0, BAR_H = 0.08, BAR_D = 0.035;
const RATE = BAR_W / 10;          // 0.10 m per second — must never drift

let bars, fillBar, whiteBar, resultLabel;
let holding = false, heldSeconds = 0;
let rulerOn = false;
const rulerMarks = [];

let dialHand, dialSweeping = false, dialElapsed = 0, dialTicksDone = 0;

function updateFill(){
  const len = Math.max(0.0005, heldSeconds * RATE);
  const frac = len / BAR_W;
  fillBar.scale.x = frac;
  fillBar.position.x = -BAR_W / 2 * (1 - frac);
}

function build(){
  // --- the two bars: white reference above, teal fill-track below, straight ahead at chest height ---
  bars = shape.group();
  whiteBar = shape.box(BAR_W, BAR_H, BAR_D, C.white);
  whiteBar.position.set(0, 0.17, 0);
  const track = shape.box(BAR_W, BAR_H, BAR_D, C.teal);
  track.material = mat(C.teal, { transparent: true, opacity: 0.35 });
  track.position.set(0, -0.17, 0);
  // bright end-caps so the empty track's full 1.00 m extent reads before anything fills it
  const capL = shape.box(0.012, BAR_H * 1.4, BAR_D * 1.4, C.white); capL.position.set(-BAR_W / 2, -0.17, 0);
  const capR = shape.box(0.012, BAR_H * 1.4, BAR_D * 1.4, C.white); capR.position.set(BAR_W / 2, -0.17, 0);
  fillBar = shape.box(BAR_W, BAR_H, BAR_D, C.teal);
  fillBar.material = mat(C.teal, { transparent: true, opacity: 1 });
  fillBar.position.set(-BAR_W / 2, -0.17, 0.002);
  bars.add(whiteBar, track, capL, capR, fillBar);
  place(bars, { dist: 2, dir: 'ahead', height: H.chest });
  updateFill();   // set the fill's start pose from the one formula, not a hand-typed guess

  label('10 seconds', { above: whiteBar, size: 'large' });

  // ruler: numbers 1–10 on the white bar, plus fainter 11–15 on the track for anyone who overshoots —
  // one press of the white bar reveals the whole thing.
  for (let s = 1; s <= 10; s++){
    const x = -BAR_W / 2 + s * 0.1;
    const tick = shape.box(0.006, BAR_H * 0.85, 0.006, C.dark);
    tick.position.set(x, 0, BAR_D / 2 + 0.006); tick.visible = false;
    whiteBar.add(tick); rulerMarks.push(tick);
    const num = label(String(s), { parent: whiteBar, at: [x, -BAR_H / 2 - 0.06, BAR_D / 2 + 0.02], capHeight: 0.04, bg: false });
    num.visible = false; rulerMarks.push(num);
  }
  for (let s = 11; s <= 15; s++){
    const x = -BAR_W / 2 + s * 0.1;
    const tick = shape.box(0.005, BAR_H * 0.6, 0.005, C.grey);
    tick.position.set(x, -0.17, BAR_D / 2 + 0.006); tick.visible = false;
    bars.add(tick); rulerMarks.push(tick);
    const num = label(String(s), { parent: bars, at: [x, -0.17 - BAR_H / 2 - 0.05, BAR_D / 2 + 0.02], capHeight: 0.03, bg: false, color: '#9aa0ab' });
    num.visible = false; rulerMarks.push(num);
  }
  interactive(whiteBar, { select: () => {
    rulerOn = !rulerOn;
    rulerMarks.forEach(m => m.visible = rulerOn);
    tone(rulerOn ? 520 : 320, 0.08);
  } });

  // the sign: straight ahead, above the bars
  label('Ten Seconds Long\nSince 1967 a second has been 9,192,631,770 wobbles of a caesium atom. Your body has never once counted them.',
    { dist: 2, dir: 'ahead', height: H.eye + 0.24, size: 'large', width: 2.1, title: true });

  // the readout: made once here, moved and re-texted on every release — never removed and recreated
  resultLabel = label(' ', { dist: 2, dir: 'ahead', height: H.chest - 0.17, size: 'comfortable', width: 1.0, title: true });
  resultLabel.visible = false;

  // --- the pad: hold the trigger, see how long you actually held ---
  // grab:'hold' fires select on grab and release on let-go WITHOUT the engine ever repositioning the
  // object — the fix for round 1's blocker, where a plain grab:true proxy drifted off after one use
  // and then blocked the line of sight to the white bar.
  const pad = shape.box(0.32, 0.2, 0.03, C.dark);
  place(pad, { dist: 'near', dir: 22, height: 1.15, face: true });
  const accent = shape.box(0.32, 0.02, 0.032, C.teal);
  accent.position.set(0, 0.09, 0); pad.add(accent);
  label('Hold the trigger for what feels like ten seconds.\nLet go when you think you’re there.',
    { parent: pad, at: [0, -0.01, 0.03 / 2 + 0.03], capHeight: 0.022, width: 0.27, bg: false });
  interactive(pad, {
    grab: 'hold',
    select: () => {
      resultLabel.visible = false;
      holding = true; heldSeconds = 0; updateFill();
      fillBar.material.opacity = 0.06;   // hide the growth while held — no watching the answer arrive
    },
    release: () => {
      holding = false;
      fillBar.material.opacity = 1;      // reveal the full length now that the attempt is over
      const held = heldSeconds, diff = held - 10, pct = Math.round(Math.abs(diff) / 10 * 100);
      const diffText = Math.abs(diff) < 0.05 ? 'dead on.' : `${Math.abs(diff).toFixed(1)} s ${diff < 0 ? 'short' : 'long'} (${pct}%).`;
      resultLabel.setText(`You held 10 seconds as ${held.toFixed(1)} s\n${diffText}`);
      const len = Math.max(0.0005, heldSeconds * RATE);
      resultLabel.position.set(bars.position.x + (-BAR_W / 2 + len), bars.position.y - 0.17 + 0.13, bars.position.z + 0.05);
      resultLabel.visible = true;
      tone(760, 0.18, 'sine');
    },
  });

  // --- the drum button: fires the dial's 10-second sweep ---
  const btn = shape.group();
  const drum = shape.cylinder(0.055, 0.05, C.teal);
  drum.rotation.x = Math.PI / 2;
  const drumHit = shape.hitball(0.09);   // small drum, generous invisible hit target
  btn.add(drum, drumHit);
  place(btn, { dist: 'near', dir: 'ahead-left', height: 'waist', face: true });
  label('Show me ten seconds', { above: btn, size: 'small' });
  interactive(drumHit, { select: () => { dialElapsed = 0; dialTicksDone = 0; dialSweeping = true; dialHand.rotation.z = 0; } });

  // --- the dial: ten evenly spaced ticks, one hand parked at the top ---
  const dial = shape.group();
  const face = shape.cylinder(0.25, 0.03, '#23262e');
  face.rotation.x = Math.PI / 2;
  dial.add(face);
  for (let i = 0; i < 10; i++){
    const ang = i * (Math.PI * 2 / 10);
    const tick = shape.box(0.012, 0.045, 0.012, C.white);
    tick.position.set(0.2 * Math.sin(ang), 0.2 * Math.cos(ang), 0.02);
    dial.add(tick);
  }
  dialHand = shape.group();
  dialHand.position.z = 0.024;
  const needle = shape.box(0.014, 0.17, 0.01, C.orange);
  needle.position.y = 0.085;
  dialHand.add(needle);
  dial.add(dialHand);
  place(dial, { dist: 2.5, dir: -25, height: 'shoulder', face: true });
  label('One trip round = ten seconds. Ten ticks, one per second.\nOne tick = 10 cm of the bar.',
    { dist: 2.5, dir: -25, height: H.shoulder - 0.42, size: 'comfortable', width: 0.95 });

  // standing in place: no wandering off the marked spot
  input.teleport = 'none';
  stations.push([0, 0, 0]);
}

function frame(dt){
  if (holding){ heldSeconds += dt; updateFill(); }
  if (dialSweeping){
    dialElapsed += dt;
    const frac = Math.min(dialElapsed / 10, 1);
    dialHand.rotation.z = -frac * Math.PI * 2;
    const now = Math.min(10, Math.floor(dialElapsed));
    if (now > dialTicksDone){
      for (let k = dialTicksDone; k < now; k++) tone(900, 0.04, 'square');
      dialTicksDone = now;
    }
    if (dialElapsed >= 10){ dialSweeping = false; dialHand.rotation.z = 0; }
  }
}

XR.run({ build, frame });
