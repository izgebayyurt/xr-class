# Build a math learning experience from a student's design

A university student who is not a math major designed a short interactive experience to teach a math idea to **a friend who finds math hard**. Their design is below. You are the builder: turn it into one working web page.

## Rules
1. **Build their design.** Keep their concept, activity, examples, wording and look recognisable. Where the design is vague or missing, fill the gap with the simplest standard classroom version of that activity. Don't add a second activity they didn't ask for.
2. **The math must be correct.** If the design contains a mathematical mistake, build the correct math and keep their activity as close as you can. Record every change in notes.json.
3. **Write for the friend.** Use plain words and short sentences. Explain any math word the first time it appears. Give numbers units and context. Use a friendly tone, never condescending. Keep text short: the card is at most three short sentences, and each note is at most about 50 words. Reveal the explanation in steps as the visitor acts; don't put it all in one long box.
4. **Follow this order.**
   - The card (`MK.say`) always tells the visitor what to do next.
   - The visitor makes **one guess first** (`MK.guess`), before any evidence is shown.
   - Then they **do something** that produces the evidence.
   - Then the page explains why, tied to what they just saw.
   - Then they can explore variations.
   - It ends with a one- or two-sentence takeaway in the card.
   - Start over is built in (it reruns `build()`).
5. **Show why with inspectable pieces, not staged animations.**
   - Every number on screen must be counted or computed by the code from the objects shown, never typed in as a result.
   - Don't animate the answer happening (e.g. liquid that "fills exactly 3 times"). Let the visitor count, drag, cut, run trials or change a value and watch a computed result.
   - Random simulations use `MK.rng()` and say they're a model (`MK.model('...')`).
   - Feedback on the guess compares it honestly to the computed answer.
6. **One self-contained page.** Use 2D SVG through `MK.svg`. Only use 3D if the design asks for it: three.js through `<script type="importmap">` from `https://cdn.jsdelivr.net/npm/three@0.185.1/`, drawn inside `MK.stage`. No other external files, images, fonts, storage, `alert`/`prompt`, or network calls. Laptop first: on a 1280×800 screen the card, the drawing and the opening guess are all visible without scrolling. It must also work at phone width (390 px).
7. **Use MK for every control and text block** (card, guess, buttons, sliders, inputs, readouts, notes, tables) so the visitor's actions are recorded. Keep it under about 600 lines.

## Check your work
Before finishing, run:
```
node /home/claude/xr/src/math/check-page.mjs <your page.html> <your folder>/check
```
It plays the page like a visitor and reports problems and warnings. It saves screenshots (`check-start.png`, `check-after.png`, `check-phone.png`); look at them. Fix every problem. Fix warnings unless they're false alarms. Then walk through the page as the friend would and recompute every number shown.

## Output
Write two files in your folder:
- `page.html`: the page. Include mathkit with exactly `<script src="mathkit.js"></script>` in the head (it gets inlined when published).
- `notes.json`: `{ "title": "...", "concept": "...", "kept": ["what you kept from the design"], "filled_in": ["what you added because the design was silent"], "changed": [{ "what": "...", "why": "..." }], "math_check": "how you verified the numbers" }`

## The MK kit (mathkit.js)

```
MK.start({ title, build, css? })      build() creates everything; Start over clears the page and runs build() again
MK.say(text)                          the card under the title (use \n for a new line); always says what to do next
MK.model(text)                        footer label "Model: ..." for simulations and simplifications
MK.wide()                             stage takes the full width (no side column) for this run

MK.guess({ ask, options:[...] }, (value, i, row) => {})                       multiple-choice guess, answered once, recorded
MK.guess({ ask, unit?, placeholder?, step? }, (value, row) => {})             number guess, recorded, collapses to "ask: value"
MK.button(label, api => {}, { alt?, where? })      .label = 'x' · .enable(bool) · .show() .hide()
MK.choices([...], (i, text, row) => {}, { ask?, where? })   row.lock() · row.mark(i, 'right'|'wrong') · row.reset()
MK.slider({ label, min, max, step, value, format(v), onInput(v), where? })   .value
MK.input({ ask, unit?, button?, type?:'number'|'text', onSubmit(v, row) })   row.lock() · row.reset()
MK.readout(label, value?, { where? })   big number box (side column by default) · .set(v)
MK.note(text, { where? })               short text box (side by default) · .set(text)
MK.table(headers, rows, { where? })     .set(rows, highlightRowIndex)
MK.show(a, b, ...) · MK.hide(...)       anything above, or an SVG shape
   where: 'controls' (row under the stage, default for controls) | 'side' | 'stage'

S = MK.svg(width, height, { where?:'stage', maxHeight?:'60vh', fontSize? })   scales to fit; coordinates are in width × height units
S.rect(x,y,w,h,{fill,stroke,'stroke-width',rx,opacity}) · S.circle(cx,cy,r,{...}) · S.line(x1,y1,x2,y2,{...})
S.path(d,{...}) · S.polygon([[x,y],...],{...}) · S.text(x,y,str,{size,weight,anchor:'start'|'middle'|'end',fill})
S.g({transform}) → group; any shape: .attr({...}) .text(t) .on('click', fn) .show(bool) .hide() .remove() .add(tag, attrs)
   (pass { parent: group } in a style object to draw inside a group)
S.clear() · S.point(event) → [x,y] · S.drag(shape, (x,y) => {}, (x,y) => {}) makes a shape draggable (mouse and touch)
MK.scale(d0,d1,r0,r1) → f(x), f.invert(y) · MK.ticks(a,b,n) → nice tick values
MK.bars(S, { values, labels?, max?, color?, highlight:[i], format(v), tick(v), xLabel?, box:{x,y,w,h} }) → .set(values, {highlight, max})

MK.frac(n,d) exact fractions: .add .sub .mul .div (fraction or whole number) .cmp .eq .valueOf() .toString() → "3/4"
r = MK.rng(seed?) → r() in [0,1) · r.int(lo,hi) · r.pick(arr) · r.chance(p)
MK.sum(a) · MK.mean(a) · MK.median(a) · MK.fmt(x, { dp, money, pct, fixed })
MK.after(ms, fn) · MK.every(ms, fn) → id · MK.stop(id) · MK.loop((dt, t) => false to stop)   all stop on Start over
MK.log(event, data)  record something notable (e.g. MK.log('reached', { step: 3 }))
```

## Example (a different topic, to show the pattern)

```html
@@EXAMPLE@@
```

## The student's design
