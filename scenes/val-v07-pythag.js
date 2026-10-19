const { THREE, scene, label, interactive, tone, mat, sky, ground, ui, C } = XR;

function build(){
  sky({ top:'dark', bottom:'blue' });
  ground({ color:'teal', grid:false, arrow:false });

  // ---- the 3-4-5 right triangle, all numbers computed from a and b ----
  const a = 3, b = 4, c = Math.hypot(a, b);
  const S = 0.16, FX = 0.55, FY = 1.08, FZ = -2.6;               // metres per unit, board centre x, origin height, board depth
  const W = p => new THREE.Vector3(FX + S*(p.x - 1.5), FY + S*p.y, FZ);
  const fmt = v => String(Math.round(v*100)/100);
  const area = p => Math.abs(p.reduce((s, q, i) => { const r = p[(i+1) % p.length]; return s + q.x*r.y - r.x*q.y; }, 0)) / 2;
  const mean = p => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  const clip = (poly, o, n) => {                                  // keep the part of a convex polygon on the +n side of a line through o
    const out = [];
    poly.forEach((p, i) => {
      const q = poly[(i+1) % poly.length];
      const dp = (p.x-o.x)*n.x + (p.y-o.y)*n.y, dq = (q.x-o.x)*n.x + (q.y-o.y)*n.y;
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const t = dp/(dp-dq); out.push({ x: p.x + t*(q.x-p.x), y: p.y + t*(q.y-p.y) }); }
    });
    return out.filter((p, i) => { const q = out[(i+1) % out.length]; return Math.hypot(p.x-q.x, p.y-q.y) > 1e-6; });
  };

  // right angle at (0,0); leg a along +x, leg b along +y; hypotenuse runs from (a,0) to (0,b)
  const u = { x: -a/c, y: b/c };                                  // along the hypotenuse
  const v = { x: b/c, y: a/c };                                   // square to it, pointing away from the triangle
  const Asq = [{x:0, y:0}, {x:a, y:0}, {x:a, y:-a}, {x:0, y:-a}];
  const Bsq = [{x:-b, y:0}, {x:0, y:0}, {x:0, y:b}, {x:-b, y:b}];
  const Csq = [{x:a, y:0}, {x:a+b, y:a}, {x:b, y:a+b}, {x:0, y:b}];
  const M = mean(Bsq), Cc = mean(Csq), Ac = mean(Asq);

  const flat = (pts, g, color, opacity) => {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2((p.x-g.x)*S, (p.y-g.y)*S)));
    const o = { side: THREE.DoubleSide };
    if (opacity < 1) { o.opacity = opacity; o.transparent = true; }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat(color, o));
    m.position.copy(W(g));
    scene.add(m);
    return m;
  };

  const tri = [{x:0, y:0}, {x:a, y:0}, {x:0, y:b}];
  flat(tri, mean(tri), C.green, 1);
  const bedA = flat(Asq, Ac, C.grey, 0.35);
  const bedB = flat(Bsq, M, C.grey, 0.35);
  const bedC = flat(Csq, Cc, C.blue, 0.5);
  label(`a² = ${a}×${a} = ${fmt(a*a)}`, { parent: bedA, at: [0, 0, 0.05], capHeight: 0.035, bg: false });
  label(`b² = ${b}×${b} = ${fmt(b*b)}`, { parent: bedB, at: [0, 0, 0.05], capHeight: 0.035, bg: false });
  const cLabel = label(`c² = ${fmt(c)}×${fmt(c)} = ${fmt(c*c)}`, { parent: bedC, at: [0, 0, 0.05], capHeight: 0.04, bg: false });

  // ---- cut the b-square through its centre: one line along the hypotenuse, one square to it ----
  const specs = [];
  const colors = [C.orange, C.pink, C.purple, C.teal];
  let k = 0;
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([su, sv]) => {
    let poly = clip(Bsq, M, { x: su*u.x, y: su*u.y });
    poly = clip(poly, M, { x: sv*v.x, y: sv*v.y });
    // slide so the piece's corner at the b-square's centre lands in a corner of the c-square
    const T = { x: Cc.x - su*c/2*u.x - sv*c/2*v.x - M.x, y: Cc.y - su*c/2*u.y - sv*c/2*v.y - M.y };
    specs.push({ poly, T, color: colors[k++] });
  });
  specs.push({ poly: Asq, T: { x: Cc.x - Ac.x, y: Cc.y - Ac.y }, color: C.yellow });

  const pieces = specs.map(sp => {
    const g = mean(sp.poly);
    const m = flat(sp.poly, g, sp.color, 1);
    m.position.z = FZ + 0.03;
    m.userData.home = m.position.clone();
    m.userData.target = W({ x: g.x + sp.T.x, y: g.y + sp.T.y }).setZ(FZ + 0.03);
    m.userData.area = area(sp.poly);
    m.userData.placed = false;
    return m;
  });

  // ---- card, guess, start over ----
  let unlocked = false, guessIdx = null;
  const intro = 'Squares on the sides of a right triangle.\nIs a² + b² less than, equal to, or more than c²?\nPoint at your guess and click.';
  const card = ui.sign('Pythagoras by hand\n' + intro, { dist: 'room', dir: -20, height: 'eye', width: 0.95 });
  const say = t => card.setText('Pythagoras by hand\n' + t);

  const truth = area(Asq) + area(Bsq);
  const answerIdx = Math.abs(truth - area(Csq)) < 1e-6 ? 1 : (truth < area(Csq) ? 0 : 2);

  const guess = ui.choices(['Less', 'Equal', 'More'], { dist: 'near', dir: 'ahead', height: 'waist', onPick: (i, t, row) => {
    guessIdx = i;
    row.lock();
    unlocked = true;
    refresh();
  } });

  const goHome = p => { p.position.copy(p.userData.home); p.quaternion.identity(); };
  const tmp = new THREE.Vector3();

  function finish(){
    const placedArea = pieces.reduce((s, p) => s + p.userData.area, 0);
    say(`The five pieces cover c² exactly:\n${fmt(a*a)} + ${fmt(b*b)} = ${fmt(placedArea)} = ${fmt(area(Csq))}.\nSo a² + b² = c² is a fact about area: the two small squares, cut up, are the big square.`);
    if (guessIdx !== null) { guess.mark(guessIdx, guessIdx === answerIdx ? 'right' : 'wrong'); if (guessIdx !== answerIdx) guess.mark(answerIdx, 'right'); }
  }

  function refresh(){
    const n = pieces.filter(p => p.userData.placed).length;
    cLabel.visible = n === 0;
    if (!unlocked) { say(intro); return; }
    if (n < pieces.length) say(`Test it: carry each coloured piece into the big blue square.\nPieces slide; they never turn.\n${n} of ${pieces.length} placed.`);
    else finish();
  }

  pieces.forEach(p => {
    interactive(p, {
      grab: true,
      select: () => { if (!unlocked) return; p.userData.placed = false; refresh(); },
      release: () => {
        if (!unlocked) { goHome(p); return; }
        p.getWorldPosition(tmp);
        if (tmp.distanceTo(p.userData.target) < 0.22) {
          p.position.copy(p.userData.target); p.quaternion.identity(); p.userData.placed = true;
          tone(660, 0.12, 'triangle');
        } else {
          goHome(p);
        }
        refresh();
      }
    });
  });

  ui.button('Start over', { dist: 'near', dir: 'ahead-right', height: 'waist', onPress: () => {
    pieces.forEach(p => { goHome(p); p.userData.placed = false; });
    unlocked = false; guessIdx = null;
    guess.reset();
    refresh();
  } });
}

function frame(dt, t){
}

XR.run({ build, frame });
