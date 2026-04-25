# Skill: Perf-Gate Verification (Reviewer-Rejection-Lockout flow)

> When a reviewer requests changes to a perf-budget gate and the original
> author pushes a fix, an independent verifier must prove the fix works.
> This skill captures the pattern for that proof.

## When to use

- A PR adds a CI perf gate (Playwright/Electron, Vitest perf, etc.).
- The Lead reviewer posted CHANGES_REQUESTED with concrete numbers.
- The original author pushed a "fix the asks" commit.
- Reviewer Rejection Lockout means the author cannot self-approve.
- You are the independent verifier.

## Verification recipe

1. **Diff the fix commit explicitly per ask.** Don't trust the commit message
   alone. For each of Lead's bullet points, find the line in the new code
   that addresses it and quote the file/line in your verification notes.

2. **Sanity-check selectors against current source.** Perf gates often depend
   on DOM selectors that drift. Open the components the spec selects against,
   confirm the anchor (`aria-label`, class, `role`) actually exists at the
   referenced line. Virtualised tables in particular: verify whether padding
   rows carry `aria-hidden="true"` and that the selector excludes them.

3. **Run the gate end-to-end on your local box.** Reading the diff isn't
   enough. The whole point of the Lead's review was that the original code
   compiled fine but produced no measurements. Reproduce: seed → run → read
   numbers → confirm no timeouts and median is comfortably under budget.

4. **Capture observed numbers.** All three runs + median + budget headroom
   ratio. These become the baseline the next tightening PR is calibrated
   against.

5. **Decide: approve or self-correct.** If the fix is incomplete, you
   (verifier) push the corrections directly to the branch — the original
   author is locked out. Commit message format: `test(#NN): {what} (post-Lead-review)`.

## Electron-specific gotcha

- `_electron.launch({ args: ['dist/main/index.js'] })` **bypasses package.json
  main resolution** → `app.getName()` falls back to `"Electron"` →
  `userData` becomes `%APPDATA%\Electron`, not `%APPDATA%\<your-app>`.
- Any seed that wrote to `%APPDATA%\<your-app>` is invisible to the test.
- The app under test loads empty, the data-row selector times out, and you
  get zero measurements — failures look like "selector not found" not
  "perf regression," which is misleading.
- **Always launch with `args: ['.']`** so package.json `main` + name resolve.

## Budget calibration

- Day-1 budget should be `observed_median × 2` minimum, ideally with one
  week of CI data before tightening.
- Final steady-state budget: `observed_median × 1.5` after the dataset
  stabilises.
- `BUDGET_MS = 500` for a screen that mounts in ~700-750 ms guarantees a
  red gate on day one. Don't ship that.

## Per-test timeout vs per-run cap

- Global Playwright `timeout` must cover all RUNS launches × cold-start
  worst case, plus harness overhead. For 3 cold Electron launches at
  ~40 s each on slow CI: **`timeout: 240_000`**.
- Per-run `waitForSelector` cap can be tighter (e.g. 30 s) to fail fast on
  truly stuck launches without swallowing the median budget.

## Checklist (paste into verification notes)

```
[ ] Each Lead bullet → quoted file:line in fix commit
[ ] Selectors verified against current component source
[ ] Local seed runs without error
[ ] Local gate runs without timeouts
[ ] Median < BUDGET_MS with >= 2x headroom
[ ] Three run times captured for future calibration
[ ] APPROVE review posted with numbers (or corrections pushed)
[ ] PR merged via `gh pr merge --squash --delete-branch --auto`
[ ] Umbrella issue checked and closed if all sub-tasks done
```
