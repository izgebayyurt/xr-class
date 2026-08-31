# x4 · The Estimation Tutor · Tier X

You put on the headset and a calm voice-of-text says: "Let's find out how your eyes lie to you." Then it runs you through estimation trials — distances, heights, angles — watches HOW you're wrong, and starts aiming at your weaknesses. By the end it hands you a portrait of your own perceptual bias, measured. This is a tutor with a model of you, not a quiz with a score.

## Required mechanics
- **Three trial modalities**, each fully embodied: DISTANCE ("walk/teleport to where 3.5 m from the post is", answer = your standing spot), HEIGHT ("raise the marker to 1.2 m", a grab:'hold' handle on a pole), ANGLE ("turn the pointer to 40° from that beacon", a grab:'hold' dial on a floor rose). Each trial: prompt on the plaque → user acts → confirm with trigger on the plaque → feedback moment shows truth vs answer IN SPACE (a tape/pole-mark/arc drawn between your answer and truth) plus the signed error.
- **The learner model**: per modality, maintain an exponentially-weighted estimate of relative bias (mean of signed error / magnitude, λ≈0.7) and spread. After a 6-trial calibration sweep (2 per modality, fixed order), the ADAPTIVE phase begins: each next trial is drawn from the modality with the worst current |bias|+spread (ties → least-recently-tested), with magnitudes sampled AROUND where that learner's errors are largest (e.g. if long distances hurt, ask long distances). The selection rule must be deterministic given the model state and the seeded RNG.
- **Seeded RNG**: all randomness through one seedable PRNG (e.g. mulberry32). Same seed + same answers ⇒ identical session, trial for trial.
- **Feedback language uses the model, not the trial**: after each adaptive trial the plaque speaks in trends — "Third time you've undershot a long distance. You compress far space by about 18%." Numbers come from the model.
- **Session arc**: calibration (6) → adaptive (10) → summary: three floor-standing bars (one per modality, height = |bias|, color by direction, labeled "+12% far" etc.), one sentence naming the strongest bias, payoff: "Your eyes have habits. Now you've met them." RESTART reseeds.
- **≤3 interaction verbs total** (act, confirm, restart) — complexity lives in the model, not the controls.

## Verification Contract (window.ENV_TEST)
- `seed(n)` then `restart()` → deterministic session · `trial()` → {index, phase, modality, target} 
- `answer(value)` → programmatically submit (value in the trial's natural unit: metres or degrees), returns {signedError, feedbackText}
- `model()` → {distance:{bias, spread, n}, height:{...}, angle:{...}}
- `nextChoiceExplain()` → {modality, why} — the selection rule's verdict for the upcoming adaptive trial
- `summary()` → the three displayed bias numbers once in summary phase
The panel will: seed(42), feed a synthetic learner that answers distance×0.8, height×1.05, angle+2°, run all 16 trials via answer(); assert model().distance.bias converges to −0.20±0.05 while height/angle stay small; assert ≥6 of the 10 adaptive trials chose DISTANCE and nextChoiceExplain() names it with the model's numbers; assert identical trial sequence on re-seed(42); assert summary() matches model(); assert feedback text after trial 12 references a trend, not just the single error.

## Look/feel & scope
Quiet clinic-at-dusk: muted sky(), one post/pole/rose station arc in the front 90°, plaque ahead at eye level. Out of scope: time pressure, scores/grades, more modalities, speech audio, comparisons to other people. Don't change: determinism under seeding, and the tutor NEVER shows the truth before the user commits.
