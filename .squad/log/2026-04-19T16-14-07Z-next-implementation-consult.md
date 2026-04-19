# Session Log: Next Implementation Consult — 2026-04-19T16:14:07Z

**Requested by:** Pedro (perocha)

**Participants:** Link (Product), Neo (Architecture)

**Scope:** Strategic decision — M1 screen implementation sequence and internal alpha gate.

**Question:** "What's next on M1 implementation?"

**Recommendation (aligned):** Panel-first unlock. Complete Panel UI + core wiring, unblock internal alpha on dashboard summary screen. Movements full CRUD and Saldo defer to M1+1 and M1.25 respectively.

**Rationale:** Panel is simpler to wire, validates the event-sourced core on gentlest code surface (read-only, no empty-state gate), and unblocks volunteer dogfood 3–5 days sooner than full Movements-first approach.

**Key decisions:**
- M1 exit gate: Account creation → Tx entry → Panel visibility (not full CRUD on all three screens).
- Movements structure UI complete in M1; command-side wiring (forms, filters, date selection) lands M1+1.
- Saldo explicitly deferred to M1.25 (power-user feature, not core loop).

**Outcome:** Team aligned on Panel-first strategy. Awaiting Pedro's go/no-go before spawning implementation sprints (Morpheus core/query, Trinity Panel UI).

**Artifacts:**
- `.squad/decisions/inbox/link-next-milestone.md` — Product decision document
- `.squad/decisions/inbox/neo-next-implementation.md` — Architecture & work packages

**Next:** Pedro green-lights → Morpheus + Trinity spawn for Phase 1 (Panel MVP).
