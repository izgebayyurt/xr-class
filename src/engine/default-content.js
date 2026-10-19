const { THREE, scene, shape, place, label, interactive, tone, mat, sky, ground, ui, geo, template, H, C, input, onButton, stations } = XR;

function build(){
  // Example (replace everything in build()): card → guess → act → computed result → explore.
  // Slots keep things apart: ui.sign → the card; buttons, choices, sliders → the controls row; readouts → the side; slot:'stage' → the main thing.
  const f = x => x*x;
  const slopeAt = x => (f(x + 1e-4) - f(x - 1e-4)) / 2e-4;          // measured from the curve, not typed in
  const ask = 'Slope explorer\nHow steep is y = x² at x = 1? Pick your guess below.';
  const card = ui.sign(ask);
  const plot = geo.plot(f, { xmin:-2, xmax:2, slot:'stage', height:'chest' });
  const out = ui.readout('');
  const show = x => { plot.mark(x); out.setText(`slope at x = ${x.toFixed(1)}: ${slopeAt(x).toFixed(2)}`); };
  const guess = ui.choices(['1', '2', '4'], { onPick: (i, t, row) => {
    const s = slopeAt(1), right = Math.abs(+t - s) < 0.01; row.lock(); row.mark(i, right ? 'right' : 'wrong');
    card.setText(`Slope explorer\n${right ? 'Right!' : 'Not quite.'} At x = 1 the slope is ${s.toFixed(2)}. Drag the orange knob: the slope is always twice x.`);
    slider.visible = true; out.visible = true; again.visible = true; show(1);
  } });
  const slider = ui.slider({ min:-2, max:2, value:1, step:0.1, onChange: show });
  const again = ui.button('Start over', { onPress: () => {
    guess.reset(); slider.visible = false; out.visible = false; again.visible = false; card.setText(ask);
  } });
  slider.visible = false; out.visible = false; again.visible = false;   // revealed after the guess
}

function frame(dt, t){
  // runs every frame (dt = seconds since last frame, t = seconds since start)
}

XR.run({ build, frame });
