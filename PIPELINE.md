# Free-plan pipeline — test steps

## One-time setup (instructor, ~10 min)
1. On github.com (logged in as izgebayyurt): New repository → name it exactly `xr-class`, Public, no README needed.
2. On the new repo page: "uploading an existing file" → drag in everything from this folder (`xr-engine.js`, `student.html`, `prompt-kit.md`, `questionnaire.md`, `test-message.md`) → Commit.
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save. Wait ~2 min.
4. Verify in a browser: https://izgebayyurt.github.io/xr-class/xr-engine.js shows code, and https://izgebayyurt.github.io/xr-class/student.html shows the empty green world (drag to look). If the page is black with "XR is not defined" in red, the engine URL is wrong — repo must be named `xr-class`, or edit the one src= line in student.html.

## The test (incognito, ~10 min, 2–3 Claude messages)
1. Incognito window → claude.ai → sign in with an account that has NO paid plan (incognito alone doesn't make you free; use a personal Gmail). 
2. New chat → paste the ENTIRE contents of `test-message.md` (prompt kit + a ready-made Tier-2 brief) as one message. Send.
3. Claude replies with one code block starting `const { ... } = XR;` and ending `XR.run({ build, frame });`. If it added prose before the block or split it, reply: "One code block only, complete, no explanation." Copy the block.
4. Download `student.html` from the repo (or use a local copy) → open it in any text editor → select everything between
   `<!-- ===================== CONTENT ... -->` and `<!-- ===================== end CONTENT ... -->`
   (the whole `<script type="module"> ... </script>`) → replace the inside of the script tag with Claude's block → save.
5. Double-click the file → Chrome. Drag to look, WASD to walk, click things. Compare against the brief.
6. Add `?debug` to the address bar → audit panel appears top-right → check errors/warnings → "Copy report for Claude".
7. Round two: in the same chat, paste the copied report plus one line of what you want changed (or the bug-report form from the questionnaire). Get a new block, paste it in again, reload.
8. Headset (optional): upload the filled student.html to the repo (rename it, e.g. `demo.html`) → open https://izgebayyurt.github.io/xr-class/demo.html in the Quest browser → ENTER VR.

## What to record during the test
- How many messages the account let you send before hitting the limit.
- Was the first reply one clean block? Did it run without red errors on the page?
- Did it use only the cheat-sheet API, or invent functions (invented API shows up as red `... is not a function` on screen — paste that back, it's usually a one-round fix).
- How many rounds to match the brief.

## Failure modes
- Black page + "XR is not defined": engine URL wrong or Pages not live yet.
- Red error on screen: paste its exact text back to Claude.
- Claude writes a whole HTML file: reply "CONTENT block only — the page and engine already exist."
- No sound on first click: browsers unlock audio on the first input; click once more.
