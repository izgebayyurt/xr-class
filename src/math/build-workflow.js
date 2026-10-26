export const meta = {
  name: 'pme-build-experiences',
  description: 'Build one math experience per student brief (Opus), review each cold, repair once if needed',
  phases: [
    { title: 'Build', detail: 'one builder per brief, fixed prompt file' },
    { title: 'Review', detail: 'cold reviewer: checker + math + rules + fidelity' },
    { title: 'Repair', detail: 'one repair attempt when the review blocks' },
  ],
}
const RUN = args.run
const CHECK = args.check || '/home/claude/xr/src/math/check-page.mjs'
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'repair'] },
    blocking: { type: 'array', items: { type: 'string' }, description: 'problems that must be fixed: crashes, wrong math, missing guess-first, answer staged instead of computed, unusable layout, ignores the design' },
    minor: { type: 'array', items: { type: 'string' } },
    math_errors: { type: 'array', items: { type: 'string' } },
    shows_why: { type: 'integer', description: '1-5: does the visitor see WHY through pieces they inspect' },
    fidelity: { type: 'integer', description: '1-5: how recognisably it is the student design' },
    clarity: { type: 'integer', description: '1-5: would a friend who finds math hard know what to do' },
    summary: { type: 'string', description: 'two sentences: what the experience does' },
  },
  required: ['verdict', 'blocking', 'minor', 'math_errors', 'shows_why', 'fidelity', 'clarity', 'summary'],
}
const reviewPrompt = (dir, round) => `You review one interactive math experience that an AI built from a non-math-major student's design. Be strict but fair; you have not seen how it was made.
Files: ${dir}/brief.md (the student's design), ${dir}/page.html (the experience), ${dir}/prompt.txt (the rules the builder had; the rules are in the part before "## The student's design").
1. Run: node ${CHECK} ${dir}/page.html ${dir}/review${round}  — it plays the page like a visitor and writes review${round}-start.png, -after.png, -phone.png. Read the JSON and LOOK at all three screenshots.
2. Read page.html fully. Recompute every number, claim and explanation the visitor sees (write a quick node script if useful). Is the math correct for every input the controls allow (sliders at their extremes too)?
3. Check the rules: one guess before any evidence; the card always says what to do next; evidence is computed from the objects shown and inspectable (not a staged animation of the answer; no hard-coded results); random simulations labelled as models; plain language for a friend who finds math hard; works at phone width; nothing overlapping or cut off in the screenshots.
4. Fidelity: is it recognisably the student's design (their concept, activity, look)? Filling gaps is fine; replacing their idea is not.
Verdict "repair" only for blocking problems (crash, wrong or misleading math, missing guess-first, staged/hard-coded answer, unusable or broken layout, ignores the design). Cosmetic issues go in minor. Do not edit any file.`

const results = await pipeline(args.briefs,
  async (bid) => {
    const dir = `${RUN}/${bid}`
    await agent(`Read ${dir}/prompt.txt and do exactly what it says. Your folder is ${dir}: write page.html and notes.json there. Do not open any other folder under ${RUN}. When done, reply with one line: the page title.`, { label: `build:${bid}`, phase: 'Build' })
    return dir
  },
  async (dir, bid) => {
    const r = await agent(reviewPrompt(dir, 1), { label: `review:${bid}`, phase: 'Review', schema: REVIEW })
    return { dir, bid, review1: r }
  },
  async (st) => {
    if (!st.review1 || st.review1.verdict !== 'repair') return { ...st, repaired: false }
    const out = await agent(`An interactive math experience at ${st.dir}/page.html was built from the student's design in ${st.dir}/brief.md under the rules in ${st.dir}/prompt.txt (everything before "## The student's design"; the MK kit reference is there too). A reviewer found these problems:\n${JSON.stringify({ blocking: st.review1.blocking, math_errors: st.review1.math_errors, minor: st.review1.minor }, null, 1)}\nFix the blocking problems and math errors (and minor ones if easy) by editing ${st.dir}/page.html. Keep the student's design and everything that already works. Then run: node ${CHECK} ${st.dir}/page.html ${st.dir}/repair  and look at the screenshots; fix anything it reports. Finally write ${st.dir}/repair.md: a bullet list of exactly what you changed and why. Reply with one line.`, { label: `repair:${st.bid}`, phase: 'Repair' })
    return { ...st, repaired: true, repairNote: out }
  },
)
return results
