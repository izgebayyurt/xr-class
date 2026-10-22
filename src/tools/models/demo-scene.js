const { THREE, scene, shape, model, place, label, interactive, tone, ui, H, C } = XR;
function build(){
  const card = ui.sign('Model library test\nReal sizes: a table, a chair, an apple on the table, a car behind.');
  const table = model('table', { slot:'stage', dist:2.2 });
  const chair = model('chair', { dist:2.2, dir:-25 });
  const apple = model('apple'); apple.position.set(table.position.x, 0.75, table.position.z); 
  const car = model('car', { dist:6, dir:20 });
  const tree = model('tree', { dist:7, dir:-35 });
  const astro = model('astronaut', { dist:3, dir:28 });
  interactive(chair, { select: () => { tone(500, .1); card.setText('Model library test\nYou clicked the chair.'); } });
}
function frame(dt, t){}
XR.run({ build, frame });
