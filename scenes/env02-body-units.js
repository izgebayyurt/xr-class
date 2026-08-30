const { shape, place, label, interactive, tone, H, C, ground, sky } = XR;

// --- data: exact historical body-unit lengths, do not round ---
const UNITS = [
  { name: 'hand',   part: 'a hand’s width (horses are still measured in these)', m: 0.1016, in: 4  },
  { name: 'span',   part: 'thumb-tip to little-finger-tip, fingers spread',            m: 0.2286, in: 9  },
  { name: 'foot',   part: 'a foot',                                                    m: 0.3048, in: 12 },
  { name: 'cubit',  part: 'elbow to fingertip',                                        m: 0.4572, in: 18 },
  { name: 'yard',   part: 'nose to fingertip of one outstretched arm',                 m: 0.9144, in: 36 },
  { name: 'fathom', part: 'both arms out, fingertip to fingertip',                     m: 1.8288, in: 72 },
];
// tick marks sit where each unit actually ends along the metre, not at arbitrary points
const TICKS = [
  { pos: 0.3048, text: '1 foot' },
  { pos: 0.4572, text: '1 cubit' },
  { pos: 0.6096, text: '2 feet' },
  { pos: 0.9144, text: '1 yard — 8.6 cm short of the metre' },
];
const INSTRUCTION = 'Point at a rod on the rack\nand pull the trigger.';

function build() {
  ground({ color: 'dark', grid: false });
  sky({ top: 'dark', bottom: 'orange' });

  // rack: 6 slots, ≥0.25 m apart, shortest (hand) low, longest (fathom) at eye height
  const bottomY = 0.33;
  const topY = H.eye;
  const step = (topY - bottomY) / (UNITS.length - 1);

  const rods = [];
  UNITS.forEach((u, i) => {
    const y = bottomY + step * i;
    const g = shape.group();
    place(g, { dist: 'room', dir: 'ahead', height: y });

    const rod = shape.box(u.m, 0.05, 0.05, C.orange);
    g.add(rod);
    const nameLbl = label(u.name, { parent: rod, at: [0, 0.06, 0], capHeight: 0.035, bg: false });

    const hit = shape.hit(Math.max(u.m, 0.18) + 0.08, 0.2, 0.22);
    g.add(hit);

    // forward distance scales with the rod's own length: small units still arrive at arm's reach,
    // the fathom stops at ~1.3 m where its 1.83 m subtends a readable ~70° instead of 110°
    const forwardDist = Math.min(2.0, Math.max(0.55, u.m * 0.72));
    rods.push({ u, g, rod, nameLbl, rackY: y, forwardDist });
    interactive(hit, { select: () => selectUnit(i) });
  });

  // fixed info label at a comfortable, constant distance — independent of whichever rod is forward
  const info = label(INSTRUCTION, {
    dist: 'near', dir: 'ahead', height: H.chest + 0.32, size: 'comfortable', width: 0.75, theme: 'dark', anchor: 'top',
  });

  let activeIndex = -1;
  function selectUnit(i) {
    const r = rods[i];
    if (activeIndex === i) {
      place(r.g, { dist: 'room', dir: 'ahead', height: r.rackY });
      r.rod.material.emissive?.setHex(0x000000);
      r.nameLbl.visible = true;
      activeIndex = -1;
      info.setText(INSTRUCTION);
      tone(330, 0.08, 'square');
      return;
    }
    if (activeIndex >= 0) {
      const prev = rods[activeIndex];
      place(prev.g, { dist: 'room', dir: 'ahead', height: prev.rackY });
      prev.rod.material.emissive?.setHex(0x000000);
      prev.nameLbl.visible = true;
    }
    place(r.g, { dist: r.forwardDist, dir: 'ahead', height: H.chest });
    r.rod.material.emissive?.setHex(0x663311);
    r.nameLbl.visible = false; // suppress: it balloons in size at close range and would dwarf the placard
    activeIndex = i;
    info.setText(`${r.u.name} — ${r.u.part}\n${r.u.m.toFixed(4)} m  (${r.u.in} in)\nHold the matching part of yourself up against it.`);
    tone(520, 0.08, 'sine');
  }

  // metre rod: white, on its own plinth, well below and apart from the rack — the control, not the base of the stack
  const plinth = shape.box(1.15, 0.05, 0.32, C.dark);
  place(plinth, { dist: 'room', dir: 'ahead', height: 'floor' });

  const metreLen = 1.0;
  const metreG = shape.group();
  place(metreG, { dist: 'room', dir: 'ahead', height: 0.11 });
  const metreRod = shape.box(metreLen, 0.05, 0.05, C.white);
  metreG.add(metreRod);
  const metreHit = shape.hit(metreLen + 0.08, 0.2, 0.22);
  metreG.add(metreHit);

  const extras = [];
  const rowY = [0.09, 0.15, 0.21, 0.27]; // one distinct row per tick — no shared row to overprint
  TICKS.forEach((tck, i) => {
    const x = tck.pos - 0.5; // rod is centred, spans -0.5..+0.5 m from one end
    const mark = shape.box(0.015, 0.06, 0.015, C.dark);
    mark.position.set(x, 0.045, 0);
    metreRod.add(mark);
    extras.push(mark);
    const t = label(tck.text, { parent: metreRod, at: [x, rowY[i], 0], capHeight: 0.028, bg: false });
    extras.push(t);
  });
  // payoff sits past the rod's own end, not stacked above its centre — stacking above put it at the
  // same world height band as the hand rod's rack slot (same 'room' depth, same x=0 column) and the
  // payoff text was losing clicks to the hand rod's hit box
  const payoff = label(
    'A yard reaches 0.9144 m — 8.6 cm short of a metre.\nNone of these numbers are you any more.',
    { parent: metreRod, at: [0.62, 0.06, 0], capHeight: 0.032, bg: false }
  );
  extras.push(payoff);
  extras.forEach(e => { e.visible = false; });

  let ticksShown = false;
  interactive(metreHit, {
    select: () => {
      ticksShown = !ticksShown;
      extras.forEach(e => { e.visible = ticksShown; });
      tone(ticksShown ? 660 : 330, 0.08, 'square');
    },
  });

  // the fathom post: at 'reach' so the visitor can actually stand beside it, as its own label invites
  const post = shape.cylinder(0.05, 1.8288, 0x9c7a4d);
  place(post, { dist: 'reach', dir: -55, height: 'floor' });
  label('One fathom — six foot.\nStand beside it and see where you land.', { above: post, size: 'comfortable', width: 0.9, theme: 'dark' });

  // sign
  label(
    'Units Used to Be Bodies\n' +
    '1791: a metre is one ten-millionth of the way from the North Pole to the equator.\n' +
    '1983: a metre is how far light travels in 1/299,792,458 of a second.\n' +
    'Neither of them is you any more.',
    { dist: 'room', dir: 'ahead-right', height: 'eye', size: 'large', width: 1.1, theme: 'dark', title: true, accent: '#e0752a' }
  );
}

function frame(dt, t) {
  // static scene: nothing needs per-frame work
}

XR.run({ build, frame });
