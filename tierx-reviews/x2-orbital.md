# x2 · Orbital Sandbox · Tier X

You put on the headset and a small glowing star hangs at chest height, two steps ahead. You grab a moon from a rack, throw it, and it FALLS — real gravity, forever. Thrown gently sideways it traces an ellipse that closes on itself, exactly. Thrown hard it escapes on a hyperbola. The room's job: make "an orbit is falling and missing" something your arm learns.

## Required mechanics
- **Physics**: acceleration a = −μ·r̂/|r|² toward the fixed star (μ chosen so a comfortable ~1 m toss orbits with a period of a few seconds). Integrator must be symplectic (leapfrog / velocity Verlet) with fixed substeps (accumulator pattern) — energy of an elliptical orbit must drift < 0.1% over 60 simulated seconds. Up to 5 moons; a moon entering the star's radius is absorbed (brief flash); past 12 m it's released ("escaped" tag) and cleaned up.
- **Throwing**: VR — grab:true, velocity from the hand's recent motion (sample last ~100 ms of world positions at release). Desktop — drag the moon and release; velocity from recent mouse-carry motion. A moon in flight can be re-grabbed (its trail clears).
- **Trails**: each moon leaves an orbit trail (mutated ring buffer — no per-frame allocation). Closed orbits visibly overdraw themselves (that's the point: same path, again and again).
- **Live readout per last-thrown moon**: specific energy ε, classification (ellipse ε<0 / near-parabola / hyperbola ε>0), and for ellipses: period + eccentricity from the vis-viva/orbital elements — displayed AND correct.
- **Time control**: a grab:'hold' slider for time-warp 0.25×–4× (substeps scale so accuracy holds).
- **Payoff** (gated on the first completed closed orbit): "It keeps missing. That's all an orbit is — falling, and missing. ε < 0 and it must return."

## Verification Contract (window.ENV_TEST)
- `spawn(px,py,pz, vx,vy,vz)` → id (bypasses throwing) · `bodies()` → [{id, p, v, state:'orbit'|'absorbed'|'escaped'}]
- `energy(id)` → specific energy · `elements(id)` → {ecc, period} for bound orbits · `mu()` → μ
- `step(seconds)` — advance the simulation deterministically OFF the render loop (same substep size as live)
- `timeWarp(x)` · `clear()`
The panel will: spawn a circular orbit (v=√(μ/r) tangential), step(60), assert |Δε/ε| < 0.001 and position returns within 1% of start each period; spawn an eccentric ellipse (e≈0.7), assert period matches 2π√(a³/μ) within 1%; spawn hyperbolic (v > escape), assert classification and eventual 'escaped'; assert absorbed state inside star radius; assert trails don't grow memory (renderer.info stable over 5,000 steps).

## Look/feel & scope
Planetarium mood: sky({top:'black', bottom:'dark'}), faint floor. Star emissive orange; moons distinct colors; trails match their moon. Out of scope: moon-moon gravity, n-body, relativity, sound beyond soft chimes, orbital plane restriction (full 3D throws are allowed and must work — the integrator is 3D). Don't change: the integrator stays symplectic and fixed-step; if frame dt spikes, simulation time falls behind rather than energy exploding.
