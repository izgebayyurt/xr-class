# Free-plan pipeline — test steps

## One-time setup (instructor, ~10 min)
1. On github.com (logged in as izgebayyurt): New repository → name it exactly `xr-class`, Public, no README needed.
2. On the new repo page: "uploading an existing file" → drag in everything from this folder (`xr-engine.js`, `student.html`, `prompt-kit.md`, `questionnaire.md`, `test-message.md`) → Commit.
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save. Wait ~2 min.
4. Verify in a browser: https://izgebayyurt.github.io/xr-class/xr-engine.js shows code, and https://izgebayyurt.github.io/xr-class/student.html shows the empty green world (drag to look). If the page is black with "XR is not defined" in red, the engine URL is wrong — repo must be named `xr-class`, or edit the one src= line in student.html.

## The test (incognito, ~10 min, 2-3 Claude messages)
1. Incognito window -> claude.ai -> sign in with an account that has NO paid plan (incognito alone doesn't make you free; use a personal Gmail).
2. New chat -> paste the ENTIRE contents of `test-message.md` (prompt kit + a ready-made Tier-2 brief) as one message. Send.
3. Claude replies with one code block starting `const { ... } = XR;` and ending `XR.run({ build, frame });`. If it added prose before the block or split it, reply: "One code block only, complete, no explanation." Copy the block.
4. Open https://izgebayyurt.github.io/xr-class/make.html -> paste the block (markdown fences are stripped automatically) -> "Create + preview below". You get a link, a QR code, and a live preview. The whole scene lives inside the link - nothing is stored anywhere.
5. Open the link in a tab: drag to look, WASD to walk, click things. Compare against the brief.
6. "Open with audit panel" (or add ?debug before the #) -> audit top-right -> "Copy report for Claude".
7. Round two: paste the report plus one line of what to change into the same chat -> new block -> paste into make.html again (or click "view code" on the running page to jump back with the code pre-filled).
8. Headset: scan the QR with the Quest's cameras (passthrough or the Camera app) -> it opens in the headset browser -> ENTER VR. If the scene is too big for a QR, send yourself the link instead.

## What to record during the test
- How many messages the account let you send before hitting the limit.
- Was the first reply one clean block? Did it run without red errors on the page?
- Did it use only the cheat-sheet API, or invent functions (invented API shows up as red "... is not a function" on screen - paste that back, it's usually a one-round fix).
- How many rounds to match the brief.

## Failure modes
- Black page + "XR is not defined" / "engine did not load": engine URL wrong or Pages not live yet.
- Red error on screen: paste its exact text back to Claude.
- Claude writes a whole HTML file: reply "CONTENT block only - the page and engine already exist."
- No sound on first click: browsers unlock audio on the first input; click once more.
- "Too big for a QR code": the link still works - copy it instead of scanning.
