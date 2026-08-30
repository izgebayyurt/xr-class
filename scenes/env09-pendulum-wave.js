const { THREE, scene, shape, place, label, interactive, tone, mat, H, C, ground, sky, input } = XR;

// "Pendulum Wave" — eight pendulums hang from one straight rail, each with its own length L so
// its own period T = 2*pi*sqrt(L/g) makes exactly n full swings in 24 s (T = 24/n, n = 12..19).
// Every bob swings only toward/away from the visitor (rotate the pivot group about local X, which
// moves its hanging child purely in the Y-Z plane) — the row itself never shifts sideways, so the
// eight lengths can sit close together on the rail without ever colliding.
//
// Round 2: rail moved to near..room and routed through place() as one populated rig (restores
// audit coverage of the whole apparatus); clock sign moved from az 90 into the front arc, right next
// to the rail; sign/tags now built once and updated with setText (no more leak-prone rebuilds); the
// sqrt lesson is stated as a permanent line; a resync flash confirms t = 24 s instead of just
// predicting it; floor shadows make the depth swing readable from any angle; RELEASE bar widened.
//
// Round 3 (targeted): sign at az 44/'small' was still clipped and undersized — moved to 'ahead-right'
// (35°) at 'comfortable' size; the sqrt payoff got promoted off the sign onto its own comfortable
// label under RELEASE (never buried in small print again); the clock split onto its own short-line
// label so the multi-line sign only repaints on phase change, not 10x/sec; bob tags shortened to two
// lines and only one shows at a time; rail pushed to 'room' so the floor shadows clear the frustum;
// sky() retints the mood; a free t=12s "two combs" beat added alongside the t=24s resync flash.

const G = 9.81;
const MAXDEG = 20;                              // pull-back amplitude, degrees
const MAXRAD = THREE.MathUtils.degToRad(MAXDEG);
const WIDTH = 1.7;                              // rail width ~ one person's height
const RAIL_DIST = 2.5;                          // 'room' — pushed out so the floor shadows clear the frustum
const POST_X = WIDTH / 2 + 0.03;
const N = 8;

// pendulum n = 12..19: T = 24/n seconds, L from T = 2*pi*sqrt(L/g)  =>  L = g*(T/2pi)^2
const PEND = [];
for (let n = 12; n <= 19; n++) {
  const T = 24 / n;
  const L = G * (T / (2 * Math.PI)) ** 2;
  PEND.push({ n, T, L });
}
const LONGEST = PEND[0], SHORTEST = PEND[PEND.length - 1];
const RATIO_L = LONGEST.L / SHORTEST.L, RATIO_T = LONGEST.T / SHORTEST.T;
const PAYOFF = `Longest string ${RATIO_L.toFixed(2)}× the shortest. It swings only ${RATIO_T.toFixed(2)}× slower. `
             + `${RATIO_T.toFixed(2)} = √${RATIO_L.toFixed(2)}.`;

const TEAL = new THREE.Color(C.teal), PURPLE = new THREE.Color(C.purple);

let released = false;
let simT = 0;        // physics clock: only ticks once released, resets to 0 on every release
let clockT = 0;       // ui clock: always ticks — drives the clock label, tag fade, resync/comb flashes
let signLbl, clockLbl, clockTimer = 0;
let railMat, lastCycle = -1, flashUntil = -1, lastHalf = -1, halfFlashUntil = -1, prevExtra = '';

// the big sign only carries the two mandated standing lines + a transient flash line — it repaints
// only when that flash line changes (phase change), not on a timer.
function signText(){
  let t = 'Same physics, different lengths.\nThey are all back together at 24.0 s.';
  if (clockT < flashUntil) t += '\nBack in sync.';
  else if (clockT < halfFlashUntil) t += '\nAt 12 s they split into two combs.';
  return t;
}
function currentExtra(){
  if (clockT < flashUntil) return 'sync';
  if (clockT < halfFlashUntil) return 'half';
  return '';
}

function doRelease(){
  simT = 0;
  released = true;
  lastCycle = -1; lastHalf = -1;
  flashUntil = -1; halfFlashUntil = -1;   // round-2 trap: both must reset together, or a stale flash re-fires
  prevExtra = '';
  signLbl.setText(signText());
  clockLbl.setText('t = 0.0 s');
}

function onBobSelect(p){
  PEND.forEach(q => { if (q !== p && q.tagUntil > 0){ q.tagLbl.visible = false; q.tagUntil = -1; } }); // only one tag up at a time
  p.tagLbl.setText(`L = ${p.L.toFixed(3)} m\nT = ${p.T.toFixed(2)} s · ${p.n} swings`);
  p.tagLbl.visible = true;
  p.tagLbl.traverse(ch => { if (ch.material) { ch.material.transparent = true; ch.material.opacity = 1; } });
  p.tagUntil = clockT + 3.2;
  tone(200 * p.n / 12, 0.28, 'sine');
}

function build(){
  ground({ color: 'dark', grid: false, arrow: false });
  sky({ top: 'black', bottom: 'dark' });  // patient/hypnotic mood instead of blank daylight blue
  input.teleport = 'none';         // "standing in place, no teleport — the wave only reads from the front"

  // --- the whole apparatus, built in local space (y=0 = floor, y=H.eye = rail), then placed as one
  // unit so the audit sees the rail, posts, strings and bobs, not just the eight hit targets.
  const rig = shape.group();

  const rail = shape.box(WIDTH + 0.1, 0.02, 0.02, C.white);
  railMat = mat(C.white, { emissive: 0x333333, emissiveIntensity: 0.35 }); // correct the warm key-light cast
  rail.material = railMat;
  rail.position.y = H.eye;
  rig.add(rail);

  [-1, 1].forEach(side => {
    const post = shape.cylinder(0.018, H.eye, C.grey);
    post.position.set(side * POST_X, H.eye / 2, 0);
    rig.add(post);
  });

  // eight pendulums: index 0 = n=12 (longest, left) ... index 7 = n=19 (shortest, right)
  PEND.forEach((p, i) => {
    const x = -WIDTH / 2 + i * (WIDTH / (N - 1));
    const t = i / (N - 1);                                  // 0 at long/left, 1 at short/right
    const color = PURPLE.clone().lerp(TEAL, t).getHex();     // purple (long) -> teal (short)

    const group = shape.group();
    group.position.set(x, H.eye, 0);
    rig.add(group);

    const string = shape.cylinder(0.006, p.L, C.white);
    string.position.y = -p.L / 2;                            // spans pivot (y=0) down to bob (y=-L)
    group.add(string);

    const bob = shape.ball(0.045, color);                    // 9 cm — visible at the greater rail distance
    bob.position.y = -p.L;
    group.add(bob);

    // rides the swing, gives an easy laser target well above the visible bob's own footprint.
    const bobHit = shape.hitball(0.1);
    bobHit.position.y = -p.L;
    group.add(bobHit);

    // floor shadow: same x as the pivot, z tracks the bob's toward/away swing every frame —
    // turns the depth motion into a visible snake along the floor from any viewing angle.
    const shadow = shape.cylinder(0.05, 0.006, C.dark);
    shadow.position.set(x, 0.005, 0);
    rig.add(shadow);

    // per-bob info tag, built once and toggled with setText — parented so it swings with its bob
    // and stays legible next to the numbers it names (fix: was a free label that detached).
    const tagLbl = label(' ', { parent: group, at: [0, -p.L, 0.13], capHeight: 0.035 });
    tagLbl.visible = false;

    p.group = group; p.bobHit = bobHit; p.shadow = shadow; p.tagLbl = tagLbl; p.tagUntil = -1;
    interactive(bobHit, { select: () => onBobSelect(p) });
  });

  place(rig, { dist: RAIL_DIST, dir: 'ahead', height: 'floor', anchor: 'bottom' });

  // RELEASE bar, under the middle of the rail, pulled toward the visitor and widened so the label fits
  const bar = shape.panel(0.28, 0.08, C.teal);
  place(bar, { dist: RAIL_DIST - 0.5, dir: 'ahead', height: H.eye - 0.16 });
  label('RELEASE', { parent: bar, at: [0, 0, 0.03], capHeight: 0.032, bg: false });
  interactive(bar, { select: doRelease });

  // the sqrt payoff — the sentence the room exists to teach — gets its own comfortable-size label
  // right under RELEASE, instead of being buried in the sign's small print.
  label(PAYOFF, { dist: RAIL_DIST - 0.9, dir: 'ahead', height: H.eye - 0.6, size: 'comfortable', width: 1.6, theme: 'dark' });

  // the sign — 'ahead-right' (35°, a good 18° clear of the row's own ~17° right edge now that the
  // row sits at 'room'), 'comfortable' size (was 'small'/30' and clipped). Anchored at the top edge
  // so the transient third line grows the panel downward instead of shifting it on screen.
  const SIGN_DIR = 'ahead-right', SIGN_DIST = 'room';
  signLbl = label(signText(), { dist: SIGN_DIST, dir: SIGN_DIR, height: 'eye', size: 'comfortable', width: 1.5, theme: 'dark', anchor: 'top' });

  // the live clock — its own short-line label so it can repaint at 10 Hz cheaply without repainting
  // the whole sign (fix: round 2 repainted all four lines ten times a second).
  clockLbl = label('t = 0.0 s', { dist: SIGN_DIST, dir: SIGN_DIR, height: H.eye - 0.34, size: 'comfortable', width: 0.9, theme: 'dark' });

  // one line of small print on the idealisation this room simplifies away, stacked under the sign
  label('Simulated at the ideal T = 2π√(L/g). A real 20° pendulum runs about 0.76% slower than this and would not quite reconverge.',
    { dist: SIGN_DIST, dir: SIGN_DIR, height: H.eye - 0.6, size: 'small', width: 1.5, theme: 'glass' });
}

function frame(dt){
  clockT += dt;
  if (released) simT += dt;

  PEND.forEach(p => {
    const thetaDeg = released ? MAXDEG * Math.cos(2 * Math.PI * simT / p.T) : MAXDEG; // rest = pulled back, ready to let go
    const thetaRad = THREE.MathUtils.degToRad(thetaDeg);
    p.group.rotation.x = thetaRad;
    p.shadow.position.z = -p.L * Math.sin(thetaRad);

    if (p.tagUntil > 0){
      const remain = p.tagUntil - clockT;
      if (remain <= 0){ p.tagLbl.visible = false; p.tagUntil = -1; }
      else if (remain < 0.8){
        const op = Math.max(0, remain / 0.8);
        p.tagLbl.traverse(ch => { if (ch.material) { ch.material.transparent = true; ch.material.opacity = op; } });
      }
    }
  });

  // the payoff, confirmed: flash + chord every time the row genuinely re-syncs at a multiple of 24 s
  if (released){
    const cyc = Math.floor(simT / 24 + 1e-6);
    if (cyc > lastCycle && cyc > 0){
      lastCycle = cyc;
      flashUntil = clockT + 0.4;
      tone(200, 0.16, 'sine'); tone(300, 0.16, 'sine'); tone(400, 0.22, 'sine');
    }
    // free bonus beat: at t = 12 s (mod 24) the row splits into a striking two-comb pattern by parity of n
    const half = Math.floor((simT - 12) / 24 + 1e-6);
    if (half > lastHalf && half >= 0){ lastHalf = half; halfFlashUntil = clockT + 3; tone(260, 0.12, 'triangle'); }
  }
  railMat.color.setHex(clockT < flashUntil ? C.teal : C.white);

  // the sign repaints only when its transient third line changes state — not on a timer.
  const extra = currentExtra();
  if (extra !== prevExtra){ prevExtra = extra; signLbl.setText(signText()); }

  // the clock is a short, cheap single line — fine to repaint at 10 Hz on its own small canvas.
  clockTimer += dt;
  if (clockTimer >= 0.1){ clockTimer = 0; clockLbl.setText(`t = ${simT.toFixed(1)} s`); }
}

XR.run({ build, frame });
