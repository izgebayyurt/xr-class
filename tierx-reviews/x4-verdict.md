# x4 · The Estimation Tutor — head-to-head verdict

|  | Functionality | Visual | Epistemic |
|---|---|---|---|
| **x4a** | **9** | **8** | **9** |
| **x4b** | 6 | 4 | 5 |

**x4a wins on all three axes.** Both builds contain a working learner model and a working
adaptive rule — that part of the brief is met twice over. They separate on determinism
hygiene, on what the room looks like, and on whether the tutor tells the truth about you.

---

## Both models are real

I ran the brief's learner (distance ×0.8, height ×1.05, angle +2°) and **three of my own**
against both builds, all through my own probe:

| learner | x4a | x4b |
|---|---|---|
| brief's | distance bias −0.2000, 10/10 adaptive = distance | −0.19999989, 10/10 = distance |
| **angle ×1.35** (different modality, opposite sign) | +0.3500, 10/10 = angle | +0.3500, 10/10 = angle |
| **height wrong only above 1.0 m** | band means 0.010 vs 0.30; 100% of adaptive height targets > 1.0 m | 100% of adaptive height targets > 1.0 m |
| **distance alternating ±25%, zero mean** | bias −0.044, spread 0.246 | bias −0.135, spread 0.385 |

Neither build is hard-wired to the brief's example. The selection rules genuinely track the
model, and both do magnitude-band targeting that works.

## Determinism — the decisive functional split

The brief's "Don't change" clause is **determinism under seeding**.

- **x4a**: the PRNG is consumed only inside `makeTrial`. Draw count before/after an answer is
  independent of the answer value. The in-world RESTART walks the seed through a pure
  integer hash — it reseeds, *and* re-running that reseed path twice gives identical
  sessions. No `Math.random()` in the file.
- **x4b**: `forceSceneValue` draws from the seeded stream to pick a cosmetic foot-marker
  bearing (x4b.js:225), and that path runs on `ENV_TEST.answer()` but **not** on a real
  CONFIRM press. Reproducing mulberry32(42) independently, the calibration targets came from
  draw indices **[0, 2, 3, 4, 6, 7]** instead of [0,1,2,3,4,5] — draws 1 and 5 eaten by the
  two distance answers. A human and the panel therefore get *different sessions from the
  same seed and the same answers*, which is precisely what seeding was supposed to prevent.
  Separately, `doRestart` reseeds with `Math.random()` (a second, unseeded source), and
  `seedLocked` latches permanently on the first `seed()` call, so after any seeded run the
  in-world RESTART stops reseeding at all — measured identical targets before and after.

## Epistemic — the decisive content split

Both rooms promise feedback that "uses the model, not the trial". Only one keeps the promise
honestly when the model has nothing confident to say.

Given my alternating ±25% learner (no bias, large scatter), **x4b's plaque asserted a streak
that never happened**:

> "Third time you've overshot a long distance… Fourth time you've undershot a short
> distance… Twelfth time you've undershot a short distance. You compress near space by
> about 13%."

That learner never undershot twice in a row, and its true bias is zero — the "13%" is an
oscillating EWMA reported as a settled habit. `trendFeedback` prints the modality's total
trial count as if it were a run (x4b.js:181-188). **x4a on the same learner** dropped its
streak clause and said something literally true: *"That is 6 of your 12 distance trials on
the short side… you compress distance by about 4%, steady to +/-25%"* — with the spread
carrying the real story.

x4a also earns its epistemic score on what it withholds: no floor grid, no pole ticks, no
degree marks, no live readout, and the instrument is randomised clear of the target each
trial (x4a.js:182-194) so it can never anchor the answer. And its normalised estimator
(`bias = S/W`, x4a.js:109-114) is a correct and non-obvious fix — a plain λ-EWMA seeded at
zero would make the first adaptive choice a function of trial count rather than of the
learner. x4b instead inverts λ (0.7 on the *new* sample), which passes the brief's
convergence assertion but forgets ~3× too fast.

x4a is not flawless here: its streak sentence attributes a same-*sign* run to the current
magnitude **band** ("Eighth time in a row you have undershot a middling distance" when the
run spanned three bands). Real defect, far milder than fabricating the run itself.

## Visual

x4a puts all five objects inside ±38° with a 5 cm-cap plaque at 2.4 m, and its summary hides
the instruments and reads cleanly. x4b leaves the rose (−57° elevation) and its dial and the
beacon (+55°) outside the start view, crowds a 1.6 cm-cap plaque to 1.2 m from the face, and
— worst — never tears down the trial scene when the summary begins: the pole passes through
the distance bar, the CONFIRM/RESTART buttons stand in the chart, and three text cards
overlap with one clipped unreadable behind another.

## Dishonesty caught

- **x4b**: (a) the header claims "same seed and the same answers are identical, trial for
  trial" — true only within one answer path, disproved above; (b) the tutor states streaks
  and habit percentages that the learner's history does not contain. Neither looks
  deliberate; both are the kind of claim a build should have tested before asserting.
- **x4a**: nothing caught. Its header's non-obvious claims (normalised estimator, PRNG
  touched only in `makeTrial`, no per-frame allocation, pure reseed) all held up under
  direct measurement.

## What each should do next

- **x4a**: track a per-band run (or drop the band from the streak clause); state the bar
  scale in-world, since |bias| ≥ 30% saturates; lift the instrument tags to match the plaque.
- **x4b**: move the cosmetic bearing off the seeded stream; replace `Math.random()` with a
  derived reseed and drop the `seedLocked` latch; make streak claims from an actual signed
  run length and report spread when bias is small; hide the instruments and clear the plaque
  on entering summary; move the rose and beacon into the front arc and the plaque out to
  ~2.4 m; replace the 3.2 s feedback timer with a "next" press.
