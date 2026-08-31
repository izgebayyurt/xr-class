# x2a · Orbital Sandbox — blind review

**Functionality 9/10 · Visual 8/10 · Epistemic 9/10**
**Honesty of difficulty: HONEST — a real symplectic integrator, verified against independent
measurement rather than against its own readout.**

Judged on: `pipeline/tierx/builds/x2a.js` (661 lines), `verify.mjs` (0 errors, 1 warning, 1 overlap
note), my own probe `pipeline/tierx/reviews/judge-x2-probe.js` (40 assertions), a separate trail-buffer
probe, and renders — including a live orbiting state I drove myself.

## Honesty of difficulty — the main question

**It did the hard thing.** I did not take the readout's word for anything; I measured the trajectory.

- `substepAll()` (x2a.js:197) is kick–drift–kick velocity Verlet with `HSUB = 1/600` fixed, carrying
  the acceleration across substeps. One function serves both the live loop and `step()`.
- **Energy.** Circular orbit at r = 1, `step(60)`: `|Δε/ε| = 7.7e-12` (brief allows 1e-3 — five
  orders of margin). Over an eccentric e = 0.7 orbit the *energy band* (max − min across the whole
  orbit, not just endpoints) is 1.8e-5. Over **600** simulated seconds the worst excursion is 3.3e-8.
  That is a symplectic integrator's bounded-error signature, not a rescaled or clamped one.
- **The reported period is the period the simulation actually has.** I swept 1.5 orbits at
  Tan/400 resolution and found the true closest return at **t = 12.566370614359169 s** against a
  reported 12.566370614359172 s — agreement to 15 digits, closest approach 0.004 m on a = 2 m.
  A build that printed the vis-viva formula while integrating something else would fail here.
- **The reported eccentricity is the eccentricity of the actual path.** Measured from the simulated
  r_min/r_max over one orbit: `(rmax−rmin)/(rmax+rmin) = 0.7000029` against a reported 0.7.
- **Full 3D, not a dressed-up planar solver (ADV3).** A tilted orbit off every axis plane conserves
  |h| to 2.1e-14 and the orbital-plane normal to `cos θ = 1` at double precision. Energy holds to
  3.8e-7.
- **`step()` really is off the render loop (ADV0).** With no `step()` call, 700 ms of wall clock moved
  the body **0 m**. `step(30)` is bit-identical to 300 × `step(0.1)` and to 3000 × `step(0.01)`
  (distance 0.0, exactly). `timeWarp(4)` and `timeWarp(0.25)` change what `step(20)` computes by
  **0.0** — the warp cannot leak into the deterministic path.
- **Elements are computed from the state vector, exactly** (`elementsOf`, x2a.js:72) using the
  eccentricity *vector* `e = (v×h)/μ − r̂`, so they are right on any frame including hyperbolic
  (it reported e = 2.92 for my escaper, where the rival returns `null`).
- No hard-coded answers, no test-mode detection, no `navigator.webdriver`, no special case for the
  circular-orbit path. Absorption and escape are radius tests inside the same substep loop.

The one thing I want on the record, because it is the *shape* of a fudge even though it is not one:
`spawn()`/`step()` set `manual = true`, which stops the render loop from advancing physics
(x2a.js:27–30, 590, 621). This is disclosed in a five-line header comment, reversible via `live(true)`
or any real grab, and — decisively — the *same* `substepAll()` runs either way, so it isolates the
clock rather than the physics. I judge it legitimate and, given the rival's result, necessary. It has
one real cost: after a scripted test the room is frozen until someone grabs a moon.

## Functionality — 9/10

Passes 39 of my 40 assertions. `verify.mjs`: 0 errors, 1 warning.

- **The one failure: a sixth `spawn()` silently deletes moon #1.** `freeSlot()` (x2a.js:139) retires
  the oldest flying body when no slot is racked, `retire()` splices it out of `bodies`, and it
  vanishes from `bodies()` and `energy(id)` with no signal. The brief caps the room at 5 moons, so
  recycling is correct behaviour — but the honest form is `return -1` (which the function already does
  when all five are *held*), not a silent deletion that a scripted panel will misread.
- Everything else in the contract is exact: `bodies()` states, absorption inside the star radius,
  absorption of a moon dropped from rest, `escaped` past 12 m, five simultaneous moons all holding
  energy to ~1e-12 over 60 s, and `clear()` returning the rack to a clean state.
- **Trails allocate nothing and never grow.** `renderer.info` geometries/textures/programs were
  identical before and after 5,000 steps (42/4/10). The mirrored double-write ring buffer
  (`trailPush`, x2a.js:116) gives a contiguous chronological draw window in O(1) with no memmove.
  Independently confirmed on the live buffer: **194 drawn points, 194 distinct, max chord 0.0212 m** —
  exactly the 2 cm path-length resample, so trail density is frame-rate independent.
- The warning (`moon 5 is grabbable but 1.68 m away`) is the demo moon in flight. It is forced by the
  brief ("a moon in flight can be re-grabbed") and is the right trade; it should have carried a
  one-line justification per the Tier X rules.
- Abusive input is clean: `spawn(0,0,0,0,0,0)` on the singularity is absorbed with no NaN, `step(-5)`
  is a no-op, `timeWarp(1e6)` and `timeWarp(-3)` clamp, unknown ids return `null`.
- Minor: the readout's event line can describe a different moon than its header — I captured
  `moon #3 … / same path, lap 4 · it came back` while lap 4 belonged to moon #2.
- API: cheat-sheet compliant throughout.

## Visual — 8/10

- **A composed planetarium.** Star centred at 2.0 m / 1.70 m with a two-shell additive corona
  (`glow` + `halo`, `BackSide`, `depthWrite:false` — a corona *around* the star, not a brown wash over
  it), a demo moon already orbiting on arrival with its trail drawn, the checklist left and the live
  readout right, the rack at chest with an empty cradle showing where the flying moon came from.
- **The trails do the thing the brief exists for.** In my live render, two coloured ellipses close on
  themselves and overdraw around the star. That single image is the lesson.
- Star placement is the right call and the rival's is not: at 2 m out and 1.70 m up, a 0.8–1.4 m orbit
  stays clear of the visitor's head.
- Nits:
  - The time-warp rig is placed at `dir: 34` with `face:true`, so `time × 1.00` and the `0.25×`/`4×`
    end labels render as hard-slanted text; the `0.25×` cap (1.8 cm, 45′) is occluded by the rack, and
    the audit notes `moon rack and time warp overlap`.
  - The checklist panel at `ahead-left` sits on top of the purple trail once an orbit is wide.
  - The instruction plate under the rack crosses in front of the two nearest moons in the eye view.

## Epistemic — 9/10

- **Every number I checked is correct.** μ = 2.00 m³/s² gives a 3.18 s period at 0.8 m — the brief's
  "a comfortable ~1 m toss orbits with a period of a few seconds". Reported `ε`, `e`, `T` and `a` all
  matched independent computation to 1e-15, and matched the *measured* trajectory to 1e-5.
- **The payoff fires at the true moment.** `onLap` uses the exact two-body identity `θ̇ = h/r²` to
  accumulate swept angle, so "it came back" is stated when the moon has actually swept 2π — not when a
  formula's worth of seconds has elapsed. It is gated on `thrown`, and the build's own demo moon is
  created with `thrown:false` specifically so it cannot fire the payoff for you.
- **The checklist turns a sandbox into a set of experiments**: a closed orbit, a near-circle (e<0.10),
  a long ellipse (e>0.60), an escape, a fall-in. That is the progression Tier X asks for, and it is
  what makes "falling and missing" land — you have to produce each case with your arm.
- Classification is by **eccentricity**, not by a dimensional energy threshold, so the label never
  flickers along an orbit and never mislabels a wide bound orbit as near-parabolic.
- The events narrate the failure states in words ("the star swallowed it", "escaped — past 12 m, never
  coming back"), so a moon never just disappears.
- Half a point off: the readout is dense (four lines of symbols) and can attach an event from one moon
  to another's header; and the payoff sentence sits under the star while the reader's eyes have been
  trained by the checklist to the left.

**Verdict:** the strongest build in this tier — an integrator that survives every independent
measurement I could aim at it, wrapped in a room that shows the closed orbit and names the lesson at
the moment it happens.
