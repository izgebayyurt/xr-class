# x1 · Compass & Straightedge · Tier X

You put on the headset and you're standing at a drafting table (a ~1.6 m round workplane, waist height, a step ahead). On it: two given points, A and B, and three tools. You can do everything Euclid could: draw a LINE through two points, draw a CIRCLE by anchoring the compass at one point and opening it to another, and use the points where things cross. The room asks you to construct an equilateral triangle on AB (Euclid I.1). When you succeed — and the system KNOWS you succeeded, it doesn't eyeball it — the triangle fills with light and the payoff appears.

## Required mechanics
- **Tools**: pick a tool (LINE / CIRCLE / MOVE) from a small palette; then point-select the point(s) it needs. Circle = center point then radius point (circle passes through the second point). Line = two points, drawn extended across the table. Selected/hover points glow; a status line always says what the tool expects next ("Circle: pick the center").
- **Intersections become points**: whenever two drawn curves (line/line, line/circle, circle/circle) intersect on the table, small markers appear; selecting a marker promotes it to a real, named point (C, D, E…). These are the ONLY new points — no free-floating point placement.
- **The kernel (the actual assignment)**: every derived point stores its parents (the two curves and which intersection branch); every curve stores its defining points. Geometry is COMPUTED FROM THE GRAPH, top-down. The acid test: MOVE tool drags A or B, and the entire construction re-derives live — circles re-inflate, intersection points slide, the triangle stays exactly equilateral at every instant because it is equilateral *by construction*.
- **Success detection by dependency, not distance**: the room detects I.1 when a promoted point C exists whose parents are the circle centered A through B and the circle centered B through A. On success: triangle ABС fills, chime, payoff text: "Not measured. Constructed. Move A — it cannot break."
- **Undo** (last action), and a RESET. Curve/point count cap ~40 with a gentle message.

## Verification Contract (window.ENV_TEST)
- `points()` → [{id, x, z, kind:'given'|'derived', parents}] · `curves()` → [{id, type:'line'|'circle', defs}]
- `selectTool(name)`, `pick(idOrMarkerIndex)` — drive the exact UI path a user takes (tool → picks), including promoting intersection markers
- `markers()` → current promotable intersections [{index, x, z}]
- `movePoint('A', x, z)` — MOVE-tool drag, triggers full re-derivation
- `solved()` → bool (dependency-detected I.1)
- `undo()`, `reset()`
The panel will: script I.1 through selectTool/pick alone; assert |AC|=|BC|=|AB| to 1e-9; call movePoint('A', …) to 20 random spots and re-assert equality at each; assert solved() flips true only via the dependency route (a near-equilateral triangle made of other constructions must NOT count); assert undo() unwinds both the graph and the display.

## Look/feel & scope
Blueprint mood: dark table, chalk-white curves, teal given points, orange derived points. sky() dark. Labels on the table are flat (parented, rotated), status text at eye level ahead. Out of scope: arcs-only compasses, collapsing compass rules, 3D construction, multiple puzzles (ONE assignment, I.1 — but the kernel must obviously generalize). Don't change: correctness comes from the dependency graph — no snapping-by-closeness anywhere in the math path.
