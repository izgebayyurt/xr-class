# x2b · Orbital Sandbox — blind review

**Functionality 6/10 · Visual 3/10 · Epistemic 5/10**
**Honesty of difficulty: HONEST on the physics — the integrator is real and accurate. The failures
are in delivery, not in the kernel.**

Judged on: `pipeline/tierx/builds/x2b.js` (370 lines), `verify.mjs` (0 errors, 0 warnings, 1 overlap
note), my own probe `pipeline/tierx/reviews/judge-x2-probe.js` (the same 40 assertions I ran against
the other x2 build), a separate trail-buffer probe, and renders — including a live orbiting state I
drove myself.

## Honesty of difficulty — the main question

**The integrator is real.** I measured the trajectory rather than trusting the readout, and it holds.

- `substep()` (x2b.js:73) is textbook velocity Verlet with `SUBSTEP = 1/400` fixed and an accumulator
  in `frame()`. No rescaling, no energy clamp, no special case.
- Circular orbit, `step(60)`: `|Δε/ε| = 1.1e-11`. Energy band across a full e = 0.7 orbit: 4.4e-5.
  Over 600 simulated seconds the worst excursion is 6.5e-8. Genuinely symplectic.
- **The reported period is the simulated period.** True closest return measured at
  11.981564263386616 s against a reported 11.981564263386613 s. **The reported eccentricity is the
  path's eccentricity**: measured 0.7000126 from simulated r_min/r_max against a reported 0.7.
- **Fully 3D.** A tilted orbit conserves |h| to 2.0e-14 and the plane normal to `cos θ = 1`.
- Absorption, escape at 12 m, five simultaneous moons, `renderer.info` flat over 5,000 steps — all
  correct. No hard-coded answers, no test-mode branch, no special-casing of the tested path.

So the hard thing was done. What follows is everything built on top of it.

## Functionality — 6/10

Passes 39 of my 40 assertions, but the one it fails is a contract clause, and two more defects that
no single assertion catches are worse than the failure.

- **CONTRACT VIOLATION — `step()` is not off the render loop (ADV0).** The brief: *"`step(seconds)` —
  advance the simulation deterministically OFF the render loop."* `frame()` (x2b.js:330) keeps
  integrating every `state === 'orbit'` body regardless, so a scripted body moves **0.296 m in 700 ms
  of wall clock with no `step()` call at all**. Every phase assertion the panel makes is silently
  contaminated by however many render frames landed between calls; at Quest frame rates the smear is
  larger than under the software renderer. The fix is the one the rival build made: a flag that hands
  the clock to the panel while a script is driving.
- **BUG — the trail sampler pushes the same position N times per frame, and the trail is frame-rate
  dependent.** In `frame()` (x2b.js:345):
  ```js
  b.trail.acc += simDt;
  while (b.trail.acc >= TRAIL_INTERVAL) { trailPush(b.trail, b.mesh.position); b.trail.acc -= TRAIL_INTERVAL; }
  ```
  `b.mesh.position` does not change inside the loop, so every iteration writes the *identical* point.
  Measured on the live buffer at warp ×1: **133 points drawn, only 45 distinct**, max chord 0.178 m.
  At warp ×4 it is ~13 duplicates per frame and the chords are ~0.7 m. Consequences: the 400-slot ring
  buffer's effective capacity collapses to the number of *frames*, the trail becomes a coarse polygon
  whose shape depends on frame rate, and — the part that matters — **the closed ellipse overdrawing
  itself never appears.** That is the brief's stated point ("same path, again and again") and the
  room's central image. Sample on sim-time by interpolating, or resample by path length.
- **The visitor is never told why a moon vanished.** `updateReadout` (x2b.js:304): the moment a body
  leaves `'orbit'`/`'held'` the readout reverts to *"Throw a moon to see its orbit."* The brief asks
  for an "escaped" tag past 12 m and a flash on absorption; there is a `tone()` and a star flash, but
  no words at all. Escape and absorption are two of the three outcomes the room teaches.
- `step()` takes a **variable final substep** (`Math.min(SUBSTEP, remaining)`, x2b.js:270), against the
  brief's "same substep size as live". Practically it is the better trade for the panel's
  period assertion (it lands exactly on the requested time, so my 10-period return errors were
  3e-5…2.9e-4 versus the rival's 5e-4…2.2e-3 residual wobble) — but it means `step(30)` and
  300 × `step(0.1)` differ by ~1e-11 instead of exactly 0, and it is a literal deviation from the
  brief. Carry a remainder accumulator and you get both.
- `clear()` does not reset `accumulator` or `payoffShown`; leftover accumulated time is applied to the
  next body, and the payoff can never be shown a second time in a session.
- **API:** `col` (x2b.js:1, used at :110) exists on `XR` but is **not on the cheat sheet in
  `dist/prompt-kit.md`** — the sheet specifies `C.teal` / `mat()` for colour. Not a hallucination (it
  works), so not the automatic ≤4, but it is off-contract. `tone(f, s, type, vol)` likewise passes a
  4th argument the sheet does not document.
- Latent: `computeElements` classifies on a **dimensional** threshold `|ε| < 0.05`, so `elements()`
  returns `{ecc: null, period: null}` for any bound orbit with a > ~22 m. Unreachable here because
  `ESCAPE_R = 12`, but eccentricity is the scale-free invariant and is the right discriminator.
- Good: `spawn`'s star-relative frame is documented, the sixth spawn does not delete anyone, abusive
  input never throws and produces no NaN, and the `copyWithin` ring shift allocates nothing.
- **370 lines against a 1,200-line Tier X budget.** The physics is there; the "multi-stage, real
  progression and failure states" the tier asks for is not.

## Visual — 3/10

- **The star does not read as a star.** `shape.ball(0.12)` at `dist: 1.3`, `height: 'chest'` renders
  at the same apparent size as the moons, at nearly the same height, immediately beside the yellow one
  — in `eye.png` they read as a pair of balls. There is no corona, and `ground({color: 0x11141b})` is
  invisible, so there is no floor either. The brief's planetarium is not built.
- **The orbits sweep through the visitor.** Star 1.3 m ahead at 1.25 m; a 1 m orbit passes ~0.3 m from
  where the user stands, at chest height. Compare 2.0 m / 1.70 m in the rival build.
- **Half the room is outside the opening view.** `spread(rackMeshes, { dir: -30, span: 50 })` puts the
  moons at −55°…−5°: the audit marks `moon-red` as not in view and it is clipped at the frame edge.
  The intro label at `dir: 55` is likewise marked not-in-view and renders as the fragment `ger / Ho`
  at the right edge. The one text that explains the room is off-screen at start.
- **The trail bug (above) destroys the payoff image**: in my live render the "orbits" are a jagged
  white polygon wandering across the whole floor plane rather than two closed ellipses.
- The white slider knob (`shape.ball(0.045)` plus its label) is the largest, brightest object in the
  lower-right and pulls the eye away from the star.
- `Time-warp` is a 0.6 cm cap label at 0.59 m (38′) — at the legibility floor.
- Credit: the moon colours are distinct and well chosen, and the payoff card itself is well typeset.

## Epistemic — 5/10

- What the room *says* is true. μ = 2.2 gives a 4.24 s period at 1 m ("a period of a few seconds" ✓),
  and the displayed ε, e and T are correct — I verified them against the simulated path, not just
  against each other.
- **But the two things a visitor is supposed to experience are broken.** The closed path that
  overdraws itself is the whole argument for "falling and missing", and the trail bug means it is
  never drawn. Escape and absorption happen silently, so the room never contrasts ε<0 with ε>0 in
  words — the payoff line asserts "ε < 0 and it must return" without the visitor ever having been
  shown the case where it doesn't.
- The payoff gate (`simClock - thrownAt >= period`) is a reasonable proxy but is *time elapsed*, not
  *angle swept* — it fires even for a moon whose path the visitor never saw close.
- No progression, no experiments to attempt, no failure framing. A visitor with two minutes gets a
  ball on a wiggly line and a correct number they have no reason to trust.
- The classification threshold being dimensional rather than eccentricity-based is a small correctness
  smell in a room whose subject is exactly that invariant.

**Verdict:** an honest, accurate symplectic kernel — and then the room around it was not finished. Fix
the trail sampler and take the clock back from the render loop and this jumps two points in every
category on the same physics.
