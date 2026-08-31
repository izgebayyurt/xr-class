# x4a · The Estimation Tutor — blind review

**Functionality 9/10 · Visual 8/10 · Epistemic 9/10**

887 lines. `verify.mjs` clean: 0 errors, 0 warnings, no page errors, no audit flags.

Judged from artifacts only: splice + verify + renders + an independently written probe
(`x4-probe.js`, 20 assertions) driven by **four synthetic learners** — the brief's
(distance ×0.8, height ×1.05, angle +2°) and three of mine — plus a PRNG-hygiene probe and
real pointer-ray drags on both `grab:'hold'` handles.

## Contract: 20/20

Every assertion the brief lists, plus everything I added:

- 16 trials; calibration is exactly `distance, height, angle, distance, height, angle`;
  10 adaptive.
- `model().distance.bias` = **−0.2000** (brief: −0.20 ± 0.05); height +0.050, angle +0.046.
- **10 of 10** adaptive trials chose DISTANCE (brief asks ≥6); `nextChoiceExplain()` names
  it with the model's own numbers.
- `seed(42)` replays the session trial-for-trial; a different seed gives a different session.
- `summary()` matches `model()` to 1e-9.
- Trial-12 feedback speaks in trends.
- Answering past the end does not corrupt the model.

### My three learners

| learner | what I expected | what happened |
|---|---|---|
| angle ×1.35, height ×0.98, distance exact | model finds ANGLE, **positive** bias ≈ +0.35 | bias +0.350; 10/10 adaptive trials chased angle; summary named angle |
| height accurate below 1.0 m, ×1.30 above | adaptive height trials cluster on **large** targets | band means 0.010 (low) vs 0.30 (high); 100% of adaptive height targets > 1.0 m |
| distance alternating ±25%, zero mean | bias ≈ 0 but **spread** large; rule still picks distance | bias −0.044, spread 0.246; distance chosen every adaptive trial |

The selection rule is following the model, not the brief's example.

### The model is actually right

`learn()` (x4a.js:117-130) keeps `S`, `W`, `Q` and reports `bias = S/W`. The header's
justification is correct and non-obvious: a plain λ-EWMA seeded at zero reads −0.10 after two
−0.20 samples, so an early adaptive decision would be a function of *trial count* rather than
of the learner. Dividing by accumulated weight makes the estimate exact from the first
sample while still forgetting at λ. Verified: after two −0.20 calibration trials the bias is
already −0.200, and the first adaptive trial is distance.

### PRNG hygiene is clean

`rngDraws()` before/after an answer is **independent of the answer value** (3 draws either
way — all inside `makeTrial` for the next trial, as the header claims). The in-world RESTART
walks the seed through a pure integer hash (x4a.js:492), so a second visitor gets a
different session *and* the same seed reliably reproduces that second session. Verified by
running the reseed path twice: identical targets both times. No `Math.random()` anywhere.

### Other functional checks

- Real pointer-ray drag: the pole marker tracks 0.35 m exactly; the rose pointer sweeps
  monotonically (145.6° → 111.2° → 65.4° → 19.6°) under a rotating ray.
- Zero scene-object / geometry / material growth across two full 16-trial sessions.
- Truth geometry is invisible before the first commit; `drawn()` lets a reviewer confirm the
  room drew what it printed. `summary()` reports `available: false` mid-session.
- API clean; `frame()` does one eased reveal scalar and one yaw per visible number.

## Visual

`eye.png` is a real place: post at +14°, pole at +34°, rose at −26°, beacon at −38°, plaque
at −14° — every instrument inside the comfortable arc, none of them at the visitor's feet.
The header's reasoning for pushing the rose out to 2.9 m ("a floor instrument only enters the
opening frame from about 2.6 m out") is exactly the right kind of thinking, and the render
bears it out. Plaque text is 5 cm cap at 2.4 m — the most legible prompt of the four builds.
`judge-summary.png` is clean: three bars, correct relative heights, teal-under / amber-over,
one sentence, payoff, RESTART; instruments hidden.

Deductions:

- The plaque crowds "the beacon" in screen space at start (different depths, so no audit
  flag, but it reads as clutter).
- Instrument tags are 2.2–3.3 cm cap — small next to the plaque's 5 cm.
- Bar scale is arbitrary (`BAR_SCALE` 3.5, `BAR_MAX` 1.05), so any |bias| ≥ 30% saturates.
  It is labelled "(capped)", which is honest, but two very different learners can draw the
  same bar.
- In the summary frame the bars' plinths sit right at the bottom edge of the view.

## Epistemic

The strongest thing here is what is *absent*: no floor grid, no ticks on the pole, no degree
marks on the rose, no live readout of what you are currently holding, and the instrument
never parks on the answer (`makeTrial` randomises the start and pushes it clear of the
target, x4a.js:182-194). A room that gave you a ruler would measure the ruler.

Feedback language is genuinely model-driven and, importantly, **degrades honestly**. With
the brief's learner: *"Ninth time in a row you have undershot a long distance. Across 9
distance trials you compress distance by about 20%, steady to +/-0%."* With my alternating
learner the run breaks and it falls back to a literally true count: *"That is 6 of your 12
distance trials on the short side... you compress distance by about 4%, steady to +/-25%."*
It does not invent a habit that is not there, and the spread number carries the real story.

Two epistemic wobbles:

- **The streak sentence attributes a run to the current band.** `m.run` counts consecutive
  same-*sign* errors across all magnitude bands, but the sentence pins it to
  `SPEC[k].band[rec.band]` (x4a.js:268). Trials 10–13 of the brief-learner run read "Sixth
  time in a row... a long distance", "Seventh... a short distance", "Eighth... a middling
  distance" — the *sign* run is real, the *band* attribution is not. Either track a
  per-band run or drop the band from that clause.
- "You compress distance by about 20%" for a learner who *stops short* is psychophysically
  ambiguous (stopping short of 2.1 m means you judged 1.68 m to be 2.1 m — you expanded
  perceived distance). This wording is inherited verbatim from the brief's own example
  ("You compress far space by about 18%"), so it is not x4a's invention, but the brief is
  worth fixing at source.

## Verdict

A tutor that really does carry a model of you, and one that is careful about what it claims
on your behalf. The model maths is not just plausible but correctly reasoned; the selection
rule provably follows the learner rather than the example; determinism and PRNG hygiene are
airtight. Fix the band clause in the streak sentence and give the bars a stated scale.
