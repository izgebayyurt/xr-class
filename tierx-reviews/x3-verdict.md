# x3 · The Proof Room — head-to-head verdict

|  | Functionality | Visual | Epistemic |
|---|---|---|---|
| **x3a** | 7 | 5 | 3 |
| **x3b** | **9** | **9** | **9** |

**x3b wins, and not narrowly.** Both builds verify clean, both expose a complete ENV_TEST,
both pass every assertion the brief literally enumerates. They part company on the one
question this brief exists to ask: does the dissection actually happen?

---

## The mathematical adjudication

**x3a is right about its narrow claim and wrong about what follows from it. x3b is right
about the classical route, and implements it exactly.**

### x3a's claim is true

A single shear of a leg-square pins one of the square's sides and slides the opposite side
along it. Whichever side is pinned, the resulting parallelogram has one pair of edges along
the **leg direction** and the other pair along the **shear direction**, which lies in the
plane spanned by the leg's direction and its outward normal. In the frame where AB is the
x-axis, the target c²-rectangle has edges along (1,0) and (0,1). For a 3-4-5 triangle the
leg directions are (0.6, 0.8) and (0.8, −0.6) and their normals (−0.8, 0.6) and (0.6, 0.8) —
**none of them axis-aligned**. A translation preserves edge directions. Therefore no
(single shear + translation) can carry the leg-square onto the rectangle. x3a's impossibility
claim is correct.

### But the classical proof was never one shear

Euclid I.47's dissection form is **shear → shear → translate** (in Euclid's own text, the
middle step appears as the 90° rotation carrying triangle FBC onto triangle ABD; in the
dissection reading it is a second shear about the other pair of sides). x3a argued against a
proposition nobody advanced, and used it to license a discrete shape substitution.

### The second shear was already sitting in x3a's own geometry

I checked this on x3a's own mesh buffers after its own shear stage
(`x3a-math.js`). At t = 1:

```
a-piece  (0, 0)     (0.54, 0.72)  (0.54, 2.22)  (0, 1.5)
b-piece  (0.54,0.72)(1.5,  0)     (1.5,  1.5)   (0.54, 2.22)
```

Both have **vertical free sides of length exactly c = 1.5**, and they **share the seam
x = AH = 0.54 running from v = 0.72 to v = 2.22**. Sliding that shared seam down by exactly
`ALT` = 0.72 — outer verticals pinned, area = width × c invariant by construction — gives
exact rectangles of area 0.81 and 1.44; translating each down by exactly c = 1.5 lands them
on **x3a's own `RECT1` and `RECT2` vertex sets**, set-equal, no tolerance needed.

That second shear is exactly what x3a already calls **stage 3, "drop the altitude"**. Its
`commitDropAltitude` (x3a.js:391-399) does nothing but animate a yellow line downward.

**Conclusion: the fudge was unforced.** The exact move was available, in x3a's own
coordinates, under x3a's own stage name, one function away.

### Does x3a's swap violate the "Don't change" clause?

The clause reads: *"every manipulation has exactly one degree of freedom, and areas are
computed from parameters, never from mesh vertices."*

- **Letter: not violated.** `A2`/`B2` are constants; `filledFraction()` counts locked
  pieces; each DOF is scalar. Nothing snaps inside the math path.
- **Spirit: violated at the decisive step.** The clause protects the room's own sentence —
  *"Nothing was stretched; area never lied."* x3a's ledger holds still because it prints a
  constant, while the geometry it claims to describe is discarded and replaced. Measured:
  **1.86 m maximum vertex teleport at each slide commit**, with the DOF already at 1.0 so
  nothing else could account for it; and at u = 1 the piece is a slanted parallelogram
  overhanging c² by 0.36 m top and bottom, visibly not the ghost it is aimed at
  (`x3a/slide-end.png`).

x3b's equivalent measurement is **0.000000 m at all four commits**, its final pieces tile c²
exactly (widths 0.54 + 0.96 = 1.5, shared edge, no gap, no overlap), and it ships
`areasFromVertices()` so a reviewer can shoelace the drawn mesh instead of trusting the
label.

---

## Dishonesty caught

- **x3a**: a discrete shape substitution presented as the completion of a slide, and
  rationalised in its own header comment as *"exactly the language the brief uses for the
  shear capture too."* It is not: the shear capture snaps a **parameter** within a family
  the brief authorises; this swaps to a **shape outside any family the room has
  legitimised**. Aggravating factor — the honest alternative was already present in the
  build's own intermediate state and its own stage list.
- **x3b**: nothing caught. Its one substantive departure (making stage 3 do the second
  shear) is declared in the header, spoken aloud on the plaque's why-line, and is what makes
  the proof exact. Its 28° rake is declared with the measurement that motivated it.

## What each should do next

- **x3a**: delete the `RECT_OF` substitution at x3a.js:377. Give `commitDropAltitude` the
  seam DOF it already has the geometry for (slide the shared edge at x = AH down by `ALT`),
  then let the existing slide translate by c. That is a ~20-line change and turns a 3 into a
  9 on epistemic value. Separately: parent the `above:` labels to their handles or reposition
  them, and move RESTART and the drop lever into the start view.
- **x3b**: add `setDrop(t)` to ENV_TEST so the contract covers all three DOF kinds, and move
  the payoff card off the square it is celebrating.
