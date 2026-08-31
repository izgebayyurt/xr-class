# x3b · The Proof Room — blind review

**Functionality 9/10 · Visual 9/10 · Epistemic 9/10**

784 lines. `verify.mjs` clean: 0 errors, 0 warnings, no page errors. One audit *note*
(`proof-board` and `board-base` overlap) which is the table sitting on its own plinth —
intended.

Judged from artifacts only: splice + verify + renders + an independently written probe
(`x3b-probe.js`, 22 assertions: the brief's Verification Contract plus 11 adversarial ones),
a fair continuity test (`cont-b.js`), and a real pointer-ray drag through
`XR._test.interactables`. All geometry read off the **mesh buffers**, never from ENV_TEST.

## The proof is real

`computeQuad` (x3b.js:194-209) runs two families, and I verified both against the drawn
vertices:

- `'shear'`: `[origin, C, outC + s·dir, outO + s·dir]` — base pinned to the leg, far edge
  sliding along it. One DOF. Shoelace of the drawn quad = **0.810000** at t = 0, 0.3, 0.7,
  1.0 and 1.44 for the other piece.
- `'rect'`: q0/q3 pinned on the outer vertical, q1/q2 sliding down the line u = foot. **This
  is a second shear**, and it is the one the classical proof needs. At t = 1, d = 0 the two
  families produce byte-identical vertices, so the hand-off moves nothing.

Checked end to end:

- At shear = 1 both pieces have vertical free sides of length exactly c = 1.5 and share the
  seam at u = foot from v = alt to v = alt + c.
- Dropping that seam by exactly `alt` = 0.72 makes both pieces exact rectangles (0.54 × 1.5
  and 0.96 × 1.5). The seam's lower end traces C → H — it really is the altitude.
- The slide is then a pure translation by exactly c.
- Final drawn quads tile c² **exactly**: same vertical extent, height 1.5, widths 0.54 +
  0.96 = 1.5, adjacent at u = foot with no gap and no overlap (probe ADV-8).

**Continuity at commit — the test x3a fails.** Driving each DOF to exactly 1.0 and *then*
releasing: max vertex movement at the commit is **0.000000 m at all four stages**. Nothing
is substituted; the parameter carries the shape onto its target.

The IEEE claim in the header holds too: `a*a === (a*a/c)*c` and `b*b === (b*b/c)*c` are both
exactly true, so the symbolic area does not even jump one ulp at the family hand-off.

## Contract and robustness

- All contract assertions pass: 6-stage walk in order, areas constant, `c2filled` = 2.25 at
  the finale, `release()` outside the window does not advance, 7 distinct specific hints,
  `restart()` + re-run.
- **Capture window is a real boundary**, not decoration: at 1 − (CAPTURE + 0.01) the release
  does not advance; at 1 − (CAPTURE − 0.005) it does. The snap is of the *parameter*, which
  the brief explicitly sanctions ("within a small capture window the handle clicks in").
- Real pointer-ray drag on the `drop` handle moves the DOF monotonically (0.25 → 0.50 → 0.75
  → 1.0) while both drawn areas stay at 0.81 / 1.44 to 1e-7.
- `filledBy` (x3b.js:218-225) computes overlap with c² from `slide` and `width`, gated on
  `drop === 1` — parameters only, and it reports honest partial fill during the slide
  (0.243 at u = 0.3), which is better than an on/off flag.
- `areasFromVertices()` (x3b.js:744-751) is a shoelace over the drawn vertices, offered so a
  reviewer can *check* rather than trust. That is the right instinct for this tier.
- API clean (`XR.camera`, `XR.run` only); `frame()` does nothing but the finale breathe.

## Where it deviates, and whether that is honest

- **Stage 3 is a shear, not just a line drop.** The brief's stage list says "drop the
  altitude (splits c² into two rectangles)". x3b makes that same gesture do the geometric
  work as well, and says so in the plaque's why-line ("Both keep their width and their 1.5 m
  sides: one more shear"). This is a *deepening* of the brief, not an evasion — it is what
  makes the room exact. Correct call.
- **The rake (28°) is declared** in the header with the measurement that motivated it (flat,
  a 1.58 m eye sees the plane at 14°). `side.png` confirms a drafting table; `eye.png` is
  the best first view of the four builds. Legitimate, well-argued departure.
- **Plaque is above eye, not at eye.** Audit: dist 5.61 m, elevation +15°. The brief says
  eye level. Justified (it would occlude the figure), still a deviation, and 5.6 m is far.
- **Handles are at 3.4–4 m** — laser reach, not `'reach'`. Forced by a 3 m figure; declared.

## Defects

- **ENV_TEST has no direct setter for the `drop` DOF.** The contract lists `setShear` /
  `setSlide`; neither reaches stage 3, so a panel can only drive the altitude via
  `advance()` or by poking a handle object. `setShear('a', t)` at stage 3 silently no-ops
  (x3b.js:684). A `setDrop(t)` would have closed the contract properly.
- The payoff card sits over the top of the filled c² and the triangle at the finale
  (`stage6.png`) — the one moment nothing should be occluded.
- At stage 1 the ghost is shown only for the live handle, but *both* shear handles are
  visible; grabbing the wrong one is correctly diagnosed, so this is a small nit.
- The piece tags (`a² = 0.81 m²`) ride the centroid — good — but at 3.7–3.9 m they are
  small, and at stage 1 they briefly overlap the `b = 1.2 m` edge tag (`stage1.png`).
- `setTimeout` chords in `commitStage`/`finish` fire outside any frame budget; harmless here,
  but they will overlap if a visitor spams the handle.

## Verdict

This is the build the brief was asking for. Two shears and one translation, each one degree
of freedom, each area-preserving by construction, verified against the mesh rather than
against the label — and the final pieces genuinely tile c² with no gap, no overlap and no
substitution. The one thing that would raise it further is closing the `drop` DOF into the
contract and moving the payoff off the square it is about.
