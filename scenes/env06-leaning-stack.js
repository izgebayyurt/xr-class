const { THREE, shape, place, label, interactive, mat, ground, input, C } = XR;

// "The Leaning Stack" — Cavalieri's principle, felt with a hand.
// 20 discs each, r=0.25 h=0.05 -> each stack exactly 1.00 m tall, volume 20*pi*0.25^2*0.05 = 0.196 m^3.
// Left stack stands straight; right stack's discs drift 0.03 m/disc to the right (away from the left
// stack), so the top disc has moved 0.57 m sideways (a ~30 deg lean) while every disc keeps the same
// radius. A horizontal ruler slab slides 0..1.00 m on a grab handle; whatever disc it crosses lights up
// in both stacks at once, at the same height, proving the slice sizes always match.

const N = 20, R = 0.25, T = 0.05, LEAN_STEP = 0.03;
const STACK_DIST = 2.3, LEFT_X = -0.55, RIGHT_X = 0.55; // pulled back so both full stacks fit the opening frame
const RECENTER = (N - 1) * LEAN_STEP / 2; // both rig and the ruler group get bbox-centred on the LEANING
// footprint by place(); this un-does it so the STRAIGHTENED pair (the state that must read symmetric)
// lands on the visitor's centreline instead.
const SLAB_LIFT = 0.003; // a hair, not a wash-fix: must stay well under half a disc's 0.05 m thickness
// or the slab and the lit disc disagree about which slice is "current".
const SWEEP_UP = 5, SWEEP_DOWN = 5; // seconds, "slowly" up then down
const PROMPT = 'Which one holds more?\nHold the ruler at one height, then press STRAIGHTEN.';
const PAYOFF = 'Same height. Same slice. Same volume.\nBoth stacks: 0.196 m³';

let leftDiscs = [], rightDiscs = [];
let rig, sliceLabel, signLabel, revealed = false;
let leanT = 1, leanTarget = 1;              // 0 = straight, 1 = full lean (starting state: leaning)
let currentHeight = 0.975, litIndex = -1;
let dragging = false, rail, rulerAssembly, handle;
let sweeping = false, sweepElapsed = 0;

function reveal(){
  if (revealed) return;
  revealed = true;
  signLabel.setText(PAYOFF);
}

function applyHeight(h, moveHandle){
  currentHeight = Math.max(0, Math.min(1, h));
  rulerAssembly.position.y = currentHeight + SLAB_LIFT;
  if (moveHandle) handle.position.y = currentHeight;
  const idx = Math.min(N - 1, Math.floor(currentHeight / T + 1e-6));
  if (idx !== litIndex){
    if (litIndex >= 0){
      leftDiscs[litIndex].material.color.setHex(leftDiscs[litIndex].userData.base);
      rightDiscs[litIndex].material.color.setHex(rightDiscs[litIndex].userData.base);
      reveal(); // any deliberate change of slice height counts as "having a look"
    }
    leftDiscs[idx].material.color.setHex(C.orange);
    rightDiscs[idx].material.color.setHex(C.orange);
    // one shared, high-contrast caption, moved to sit between the two lit discs — never removed/recreated.
    const p = new THREE.Vector3(0, idx * T + T / 2, R + 0.03);
    rig.localToWorld(p);
    sliceLabel.position.copy(p);
    litIndex = idx;
  }
}

function build(){
  ground({ color: '#eef2f6', grid: true, arrow: false, radius: 6 });
  input.teleport = 'none'; // posture is standing-in-place; crouching to look along the ruler is the point

  // --- the two stacks, framed whole a few steps ahead ---
  rig = shape.group();
  for (let i = 0; i < N; i++){
    const y = i * T + T / 2;
    const base = (i % 2 === 0) ? C.white : C.grey; // alternate shades so 20 distinct slices read as 20, not one smooth column
    const dl = shape.cylinder(R, T, 'white'); dl.position.set(LEFT_X, y, 0); dl.material.color.setHex(base); dl.userData.base = base; rig.add(dl); leftDiscs.push(dl);
    const dr = shape.cylinder(R, T, 'white'); dr.position.set(RIGHT_X + i * LEAN_STEP, y, 0); dr.material.color.setHex(base); dr.userData.base = base; rig.add(dr); rightDiscs.push(dr);
  }
  place(rig, { dist: STACK_DIST, dir: 'ahead', height: 'floor' });
  rig.position.x += RECENTER; // place() bbox-centred on the leaning footprint; re-centre on the straight one

  // one shared, high-contrast caption for the current slice (not two duplicate copies) — free-floating
  // so it always faces the visitor; repositioned (never recreated) in applyHeight.
  sliceLabel = label('slice area 0.196 m² — same at every height',
    { dist: STACK_DIST, dir: 'ahead', height: 'chest', size: 'comfortable', width: 1.1, bg: true, theme: 'dark' });

  // --- the ruler slab: its own group (NOT a child of rig) so its off-centre x doesn't drag rig's
  // bounding-box-anchored placement off the user's centreline. Spans both stacks at every height,
  // including full lean.
  rulerAssembly = shape.group();
  const slab = shape.box(2.3, 0.012, 0.6, 'teal');
  slab.material = mat('teal', { transparent: true, opacity: 0.22, emissive: C.teal, emissiveIntensity: 0.5 });
  slab.position.set(0.285, 0.5, 0); // safe mid-height for place()'s bbox anchor
  rulerAssembly.add(slab);
  place(rulerAssembly, { dist: STACK_DIST, dir: 'ahead', height: 'floor' });
  slab.position.y = 0; // zero the parked child offset now that place() has used it for the bbox anchor —
  // applyHeight sets the GROUP's y absolutely each frame, so a forgotten child offset here was pure
  // double-counting (0.5 m of it, on top of the group's own y).
  rulerAssembly.position.x += RECENTER; // same bbox-centring artifact, same correction, so the slab keeps
  // spanning the leaning stack's full sideways travel instead of falling 0.285 m short of it.

  // --- grab rail: static, directly ahead at arm's reach, floor to 1.00 m ---
  rail = shape.group();
  const rod = shape.box(0.018, 1.0, 0.018, 'white');
  rod.material = mat('white', { transparent: true, opacity: 0.4 });
  rod.position.y = 0.5;
  rail.add(rod);

  // the handle IS the visible ball — grab:'hold' must live on the thing the visitor sees, never on
  // an invisible child proxy — sized past 'apple' (.08) so it needs no separate hit target either.
  handle = shape.ball(0.06, 'orange');
  handle.position.y = 0.5; // safe mid-height: must not poke below the rod's y=0 bottom at place() time
  rail.add(handle);
  place(rail, { dist: 'reach', dir: 'ahead', height: 'floor' });
  interactive(handle, {
    grab: 'hold',
    select: () => { dragging = true; sweeping = false; },
    release: () => { dragging = false; applyHeight(currentHeight, true); },
    // drag() fires every frame while held with the pointer's current world point — works identically
    // for a real controller or the desktop mouse ray, unlike guessing at a controller via onController.
    drag: (obj, { point }) => {
      const local = point.clone(); rail.worldToLocal(local);
      applyHeight(local.y, true);
    },
  });
  label('Slide me', { parent: handle, at: [0, 0.11, 0], capHeight: 0.02, bg: false });

  applyHeight(currentHeight, true); // just below the very top disc, so the ruler is genuinely slicing it, not resting on its rim

  // --- STRAIGHTEN button — chest height, pulled off the far corner so it isn't clipped by the frame edge ---
  const btn = shape.box(0.16, 0.09, 0.03, 'teal');
  place(btn, { dist: 0.85, dir: 25, height: 'chest', face: true });
  label('STRAIGHTEN', { parent: btn, at: [0, 0, 0.03 / 2 + 0.03], capHeight: 0.025, bg: false });
  interactive(btn, { select: () => { leanTarget = leanTarget === 1 ? 0 : 1; reveal(); } });

  // --- sign, across the room at eye level: opens with the question, reveals the payoff after use ---
  const signPos = { dist: 2.5, dir: 'ahead', height: 'eye' };
  signLabel = label(PROMPT, { ...signPos, size: 'large', width: 2.0, title: true, accent: '#f2892e' });
  const signHit = shape.hit(2.1, 0.5, 0.08);
  place(signHit, signPos);
  interactive(signHit, { select: () => { sweeping = true; sweepElapsed = 0; dragging = false; reveal(); } });
}

function frame(dt){
  // dragging is driven by the drag() callback (fires every frame while held, from the real pointer) —
  // frame() only needs to run the sweep and the lean animation.
  if (!dragging && sweeping){
    sweepElapsed += dt;
    const total = SWEEP_UP + SWEEP_DOWN;
    let h;
    if (sweepElapsed <= SWEEP_UP) h = sweepElapsed / SWEEP_UP;
    else if (sweepElapsed <= total) h = 1 - (sweepElapsed - SWEEP_UP) / SWEEP_DOWN;
    else { h = 0; sweeping = false; }
    applyHeight(h, true);
  }

  if (leanT !== leanTarget){
    const dir = leanTarget > leanT ? 1 : -1;
    leanT = Math.max(0, Math.min(1, leanT + dir * dt / 1.5));
    for (let i = 0; i < N; i++) rightDiscs[i].position.x = RIGHT_X + leanT * i * LEAN_STEP;
  }
}

XR.run({ build, frame });
