# PME math pipeline (kit 2026-10-26.1)

1. Students design a scene in Google Form 1.
2. Fresh builders turn each design into a scene, once per model (see 4).
3. An automatic check runs, plus at most one repair.
4. Every design is built twice, by Opus 5.5 (high) and Sonnet 5.5 (medium, the free model). Each student gets blinded links to versions A and B of their own design and of two classmates' designs, through a shared sheet.
5. They give feedback in Google Form 2.

## Files
- `forms.md`: the exact questions for Form 1 (design) and Form 2 (scene feedback)
- `prompt.md` + `example.html`: the fixed builder prompt (rules, MK reference, one worked example). Each student's full prompt is saved as `<run>/<bid>/prompt.txt`
- `mathkit.js`: the shell every scene runs in. It provides:
  - layout and guess-first controls
  - SVG helpers
  - exact fractions and seeded randomness
  - timers that Start over clears
  - event reporting to the viewer
- `check-page.mjs`: a headless visitor. It answers the guess, presses everything, drags, waits, presses Start over, and checks phone width. It reports problems and warnings and saves screenshots
- `ingest.mjs`: turns the Form 1 CSV into `<run>/briefs.json`, `<run>/roster.json` (PRIVATE: participant ID → name) and one folder per student.
  - The builder never sees names.
  - The builder never sees the expectation questions (10–11).
- `release.mjs`: seeded ring assignment (own scene + the next two; every scene gets exactly 2 reviewers). Each link is a separately encrypted copy with its own scene code, so nothing connects a reviewed scene to its author. It writes:
  - `e/<code>.txt` → the site
  - `sheet.csv` → the shared Google Sheet
  - `views.json` and `assignments.csv` → PRIVATE, the code → author key
- `x.html`: the viewer. It decrypts with the key from the link's `#k=` and runs the scene in a sandboxed iframe. It shows the scene code top right. It logs under the participant ID (`&v=`), batched into one write when the visitor leaves

## Run day
1. Download the Form 1 responses as CSV, then run `node ingest.mjs responses.csv <run>`
2. Run the build workflow: one Opus builder per brief, then a cold review, then at most one repair. The builder may run `check-page.mjs` on its own page, as the fixed prompt says
3. Run `check-page.mjs` on every final page
4. Build Form 2 and get the pre-filled link with PID / OWN / S1 / S2
5. Run `node release.mjs <run> <site repo> "<that link>" <seed> <site url>`, then commit and push `e/` and `x.html`
6. Upload `sheet.csv` to Google Drive (it converts into a Google Sheet with clickable links). Share it view-only
7. Save the whole `<run>` folder (roster, keys, prompts, pages, reviews) to a PRIVATE folder on Izge's computer, not the public repo
8. Afterwards, export the logs from the worker (`/export?key=`): `x-open` and `x-view` events, keyed by participant ID

## Data for the paper
- `briefs.json`: the design and the stated expectation
- `<bid>/prompt.txt`, `page.html`, `notes.json` (what the builder kept, filled in and changed)
- the review JSON and `repair.md` (if any)
- `views.json`: which scene code is whose
- Form 2: expectation match, perceived ownership, math correctness, peer ratings
- viewer logs: the guess, every action, time on page
