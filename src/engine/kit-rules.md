You are writing the CONTENT block of a small WebXR page. The page's engine is already written and loaded; you only write JavaScript that uses its API. The student will try it first on a laptop (drag to look, click to select, WASD to walk) and maybe later in a Quest 3 headset. Reply with ONE code block containing the complete CONTENT block and nothing else before it (no HTML, no imports). The block must start with `const { ... } = XR;` and end with `XR.run({ build, frame });`. You get one reply — the student cannot answer questions — so make sensible choices yourself.

Rules — making it work
- Use only the API below and plain Three.js (available as `THREE` from the XR object). No external files, models, images, fonts or sounds. No libraries.
- Place things with body words (dist/dir/height), never raw coordinates, unless the API gives no other way.
- Everything the visitor needs at the start must be visible without turning: within ±35° of 'ahead', between 'waist' and 'eye' height. Text goes at 'near'..'room', 'chest'..'eye' height. Controls (buttons, choices, sliders) go at 'near'..'room', 'waist'..'eye' — never at 'reach' + 'waist', which is below a laptop screen. Grabbable things go at 'reach', 'chest' height.
- Nothing stands between the visitor and text they must read. Don't add tables, platforms or walls unless the brief asks; size every object for what it represents.
- Anything selectable must be easy to hit with a pointer from where the visitor stands. If the visible thing is smaller than an 'apple', drawn as lines/wireframe, or fast-moving, give it an invisible stand-in (shape.hit / shape.hitball) as the actual target.
- Keep frame() cheap. Prefer fewer, larger objects. Under 500 lines — use the room for a complete, clear experience, not for extra features.
- If part of the brief is impossible with this API, do the closest thing you can and say so in one line AFTER the code block.

Rules — making it make sense
- Open with a card: the first thing visible, at 'room', 'ahead', 'eye' height (ui.sign): a title, one line saying what this is about, and the first thing to do ("Point at … and click / pull the trigger"). Update it with setText at every step so it always says what to do next.
- When the brief leaves something open, choose the standard classroom version of the activity and put its rules on the card.
- If the point is a result someone could guess, ask for their guess first (2–4 choices), then let the experience reveal the answer.
- Show why, don't just assert: if the point is that something is true, let the visitor see why with pieces they can inspect — cut, rearrange, overlay, stack or count them. An animation that shows the answer proves nothing, because the program was written to show it.
- Compute, don't stage: every number, level, size or outcome shown is calculated from the scene's actual quantities — never animated toward a predetermined answer or hard-coded.
- If you simulate something (motion, liquid, growth), say on screen that it is a model following a stated rule.
- State the lesson in one line at the moment the key interaction produces its result. Only state facts and numbers you are sure of; if unsure, say less.
- If there are steps or rounds, include a "Start over" button.

Before you answer, check your block against this list — you will not get to see it run:
1. Every name you call is in the `const { ... } = XR;` line (or called as XR.name).
2. The card, every control and all text to read are inside the starting view: 'near'..'room', 'waist'..'eye' (text 'chest'..'eye'), within ±35° — nothing in front of them.
3. Small, thin or moving things you must point at have a shape.hit / shape.hitball target.
4. Labels are created once in build(); later changes use setText or .visible, never remove-and-recreate.
5. Handles use grab:'hold' + drag(); carried things use grab:true; nothing guesses the hand via onController.
6. The card says what to do first and stays current; results are computed, not hard-coded; the lesson line appears at the result.
7. Every ( [ { has its partner — one missing bracket costs a whole round. The block starts with the const line, ends with XR.run({ build, frame }), no markdown/HTML/imports inside.
