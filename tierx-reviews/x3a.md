# x3a · The Proof Room — blind review

**Functionality 7/10 · Visual 5/10 · Epistemic 3/10**

574 lines. `verify.mjs` clean: 0 errors, 0 warnings, no page errors, no overlay errors.
Judged from artifacts only: splice + verify + renders + an independently written probe
(`x3a-probe.js`, 19 assertions: the brief's Verification Contract plus 10 adversarial ones)
plus a real pointer-ray drag through `XR._test.interactables`.

## What works

- **Every assertion the brief actually lists passes.** advance() walks `intro > shear-a >
  shear-b > drop-altitude > slide-a > slide-b > finale` in order; `areas()` returns
  {0.81, 1.44} at every stage; `c2filled` is exactly 2.25 at the finale; a `release()` at
  t = 0.5 does not advance; `attemptWrong()` yields 7 distinct, specific hints; `restart()`
  resets and a second full walk completes.
- **The shear is genuinely one degree of freedom and genuinely area-preserving.** I drove
  the teal handle with a real world-space pointer ray (not ENV_TEST): the drawn quad's
  shoelace area held at exactly 0.8100 at every sampled point of the drag. `buildPiece`
  (x3a.js:71-82) solves the target offset from the leg's own normal — no hardcoded angle,
  `AH`, `ALT`, `HYP` all derived from `LEG_A`/`LEG_B`. That part of the brief is honoured.
- API is clean — only `XR.run` is touched directly; everything else comes through the
  destructured cheat-sheet names. No hallucinated methods.
- `frame()` is cheap: no allocation, `setText` only on change, buffers mutated in place.
- Hint texts are diagnostic rather than generic, e.g. *"That's not this stage's handle — the
  altitude has to drop before anything slides."*

## What is fudged — the central finding

**The slide does not put the piece into the rectangle. The code swaps the piece for the
rectangle at the moment of capture.** `tryCommit` (x3a.js:375-378):

```js
st.u = 1; st.phase = 'locked';
st.quadCur = RECT_OF[which];      // <- the parallelogram is DISCARDED
setQuad(st.mesh, st.quadCur);     //    and replaced by a different shape
```

Measured (probe ADV-6/7/8, and `cont-a.js`, which drives the DOF to exactly 1.0 *first* and
only then releases, so the commit is the only thing left that can move anything):

| slide u | drawn quad (board coords) | is it the rectangle? |
|---|---|---|
| 0.90 | (0,−1.674) (0.54,−0.954) (0.54,0.546) (0,−0.174) | no |
| 1.00 | (0,−1.860) (0.54,−1.140) (0.54,0.360) (0,−0.360) | no |
| after release() | (0,0) (0.54,0) (0.54,−1.5) (0,−1.5) | yes |

- **max vertex jump at commit: 1.86 m**, on both slide stages. Nothing else moves at that
  instant — the DOF was already at its target.
- At the end of its own track the piece is a *slanted parallelogram* that overhangs c² by
  0.36 m at the top and 0.36 m at the bottom (`slide-end.png`). It never coincides with the
  dashed rectangle ghost it is nominally being slid into. The visitor watches the shape pop.

**The build's own comment justifies this** (x3a.js:26-29): *"the quad's four vertices are
swapped for the rectangle's own four corners (a discrete 'click home', exactly the language
the brief uses for the shear capture too)."* Those two are not the same move. The shear
capture snaps the **parameter** t to 1 and stays inside the one-parameter family the brief
authorises; this swaps to a **different shape** outside any family the room has legitimised.

### Does it violate the brief's "Don't change" clause?

Letter: no, and this needs saying plainly. Areas *are* computed from parameters (`A2`,
`B2`, `filledFraction()` counts locked pieces — x3a.js:447-452), never from mesh vertices,
and each manipulation *is* one DOF. Nothing in the math path snaps.

Spirit: yes, decisively. The clause exists to protect the sentence the room is built to
utter — *"Nothing was stretched; area never lied."* The ledger stays still not because the
geometry is honest but because it is a printed constant; at the crux the geometry is
replaced. A visitor who trusts their eyes sees a shape change that none of the three
plaque arguments (shear = same base and height; translation preserves area) licenses.

### The honest route was already built, and already named

At t = 1 both of x3a's parallelograms have **vertical free sides of length exactly
c = 1.5**, and they **share the seam x = AH = 0.54 from v = 0.72 to v = 2.22** (verified,
`x3a-math.js`). Sliding that shared seam down by exactly `ALT` = 0.72 — a second shear,
outer sides pinned, area invariant by construction — yields:

```
a-piece → (0,0)(0.54,0)(0.54,1.5)(0,1.5)      area 0.81
b-piece → (0.54,0)(1.5,0)(1.5,1.5)(0.54,1.5)  area 1.44
```

Both exact rectangles. Translating each down by exactly c = 1.5 lands them on x3a's *own*
`RECT1` and `RECT2` vertex sets — I checked set equality, it is exact.

That second shear is *literally x3a's stage 3*. `commitDropAltitude` (x3a.js:391-399)
instead only grows a yellow line downward and reveals two ghosts; it performs no geometric
work at all. The correct move was one stage away, under its own name, in its own
coordinates.

## Other defects

- **The `above:` labels never follow their handles** (x3a.js:261-263). Measured drift once
  the pieces move: "shear a²" ends **0.49 m** from the nearest handle (0.15 m at rest),
  "shear b²" 0.38 m. Visible in `slide-end.png` — the teal knob is top-centre while its
  label sits far left. A visitor is told to grab a handle by a caption pointing at nothing.
- The brief says the figure **lies on a big table**; x3a built a vertical wall panel
  (`top.png` shows the whole scene collapsed into one plane, zero floor footprint).
- Ghost targets are low-opacity solid line loops, not the **dashed outlines** the brief asks
  for.
- The welcome plaque is drawn straight across the orange square (`eye.png`); mid-slide the
  b-piece sails off the top of the pale board and over the plaque (`slide-end.png`).
- RESTART is at dir −52°, waist height — outside the start view (audit: `view -`). The drop
  lever is at elevation −37°, also outside the start view.
- The finale payoff card covers the top third of the square it is celebrating.

## Verdict

A competent, well-instrumented state machine whose shear stage is honest and whose slide
stage is a substitution dressed as a slide. Because the exact second shear was already
sitting in the geometry under the stage name x3a gave it, the fudge was neither forced nor
necessary — and it is at precisely the step where a proof room must not blink.
