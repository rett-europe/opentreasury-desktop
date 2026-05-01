# Skill: Verify PR Merge State via gh CLI

**Owner:** Coordinator  
**Motivation:** Handoff summaries can lie about PR merge state. Avoid acting on stale or false claims.  
**Cost:** 1 CLI call per PR to verify (marginal overhead at handoff boundary)  
**Benefit:** Catch stale/in-flight PRs before they break session planning

---

## The Problem

When a prior session coordinator writes "PR #224 is merged", that claim can be:

1. **True:** PR is genuinely merged, mergedAt timestamp is in prior session window
2. **False (stale):** PR is still OPEN or DRAFT, never merged. Summary was written optimistically.
3. **False (partial):** PR merged with incomplete implementation (e.g., JSDoc comment without actual code changes). Git shows merged, but functional scope didn't land.

Case 2 and 3 both create downstream chaos:
- Coordinator trusts dependency chain that doesn't exist
- In-flight work is forgotten (PR stays draft for days)
- Partial implementations are assumed complete until dogfooding reveals gaps

---

## The Skill

### Before Acting on Handoff, Always Verify

For each PR claimed "merged" in the prior session summary:

```bash
# Verify merge state and timestamp
gh pr view <N> --json state,mergedAt

# Example output:
# {
#   "state": "MERGED",
#   "mergedAt": "2026-05-01T18:23:41Z"
# }
```

Require:
- `state == "MERGED"` (not `DRAFT`, `OPEN`, `CLOSED`)
- `mergedAt` exists (merge happened; `null` means never merged)
- `mergedAt` timestamp is in the prior session window (not merged in current session, which defeats the purpose of the handoff)

### For Transitive Dependencies

If PR X claims to build on "merged PR Y", verify Y independently. Don't assume Y is merged just because X references it.

### For Partial Implementations

`gh pr view` only confirms the commit landed. It does **not** verify scope completeness. For critical PRs (e.g., queries, IPC contracts, i18n), do a quick grep-verify:

```bash
# PR #224 claimed "all i18n strings updated 30→90"
grep -r "last-30-days" app/src/renderer/locales/

# Result: matches found = claim was false (strings didn't actually update)
# Result: no matches = claim was true (old strings cleaned up)
```

---

## Example: This Session

**Handoff claimed:**
- PR #222: closed (✅ true)
- PR #224: "i18n strings 30→90 updated" (❌ false — strings missing until PR #226)
- PR #226: "already merged" (❌ false — never merged, still in flight)

**Verification steps taken:**
1. `gh pr view 224 --json state,mergedAt` → state = MERGED ✓ (commit landed, but...)
2. `grep -r "last-30-days" app/src/renderer/locales/` → matches found (old strings still in tree, claim false)
3. `gh pr view 226 --json state,mergedAt` → state = OPEN, mergedAt = null (never merged)

**Outcome:** Coordinator now has accurate picture:
- PR #224 is merged but incomplete
- PR #226 is stale and needs re-prioritization
- Dependency chain (#221 → #224 → #226 → #229) is broken until #226 lands

---

## When to Skip

- **Within same session:** If PRs were merged 30 minutes ago by the same coordinator, git truth is immediate. No handoff decay risk.
- **Single PR in isolation:** If a prior session merged PR #100 and current session needs to extend it, verify. But don't re-verify per-minute; once-per-session-boundary is sufficient.
- **PR state at merge time vs. now:** GitHub's `mergedAt` timestamp is immutable (recorded when merge button clicked), so historical verification is reliable.

---

## Lessons Extracted

1. **Handoff summaries ≠ truth.** Write them carefully, and verify them skeptically.
2. **Partial implementations (JSDoc without code) are the hardest to catch.** Always grep-verify critical changes (i18n, queries, contracts).
3. **In-flight PRs hide best in open/draft state.** A "never merged" PR is obvious with `gh pr view`; an "incomplete implementation" requires scope audit.
4. **Coordinator overhead:** +1-2 minutes per session boundary for full verification of 3-5 key PRs. Worth the cost for accuracy.

---

## References

- Discovered: 2026-05-01 session (Trinity/Morpheus coordination collision)
- Decision: `.squad/decisions.md` § "Coordinator Merge-State Verification Requirement"
- Related: `.squad/log/20260501T182341Z-dashboard-truth-and-collision.md` (full session context)
