# Skill — Safely re-index `--space-N` tokens across a CSS codebase

## When to use
The design system rescales its spacing tokens and every `--space-N` index shifts (e.g. v0.1 `--space-1 = 4px` → v0.2 `--space-1 = 2px`, with the *intent* preserved as `--space-2`). Naive find-and-replace breaks because `--space-1` is a prefix of `--space-10`, and chained replacements (`1→2`, then `2→4`, …) will mutate tokens you already migrated.

## Pattern: two-pass placeholder rewrite

1. **Pass 1 — oldToken → unique placeholder.** Iterate from the longest index to the shortest (`10, 9, 8, …, 1`) so `--space-10` is consumed before `--space-1` can match it.
2. **Pass 2 — placeholder → newToken.** Walk the placeholder list in the same order, substituting the final new token.

### PowerShell one-file version
```powershell
$map = [ordered]@{
  '--space-10' = '--space-13'
  '--space-9'  = '--space-12'
  '--space-8'  = '--space-11'
  '--space-7'  = '--space-10'
  '--space-6'  = '--space-9'
  '--space-5'  = '--space-8'
  '--space-4'  = '--space-7'
  '--space-3'  = '--space-6'
  '--space-2'  = '--space-4'
  '--space-1'  = '--space-2'
}

foreach ($f in Get-ChildItem app\src\renderer -Recurse -Include *.css |
                Where-Object { $_.FullName -notmatch 'tokens\.css$' }) {
  $text = Get-Content $f.FullName -Raw
  $i = 0
  foreach ($old in $map.Keys) {
    $text = $text.Replace($old, "__SPC_PH_${i}__"); $i++
  }
  $i = 0
  foreach ($new in $map.Values) {
    $text = $text.Replace("__SPC_PH_${i}__", $new); $i++
  }
  Set-Content -Path $f.FullName -Value $text -NoNewline
}
```

## Guardrails
- **Exclude the tokens file itself** — it holds the *definition* of `--space-N`; you only want to rewrite *consumers*.
- **Migrate caller props too, not just CSS.** Any JS/TSX that passes a numeric index to a component (e.g. `<Stack gap={3}>` where the component does `gap: var(--space-${gap})`) is a consumer in disguise. Grep for `gap=\{[0-9]+\}` / `space-${` / similar patterns.
- **Update tests that assert on the exact token name.** A test checking `style.gap` contains `var(--space-3)` still passes under the new scheme (token still exists, just resolves to a different px). A test checking *rendered pixels* will not.
- **Snapshot the before/after file diff count.** Unexpected zero-diff files are a red flag that the file was skipped (e.g. due to a glob filter) rather than already-migrated.

## When NOT to use
- Values (not indexes) changed but names stayed the same — no code migration needed; just visually review.
- Token ring grew but existing slot values are preserved — no migration; additions only.

## Rationale
This came up on tokens v0.2 adoption (`fix/trinity-prototype-parity`). The prototype's finer 2-px grid pushed every v0.1 slot down, and a single-pass `sed` would have silently re-remapped `--space-2` twice. The placeholder hop is ~15 lines of PowerShell and eliminates the whole class of bug.
