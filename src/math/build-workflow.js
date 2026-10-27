export const meta = {
  name: 'pme-build-experiences',
  description: 'Build each student brief once per model arm (Opus 5.5 high, Sonnet 5.5 medium); each arm reviews and repairs only its own work',
  phases: [
    { title: 'Build', detail: 'one fresh builder per brief per arm, same prompt file' },
    { title: 'Review', detail: 'cold reviewer from the same arm: checker + math + rules + fidelity' },
    { title: 'Repair', detail: 'one repair attempt from the same arm when the review blocks' },
  ],
}
// args: { run, briefs: ['b01', ...], arms?: [{ name, model, effort }], check? }
// Output per brief and arm: <run>/<bid>/<arm>/page.html, notes.json, review/repair files. The prompt and brief stay in <run>/<bid>/.
// Each arm uses only its own model and effort for building, reviewing and repairing, so the free arm gets no paid help.
const RUN = args.run
const CHECK = args.check || '/home/claude/xr/src/math/check-page.mjs'
const ARMS = args.arms || [{ name: 'opus', model: 'opus', effort: 'high' }, { name: 'sonnet', model: 'sonnet', effort: 'medium' }]
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
const reviewPrompt = (src, dir) => `You review one interactive math experience that an AI built from a non-math-major student's design. Be strict but fair; you have not seen how it was made.
Files: ${src}/brief.md (the student's design), ${dir}/page.html (the experience), ${src}/prompt.txt (the rules the builder had; the rules are in the part before "## The student's design"). Do not open any other folder.
1. Run: node ${CHECK} ${dir}/page.html ${dir}/review1  — it plays the page like a visitor and writes review1-start.png, -after.png, -phone.png. Read the JSON and LOOK at all three screenshots.
2. Read page.html fully. Recompute every number, claim and explanation the visitor sees (write a quick node script if useful). Is the math correct for every input the controls allow (sliders at their extremes too)?
3. Check the rules: one guess before any evidence; the card always says what to do next; evidence is computed from the objects shown and inspectable (not a staged animation of the answer; no hard-coded results); random simulations labelled as models; plain language for a friend who finds math hard; works at phone width; nothing overlapping or cut off in the screenshots.
4. Fidelity: is it recognisably the student's design (their concept, activity, look)? Filling gaps is fine; replacing their idea is not.
Verdict "repair" only for blocking problems (crash, wrong or misleading math, missing guess-first, staged/hard-coded answer, unusable or broken layout, ignores the design). Cosmetic issues go in minor. Do not edit any file.`

const jobs = args.briefs.flatMap(bid => ARMS.map(arm => ({ bid, arm })))
const results = await pipeline(jobs,
  async ({ bid, arm }) => {
    const src = `${RUN}/${bid}`, dir = `${src}/${arm.name}`
    await agent(`Read ${src}/prompt.txt and do exactly what it says. Your folder is ${dir}: create it if needed and write page.html and notes.json there. Do not open any other file or folder under ${RUN} except ${src}/prompt.txt and your own folder. When done, reply with one line: the page title.`,
      { label: `build:${bid}:${arm.name}`, phase: 'Build', model: arm.model, effort: arm.effort })
    return { src, dir }
  },
  async ({ src, dir }, { bid, arm }) => {
    const r = await agent(reviewPrompt(src, dir), { label: `review:${bid}:${arm.name}`, phase: 'Review', schema: REVIEW, model: arm.model, effort: arm.effort })
    return { bid, arm: arm.name, src, dir, review1: r }
  },
  async (st, { arm }) => {
    if (!st.review1 || st.review1.verdict !== 'repair') return { ...st, repaired: false }
    const out = await agent(`An interactive math experience at ${st.dir}/page.html was built from the student's design in ${st.src}/brief.md under the rules in ${st.src}/prompt.txt (everything before "## The student's design"; the MK kit reference is there too). A reviewer found these problems:\n${JSON.stringify({ blocking: st.review1.blocking, math_errors: st.review1.math_errors, minor: st.review1.minor }, null, 1)}\nFix the blocking problems and math errors (and minor ones if easy) by editing ${st.dir}/page.html. Keep the student's design and everything that already works. Do not open any other folder. Then run: node ${CHECK} ${st.dir}/page.html ${st.dir}/repair  and look at the screenshots; fix anything it reports. Finally write ${st.dir}/repair.md: a bullet list of exactly what you changed and why. Reply with one line.`,
      { label: `repair:${st.bid}:${arm.name}`, phase: 'Repair', model: arm.model, effort: arm.effort })
    return { ...st, repaired: true, repairNote: out }
  },
)
return results
