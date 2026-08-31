# x3 · The Proof Room (Euclid I.47) · Tier X

You put on the headset and a right triangle (legs a=0.9 m, b=1.2 m, hypotenuse c=1.5 m — a real 3-4-5) lies on a big table ahead, with its three squares attached: a² teal, b² orange, c² outlined and empty below the hypotenuse. The room walks you through the SHEAR PROOF of Pythagoras — you perform every step with your hands, the room verifies each one exactly, and at the end the two leg-squares have become two rectangles that exactly fill c². Nothing was stretched; area never lied.

## Required mechanics — a gated 6-stage machine
- **Stage flow**: intro → shear a² → shear b² → drop the altitude (splits c² into two rectangles) → slide sheared-a² into rectangle 1 → slide sheared-b² into rectangle 2 → finale. A stage plaque (eye level) always states the current instruction in one line, with a "why is this legal?" toggle giving the one-line area argument (shear = same base, same height).
- **Shearing is a real manipulation**: the square's top edge carries a grab:'hold' handle; drag() slides it PARALLEL to the base only (the shear parameter is the ONLY degree of freedom — the shape is drawn as the exact parallelogram for that parameter, so area is preserved BY CONSTRUCTION, not by tolerance). The target shear (the one aligning the parallelogram with the triangle's side) is marked as a ghost outline; within a small capture window the handle clicks in and the stage verifies.
- **Sliding is a real manipulation**: the sheared pieces are grab:'hold'-dragged along a fixed track into the c²-rectangles (again one DOF, translation along the track).
- **Verification is exact**: at every instant the room can state each piece's area symbolically (a², b², shear preserves it, the two c²-rectangles are a·(projection) and b·(projection) which sum to c²). A live area ledger (small panel) shows a², b², and the filled fraction of c² — numbers never wobble during shearing, and that stillness is the lesson.
- **Wrong-move diagnosis**: dragging the wrong handle for the stage, or releasing far from the target, produces a specific hint (not a generic "try again"): e.g. "You stretched nothing — but that parallelogram isn't leaning far enough to meet the triangle's side."
- **Finale**: both rectangles filled → c² floods with the two colors meeting at the altitude line, chime, payoff: "a² + b² didn't shrink, stretch, or lie. They just changed shape: 0.81 + 1.44 = 2.25. Every right triangle, forever." RESTART returns to stage 0.

## Verification Contract (window.ENV_TEST)
- `stage()` → {index, name, instruction} · `areas()` → {a2, b2, c2filled} (exact values, every stage)
- `setShear(which, t)` / `setSlide(which, t)` — drive the DOFs directly (0..1, 1 = target) · `release(which)` — end the drag as a user would
- `attemptWrong()` → performs a canonical wrong move for the current stage; returns the hint text it triggered
- `advance()` → programmatically complete the current stage's manipulation (through the same code path as a perfect drag)
- `restart()`
The panel will: walk all 6 stages via advance(), asserting stage() increments and areas() stays {0.81, 1.44} throughout with c2filled hitting 2.25±1e-9 at the finale; drive setShear to 0.3/0.7/1.0 asserting the parallelogram area equals a² exactly at each; call attemptWrong() at ≥3 stages asserting distinct, specific hint texts; assert a release() outside the capture window does NOT advance the stage; restart() and re-run.

## Look/feel & scope
Chalkboard museum: dark sky(), pale table, pieces in flat saturated colors, ghost targets as dashed outlines. Out of scope: other proofs, arbitrary triangles (fixed 3-4-5, but no hardcoded magic constants — derive from a,b), free 2-DOF dragging. Don't change: every manipulation has exactly one degree of freedom, and areas are computed from parameters, never from mesh vertices.
