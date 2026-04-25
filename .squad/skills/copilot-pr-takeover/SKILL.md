# SKILL — Taking over a stalled @copilot PR (rebase over a moving main)

> First seen: WI-23 PR #26 takeover, 2026-04-25 (Morpheus).

## When to use

A PR opened by `@copilot` (i.e. `app/copilot-swe-agent`) has gone stale, `main` has moved on (often by several merged PRs), the PR is now `mergeable: CONFLICTING`, and a coordinator authorises a human-or-agent takeover. No formal review submitted on the PR ⇒ no Reviewer Rejection Lockout, you can just push to the existing branch.

## Recipe

### 1. Worktree setup (already done by Squad runner)

```pwsh
# Branch is squad/<n>-<slug> tracking origin/copilot/issue-<n>-work-on
cd <worktree-path>
git status
git log --oneline origin/main..HEAD       # what the PR added
git log --oneline HEAD..origin/main       # what main added since
gh pr view <n> --json title,body,reviews,mergeable
```

### 2. Read before touching

- The PR body — @copilot writes detailed PR descriptions; the contract & migration shape are usually fully documented there.
- The issue body (`gh issue view <n>`) — for the canonical spec & acceptance criteria.
- `.squad/decisions.md` and `.squad/agents/<owner>/history.md` — for prior architectural calls (precedent locks, ADR conditions).
- Any review comments left by `copilot-pull-request-reviewer` — these are auto-generated bot reviews, not human reviews; treat as advisory not blocking.

### 3. Rebase, do **not** merge

```pwsh
git fetch origin
git rebase origin/main
```

`rebase` keeps the history linear and lets git auto-drop any of @copilot's commits whose patches have already landed on main (e.g. a baseline checkpoint). A `merge` would fatten the history without resolving anything.

### 4. Conflict-resolution rule for structural × semantic overlap

When two PRs touched the same lines for orthogonal reasons:

- **Structural rewrite** (perf optimisation, type rename, mutable-state introduction)
- **Semantic rewrite** (deleting a field, collapsing a stream, tightening a schema)

→ git's 3-way merge frequently produces a syntactically valid file that still references the deleted/renamed thing inside the structural change's branch. **Always run `tsc --noEmit` immediately after `git rebase --continue` to catch these stale references.** The compiler is the only reliable second-pass linter for this class of bug.

### 5. Run the gates locally before pushing

Per repo memory ([test gate](../../decisions.md)):

```pwsh
npm run typecheck                                              # tsc -b
npm run lint                                                   # eslint --max-warnings 0
npx vitest run --pool=forks --poolOptions.forks.singleFork=true
```

If any test fails, it's almost always:
- A test fixture seeded with the *old* shape that the new code now refuses (e.g. boot-guards, stricter Zod).
- A *production* call site that landed in a PR merged *after* the takeover-target opened, emitting the old shape.

Fix both — the contract is the contract, both prod and test must respect it.

### 6. Push back onto the PR's branch (keep PR #N alive)

```pwsh
git push --force-with-lease origin <local-branch>:copilot/issue-<n>-work-on
```

This keeps the existing PR's URL, comments, reviews, and CI history. Do **not** open a new PR. Only fall back to "open new PR + close old with reference comment" if branch protection blocks the push to `copilot/*`.

### 7. Mark ready-for-review and comment

```pwsh
gh pr ready <n>
gh pr comment <n> --body "Taking over from @copilot per coordinator decision (PR was stalled with conflicts). Rebased onto main, resolved conflicts in <files>, completed <fallout>. Gates: typecheck/lint/tests all green (<N> passed). Ready for review."
```

### 8. Do **not** merge

Even after gates pass — branch protection on `main` requires a fresh review. Hand off to the named reviewer (Neo for architecture, Switch for security) via the comment. Squad coordinator routes the merge.

## Anti-patterns

- ❌ `git merge origin/main` instead of rebase — fattens history, doesn't dropped already-upstream commits.
- ❌ `git checkout --theirs <file>` blindly — loses the perf/structural gains from main.
- ❌ `git checkout --ours <file>` blindly — loses the @copilot work you're trying to land.
- ❌ Pushing to a *new* branch and opening a new PR while #N is still open — splits the discussion thread.
- ❌ Merging without a human/peer reviewer — branch protection should block this anyway, but never try.

## Hygiene

- Commit message scope: `WI-XX` or `#NN` — tag the work item, not "rebase fixup".
- Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` on takeover commits.
- Append a learning to your agent's `history.md` describing the conflict-resolution pattern; it's almost always reusable.
- Append a decision doc to `.squad/decisions/inbox/<agent>-<issue>-takeover.md` for Scribe to reconcile.
