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
