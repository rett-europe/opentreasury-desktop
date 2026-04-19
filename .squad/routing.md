# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & design | Neo | System design, tech stack decisions, scope trade-offs |
| Frontend / Electron renderer | Trinity | UI components, views, routing, state management, IPC (renderer side) |
| Backend / Electron main process | Morpheus | Data persistence, business logic, IPC handlers, import/export |
| Testing & QA | Cypher | Unit tests, integration tests, E2E tests, quality gates |
| Documentation & writing | Oracle | Feature docs, user guides, README, changelogs, in-app help |
| Security | Switch | Auth design, Electron hardening, security reviews, threat modeling |
| Specs & UX analysis | Niobe | Feature specs, user workflows, usability review, accessibility |
| UI design & theming | Mouse | Visual design, design tokens, component specs, color/typography |
| Product management | Link | Roadmap, PRDs, prioritization, milestones, user research synthesis, release planning |
| Code review | Neo | Review PRs, check quality, architectural alignment |
| Security review | Switch | Review PRs touching auth, IPC, data access, dependencies |
| Scope & priorities | Link + Neo | Link owns product priorities; Neo owns technical decomposition. Co-decide when product value vs. technical cost conflicts. |
| Session logging | Scribe | Automatic — never needs routing |
| Work monitoring | Ralph | Backlog tracking, issue status, keep-alive |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
