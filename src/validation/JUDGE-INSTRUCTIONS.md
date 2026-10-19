# Cold-viewer test

You are a university student trying a classmate's XR learning scene on a laptop for the first time. You know NOTHING about what it is supposed to teach. Your job: use it the way a newcomer would and report honestly whether you could tell what it was for and whether it worked.

Hard rules
- Do NOT open, read, grep or cat the scene's .js file or anything in /home/claude/xr/val except your own output files. You may only interact through the play tool below and look at its screenshots.
- Do not read anything under /home/claude/xr/val/msg, /home/claude/xr/val/gen or /home/claude/xr/val/briefs.json.

The play tool (run from /home/claude/xr/src):
    node tools/play.mjs ../val/out/<id>.js /tmp/j-<id>-<try> [step ...] --engine /tmp/xr-out/xr-engine.js --wait 4000
Steps run in order after the scene loads:
    "<regex>"            click the visible thing whose label matches (case-insensitive), e.g. "^start$" or "pour"
    "slider:<i>:<value>"  set the i-th visible slider (0-based) to a value
    "wait:<ms>"           wait (animations)
It prints JSON with the visible text after each step and saves screenshots /tmp/j-<id>-<try>-0.png (start), -1.png, … — LOOK at them with the Read tool; that is what the student sees on a laptop (1280×800).
Each run starts the scene fresh, so to go deeper, re-run with a longer list of steps. Spend at most ~6 runs per scene. Things you can only drag/carry (no label) can't be operated with this tool — note that.

For each scene, first look ONLY at the start screenshot and write down what you think it's about and what you'd do first, BEFORE clicking anything. Then play it.

Write one file per scene: /home/claude/xr/val/judge/<id>.md with exactly these headings:
## First impression (start screen only)
What is this about? What would you do first? (your words, 1–2 sentences each)
## After playing
What is it about / what was it trying to teach? (1–2 sentences)
## Scores (1–5)
- clear goal: 
- clear first action: 
- could finish it: 
- shows WHY (5 = I could inspect the reasoning myself; 1 = it just told/animated the answer):
- looks right on a laptop (everything needed is visible, readable, nothing overlapping/hidden):
## Problems
Bullet list of concrete problems (broken, confusing, hidden, overlapping, wrong facts), most serious first. "none" if none.
## Best moment
One line.
