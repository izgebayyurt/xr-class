# x1 · Compass & Straightedge — head-to-head verdict

| | x1a | x1b |
|---|---|---|
| Functionality | 7 | **8** |
| Visual | 3 | **8** |
| Epistemic | 6 | **9** |
| Lines | 521 | 727 (budget 1,200) |
| verify.mjs | 0 err / 0 warn / 2 overlap notes | 0 err / 0 warn / 0 notes |
| My 40-assertion probe | 39 pass | 39 pass |
| Honesty of difficulty | honest | honest |

## Winner: **x1b**, decisively — but not on the kernel.

### The kernels are a genuine tie, and both are honest.

This is the finding that matters most, so it goes first. I attacked both builds with the same probe
(`pipeline/tierx/reviews/judge-x1-probe.js`) and neither fudged the hard thing.

- Both recompute the entire construction top-down from a stored graph in creation order. Neither
  caches coordinates, snaps by closeness, or contains `0.866`, `Math.sqrt(3)`, or any test-mode branch.
- Both store the intersection **branch** as a discrete attribute with a continuous sign convention.
  Driving A around a full circle in 120 steps produced **0 branch flips in both**, with worst
  equilateral error **2.2e-16** (x1a) and **2.2e-16** (x1b) — against a required 1e-9.
- Both detect I.1 structurally, by reading which curves feed the point and which points define those
  curves. The decisive test was a decoy: through the real UI path only, I built a point that is an
  **exactly** equilateral triangle with a side equal to |AB|, out of different parent curves.
  `solved()` stayed **false in both**. The inverse test — a duplicate circle(A,B) crossed with
  circle(B,A) — still solves in both, proving they read defs rather than memorised ids.
- Both scripted I.1 through `selectTool`/`pick` alone, both unwound the graph *and* the display
  exactly on undo (visible-mesh counts returned to baseline: 110→117→110 and 80→88→80), and both
  survived the 40-object cap and abusive input without throwing.

They even share a bug, which makes it a kit-level pattern rather than a builder failure: **neither
guards `movePoint` against non-finite input.** `movePoint('A', NaN, NaN)` poisons the whole graph in
both. That was the single failed assertion in both runs.

### x1b wins on the room, and the room is most of the assignment.

**Visual, 8 vs 3.** x1a's tabletop is `'dark'` under a `'dark'` sky and is effectively invisible: the
opening view is a thin grey rim arc, two dots, and 55% empty sky. Worse, its payoff — the one line the
whole room exists to deliver — is a parented flat label with `capHeight: 0.05` and **no `width`**, so
"Not measured. Constructed. Move A — it cannot break." becomes an unwrapped ~2.5 m string lying across
a 1.44 m table. In my solved-state render it reads `t measured. Constructed. Move A — it cannot brea`,
clipped off both edges of the screen, drawn straight through the triangle. x1b's solved state is the
best single frame in the tier: chalk circles, an orange derived C, a teal-filled triangle with lit
edges, and a legible payoff card floating above the table where the visitor is already looking.

**Epistemic, 9 vs 6.** x1b teaches in three places x1a does not:
1. A two-stage payoff — "Triangle ABC is filled. Now pick MOVE and drag A." → after the drag →
   "Still equilateral, at every instant." The second line is the actual residue.
2. It coaches the one idea a first-timer misses, and only when it is relevant: "The curves cross. Point
   at a small crossing marker to make it a point."
3. It refuses to move a derived point *with the reason*: "`C` is derived — it is computed, not placed."
   That teaches the dependency idea in the failure case, which is where it lands.

x1a, by contrast, can reach a **misleading state**: because its derived points go stale rather than
invalid when their parents stop intersecting, dropping A exactly onto B leaves `solved()` true with a
frozen apex and a lit "triangle" whose vertices are not where the graph says they are.

**Functionality, 8 vs 7.** Close. x1b's `ok` validity flag is the better graph design; x1b has zero
audit flags to x1a's two overlap notes; x1b ships `display()`/`meshOf()` extras that let a panel see
the display unwind. x1a's edge is that its `movePoint` clamps to the workplane while x1b's does not.

---

## What each should steal from the other

**x1a should steal from x1b:**
1. **The `ok` validity flag on derived points.** Invalidate and hide a point whose parents stop
   intersecting instead of freezing its last coordinates — this alone removes x1a's one misleading state.
2. **A width-bounded, free-floating payoff label** instead of an unwrapped table-parented one. This is
   worth more than everything else on this list combined.
3. **The status line that teaches, not just prompts** — the "a crossing is not a point until you claim
   it" hint, and the named refusal when a derived point is dragged.
4. **Get UNDO/RESET off the workplane.** At `H.chest − 0.19` they hover 4 cm above the tabletop beside
   A and B (the audit flags both overlaps); a laser aimed near the table centre hits RESET.
5. **Contrast**: a table you can see. `0x111a26` with a lit rim and faint drafting rings costs nothing.
6. Extra ENV_TEST hooks that expose the display, not just the graph.

**x1b should steal from x1a:**
1. **Clamp `ENV_TEST.movePoint` to the workplane**, the way `onPointDrag` already does. The brief calls
   `movePoint` "MOVE-tool drag"; the two paths should agree. (My probe walked A to (10000, −10000).)
2. **A tighter `TABLE_DIST`.** x1a's disc sits at 1.0 m; x1b's centre is at 1.58 m, so the far half of
   the workplane is 2.0–2.4 m out — small targets at a shallow angle.
3. **Clip circles to the table disc**, not just lines. x1b's `clipLine` is good; `circleSlot` only
   parks a ring when `r > 2.4`, so chalk circles run past the rim into empty space.

**Both should fix, and the kit should force:**
- A `Number.isFinite` guard on every contract method that accepts coordinates.
- Recomputing all pair-intersections inside a per-frame drag callback is O(curves²) in both builds —
  fine at the 3-curve I.1 construction, ~1,500 solves per frame at the 40-object cap. Only recompute
  pairs touching a moved point.
- Both derive node ids from array length (`pointId(pts.length)`, `'k' + crvs.length`). LIFO undo keeps
  this safe today; any future non-LIFO delete hands a new node a live node's id. Use a monotonic counter.
