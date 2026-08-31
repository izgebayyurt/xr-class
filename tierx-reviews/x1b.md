# x1b · Compass & Straightedge (Euclid I.1) — blind review

**Functionality 8/10 · Visual 8/10 · Epistemic 9/10**
**Honesty of difficulty: HONEST — no fudge found.**

Judged on: `pipeline/tierx/builds/x1b.js` (727 lines), `verify.mjs` (0 errors, 0 warnings, 0 notes),
my own probe `pipeline/tierx/reviews/judge-x1-probe.js` (the same 40 assertions I ran against the
other build), and the eye/top/side renders plus a solved-state render I drove myself.

## Honesty of difficulty — the main question

**It did the hard thing.** Same conclusion as for the other x1 build, reached by the same attacks.

- `evaluate()` (x1b.js:122) is a single top-down pass over `order` (creation order = topological
  order). Derived points are recomputed as `intersect(curves[0], curves[1], branch)` and nothing else
  is stored. No snapping, no `0.866`, no `Math.sqrt(3)`, no test-mode branch anywhere in the file.
- Branch is a stored discrete attribute with a *continuous* sign convention (`+h` along the left
  normal of centre1→centre2, `xCC` at x1b.js:100). My 120-step continuous drag of A around a full
  circle produced **0 branch flips** and a worst equilateral error of **2.2e-16**.
- `isI1` (x1b.js:142) tests node identity and defining point ids — `c.defs[0] === 'A' && c.defs[1] ===
  'B'` — and measures nothing.
- **Decoy test (ADV3).** I built an *exactly* equilateral triangle with side |AB| out of different
  parent curves (D = reflection of B through A; circle(D,A) × circle(A,B)). Verified exact:
  `{AB: 0.48, AE: 0.48, DE: 0.48, AD: 0.48}`. `solved()` stayed **false**. Correct.
- **Inverse decoy (ADV4).** A duplicate circle(A,B) crossed with circle(B,A) still solves — the check
  reads defs, not ids.
- Contract driven only through `selectTool`/`pick`: `|AC| = |BC| = |AB|` to 1.7e-16, and 20 random
  `movePoint('A')` calls held to **1.7e-16** (brief asked 1e-9).
- The one distance comparison in the file (`COINCIDE = 1e-6` in `coincidesWithPoint`) really is
  display-only: it suppresses a marker drawn on top of an existing point. I confirmed it decides no
  geometry — the graph is identical with and without a suppressed marker.

## Functionality — 8/10

Passes 39 of my 40 assertions. `verify.mjs`: 0 errors, 0 warnings, no ergonomic flags at all.

- **BUG — `movePoint(id, NaN, NaN)` poisons the graph.** `movePoint` → `setGiven` (x1b.js:485) writes
  `p.x = x` with no finiteness check, and every derived point follows. `movePoint` is a contract
  method; it needs a `Number.isFinite` guard. (The pointer path is safe — `onPointDrag` clamps.)
- **`ENV_TEST.movePoint` does not clamp to the workplane** while the drag handler does
  (`onPointDrag`, x1b.js:557, clamps to `CLIP_R`). My probe put A at (10000, −10000) and the
  construction followed it off the table, still exactly equilateral. Defensible (the contract path is
  raw), but the brief calls `movePoint` "MOVE-tool drag", so the two paths should agree.
- **Latent id-collision.** `pointId(pts.length)` (x1b.js:62) and `'k' + (crvs.length + 1)` derive ids
  from array length. LIFO undo keeps this consistent and I could not reach a collision — but
  `dropNodes` is a *cascade* delete, so any future non-LIFO removal (a "delete this curve" tool) would
  hand a new node the id of a live one. Use a monotonic counter.
- **`refresh()` runs inside the per-frame drag callback.** `setGiven` → `refresh` → `computeMarkers`
  is O(curves²)·2 branches, each with an O(points) `isPromoted` scan and an O(points)
  `coincidesWithPoint` scan, plus `fillMesh.geometry.computeVertexNormals()`. At the 3-curve I.1
  construction this is nothing; at the 40-object cap it is ~1,500 intersection solves per dragged
  frame. Tier X says frame cost stays at Quest rates — cache the pair list and only recompute pairs
  touching a moved point.
- **Better than its rival: derived points carry an `ok` flag.** When the parents stop intersecting the
  point is marked invalid, hidden, and `solved()` drops to false (probe note `degenerateSolved:
  false`). Dropping A exactly onto B degrades correctly instead of freezing a stale apex.
- Good: undo unwinds graph *and* display exactly (80 → 88 → 80 visible meshes), cascade delete is
  there for free, extra undos are harmless, the 40-object cap holds, and abusive input never throws.
- Extras beyond the contract that made judging easy and cost nothing at runtime: `display()`,
  `meshOf(id)`, `status()`, `solvedPointId()`, `pending()`. Other builds should copy this habit.
- API: cheat-sheet compliant. `onButton` B/Y → undo is a nice VR affordance.

## Visual — 8/10

- **The first view reads as a place.** Dark blue workplane with a lit steel rim and three faint
  drafting rings, teal A and B on it, LINE/CIRCLE/MOVE stacked left, UNDO/RESET right, the task above
  and the running status at eye level. Nothing overlaps; the audit flags nothing.
- **The solved state is the best single frame in this tier.** Chalk circles, an orange derived C,
  the triangle filled teal with bright edges, and the payoff card — "Not measured. Constructed. / Move
  A — it cannot break." — legible, floating above the table where you are already looking, with the
  status line changing to "Still equilateral, at every instant." after the first drag.
- The small octahedral markers for unpromoted crossings are a genuinely good affordance: you can see
  that a crossing exists before you claim it.
- Nits, all small:
  - **Circles are not clipped to the table** (only lines are, via `clipLine`). In the solved render
    the two chalk circles run well past the blue rim into empty space. `circleSlot` parks a ring only
    when `c.r > 2.4`; there is no disc clip.
  - The flat `C` label sits on top of its own orange point (`labelOffset` pushes radially outward from
    the table centre, which for a point near the rim points *into* the ball).
  - The table centre is at 1.58 m, so the far half of the workplane is 2.0–2.4 m out — small targets
    at a shallow angle. A 1.3 m `TABLE_DIST` would put the whole disc in comfortable pointing range.
  - The tool panels are placed at `dir: -32` with `face:true`, so they read as hard-skewed
    parallelograms in the eye view.

## Epistemic — 9/10

- The lesson is delivered by the mechanism and *then said*, in the right place, at the right moment.
  The two-stage payoff is the strongest teaching move in this tier: "Triangle ABC is filled. Now pick
  MOVE and drag A." → after the drag → "Still equilateral, at every instant." The second line is the
  actual residue.
- **The one idea a first-timer misses is coached explicitly**: `statusText()` appends "The curves
  cross. Point at a small crossing marker to make it a point." only while crossings exist and nothing
  has been promoted. That is exactly the right gate.
- Refusing to move a derived point *with the reason* — "`C` is derived — it is computed, not placed.
  Drag A or B instead." — teaches the dependency idea in the failure case, which is where it actually
  lands.
- The numbers are right by construction and I verified them independently to 1.7e-16.
- The kernel visibly generalises: one curve type + one intersection routine and promotion,
  re-derivation, undo and cascade delete all keep working. The header says so and the code backs it.
- Half a point off only for the far-side reachability and because the `ok` invalidation, while
  correct, is silent — a point that stops existing just disappears with no word about why.

**Verdict:** an exact, defensible dependency kernel inside a room that actually reads as a drafting
table and states its lesson where the visitor is looking. Ready for students after the `NaN` guard
and the circle clip.
