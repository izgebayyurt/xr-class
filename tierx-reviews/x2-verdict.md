# x2 · Orbital Sandbox — head-to-head verdict

| | x2a | x2b |
|---|---|---|
| Functionality | **9** | 6 |
| Visual | **8** | 3 |
| Epistemic | **9** | 5 |
| Lines | 661 (budget 1,200) | 370 |
| verify.mjs | 0 err / 1 warn (justified) | 0 err / 0 warn |
| My 40-assertion probe | 39 pass | 39 pass |
| Honesty of difficulty | honest | honest (physics); unfinished (room) |

## Winner: **x2a**, decisively.

### Both integrators are real. I checked by measuring, not by reading.

Both are velocity Verlet with a fixed substep (1/600 for x2a, 1/400 for x2b) and an accumulator, and
both survive every attack in `pipeline/tierx/reviews/judge-x2-probe.js`:

| measurement | required | x2a | x2b |
|---|---|---|---|
| \|Δε/ε\| over `step(60)`, circular | < 1e-3 | 7.7e-12 | 1.1e-11 |
| energy band across a full e=0.7 orbit | — | 1.8e-5 | 4.4e-5 |
| worst \|Δε/ε\| over **600** sim seconds | — | 3.3e-8 | 6.5e-8 |
| **measured** return time vs reported period | 1% | matches to 15 digits | matches to 15 digits |
| **measured** eccentricity from r_min/r_max vs readout | 1% | 0.7000029 vs 0.7 | 0.7000126 vs 0.7 |
| \|h\| conserved, tilted 3D orbit | — | 2.1e-14 | 2.0e-14 |
| orbital-plane normal drift | — | cos θ = 1 | cos θ = 1 |
| `renderer.info` over 5,000 steps | stable | 42/4/10 → identical | 19/4/6 → identical |

I deliberately did not trust either build's readout: I swept 1.5 orbits at fine resolution to find the
*actual* closest return, and computed eccentricity from the *simulated* apoapsis and periapsis. Both
pass. **Neither faked conservation, neither special-cased the tested path, neither hard-coded an
answer.** Credit to both for the part that was hard.

### x2a wins on everything the physics is *for*.

**1. `step()` is off the render loop in x2a and is not in x2b — a direct contract violation.**
The brief: *"`step(seconds)` — advance the simulation deterministically OFF the render loop."*
With no `step()` call at all, 700 ms of idle wall clock moved x2a's body **0 m** and x2b's **0.296 m**,
because x2b's `frame()` keeps integrating regardless. Every phase assertion a panel makes against x2b
is silently contaminated by whatever frames landed in between, and the contamination grows with frame
rate. x2a's composition is correspondingly exact: `step(30)` is **bit-identical** (distance 0.0) to
300 × `step(0.1)` and to 3000 × `step(0.01)`, and `timeWarp(4)` changes what `step(20)` computes by
**0.0**. x2b's compositions differ by ~1e-11 because its last substep is variable.

x2a buys this with an explicit `manual` flag: touching `spawn`/`step` stops the render loop from
advancing physics, and `live(true)` or any real grab hands time back. I looked hard at this, because
"behaves differently under test" is the *shape* of a fudge — but the same `substepAll()` runs either
way, it isolates the clock and not the physics, and it is disclosed in a five-line header comment. It
is legitimate, and x2b's result is the argument that it was necessary.

**2. x2b's trail sampler is broken, and it breaks the one image the room exists for.**
In `x2b.js:345` the push sits inside the accumulator loop and writes the *same* `b.mesh.position` on
every iteration. Measured on the live buffer at warp ×1: **133 points drawn, only 45 distinct**, max
chord 0.178 m; at warp ×4 it is ~13 duplicates per frame and ~0.7 m chords. The 400-slot ring buffer's
effective capacity collapses to the number of frames, the trail shape becomes frame-rate dependent,
and the closed ellipse overdrawing itself — *"same path, again and again", the brief's stated point* —
never appears. My live render shows a jagged white polygon across the floor. x2a resamples by **path
length** (2 cm): measured 194 drawn, **194 distinct**, max chord 0.0212 m, and its render shows two
clean coloured ellipses closing on themselves around the star.

**3. Spatial judgement.** x2a puts the star at 2.0 m / 1.70 m, so a 0.8–1.4 m orbit stays clear of the
visitor. x2b puts it at 1.3 m / chest height, so a 1 m orbit sweeps ~0.3 m from where the user is
standing — and, at the same apparent size and height as the moons with no corona, it does not read as
a star at all. x2b's rack runs to −55° and its intro label to +55°, both marked not-in-view by the
audit; the one text explaining the room is clipped off-screen at start.

**4. Progression.** Tier X asks for real progression and failure states. x2a's checklist — closed
orbit, near-circle e<0.10, long ellipse e>0.60, an escape, a fall-in — turns the sandbox into five
experiments you have to produce with your arm, and it narrates outcomes in words ("the star swallowed
it", "escaped — past 12 m, never coming back"). x2b has none, and worse: the moment a moon escapes or
is absorbed its readout reverts to *"Throw a moon to see its orbit."*, so the visitor is never told
what happened. x2b spent 370 of 1,200 available lines and stopped after the physics.

**5. The payoff gate.** x2a accumulates swept angle with the exact two-body identity `θ̇ = h/r²`, so
"it came back" is stated when the moon has genuinely swept 2π, and it is gated on `thrown` — its own
demo moon is created `thrown:false` so it cannot fire the payoff for you. x2b gates on *elapsed time ≥
period*, which fires whether or not the visitor saw a path close.

---

## What each should steal from the other

**x2b should steal from x2a — in this order:**
1. **Path-length trail resampling** (`TRAIL_D2`, resample after 2 cm of travel) instead of accumulator
   time with a repeated position. This is the single highest-value fix in either x2 build.
2. **A manual/live clock flag** so `step()` is genuinely deterministic, with an escape hatch back to
   live.
3. **Star placement at ~2 m / 1.70 m and a two-shell additive corona** (`BackSide`,
   `depthWrite:false`) so the star reads as a star and orbits do not pass through the visitor.
4. **The checklist of things to make happen**, and **narrated absorb/escape events** — the room's two
   failure states currently happen in silence.
5. **Eccentricity-based classification** instead of a dimensional `|ε| < 0.05` threshold; e is the
   scale-free invariant and is the room's actual subject.
6. Elements from the **eccentricity vector** `e = (v×h)/μ − r̂`, which is right on any frame and gives
   a real number for hyperbolas instead of `null`.
7. Bring the rack and the intro label inside ±35°.

**x2a should steal from x2b:**
1. **`step()`'s exact-remainder handling.** x2b lands exactly on the requested time; x2a's accumulator
   carries a sub-substep residual that shows as a cycling 0.05–0.22% phase wobble in the
   return-each-period test (x2b's was 0.003–0.03%). Carry the remainder *and* keep the substep fixed
   and you get both properties.
2. **Always-live simplicity as the default.** x2a's `manual` freeze is correct for the panel but
   leaves the room stopped after a scripted test until someone grabs a moon or calls `live(true)`.
   Auto-resume after N seconds of no `step()` call would remove the trap.
3. **Return `-1` rather than silently recycling.** x2a's sixth `spawn()` retires moon #1 and it
   vanishes from `bodies()` and `energy(id)` with no signal — the only assertion x2a failed. x2b keeps
   all five and refuses nothing.
4. Fix the slider rig: at `dir: 34` with `face:true`, `time × 1.00` and the `0.25×`/`4×` end labels
   render as hard-slanted text and collide with the rack (audit: `moon rack and time warp overlap`).
