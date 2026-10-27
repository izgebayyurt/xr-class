# PME run day — instructions for Claude (Cowork, linked to Izge's Mac)

Izge starts a fresh chat in the SMU project, attaches the Form 1 responses CSV, and asks you to run the build with this runbook. That request is his opt-in for the build workflow (about 50 briefs × 2 model arms: builders plus reviewers and repairs). Do the steps in order and report after each numbered step in one or two lines.

**Inputs to get from Izge (ask in one go if any are missing):**
- the Form 1 CSV
- the Form 2 pre-filled link, made with PID / OA / OB / S1A / S1B / S2A / S2B typed into the seven code fields
- the study site: by default the xr-class repo on his personal GitHub (`~/Documents/GitHub/xr-class`, `https://izgebayyurt.github.io/xr-class/`), unless he names another
- the seed: use the class date as YYYYMMDD unless he says otherwise

**Rules that protect the study:**
- Never edit a generated page by hand. Each page gets at most one automatic repair (inside the workflow). If a page still fails the final check, report it and ask Izge whether to include it as is.
- Both arms get the identical `<bid>/prompt.txt`, and each builder sees only that file and its own arm folder. Never add names, other students' work, or your own suggestions to a prompt.
- Never tell Izge's students, or put in any student-facing file, which model made which version. That mapping lives only in `views.json` and `assignments.csv`.
- Names live only in `roster.json`, `assignments.csv` and `sheet.csv`. Never write those to the public site repo.

## 0. Set up the pipeline
1. Stage `~/Documents/GitHub/xr-class/src/math/` from the Mac and copy it to `/home/claude/xr/src/math/` in the cloud workspace. Leave out `node_modules`. The prompt refers to this exact path.
2. `cd /home/claude/xr/src/math && npm install`
3. Check: `node check-page.mjs example.html /tmp/ex` must print `"pass": true`.

## 1. Ingest
`node ingest.mjs <csv> /home/claude/pme/run1`. Report the number of briefs and any duplicate names that were merged (a later submission replaces an earlier one).

## 2. Build
Run the Workflow tool with `scriptPath: /home/claude/xr/src/math/build-workflow.js` and `args: { run: "/home/claude/pme/run1", briefs: [all bids from briefs.json] }`.
- By default it builds every brief twice: arm `opus` (Opus 5.5, high effort) and arm `sonnet` (Sonnet 5.5, medium effort, the free app's setting). Each arm builds, reviews and repairs only its own pages, in `run1/<bid>/opus/` and `run1/<bid>/sonnet/`. Model and effort are set in the script, not inherited from this chat.
- It takes roughly an hour or more for 50 briefs. You are notified when it finishes.
- Save its result as `run1/workflow-result.json`.
- Confirm the models from the agent transcripts: `grep -oh '"model":"[^"]*"' ~/.claude/projects/*/subagents/workflows/<run id>/*.jsonl | sort | uniq -c` should show only `claude-opus-5-5` and `claude-sonnet-5-5`, and `grep -oh '"effort":"[^"]*"'` only `high` and `medium`. Put both counts in the log (step 7).

## 3. Final check
For every brief and arm, run `node check-page.mjs run1/<bid>/<arm>/page.html run1/<bid>/<arm>/final > run1/<bid>/<arm>/final.json`, one or two at a time; each takes about 20 seconds. List any page that fails or is missing. A failing page is still a real result of that model; ask Izge before excluding it. `release.mjs` leaves out a design only when one of its versions is missing, and says which.

## 4. Release
`node release.mjs /home/claude/pme/run1 /home/claude/pme/site "<Form 2 pre-filled link>" <seed> <site URL>`
- Each student gets 6 links: versions A and B of their own design and of two classmates' designs. Which model is A is randomized and balanced (the script prints how many pairs have Opus as A).
- This writes the encrypted scenes to `/home/claude/pme/site/e/` and writes `sheet.csv`, `views.json` and `assignments.csv` to run1.
- Publish to the study site:
  1. Tar `site/e`.
  2. Commit the tar to the Mac site repo folder with device_commit_files.
  3. Untar it there with device_bash.
  4. Make sure `x.html`, `xr-log.js` and `shortlink-config.js` are at the repo root. In xr-class they already are; `x.html` is a copy of `src/math/x.html`.
  5. `git add e x.html xr-log.js shortlink-config.js && git commit -m "Scenes for run1" && git push`.
- Deletion is off in his folders: if git leaves `.lock` files, move them into `_to_delete/`.
- GitHub Pages needs about 10 minutes. Then open one link from `assignments.csv` through the Mac's browser pane and confirm the scene loads and shows its scene code.

## 5. The class sheet
Upload `run1/sheet.csv` with Google Drive `create_file` (contentMimeType `text/csv`, title "Math scenes – your links"). It converts into a Google Sheet with clickable links. Give Izge the link and ask him to share it view-only with the class.

## 6. Keep the private record
Tar the whole `run1` folder and commit it to a PRIVATE folder on the Mac, outside any git repo: ask Izge which one, e.g. `~/Documents/PME-study-private/`. It holds the roster, the keys, every prompt, page, review and repair note, and the scene-to-author map. The cloud workspace is deleted when the session ends.

## 7. Log
Write `claude/pme-run-log.md` in the SMU project. Include:
- the date and kit version (`VERSION`)
- the seed
- the number of briefs, and per arm: builds, repairs, final failures
- the model and effort counts from the transcripts
- the concepts chosen (counts)
- where the private record is

Do not include names.
