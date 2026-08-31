# x4b · The Estimation Tutor — blind review

**Functionality 6/10 · Visual 4/10 · Epistemic 5/10**

568 lines. `verify.mjs` clean: 0 errors, 0 warnings, no page errors. One audit note
(rose disc / dial knob overlap — intended).

Judged from artifacts only: splice + verify + renders + an independently written probe
(`x4-probe.js`, 20 assertions) driven by **four synthetic learners** — the brief's and three
of mine — plus a PRNG-hygiene probe (`x4b-prng.js`) and real pointer-ray drags.

## What works

- **The learner model converges and the adaptive rule genuinely follows it.** 19/20
  assertions pass. `model().distance.bias` = **−0.19999989** for the brief's learner; 10/10
  adaptive trials chose DISTANCE; `nextChoiceExplain()` names it with numbers; `summary()`
  matches `model()`; `seed(42)` + `restart()` replays the panel's session trial-for-trial.
- My learners confirm it is not hard-wired to the brief: an angle ×1.35 learner produced
  bias +0.3500 and **10/10** adaptive angle trials; a "only large heights are wrong" learner
  got **10/10** adaptive height targets above 1.0 m (bin targeting works); an alternating
  ±25% learner produced bias −0.13 with spread 0.38 and still drew every adaptive trial.
- Truth is never rendered before a commit — `showFeedbackInSpace` is reachable only from
  `submitAnswer` after the model update. Verified.
- Real pointer-ray drags work on both handles (marker tracks 0.35 m; dial sweeps
  monotonically 34° → 69° → 115° → 160°).
- `submitAnswer` writing the value into the scene and reading it back through the same
  accessor (x4b.js:296-301) is a good idea in principle — a human and the panel are scored
  by identical code.
- API clean; no scene-object growth measured across two sessions.

## Functional defects

### 1. The answer path steals from the PRNG — determinism is broken across the two routes

`forceSceneValue` (x4b.js:225) draws from the seeded stream to pick a cosmetic bearing for
the foot marker:

```js
const ang = rng() * Math.PI * 2; // any bearing works for a synthetic marker; visuals only
```

That path runs on `ENV_TEST.answer()` and **not** on a real CONFIRM press. I reproduced
mulberry32(42) independently and asked which draw index produced each calibration target:

```
draw index used:  [0, 2, 3, 4, 6, 7]      (clean would be [0,1,2,3,4,5])
```

Draws 1 and 5 are eaten by the two distance answers. Consequence: **a human answering the
same values on the same seed gets a different session from trial 2 onward.** The brief's
"Don't change" clause is *determinism under seeding*, and the header claims "two runs with
the same seed and the same answers are identical, trial for trial" — that is true only if
both runs come through the same door. The panel is therefore not replaying the visitor's
session, which is the whole point of seeding. Fix: use a non-seeded source (or a derived
constant) for a purely cosmetic bearing.

### 2. A second, unseeded randomness source, and a reseed that latches off

- `doRestart` (x4b.js:358) reseeds with `Math.random()`. The brief: *"all randomness through
  one seedable PRNG."* x4a walks its seed through a pure hash instead, which reseeds *and*
  stays reproducible.
- `seed()` sets `seedLocked = true` permanently (x4b.js:551). I pressed the in-world RESTART
  after seeding and re-ran three trials: targets `[2.28, 0.86, 25.4]` before and
  `[2.28, 0.86, 25.4]` after — **identical**. The brief says "RESTART reseeds". After any
  seeded run the in-world button no longer does. There is no way to unlock it.

### 3. λ is inverted

`ewmaUpdate` (x4b.js:97-102) computes `bias += 0.7·(x − bias)`, i.e. **0.7 weight on the new
sample**. The brief specifies `λ ≈ 0.7` in the standard form, which puts 0.7 on the *retained
history*. Constant-error learners still converge, so the brief's assertion passes, but the
forgetting rate is inverted (~3× faster), which is why bias visibly oscillates ±13% under my
alternating learner instead of settling near zero. `spread` is a mean-absolute-deviation, not
the sd the brief implies.

### 4. Feedback is on a 3.2-second timer

`FEEDBACK_LINGER` (x4b.js:41) and `frame()` (x4b.js:526-532) tear down the truth markers and
reprompt automatically. The brief's feedback moment is a tape/pole-mark/arc drawn *in space*
between your answer and the truth — with distance targets up to 5 m, the visitor must find,
walk toward and read that comparison in 3.2 s or lose it. There is no "next" affordance and
no way to dwell. x4a keeps the comparison up until the visitor asks for the next trial.

### 5. Per-event label and mesh construction

`showFeedbackInSpace` (x4b.js:247-293) calls `label(...)` and builds fresh meshes on **every
commit**, then `remove()`s them — 16 label-texture uploads per session. The kit says
plainly: *"NEVER remove-and-recreate a label per frame or per event."* I measured no net
object growth (so it is churn, not an unbounded leak), but it is a stated rule broken where
`setText` on three pre-built labels would have done.

## Epistemic defects

### The tutor makes provably false claims about your history

`trendFeedback` (x4b.js:181-188) prints `ordinal(m.n)` — the modality's **total trial
count** — next to a direction word taken from the *aggregate* bias sign, and calls it a
streak. Run against my alternating ±25% learner, the plaque said, consecutively:

```
Third time you've overshot a long distance.  You stretch far space by about 14%.
Fourth time you've undershot a short distance. You compress near space by about 13%.
Fifth time you've overshot a short distance.  You stretch near space by about 13%.
...
Twelfth time you've undershot a short distance. You compress near space by about 13%.
```

That learner never undershot twice in a row. There is no third, fourth or twelfth time.
The "13%" is an artefact of an EWMA oscillating around zero, reported as a settled habit,
when the true story is ±25% scatter with no bias at all. For a room whose thesis is *"a
tutor with a model of you, not a quiz with a score"*, a tutor that fabricates your record is
the worst available failure. x4a, on the same learner, correctly fell back to *"That is 6 of
your 12 distance trials on the short side"* — a literally true statement.

Fix: track a signed run length and only claim a streak when there is one; report spread when
bias is small.

Secondary: adaptive feedback replaces the numbers entirely (`buildFeedback`, x4b.js:189-193),
so from trial 7 on the plaque never states your answer, the target, or the signed error —
those exist only on a floor label that vanishes in 3.2 s. And the summary bar labels read
"−20% long" / "+4% narrow", where the word is the magnitude **bin**, not the direction the
brief asks for ("+12% far"); the direction is carried only by colour.

## Visual

`eye.png` is the weakest first view of the four. The rose (dir +35°, dist 1.0 m) sits at
elevation −57° and its dial knob at −47° — **both outside the start view**; the visitor must
look at their own feet to find one of the three instruments. The beacon is at +55°, also
out of view. The pole is 0.95 m away with a 1.85 m rail (77° angular) and is clipped by the
left edge of the frame. The plaque is 1.2 m from the face at 1.6 cm cap height, with CONFIRM
and RESTART stacked directly beneath it. The result is a frame that is mostly empty sky with
a small text column and two cropped poles.

`judge-summary.png` is worse: `enterSummary` (x4b.js:325-344) never hides the instruments or
the buttons, so the pole passes straight **through** the distance bar, the CONFIRM/RESTART
pair stands in the middle of the chart, and three text cards overlap — the payoff, the
leftover trend sentence still on the plaque (never cleared), and `sentenceLbl`, which is
clipped behind the plaque and unreadable ("Y...strongest habit: distance"). The two small
biases render as 9 cm slabs rather than bars.

## Verdict

The engine underneath is sound — the model converges, the bins target the right magnitudes,
and the adaptive rule chased every learner I threw at it. It is let down by a seeded stream
that the answer path quietly consumes, a second unseeded random source, a reseed that
latches off, a feedback moment on a stopwatch, and above all a trend sentence that states
things about the visitor that did not happen. The summary scene needs to be built as a
scene, not left on top of the previous one.
