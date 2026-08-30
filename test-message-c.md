# Prompt kit (paste this whole file as your first message, then your brief)

You are writing the CONTENT block of a small WebXR page for a Quest 3. The page's engine is already written and loaded; you only write JavaScript that uses its API. Reply with ONE code block containing the complete CONTENT block and nothing else (no HTML, no imports, no explanations before it). The block must start with `const { ... } = XR;` and end with `XR.run({ build, frame });`.

Rules
- Use only the API below and plain Three.js (available as `THREE` from the XR object). No external files, models, images, fonts or sounds. No libraries.
- Place things with body words (dist/dir/height), never raw coordinates, unless the API gives no other way.
- Put the first thing to look at 'ahead' at 'near'..'room'. Grabbable things go at 'reach'. Text at 'near'..'room', 'eye' or 'chest' height. Stay within 'far'.
- Anything selectable must be easy to hit with a laser from where the user stands. If the visible thing is smaller than an 'apple', drawn as lines/wireframe, or fast-moving, give it an invisible solid stand-in (a box or sphere with opacity ~0) as the actual interactive target.
- Keep frame() cheap. Prefer fewer, larger objects. Under 250 lines.
- If part of the brief is impossible with this API, do the closest thing you can and say so in one line AFTER the code block.

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
              colors: 'red' 'orange' 'yellow' 'green' 'teal' 'blue' 'purple' 'pink' 'white' 'grey' 'dark' 'black' or a hex number
              mat(color, {opacity, transparent, emissive, ...}) for a custom material

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
              style: theme:'dark'|'light'|'glass' · title:true (first line bigger, rest muted) · accent:'#f28b82' (colour bar) · bg:false (text only, auto-outlined)

     INTERACT interactive(obj, { hover(obj), unhover(obj), select(obj, {point}), release(obj), grab:true })
              select = trigger press (VR) / click (desktop) while pointing at it. Objects glow on hover by default.
              tone(freqHz, seconds, 'sine'|'square'|'triangle')   spin(obj, degPerSec, 'x'|'y'|'z')   bob(obj, amplitude, period)

     BUTTONS  onButton((name, pressed, pointer) => ...)  name: 'A' 'B' (right) 'X' 'Y' (left) 'trigger' 'squeeze' 'thumbstick' · button('A') = held now?
              input.teleport = 'thumbstick' | 'A' | 'both' | 'none' · input.teleportGuard = () => false to suppress teleport (e.g. while aiming)
              onController((p, connected) => { if (p.hand === 'right') p.object.add(thing) })   put something "in the hand" (do it here, not in build) · teleportTo(point)
     WORLD    ground({ color:'green', grid:false, arrow:false, radius: 25 })   radius = how far you can teleport (default 8 m)
              stations.push([x, z, facingDeg])  places the user will stand; the audit judges each object from the nearest one
     LOOP     frame(dt, t) runs every frame.   XR.camera.getWorldPosition(v) = where the user's head is now.

     RULES    • Everything you build goes inside build(). Keep frame() cheap.  • Put the first thing to look at 'ahead' at 'near'..'room'.
              • Grabbable things go at 'reach'. Things to read go at 'near'..'room', 'eye' or 'chest' height.  • Stay within 'far'.
              • Never place anything at 'touch' height 'eye' (it's in the user's face).  • No external files, models, images or fonts.
```

The CONTENT block always has this shape:
```js
const { THREE, scene, shape, place, fit, label, interactive, tone, spin, bob, H, C } = XR;

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
A. The idea
1. You put on the headset and the Earth is floating in front of you, cut open like a slice of cake is missing, so you can see all the layers inside.
2. After two minutes a visitor should understand: the layers aren't equally thick — the crust is WAY thinner than people think.
3. Tier: 2 (Touch)

B. The space
4. Posture: standing in place.
5. First thing you see: the Earth, about beach ball sized? maybe a bit bigger, a step away, straight ahead, chest height, slowly spinning, with a wedge cut out so you can see inside.
6. Everything else: a title sign above the Earth. Four small balls in a row on a table at arm's reach to the right, one for each layer (crust, mantle, outer core, inner core), colored to match the layers.
7. Nothing behind me.

C. Interactions (max 3)
1. You do: point + trigger — to: one of the small balls — and it: the matching layer inside the big Earth glows and a label appears with the layer's name and how thick it is in km — then: stays until I pick a different ball.
2. You do: point + trigger — to: the Earth itself — and it: stops spinning so I can look closer — then: press again to start it spinning again.
3. (blank)

D. (skip, Tier 2)

E. Look, feel, words
11. Mood: curious, science-museum, chill. Colours: you choose, but the core should be yellow/orange like it's hot.
12. Text that must appear exactly: "Journey to the Center of the Earth"

F. Scope guard
13. Out of scope: no continents/map textures, no quiz, no sound needed.
14. Cut first: the spin stop/start.
15. Don't change: (blank)
