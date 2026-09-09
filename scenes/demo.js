const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, ui, geo, template, H, C, input, onButton, onController, stations } = XR;

function build(){
  // --- Example scene (delete everything in build() and write your own). It uses the ready-made widgets: ---
  ui.sign('Slope explorer\nDrag the slider; the dot rides the curve and the tangent tilts.', { dist:'room', dir:'ahead', height:'eye' });
  const plot = geo.plot(x => x*x, { xmin:-2, xmax:2, dist:'room', dir:'ahead-left', height:'chest' });
  const slope = ui.readout('slope = ', { decimals:2, dist:'near', dir:'ahead', height:'shoulder' });
  ui.slider({ min:-2, max:2, value:0.5, step:0.1, dist:'reach', dir:'ahead', height:'waist',
    onChange: v => { plot.mark(v); slope.set(2*v); } });
  ui.choices(['1', '2', '4'], { dist:'near', dir:'ahead-right', height:'chest',
    onPick: (i, t, row) => { row.mark(i, t === '2' ? 'right' : 'wrong'); if (t === '2') slope.setText('slope at x = 1 is 2 — the derivative of x² is 2x'); } });
  const ball = shape.ball(0.1, 'orange');
  place(ball, { dist:'reach', dir:-25, height:'chest' });
  interactive(ball, { grab:true, select: () => tone(660, 0.12) });
  label('Grab me', { above: ball, size:'comfortable' });
}

function frame(dt, t){
  // runs every frame (dt = seconds since last frame, t = seconds since start)
}

XR.run({ build, frame });
