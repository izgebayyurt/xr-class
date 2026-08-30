const { THREE, scene, shape, place, label, interactive, tone, remove, mat, H, C, ground, sky, stations, camera } = XR;

// "Where Does a Million Go?" — a 6.0 m floor line from 1 to 1,000,000,000.
// A million belongs 0.006 m from the start; visitors walk to where they think it is.
// Round 3: panel is capped + top-anchored so it can't grow through the floor, endpoint numbers billboard
// instead of lying flat (legible at any distance), the needle is taller and touches the floor for real,
// and OFFSET is shortened to pull the room back toward the kit's stated 'far' envelope.

const LEN = 6.0;                    // exact line length — do not change
const TRUE_M_DIST = 0.006;          // exact linear position of one million, from the line's start — do not change
const OFFSET = 0.6;                 // spawn stands this far behind the "1" mark — shortened from round2's 0.65
const NEEDLE_H = 1.0;                // waist-high, taller than "knee" so more of it sits above eye-down gaze; pinned number is horizontal, height is free
const RULER_VALUES = ['1', '10', '100', '1 thousand', '10 thousand', '100 thousand',
                       '1 million', '10 million', '100 million', '1 billion'];
const MILLION_RULER_M = 6 * (LEN / 9);   // where "1 million" sits on the log ruler = 4.0 m

let marker = null, panel = null, ruler = null, rulerOn = false;
let needleMesh, needleFlashLeft = 0;
let lastLine = null;                // stashed result phrase, reused when the ruler is toggled after the fact

const PANEL_OPTS = { dist: OFFSET + LEN + 0.25, dir: 'ahead', height: 2.55, anchor: 'top', size: 'comfortable', width: 3.4,
                      title: true, theme: 'dark', accent: '#e5433d' };   // anchor:'top' — grows downward, never through the floor; 'comfortable' + wider keeps the grown state short

const TITLE = 'Where Does a Million Go?';
const INSTRUCTION = 'This line runs from 1 to 1,000,000,000. Walk to where a million belongs, then point here.';
const MICRO_LINE = 'A thousand sits 6 micrometres along. Thinner than a hair.';

function refreshPanel(){
  // idle: title + the required instruction (its job is done once a result exists — dropped below, capped height).
  if (!marker){ panel.setText(`${TITLE}\n${INSTRUCTION}`); return; }
  // result: title + ONE wrapping paragraph (result + the required micrometre line + the ruler payoff when
  // shown). Each extra \n-separated entry costs its own fixed vertical slot on top of anchor:'top' — a
  // single paragraph that wraps costs far less, which is how the panel stays capped under ~2 m.
  let text = `${TITLE}\n${lastLine} One million belongs at 0.006 m — 6 mm from the start. ${MICRO_LINE}`;
  if (rulerOn){
    text += ` On the ruler your feet used, each mark is ten times the last — a million sits at ${MILLION_RULER_M.toFixed(1)} m.`;
  }
  panel.setText(text);
}

function onPanelSelect(){
  if (marker){                                    // interaction 2: clear, repeatable
    remove(marker); marker = null; lastLine = null;
    refreshPanel();
    tone(300, 0.15, 'sine');
    return;
  }
  // interaction 1: where did my feet stop, measured along the line from its start?
  const v = new THREE.Vector3();
  camera.getWorldPosition(v);
  const rawD = -v.z - OFFSET;                     // distance from the "1" mark
  const underStart = rawD < 0, overPast = rawD > LEN;
  const d = Math.min(LEN, Math.max(0, rawD));
  lastLine = underStart ? `You hadn't reached the line yet — that reads as 0.0 m.`
           : overPast   ? `You walked past the far end — that reads as ${LEN.toFixed(1)} m.`
           :              `You stood at ${d.toFixed(1)} m.`;

  marker = shape.cylinder(0.025, 0.15, 'white');   // dropped at the visitor's REAL footprint, not projected onto the line
  marker.position.set(v.x, 0.075, v.z);
  scene.add(marker);

  needleFlashLeft = 3.2;                           // the red needle flashes, held long enough to turn and see it
  refreshPanel();
  tone(520, 0.2, 'sine');
}

function onNeedleSelect(){                        // interaction 3: reveal the log ruler
  rulerOn = !rulerOn;
  ruler.visible = rulerOn;
  refreshPanel();
  tone(rulerOn ? 700 : 260, 0.18, 'triangle');
}

function build(){
  ground({ color: 'dark', grid: false, arrow: false });
  sky({ top: 'black', bottom: 'dark' });   // stark/accusing, not a cheerful blue sky over a floor line about scale

  // the line itself: a hand-wide white strip, exactly 6.0 m, starting OFFSET ahead of the spawn point
  const strip = shape.box(0.1, 0.006, LEN, 'white');
  strip.position.set(0, 0.003, -(OFFSET + LEN / 2));
  scene.add(strip);

  // "1" and "1,000,000,000" at the strip's two ends. Free labels (not flat-parented) so they billboard
  // to the visitor at every distance — a flat floor label reads fine near the "1" but smears to nothing
  // at 6.5 m of grazing incidence; 'size' keeps both legible regardless of how far away they are.
  label('1', { dist: OFFSET, dir: 'ahead', height: 0.15, size: 'comfortable', bg: false });
  label('1,000,000,000', { dist: OFFSET + LEN, dir: 'ahead', height: 0.15, size: 'large', width: 2.0, bg: false });

  // the panel, just past the far end, top edge pinned near eye height; a generous invisible hit box gives it real hover/point feedback
  panel = label(`${TITLE}\n${INSTRUCTION}`, PANEL_OPTS);
  const panelHit = shape.hit(3.6, 2.4, 0.05);
  place(panelHit, { dist: PANEL_OPTS.dist, dir: 'ahead', height: 'eye' });
  interactive(panelHit, { select: onPanelSelect });

  // the red needle: standing at the TRUE linear position of one million (looks like zero). Taller than
  // "knee" so its tip reaches into the opening view — the pinned number is the 6 mm horizontal offset,
  // never the height. The hit sphere is added AFTER place() so it can't dominate the group's bounding
  // box and lift the needle off the floor (place() anchors on whatever children exist at call time).
  const needleGroup = shape.group();
  needleMesh = shape.cylinder(0.012, NEEDLE_H, 'red');
  needleMesh.position.y = NEEDLE_H / 2;
  needleGroup.add(needleMesh);
  place(needleGroup, { dist: OFFSET + TRUE_M_DIST, dir: 'ahead', height: 'floor', anchor: 'bottom' });
  const needleHit = shape.hitball(NEEDLE_H / 2);   // thin needle — a generous invisible sphere is the real target (radius == half NEEDLE_H so it still touches, never dips below, the floor)
  needleHit.position.y = NEEDLE_H / 2;
  needleGroup.add(needleHit);
  interactive(needleHit, { select: onNeedleSelect });

  // the hidden log ruler: ten evenly spaced marks, 1 .. 1 billion, revealed by the needle. Thin boxes, not hairlines.
  ruler = shape.group();
  for (let i = 0; i < 10; i++){
    const z = -(OFFSET + i * (LEN / 9));
    const tick = shape.box(0.16, 0.006, 0.02, 'white');
    tick.position.set(0, 0.008, z);
    ruler.add(tick);
    label(RULER_VALUES[i], { parent: ruler, at: [0.7, 0.1, z], capHeight: 0.07, bg: false });   // parent: ruler already attaches it
  }
  ruler.visible = false;
  scene.add(ruler);

  // where a visitor will actually stand: spawn (facing the needle, out of its way) and mid-line (a typical guess spot)
  stations.push([0, 0, 0]);
  stations.push([0, -(OFFSET + LEN / 2), 0]);
}

function frame(dt){
  if (needleFlashLeft > 0){
    needleFlashLeft -= dt;
    const on = needleFlashLeft > 0 && Math.floor(needleFlashLeft * 6) % 2 === 0;
    needleMesh.material.color.setHex(on ? C.white : C.red);
    if (needleFlashLeft <= 0) needleMesh.material.color.setHex(C.red);
  }
}

XR.run({ build, frame });
