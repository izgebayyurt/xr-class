# Prompt kit (paste this whole file as your first message, then your brief)

You are writing the CONTENT block of a small WebXR page for a Quest 3. The page's engine is already written and loaded; you only write JavaScript that uses its API. Reply with ONE code block containing the complete CONTENT block and nothing else (no HTML, no imports, no explanations before it). The block must start with `const { ... } = XR;` and end with `XR.run({ build, frame });`.

Rules
- Use only the API below and plain Three.js (available as `THREE` from the XR object). No external files, models, images, fonts or sounds. No libraries.
- Place things with body words (dist/dir/height), never raw coordinates, unless the API gives no other way.
- Put the first thing to look at 'ahead' at 'near'..'room'. Grabbable things go at 'reach'. Text at 'near'..'room', 'eye' or 'chest' height. Stay within 'far'.
- Anything selectable must be easy to hit with a laser from where the user stands. If the visible thing is smaller than an 'apple', drawn as lines/wireframe, or fast-moving, give it an invisible solid stand-in (a box or sphere with opacity ~0) as the actual interactive target.
- Keep frame() cheap. Prefer fewer, larger objects. Under 250 lines.
- If part of the brief is impossible with this API, do the closest thing you can and say so in one line AFTER the code block.

Before you answer, check your block against this list — you will not get to see it run:
1. Every name you call is in the `const { ... } = XR;` line (or called as XR.name).
2. Things on the ground use height:'floor'; text people must read sits between 'chest' and 'eye', within ±35° of ahead.
3. Small, thin or moving things you must point at have a shape.hit / shape.hitball target.
4. Labels are created once in build(); later changes use setText, never remove-and-recreate.
5. Handles use grab:'hold' + drag(); carried things use grab:true; nothing guesses the hand via onController.
6. The lesson is stated in one line of text that appears at the moment the key interaction produces its result.
7. Every ( [ { has its partner — one missing bracket costs a whole round. The block starts with the const line, ends with XR.run({ build, frame }), no markdown/HTML/imports inside.

API cheat sheet
```
CONTENT  (edit this block only)
     API CHEAT SHEET  (everything is on the XR object; units are metres)

     FRAME OF REFERENCE   origin = floor under the user's head at start · user faces -Z · +X = user's right
       H.eye 1.58 · H.shoulder 1.39 · H.chest 1.25 · H.elbow 1.07 · H.waist 1.02 · H.hip 0.90 · H.knee 0.48 (for a 1.70 m person;
       these rescale to the real wearer ~1.5 s into a VR session, and every placed object moves with them)
       distances: 'touch' 0.35 · 'reach' 0.55 (comfortable arm's length) · 'near' 1.0 · 'room' 2.5 · 'far' 6.0 · floor edge 8.0
       directions: 'ahead' · 'ahead-left' · 'ahead-right' (±35°, still inside the comfortable view) · 'left' · 'right' · 'behind' · or degrees (+ = right)
       sizes (largest dimension): 'fingertip' .02 · 'egg' .06 · 'apple' .08 · 'hand' .10 · 'head' .22 · 'torso' .5 · 'person' 1.7 · 'door' 2 · 'car' 4

     SHAPES   shape.box(w,h,d,color) · shape.ball(r,color) · shape.cylinder(r,h,color) · shape.cone(r,h,color) · shape.torus(r,tube,color)
              shape.panel(w,h,color) (flat, faces +Z) · shape.group() · shape.line([[x,y,z],...], color)
              shape.hit(w,h,d) · shape.hitball(r) — invisible pointing targets (for tiny, wireframe or moving things)
              colors: 'red' 'orange' 'yellow' 'green' 'teal' 'blue' 'purple' 'pink' 'white' 'grey' 'dark' 'black' or a hex number
              mat(color, {opacity, transparent, emissive, ...}) for a custom material
              recolour at runtime with the palette: mesh.material.color.setHex(C.teal) — bare CSS names ('green') miss the palette
              a shape.group() renders ONLY once it is scene.add()ed or place()d — a group you never attach is silently invisible

     PLACE    place(obj, { dist, dir, height, anchor:'bottom'|'center', face:true })   ← use words, not coordinates
              fit(obj, 'head' | metres)   scale so its largest dimension matches (bounding box — pointy shapes look smaller than boxes)
              spread([a,b,c], { dist, height, dir, span })   evenly on an arc around the user
              A row of side-by-side things must fit its arc: room per item ≈ dist × angle between items (radians).
              Four 0.3 m pads need ~20° apart at 'near' (1 m); at 'reach' they collide — move the row out, don't shrink the text.
              remove(obj)

     TEXT     label('text', { size:'small'|'comfortable'|'large'|'huge', width: metres, dist, dir, height })   sized by visual angle
              label('text', { above: obj })   floats just above the object.  Free and 'above' labels always turn to face the user.
              label('text', { parent: mesh, at:[x,y,z], capHeight: 0.04 })   glued to the parent: rotates WITH it, never turns to the user.
              Text that belongs on a surface (button, panel, sign board) must be a parented label with bg:false, lifted off the
              surface (offset ≥ 0.03 along its normal) so it doesn't z-fight. Only free-floating text should turn to face the user.
              CHANGING text: lbl.setText('new text') updates a label in place. NEVER remove-and-recreate a label per frame or per
              event — that leaks GPU memory. Make each label once in build(), then setText / .visible from then on.
              A panel grows about its centre when setText adds lines — pass anchor:'top' so it grows downward from a fixed top edge.
              style: theme:'dark'|'light'|'glass' · title:true (first line bigger, rest muted) · accent:'#f28b82' (colour bar) · bg:false (text only, auto-outlined)

     INTERACT interactive(obj, { hover(obj), unhover(obj), select(obj, {point}), release(obj), grab:true|'hold' })
              select = trigger press (VR) / click (desktop) while pointing at it. Objects glow on hover by default.
              grab:true carries the object in the hand. grab:'hold' is for handles that must NOT move on their own (slider knobs,
              cranks, press-and-hold pads): select fires on grab, release on let-go, the engine never repositions the object, and
              drag(obj, {point, pointer}) fires EVERY FRAME while held with where the pointer ray now points — clamp/map that point
              onto your rail or dial yourself. Use drag; do not guess the hand via onController (wrong hand, dead on desktop).
              Register interactive() on the handle users see (a group is fine) — never grab:true on an invisible child proxy.
              tone(freqHz, seconds, 'sine'|'square'|'triangle')   spin(obj, degPerSec, 'x'|'y'|'z')   bob(obj, amplitude, period)

     BUTTONS  onButton((name, pressed, pointer) => ...)  name: 'A' 'B' (right) 'X' 'Y' (left) 'trigger' 'squeeze' 'thumbstick' · button('A') = held now?
              input.teleport = 'thumbstick' | 'A' | 'both' | 'none' · input.teleportGuard = () => false to suppress teleport (e.g. while aiming)
              onController((p, connected) => { if (p.hand === 'right') p.object.add(thing) })   put something "in the hand" (do it here, not in build) · teleportTo(point)
     WORLD    ground({ color:'green', grid:false, arrow:false, radius: 25 })   radius = how far you can teleport (default 8 m)
              sky({ top:'black', bottom:'dark' })   retint the sky + horizon to match the mood (default is daylight blue)
              stations.push([x, z, facingDeg])  places the user will stand; the audit judges each object from the nearest one
              After place()ing a group, zero any child offset you parked "for the bounding box" — place() anchors on the whole
              group's box, and a forgotten mid-height child silently lifts or misplaces everything (use numeric height instead).
     LOOP     frame(dt, t) runs every frame.   XR.camera.getWorldPosition(v) = where the user's head is now.

     RULES    • Every name you call must appear in your `const { ... } = XR;` line — sky, mat, remove, spread included. A name you
                forgot to destructure is the #1 crash ("sky is not defined"); when in doubt call it as XR.sky(...).
              • Everything you build goes inside build(). Keep frame() cheap.  • Put the first thing to look at 'ahead' at 'near'..'room'.
              • Grabbable things go at 'reach'. Things to read go at 'near'..'room', 'eye' or 'chest' height.  • Stay within 'far'.
              • Never place anything at 'touch' height 'eye' (it's in the user's face).  • No external files, models, images or fonts.
              • Interactive things and text live in the front arc (±60° max; ±35° is comfortable) unless a station faces them.
              • End with the payoff: after the key interaction, one line of text must state the lesson itself — the comparison or
                number the room exists to teach. It appears AT the moment and place the result appears (gated on that interaction,
                where the visitor is already looking) — never as a standing caption shown before the experience.
              • Never distort a meaning-carrying object to silence an audit warning — if its size, orientation or position IS the
                content, move its neighbours instead. Any lift-off nudge stays small relative to the quantity being measured.
              • THREE.InstancedMesh: set .frustumCulled = false (its auto bounds don't follow your instances).
```

The CONTENT block always has this shape:
```js
const { THREE, scene, shape, place, fit, spread, remove, label, interactive, tone, spin, bob, mat, sky, ground, H, C, input, onButton, onController, stations } = XR;

function build(){
  // --- Example scene: delete everything in build() and write your own ---
  const ball = shape.ball(0.12, 'orange');
  place(ball, { dist:'reach', dir:'ahead', height:'chest' });
  interactive(ball, { grab:true, select: () => tone(660, 0.12) });
  label('Grab me', { above: ball, size:'comfortable' });

  const pedestal = shape.cylinder(0.25, 0.9, 'grey');
  place(pedestal, { dist:'near', dir:'ahead-right', height:'floor' });
  const cube = shape.box(0.25, 0.25, 0.25, 'blue');
  place(cube, { dist:'near', dir:'ahead-right', height: 0.9 + 0.125 });
  spin(cube, 40);
  interactive(cube, { select: (obj) => { obj.material.color.setHex(Math.random()*0xffffff); tone(440, 0.1, 'triangle'); } });
  label('Point and pull the trigger', { above: cube, size:'comfortable', width: 0.6 });

  const sign = label('Welcome.\nWalk around with the thumbstick;\npoint and pull the trigger to interact.', { dist:'room', dir:'ahead', height:'eye', size:'large', width: 1.6 });
}

function frame(dt, t){
  // runs every frame (dt = seconds since last frame, t = seconds since start)
}

XR.run({ build, frame });
```

---- My brief (from the questionnaire) ----
A. You put on the headset and you're standing in a tiny solar system you can touch.
After two minutes a visitor should feel how the planets compare in size and how empty space is.
Tier: 2 (Touch).
B. Posture: standing in place.
First thing you see: the sun, glowing, about beach-ball sized, a step away straight ahead at chest height.
Everything else: the planets in a line going away from the sun, getting smaller and farther apart. 5 planets is enough. Little name tags under them.
Nothing behind me.
C. Interactions:
1. You do: point + trigger — to: any planet — and it: gets bigger for a second and shows one fact about it — then: repeatable.
2. You do: point + trigger — to: the sun — and it: the planets each do one lap around it — then: stops after the lap.
D. (blank)
E. Mood: calm, dark, spacey. Colours: you choose.
F. Out of scope: no real orbital physics, no moons, no sound needed.
Cut first: the lap animation.
Don't change: (blank)
