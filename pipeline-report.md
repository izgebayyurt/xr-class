# Autonomous development pipeline — final report

**Run:** overnight, 3 build rounds + surgical pass · **Agents:** 3 Opus brief-writers, 12 Sonnet builders (persistent across rounds), 4–5 Opus panel seats per review round + Opus chair, 2 Opus final verifiers · **Orchestrator:** Fable (this session), owning all engine/kit changes between rounds.

**Live gallery:** https://izgebayyurt.github.io/xr-class/scenes.html — every environment as a short link (`run.html?s=env01-million-line` …), each openable with `&debug` for the audit panel.

## Score table (functionality / visual / epistemic, each 1–10)

| env | title | difficulty | round 1 | round 2 | final | total Δ |
|---|---|---|---|---|---|---|
| env01 | The Million Line | easy | 8/7/7 = 22 | 6/6/8 = 20 | 8/7/8 = **23** | +1 |
| env02 | Where Units Came From | easy | 7/3/5 = 15 | 8/6/7 = 21 | 8/7/8 = **23** | +8 |
| env03 | Seven and a Half Heads | easy | 8/4/7 = 19 | 9/6/8 = 23 | 9/7/9 = **25** | +6 |
| env04 | Ten Seconds Long | easy | 4/8/7 = 19 | 8/9/9 = 26 | **26** (retired R2) | +7 |
| env05 | Draw With Your Feet | medium | 4/6/8 = 18 | 8/8/9 = 25 | **25** (retired R2) | +7 |
| env06 | The Leaning Stack | medium | 6/4/7 = 17 | 5/5/8 = 18 | 8/7/9 = **24** | +7 |
| env07 | Three Right Angles | medium | 7/4/6 = 17 | 5/6/9 = 20 | 9/7/9 = **25** | +8 |
| env08 | The Gap at Your Feet | medium | 6/4/5 = 15 | 8/7/8 = 23 | 9/8/9 = **26** | +11 |
| env09 | Pendulum Wave | hard | 8/6/7 = 21 | 9/7/8 = 24 | 9/8/9 = **26** | +5 |
| env10 | Scrubbing the Slope | hard | 8/5/8 = 21 | 7/8/9 = 24 | 9/8/10 = **27** | +6 |
| env11 | Tower Race | hard | 5/4/6 = 15 | 8/7/8 = 23 | 9/8/9 = **26** | +11 |
| env12 | The Crank and the Slider | hard | 8/7/8 = 23 | 7/8/9 = 24 | 8/8/9 = **25** | +2 |
| | | | **222** | **271** | **301** | **+79** |

Median 18.5 → 23 → 25. The four env06/11/12 defects the final verifiers still named were closed in a surgical pass after scoring (handle-follow, label burial, stale readout, covered payoff) — each re-probed. Full per-env reviews, verbatim, live in `pipeline/reviews/round{1,2,3}/`.

## The headline finding

**Not one of 36 build attempts got a number wrong.** Every failure across all rounds was *delivery*: things the visitor never saw (orphaned groups, frustum-culled trails, depth-occluding proxies), controls that died silently (relocated grab handles, proxies grabbed instead of knobs), and lessons computed but never stated. The chair's round-1 verdict held all night: eleven of twelve blockers were one-line consequences of engine defects, not builder reasoning errors. For the class, that means the fix loop belongs mostly to the instructor's kit, and the audit panel is the students' best friend.

## Kit changes made between rounds (all live on the site)

Round 1 → 2, from panel findings:
- `remove()` now disposes GPU memory and unregisters interactive children (leaks measured up to 21 MB/s and 2.6 GB/game — all confirmed dead by re-measurement).
- `lbl.setText()` — labels update in place; the remove-and-recreate idiom is banned in the cheat sheet.
- `grab:'hold'` — handles that must not move (the old grab re-attach silently relocated every slider/pad).
- `shape.hit` / `shape.hitball` — invisible pointing targets that can't depth-occlude; `mat()` at opacity ≤0.05 stops writing depth; materials passed to `shape.*` are honored.
- Audit: warns on orphaned groups, malformed/origin `stations` pushes (which had been silently disabling other warnings), interactive/text beyond ±60°, and now skips hidden geometry.
- Cheat sheet: runtime palette recolouring, arc-fit arithmetic, the payoff-sentence rule.

Round 2 → 3, from panel findings:
- `drag(obj, {point, pointer})` fires every frame while a `grab:'hold'` handle is held — kills the "guess the hand via onController" pattern that left three controls inert on desktop.
- `sky({top, bottom})` retinting; yaw-only billboards (labels never roll); `label(..., anchor:'top')` for panels that grow; text floor raised to 30′ ('small' now 38′).
- Cheat sheet: payoff placement (gated on the interaction, where the visitor looks, never a standing caption); never distort a meaning-carrying object to silence an audit warning; zero parked child offsets after `place()`.

## Remaining known warts (accepted, not blocking)

Default control heights near waist level still draw neck-strain warnings when a brief pins them there; env09's small-print idealization caption is clipped at extreme angles; the audit only sees the start state — bugs that appear after interaction still need the probe harness (a post-interaction audit is the top candidate for the next kit change).

## For the study

Persistent builder agents + verbatim reviews give a full revision-trace per environment: what the reviewer said, what the builder changed, what actually improved — 36 build/review pairs of it, with category-level scores. The three-seat rubric (functional / visual / epistemic) separated cleanly all night: builds routinely scored 8–9 functional while epistemically mute, which is precisely the gap the payoff-sentence rule then closed (epistemic mean 6.8 → 8.5 in one round).
