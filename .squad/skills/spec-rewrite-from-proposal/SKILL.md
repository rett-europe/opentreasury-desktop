# Skill: Spec Rewrite from Architecture Proposal

## Pattern

When an architect (e.g., Keaton) delivers a redesign proposal that supersedes an
existing spec, rewrite the spec as a single coherent document — not an addendum.
The new spec treats the redesigned architecture as the only design.

## When to Use

- An architecture proposal (decisions document) arrives that fundamentally
  changes the framing of an existing spec (e.g., single-device → multi-device).
- The product owner has answered all open questions from the proposal.
- The existing spec's structure and tone should be preserved, but its content
  replaced.

## Process

### 1. Gather Inputs

Read in this order:
1. **Architecture proposal** — the input contract. Contains decisions (D1, D2, …),
   schemas, estimates, and open questions for the owner.
2. **Current spec** — use for tone/structure reference and to harvest reusable
   copy (especially bilingual EN+ES strings). Do NOT preserve its framing.
3. **Style reference spec** — another spec from the same project to match tone,
   section organization, and formatting conventions.
4. **Schema/code confirmation** — verify claims in the proposal (e.g., "field X
   already exists in the schema") against actual source code.
5. **Owner's answers** — the product owner's responses to open questions. These
   are decisions, not suggestions. Lock them into the spec.

### 2. Rewrite Rules

- **No addendum framing.** Don't say "in addition to v1" or "this extends."
  Write as if the new design is the original and only design.
- **Fold owner answers as decisions.** No "open questions for Pedro" in the
  final spec. If the owner answered it, it's a locked decision in the
  Traceability section.
- **Harvest bilingual copy.** If the v1 spec had EN+ES strings for UX screens,
  reuse the ones that still apply (recovery screen, export screen) and revise
  the ones that changed (intro screen, done screen). Write new copy for new
  screens (join flow).
- **Carry forward unresolved questions.** Open questions from v1 that the
  architect hasn't answered yet (e.g., Argon2id tuning) remain as open questions
  in the new spec.
- **Update acceptance criteria.** Don't just renumber v1's ACs. Add new ACs for
  new capabilities (enrollment, concurrent write, merge-sort, dedup, conflict
  merge). Update existing ACs where file references or behaviors changed.
- **Mark front-matter.** Version: v2, supersedes: v1, status: proposed.

### 3. Decision Summary

Write a decision file (`.squad/decisions/inbox/`) that:
- States what this supersedes (both the v1 spec AND the architecture proposal).
- Lists all owner answers as resolved decisions.
- Lists remaining open questions for the architect.
- Notes the riskiest unknown.

### 4. History Update

Append learnings to the agent's `history.md`, focusing on:
- Architecture patterns that emerged (e.g., per-device files dodge conflicts).
- Owner stances that affect future specs (e.g., trusted board model).
- Reusable workflow insights (e.g., this skill itself).

## Example

**SPEC-026 v1 → v2 (2026-05-12):**
- Input: Keaton's D1–D5 (per-device files, multi-wrap keys, detection logic,
  join flow, migration path).
- Owner answers: Q1 (no revocation), Q2 (folder picker), Q3 (no cache).
- Output: Complete rewrite with 17 sections, 19 ACs, bilingual copy, estimate.
- 3 open questions for Keaton carried forward.

## Anti-Patterns

- **Don't preserve v1 scaffolding.** If the proposal says "per-device files,"
  don't keep references to a single `events.ndjson` except in the migration
  section.
- **Don't leave owner answers as open questions.** If Pedro answered Q2, the
  folder-picker decision is final — write it as spec text, not a question.
- **Don't create a diff document.** The output is a complete spec, not a
  changelog. The decision summary file handles the "what changed" narrative.
