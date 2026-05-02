# Skill: Spec to Sub-Issues Decomposition

## Pattern

When decomposing a spec's work items into GitHub issues, group by **architectural layer** rather than by item count, and order by **dependency graph** to minimize blocking.

## Rationale

Large specs often include 8–15 work items. Creating one issue per item results in:
- **Fragmentation:** Too many issues to coordinate (cognitive overhead, CI/CD noise).
- **Weak grouping:** Issues lack clear ownership boundaries (who unblocks whom?).
- **Dependency hell:** Forward-references to unknown issue numbers or unclear blocking chains.

Grouping by layer provides:
- **Clear ownership:** One owner (backend architect, frontend lead) per layer.
- **Dependency clarity:** "Depends on" relationships map to "layer X blocks layer Y+1".
- **Parallelism:** Sibling layers can start in parallel once their blocker finishes.

## Process

### 1. Extract the Spec's Work Items

Read the spec's "Work Decomposition" or "Implementation Plan" section. Identify:
- **Phases** (if grouped) or logical clusters.
- **Items per phase** (e.g., Phase 1: 3 items, Phase 2: 4 items).
- **Acceptance criteria** for each item.
- **Owner hints** (spec may suggest "for Morpheus" or "frontend").

### 2. Group by Architectural Layer

Map items to layers:

| Layer | Example | Often Includes |
|-------|---------|-----------------|
| **Contract/Schema** | Types, errors, IPC contracts | TypeScript interfaces, Zod schemas, error enums |
| **Core Logic** | Validation, migrations, command handlers | Business rules, data transformations, state machines |
| **Test Infrastructure** | Test helpers, fixtures, test matrix | Mocks, setup helpers, test templates |
| **Frontend: Interaction** | Dialogs, forms, user flows | React components, modal dialogs, navigation |
| **Frontend: Display/Error** | Result screens, boot pages | Read-only display, error boundaries, recovery UX |
| **Docs** | API docs, checklists, guides | Runbooks, breaking-change checklists, troubleshooting |

### 3. Order by Dependency

Topologically sort layers so:
- **Contract layer** is always first (types are required by logic and tests).
- **Core logic** depends on contract.
- **Test infrastructure** depends on both contract and core logic.
- **Frontend** depends on contract (to call core).

Example order for #206:
1. Dataset schema & error catalogue (contract).
2. Corruption detection (core logic, depends on #1).
3. Migration framework (core logic + tests, depends on #1).
4. Folder-picker dialogs (frontend interaction, depends on #1).
5. Boot error page (frontend display, depends on #2).

### 4. Create Issues in Order

**Critical:** Create issues in dependency order so that when you author issue N, you can reference previous issue numbers (instead of forward-referencing unknown numbers).

For each layer/group:
- **Title:** `[#parent-issue] <layer-name-and-scope>` (e.g., `[#206] Dataset schema & error catalogue`).
- **Body:**
  - 2–3 sentence problem statement.
  - "Parent: #<parent>" link.
  - "Spec: <path> § <section>" reference.
  - Acceptance criteria (bulleted, from spec).
  - Suggested owner(s).
  - "Dependencies: None" (if foundational) or "Blocked by: #<previous-issue>".
- **Labels:** `squad`, plus team-member labels (e.g., `squad:morpheus`).

### 5. Parent Issue Comment

After creating all sub-issues, comment on parent with a formatted list:

```markdown
Decomposed into the following sub-issues:
- #<n1> — <layer-name> (<owner>)
- #<n2> — <layer-name> (<owner>)
...
```

Mention any dependency chains so implementers know sequencing.

## Example Application: #206

**Spec items:** 11 work items in 4 phases.  
**Grouping decision:** 5 layers (contract → 2 core logic paths → 2 frontend paths).  
**Result:** 5 manageable issues with clear dependencies and owner boundaries.

**Issues created:**
- #238: Schema & error catalogue (Morpheus, foundational).
- #239: Corruption detection (Morpheus, depends #238).
- #240: Migration framework (Morpheus+Cypher, depends #238).
- #241: Folder-picker dialogs (Trinity, depends #238).
- #242: Boot error page (Trinity, depends #239).

**Dependency graph:**
```
#238 (contract)
├── #239 (core logic)
│   └── #242 (frontend)
├── #240 (test)
├── #241 (frontend)
```

All core logic and frontend can parallelize once #238 finishes.

## Anti-Patterns to Avoid

1. **1:1 item→issue mapping:** Creates 8–15 issues; too many to track, unclear ownership.
2. **Arbitrary grouping:** Mixing contract + logic + tests in one issue; no clear build-block boundary.
3. **Forward-references:** Creating issues then referencing future issue numbers (won't exist yet). Instead, create in order.
4. **Missing spec anchors:** Issues don't reference which spec section they implement. Implementers have to hunt.
5. **Unclear dependencies:** Not stating "Blocked by: #X" explicitly; implementers guess sequencing.

## Checklist

- [ ] Read spec's "Work Decomposition" section.
- [ ] Identify all work items and their acceptance criteria.
- [ ] Group items by architectural layer.
- [ ] Topologically sort layers by dependency.
- [ ] Create issues in sorted order (so you can reference previous issue numbers).
- [ ] For each issue: include title, problem, parent link, spec anchor, acceptance criteria, owner, dependencies.
- [ ] After all issues created, comment on parent with summary list.
- [ ] Verify no forward-references (all "Blocked by: #X" reference already-created issues).

## Variants

**Smaller specs (3–4 items):** May not need layering; one issue per item is fine.

**Larger specs (15+ items):** May need sub-grouping within layers (e.g., "Validation: Core" + "Validation: Edge Cases") to keep individual issues under 5 acceptance criteria.

**Mixed ownership (many teams):** Explicitly assign owner + co-owner in each issue (e.g., "Morpheus + Cypher"). Label each with team member label for visibility.
