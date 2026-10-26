# PME run day — instructions for Claude (Cowork, linked to Izge's Mac)

Izge starts a fresh chat in the SMU project, attaches the Form 1 responses CSV, and asks you to run the build with this runbook. That request is his opt-in for the build workflow (about 50 Opus builders plus reviewers and repairs). Do the steps in order and report after each numbered step in one or two lines.

**Inputs to get from Izge (ask in one go if any are missing):**
- the Form 1 CSV
- the Form 2 pre-filled link, made with PID / OWN / S1 / S2 typed into the four fields
- the study site: repo folder on his Mac and public URL, e.g. `~/Documents/GitHub/<org>.github.io` and `https://<org>.github.io/`
- the seed: use the class date as YYYYMMDD unless he says otherwise

**Rules that protect the study:**
- Never edit a generated page by hand. Each page gets at most one automatic repair (inside the workflow). If a page still fails the final check, report it and ask Izge whether to include it as is.
- The builder sees only `<bid>/prompt.txt`. Never add names, other students' work, or your own suggestions to a prompt.
- Names live only in `roster.json`, `assignments.csv` and `sheet.csv`. Never write those to the public site repo.

## 0. Set up the pipeline
1. Stage `~/Documents/GitHub/xr-class/src/math/` from the Mac and copy it to `/home/claude/xr/src/math/` in the cloud workspace. Leave out `node_modules`. The prompt refers to this exact path.
2. `cd /home/claude/xr/src/math && npm install`
3. Check: `node check-page.mjs example.html /tmp/ex` must print `"pass": true`.

## 1. Ingest
`node ingest.mjs <csv> /home/claude/pme/run1`. Report the number of briefs and any duplicate names that were merged (a later submission replaces an earlier one).

## 2. Build
Run the Workflow tool with `scriptPath: /home/claude/xr/src/math/build-workflow.js` and `args: { run: "/home/claude/pme/run1", briefs: [all bids from briefs.json] }`.
- It takes about 40 minutes for 12 briefs, and longer for 50. You are notified when it finishes.
- Save its result as `run1/workflow-result.json`.

## 3. Final check
For every brief, run `node check-page.mjs run1/<bid>/page.html run1/<bid>/final > run1/<bid>/final.json`, one or two at a time; each takes about 20 seconds. List any brief that fails or has no page.html.

## 4. Release
`node release.mjs /home/claude/pme/run1 /home/claude/pme/site "<Form 2 pre-filled link>" <seed> <site URL>`
- This writes the encrypted scenes to `/home/claude/pme/site/e/` and writes `sheet.csv`, `views.json` and `assignments.csv` to run1.
- Publish to the study site:
  1. Tar `site/e`.
  2. Commit the tar to the Mac site repo folder with device_commit_files.
  3. Untar it there with device_bash.
  4. Make sure `x.html`, `xr-log.js` and `shortlink-config.js` are at the repo root (copy from `src/math/x.html`, `src/engine/xr-log.js` and xr-class's `shortlink-config.js`).
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
- the number of briefs, builds, repairs and final failures
- the concepts chosen (counts)
- where the private record is

Do not include names.
