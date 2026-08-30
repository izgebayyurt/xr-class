const { THREE, scene, shape, place, label, interactive, tone, bob, mat, H } = XR;

// "How big is a cubic metre?" — reference solution for the test-message brief.
// Three cubes, each 10x wider than the last: 1 cm, 10 cm (1 litre), 1 m.

let hint, hintLeft = 0;
const pulses = [];
const pulse = (obj, amp = 0.35) => pulses.push({ obj, amp, left: 0.45 });

function build(){
  // --- the metre cube: wireframe edges + a barely-there fill so it can be pointed at ---
  const metre = shape.group();
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x14b8a6 }));
  edges.position.y = 0.5;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat('teal', { transparent: true, opacity: 0.05 }));
  fill.position.y = 0.5;
  metre.add(edges, fill);

  // 10x10x10 grid hint on the faces (lines only), hidden until selected
  hint = shape.group();
  const gh = () => { const g = new THREE.GridHelper(1, 10, 0xffffff, 0xffffff); g.material.transparent = true; g.material.opacity = 0.85; return g; };
  const gB = gh(); gB.position.y = 0.002;
  const gT = gh(); gT.position.y = 0.998;
  const gN = gh(); gN.rotation.x = Math.PI / 2; gN.position.set(0, 0.5, -0.498);
  const gS = gh(); gS.rotation.x = Math.PI / 2; gS.position.set(0, 0.5, 0.498);
  const gW = gh(); gW.rotation.z = Math.PI / 2; gW.position.set(-0.498, 0.5, 0);
  const gE = gh(); gE.rotation.z = Math.PI / 2; gE.position.set(0.498, 0.5, 0);
  hint.add(gB, gT, gN, gS, gW, gE); hint.visible = false;
  metre.add(hint);
  place(metre, { dist: 'near', dir: 'ahead', height: 'floor', anchor: 'bottom' });

  const metreLabel = label('1 m³ = 1,000,000 cm³.\nYou could stand inside me.', { above: metre, size: 'comfortable', width: 0.9 });
  metreLabel.visible = false;
  interactive(fill, { select: () => {
    metreLabel.visible = true;
    hint.visible = true; hintLeft = 4;
    hint.children.forEach(g => g.material.opacity = 0.85);
    tone(196, 0.35);
  } });

  // --- the litre cube on a waist-high pedestal, arm's reach to the right ---
  const pedestal = shape.cylinder(0.16, H.waist, 'grey');
  place(pedestal, { dist: 'reach', dir: 'right', height: 'floor', anchor: 'bottom' });
  const litre = shape.box(0.1, 0.1, 0.1, 'yellow');
  place(litre, { dist: 'reach', dir: 'right', height: H.waist + 0.05 });

  const litreLabel = label('1000 cm³ = 1 litre.\n1000 of me fill the metre cube.', { above: litre, size: 'comfortable', width: 0.6 });
  litreLabel.visible = false;
  interactive(litre, { select: () => { litreLabel.visible = true; pulse(litre); tone(440, 0.25); } });

  // --- the centimetre cube floating at arm's reach to the left, chest height ---
  // (a 1 cm cube is nearly impossible to point at, so an invisible sphere is the target)
  const tiny = shape.group();
  const cm = shape.box(0.01, 0.01, 0.01, 'white');
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat('white', { transparent: true, opacity: 0 }));
  tiny.add(cm, proxy);
  place(tiny, { dist: 'reach', dir: 'left', height: 'chest' });
  bob(tiny, 0.01, 3);

  const tinyLabel = label('1 cm³ — a sugar cube.\n1000 of me fill the litre cube.', { above: tiny, size: 'comfortable', width: 0.6 });
  tinyLabel.visible = false;
  interactive(proxy, { select: () => { tinyLabel.visible = true; pulse(cm, 2.5); tone(880, 0.2); } });

  // --- the question, across the room at eye level ---
  label('Every cube here is 10x wider than the last.\nHow many small cubes fill the big one?', { dist: 'room', dir: 'ahead', height: 'eye', size: 'large', width: 2.2 });
}

function frame(dt, t){
  for (let i = pulses.length - 1; i >= 0; i--){
    const p = pulses[i]; p.left -= dt;
    if (p.left <= 0){ p.obj.scale.setScalar(1); pulses.splice(i, 1); continue; }
    p.obj.scale.setScalar(1 + p.amp * Math.sin(Math.PI * (1 - p.left / 0.45)));
  }
  if (hintLeft > 0){
    hintLeft -= dt;
    if (hintLeft <= 0) hint.visible = false;
    else if (hintLeft < 1) hint.children.forEach(g => g.material.opacity = 0.85 * hintLeft);
  }
}

XR.run({ build, frame });
