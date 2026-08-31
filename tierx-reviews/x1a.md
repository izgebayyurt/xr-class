# x1a · Compass & Straightedge (Euclid I.1) — blind review

**Functionality 7/10 · Visual 3/10 · Epistemic 6/10**
**Honesty of difficulty: HONEST — no fudge found.**

Judged on: `pipeline/tierx/builds/x1a.js` (521 lines), `verify.mjs` (0 errors, 0 warnings, 2 overlap
notes), my own probe `pipeline/tierx/reviews/judge-x1-probe.js` (40 assertions, written from the brief,
not from the builder's), and the eye/top/side renders plus a solved-state render I drove myself.

## Honesty of difficulty — the main question

**It did the hard thing.** I attacked this specifically and could not break it.

- The kernel is real. `recomputeAll()` (x1a.js:113) walks `entities` in creation order — a valid
  topological order by construction — and recomputes every derived point from `intersect(parentA,
  parentB)[branch]`. Nothing is stored except the graph. There is no coordinate cache, no snapping,
  no `0.866`, no `Math.sqrt(3)` anywhere in the file.
- The branch is a stored discrete index, not a nearest-root re-pick. I dragged A through 120 steps
  around a full circle: **0 branch flips**, and the equilateral error never exceeded **2.2e-16**
  (`ADV1`). A build that re-selected the closest root would have flipped when the apex crossed AB.
- Success detection is structural. `checkSolved()` (x1a.js:327) reads `curve.defs.join(',')` and
  demands `'A,B'` × `'B,A'`. It measures nothing.
- **Decoy test (ADV3).** I built, through the real UI path only, a point E that is an *exactly*
  equilateral triangle with a side equal to |AB| (D = reflection of B through A via line AB × circle
  (A,B); then circle(D,A) × circle(A,B)). Verified exact: `{AB: 0.32, AE: 0.32, DE: 0.32, AD: 0.32}`.
  `solved()` stayed **false**. Correct.
- **Inverse decoy (ADV4).** Drawing circle(A,B) *twice* and crossing the duplicate with circle(B,A)
  still solves — so the check reads defining points, not memorised curve ids. Right answer.
- Contract driven only through `selectTool`/`pick`, never through internals: the I.1 script produced
  the apex and flipped `solved()` with `|AC| = |BC| = |AB|` to 1e-16, and 20 random `movePoint('A')`
  re-derivations held to **2.2e-16** (brief asked 1e-9).

## Functionality — 7/10

Passes 39 of my 40 assertions. `verify.mjs`: 0 errors, 0 warnings.

- **BUG — `movePoint(id, NaN, NaN)` poisons the whole graph.** `movePointInternal` (x1a.js:315)
  clamps with `if (d > TABLE_USABLE_R)`, and `NaN > 0.58` is false, so the clamp is skipped and
  `p.x = NaN` propagates to every derived point until `reset()`. `movePoint` is a contract method;
  it needs `if (!Number.isFinite(x) || !Number.isFinite(z)) return false;`.
- **A derived point whose parents stop intersecting goes STALE rather than invalid.** In
  `recomputeAll` (x1a.js:121) `const chosen = pts[branch] ?? pts[0]; if (chosen) {…}` — when there is
  no intersection the old coordinates are simply kept. Dropping A exactly onto B leaves `solved()`
  **true** with a frozen apex and a lit triangle that is not a triangle (probe note
  `degenerateSolved: true`). Give each point an `ok` flag, hide the mesh and the fill when it is false.
- **Marker pool is 24 but the object cap is 40** (`MARKER_POOL`, x1a.js:25). Past 24 simultaneous
  crossings the extras exist in `markersArr` and are pickable via `ENV_TEST.pick(index)` but have no
  visible or hittable slot — a construction the UI cannot reach.
- **UNDO/RESET sit on the workplane.** `spread([...], { dist: 0.85, height: H.chest - 0.19 })` places
  them ~4 cm above the tabletop, directly beside A and B (audit: `object-8 and object-46 overlap`,
  `…-47 overlap`). A laser aimed at a point near the table centre will hit RESET. Move them off the
  disc or up to a side panel.
- Good: undo unwinds graph *and* display exactly (visible-mesh count 110 → 117 → 110), extra undos on
  an empty stack are harmless, the 40-object cap holds and does not throw, and abusive input
  (`selectTool('NOPE')`, `pick('ZZZ')`, `pick(999)`, `pick(-1)`, same-point-twice) never throws and
  creates no degenerate curve.
- Minor: `letterIdx` is never rewound by `undo()` or `reset()`, so a point removed and remade is
  called D, then E, then F. Confusing in a room whose whole subject is naming derived objects.
- API: cheat-sheet compliant throughout. `grab:'hold'` on an invisible `hitball` proxy is defensible
  here (the engine never repositions a `'hold'` handle) and the build says so in a comment.

## Visual — 3/10

This is where the build falls down, and it falls down on the payoff itself.

- **The table is invisible.** `shape.cylinder(0.72, 0.05, 'dark')` under `sky({top:'black',
  bottom:'dark'})` renders as the same value as the sky. In `eye.png` there is no surface — only a
  thin grey rim arc and a couple of floating buttons. The brief's "you're standing at a drafting
  table" does not happen.
- **The first view is 55% empty sky.** Everything lives in the bottom third; A and B are 2-pixel dots.
- **The payoff line is unreadable.** `payoffLbl` (x1a.js:473) is a parented label, `capHeight: 0.05`,
  no `width`, rotated flat onto the table. "Not measured. Constructed. Move A — it cannot break."
  becomes a single unwrapped ~2.5 m string lying across a 1.44 m table: in my solved-state render it
  reads `t measured. Constructed. Move A — it cannot brea`, clipped off **both** edges of the screen,
  drawn straight through the triangle it is supposed to celebrate. This is the one moment the room
  exists for. Either give it `width` and let it wrap, or make it a free-floating label above the table.
- UNDO/RESET (see above) sit in the middle of the construction area in the eye view, and the tool
  buttons at `H.chest` hover over the far half of the table.
- The table is placed at `dist:'near'` with a 1.44 m diameter, so its near rim is ~0.28 m from the
  user — you are standing inside the table.
- Credit where due: the blueprint palette choices are right (teal givens, orange derived, chalk
  curves) and the solved triangle's teal emissive breathe is a nice touch. The problem is layout and
  contrast, not taste.

## Epistemic — 6/10

- The core claim is delivered by the mechanism, not asserted: dragging A really does re-derive, and
  the triangle really is equilateral to machine epsilon at every instant. That is the lesson, and it
  is honestly earned.
- The status line is a good teacher of the tool grammar ("CIRCLE: pick the point to open the compass
  to"), and it changes only on change (`lastStatusText`).
- **But the sentence that states the lesson cannot be read** (see Visual). A visitor gets the
  behaviour without the words.
- **Misleading state is reachable**: with A dropped on B the room shows a lit "solved" triangle whose
  vertices are not where the graph says they are.
- Nothing coaches the one idea a first-timer misses — that a crossing is not a point until you
  promote it. The yellow markers appear with no accompanying word.
- Out-of-scope discipline is good: one assignment, no free point placement, no collapsing-compass
  rules. The kernel does obviously generalise (add a type + an intersection routine).

**Verdict:** an honest, exact, well-factored dependency kernel wrapped in a room you cannot see and a
payoff you cannot read — fix the label width, the tabletop contrast and the button placement and this
is an 8.
