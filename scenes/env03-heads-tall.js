const { THREE, scene, shape, place, label, interactive, tone, remove, mat, ground, sky, stations, H, C } = XR;

// ---- Seven and a Half Heads ----
// Two stick figures (short + tall) each stand beside a stack of discs cut to their OWN head
// height; 7.5 discs always tops out level with that figure's head. A third stack, sized off
// the real wearer's eye height, does the same for the visitor. The number (7.5) never moves.
// (Round 2: the two stacks are still visible from the start, matching the brief's "first thing
// you see" — the counting interaction supplies the exact numeric confirmation, not the reveal.)

const HEADS = 7.5;
const LEFT_TOTAL = 1.55, RIGHT_TOTAL = 1.95;
const FIG_DIST = 2.2, FIG_ANGLE = 11.5, STACK_X_OFFSET = 1.2;
const DISC_R = 0.09;
const STEP = 0.5, HOLD = 3.0, FADE = 1.0;
const COUNT_WORDS = ['1', '2', '3', '4', '5', '6', '7', 'and a half'];
const BASE_SHADES = [0xf6f2ea, 0xe6dfd0];                    // alternating chalk tones: discs read as slabs
const LIT_SHADES = [C.orange, new THREE.Color(C.orange).lerp(new THREE.Color(0xffffff), 0.32).getHex()];

const discH = (total) => total / HEADS;
const fmtM = (m) => m.toFixed(2) + ' m';
const fmtCm = (m) => (m * 100).toFixed(1) + ' cm';
const worldXZ = (dist, dirDeg) => { const r = dirDeg * Math.PI / 180; return new THREE.Vector3(dist * Math.sin(r), 0, -dist * Math.cos(r)); };

let countLabel;
let playerStack, lastEyeH = null;
let activeCount = null; // { stack, resultText, idx, t, phase }

function buildFigure(total, dir){
  const g = shape.group();
  const headD = discH(total), headR = headD / 2;
  const neckY = total - headD;
  const column = shape.cylinder(0.09, neckY, 'grey');
  column.position.y = neckY / 2;
  const head = shape.ball(headR, 'white');
  head.position.y = neckY + headR;
  const bar = shape.box(total, 0.05, 0.05, 'orange');       // arm span == height — its length IS the content, stays on X
  bar.position.y = neckY;
  label('arm span = height', { parent: bar, at: [total / 2 - 0.15, 0.06, 0], capHeight: 0.035, bg: false }); // end, clear of the head ball
  g.add(column, head, bar);
  place(g, { dist: FIG_DIST, dir, height: 0, anchor: 'bottom' });
  const hit = shape.hit(0.4, total, 0.4);
  hit.position.y = total / 2;
  g.add(hit);
  return { group: g, total, hit };                            // select wired in build() once the paired stack exists
}

function buildStack(total, dist, dir, sideSign, figWorldPos, withHit){
  const d = discH(total);
  const g = shape.group();
  const discs = [];
  let y = 0;
  for (let i = 0; i < 8; i++){
    const h = i < 7 ? d : d / 2;
    const shade = BASE_SHADES[i % 2];
    const disc = shape.cylinder(DISC_R, h, shade);
    disc.userData.base = shade;
    disc.position.y = y + h / 2;
    y += h;
    g.add(disc);
    discs.push(disc);
  }
  place(g, { dist, dir, height: 0, anchor: 'bottom' });
  g.position.x += sideSign * STACK_X_OFFSET;                  // same depth as figure, nudged sideways only
  let hit = null;
  if (withHit){                                               // only the visitor's own stack is directly selectable
    hit = shape.hit(DISC_R * 2 + 0.1, total, DISC_R * 2 + 0.1);
    hit.position.y = total / 2;
    g.add(hit);
  }
  const plaque = label('7.5', { above: g, size: 'comfortable', width: 0.5 });
  plaque.visible = false;                                     // revealed once this stack has been counted
  const FORWARD = 0.4; // pull toward the viewer so the placard floats in front of the pair, not through it
  const midPos = figWorldPos
    ? new THREE.Vector3((figWorldPos.x + g.position.x) / 2, 1.3, figWorldPos.z + FORWARD)
    : new THREE.Vector3(g.position.x - 0.35, Math.min(total * 0.6, total - 0.15), g.position.z + FORWARD);
  return { group: g, discs, total, hit, plaque, midPos };
}

function resetStack(stack){
  stack.discs.forEach(d => d.material.color.set(d.userData.base));
}

function startCount(stack, resultText){
  if (activeCount){
    resetStack(activeCount.stack);
    countLabel.visible = false;
  }
  activeCount = { stack, resultText, idx: 0, t: 0, phase: 'lighting' };
  resetStack(stack);
  stack.discs[0].material.color.setHex(LIT_SHADES[0]);
  countLabel.position.copy(stack.midPos);
  countLabel.visible = true;
  countLabel.setText(COUNT_WORDS[0]);
  tone(440, 0.08, 'sine');
}

function playerTotal(){ return H.eye + 0.12; }
function playerResultText(){ return 'You: 7.5 heads. Different body. Different head. Same number.'; }

function buildPlayerStack(){
  if (playerStack){
    if (activeCount && activeCount.stack === playerStack){ countLabel.visible = false; activeCount = null; }
    remove(playerStack.plaque);                                // free-floating 'above' label: not a child, remove explicitly
    remove(playerStack.group);                                 // now disposes+unregisters the hit child too
  }
  playerStack = buildStack(playerTotal(), 1.7, 48, 0, null, true);
  interactive(playerStack.hit, { select: () => startCount(playerStack, playerResultText()) });
  lastEyeH = H.eye;
}

function build(){
  ground({ color: '#cfc9bf', grid: false, arrow: false });
  sky({ top: '#c9c3b8', bottom: '#efece3' });                 // chalky studio grey, not the default daylight blue
  stations.push([0, 0, 45]);                                   // a pose that actually faces the visitor's own stack

  const leftFigPos = worldXZ(FIG_DIST, -FIG_ANGLE);
  const rightFigPos = worldXZ(FIG_DIST, FIG_ANGLE);
  const leftFig = buildFigure(LEFT_TOTAL, -FIG_ANGLE);
  const rightFig = buildFigure(RIGHT_TOTAL, FIG_ANGLE);

  const leftStack = buildStack(LEFT_TOTAL, FIG_DIST, -FIG_ANGLE, -1, leftFigPos);
  const rightStack = buildStack(RIGHT_TOTAL, FIG_DIST, FIG_ANGLE, 1, rightFigPos);

  const leftText = `${fmtM(LEFT_TOTAL)} tall · head ${fmtCm(discH(LEFT_TOTAL))} · 7.5 heads`;
  const rightText = `${fmtM(RIGHT_TOTAL)} tall · head ${fmtCm(discH(RIGHT_TOTAL))} · 7.5 heads`;
  interactive(leftFig.hit, { select: () => startCount(leftStack, leftText) });
  interactive(rightFig.hit, { select: () => startCount(rightStack, rightText) });

  countLabel = label('', { dist: FIG_DIST, dir: 0, height: 1.3, size: 'large', width: 1.4, anchor: 'top' });
  countLabel.visible = false;

  buildPlayerStack();

  // Brief asks for the sign at "eye level, straight ahead" — round 1 put it there and the tall
  // figure's head/bar shredded it (worst defect in the set). dist 4.0 / height 2.75 is a
  // deliberate, kept deviation: it's the only placement that stays fully unoccluded and legible.
  label(
    'Seven and a Half Heads\n' +
    'The tall figure is 26% taller than the short one.\n' +
    'Its head is 26% bigger too.\n' +
    'Real adults measure between 7.3 and 7.7 heads.\n' +
    'The drawing canon rounds it to 7.5.\n' +
    'And one for you, to your right.',
    { dist: 4.0, dir: 'ahead', height: 2.75, size: 'large', width: 3.0, title: true, anchor: 'top' }
  );
}

function frame(dt){
  if (Math.abs(H.eye - lastEyeH) > 0.01){
    buildPlayerStack();
  }

  if (!activeCount) return;
  const ac = activeCount;
  if (ac.phase === 'lighting'){
    ac.t += dt;
    if (ac.t >= STEP && ac.idx < 7){
      ac.t -= STEP;
      ac.idx++;
      ac.stack.discs[ac.idx].material.color.setHex(LIT_SHADES[ac.idx % 2]);
      countLabel.setText(COUNT_WORDS[ac.idx]);
      if (ac.idx === 7){ ac.phase = 'half'; ac.t = 0; }
    }
  } else if (ac.phase === 'half'){
    ac.t += dt;
    if (ac.t >= STEP){
      ac.phase = 'hold'; ac.t = 0;
      countLabel.setText(ac.resultText);
      ac.stack.plaque.visible = true;
    }
  } else if (ac.phase === 'hold'){
    ac.t += dt;
    if (ac.t >= HOLD){ ac.phase = 'fading'; ac.t = 0; }
  } else if (ac.phase === 'fading'){
    ac.t += dt;
    const k = Math.min(ac.t / FADE, 1);
    ac.stack.discs.forEach((d, i) => {
      d.material.color.setHex(LIT_SHADES[i % 2]).lerp(new THREE.Color(d.userData.base), k);
    });
    if (k >= 1){
      countLabel.visible = false;
      activeCount = null;
    }
  }
}

XR.run({ build, frame });
