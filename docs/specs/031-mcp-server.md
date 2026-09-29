# SPEC-031 — Local MCP Server for AI Agents

> **Status:** Draft · **Owner:** Neo (Lead) · **Last updated:** 2026-09-29
> **Paired PRD:** —
> **Paired UX:** —
> **Paired Design:** —

---

## 1. Summary

OpenTreasury exposes an opt-in, local-only [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server so external AI agents (GitHub Copilot, Claude Desktop, VS Code, etc.) can read
transactions and categories and **propose** classifications. Every write goes through the
existing command layer, lands as `pending`, and is reviewed by the user with the bulk actions
shipped in #429.

## 2. Problem

Classifying imported movements is the most repetitive task in the app. Users already have AI
agents available but there is no safe way to connect them: the dataset is an encrypted,
append-only event log, so agents cannot (and must not) edit files directly. Direct file edits
would bypass validation, the audit chain and encryption.

## 3. Users & Scenarios

**Scenario A — Bulk classify:** After a bank import, the user asks their agent "categorize all
pending, unclassified movements from September". The agent lists them, lists the category tree,
and submits classifications. The user reviews them in Movements (filter: pending) and bulk-approves.

**Scenario B — Read-only Q&A:** "How much did we spend on travel this quarter?" — the agent
reads transactions/categories; no writes.

**Scenario C — Fix mistakes:** "These 12 movements from the Sabadell import are expenses, not
income" — the agent calls `set_transaction_type`.

## 4. Requirements

### 4.1 Functional

- FR1 — The server is **off by default**. Preferences → *AI agents (MCP)* toggles it on.
- FR2 — Transport: **stdio via a bundled launcher** (`opentreasury-mcp`) that connects to the
  running app over a local named pipe / Unix socket. No TCP port is opened. The app must be
  running and unlocked; otherwise tools return `APP_LOCKED`.
- FR3 — Access is gated by a per-install **access token** shown (and regenerable) in
  Preferences; the launcher passes it on connect. Revoking the token disconnects clients.
- FR4 — Read tools:
  - `list_transactions({ from?, to?, status?, uncategorized?, accountId?, text?, limit, cursor })`
  - `get_transaction({ id })`
  - `list_categories()` (categories + subcategories, ids and names)
  - `list_tags()`, `list_accounts()`
- FR5 — Write tools (all reuse existing commands; all batched with one `correlationId`):
  - `classify_transactions({ items: [{ id, categoryId, subcategoryId?, tagIds? }] })`
  - `set_transaction_type({ ids, type: 'income' | 'expense' })`
  - `delete_transactions({ ids })` — **only advertised when the separate "Allow agents to
    delete" opt-in is on** (FR11).
- FR6 — **Agent writes never approve.** Any transaction touched by an agent is forced to
  `status: 'pending'`. Approved transactions are rejected with `TX_LOCKED` (SPEC-025 edit rules
  apply unchanged). Agents may only reference **existing** categories/subcategories/tags;
  unknown ids are rejected with `NOT_FOUND` (no create tools in v1).
- FR7 — Every agent write is recorded in the audit chain with `actorIdentitySource: 'mcp'` and
  the client name reported at MCP `initialize`, so the Audit screen can show "by Claude Desktop".
- FR8 — Settings allow **Read-only** mode (write tools not advertised).
- FR9 — The Movements screen shows a dismissible banner "N movements updated by an AI agent —
  review" linking to a pending filter for the latest `correlationId`.
- FR10 — Server exposes an MCP **prompt** `categorize_pending` with guidance (use existing
  categories only, leave uncertain ones unclassified).
- FR11 — `delete_transactions` requires an extra opt-in (off by default, independent of the
  main toggle, disabled in Read-only mode). It may only delete **`pending`** transactions
  (approved → `TX_LOCKED`), max 200 ids per call. Deletions are append-only `tx.deleted` events,
  audited with the `mcp` actor like any other write. Intended use: duplicate cleanup after a bad import.

### 4.2 Non-functional

- NFR1 — `list_transactions` over 10k movements responds < 200 ms (served from the read model).
- NFR2 — Fully offline; no data leaves the machine except what the user's agent itself sends.
- NFR3 — Write batches limited to 500 items per call; rate limit 10 writes/s.
- NFR4 — Server stops when the app locks, quits, or the toggle is turned off.

## 5. UX Notes

- Preferences card: toggle, mode (Read-only / Propose changes), "Allow agents to delete
  pending movements" opt-in, token (copy / regenerate),
  copy-paste config snippets for Copilot CLI, VS Code and Claude Desktop, "connected clients" list.
- Review happens with existing bulk actions (classify, approve, set type, delete).

## 6. Data Model

### 6.1 Domain events

No new event types. Reuses `tx.updated` (with `correlationId`). Envelope `actorIdentitySource`
enum extends from `['local', 'aad']` to `['local', 'aad', 'mcp']` — requires schema migration
check (additive; readers must tolerate the new value).

### 6.2 Read-model projections

None new. Read tools query the existing read model.

### 6.3 File layout

None. Token stored in `userData/mcp.json` (non-dataset, never synced).

## 7. IPC Surface

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `mcp:getStatus` | renderer → main | — | `McpStatusResponse` |
| `mcp:setEnabled` | renderer → main | `McpSetEnabledRequest` | `McpStatusResponse` |
| `mcp:regenerateToken` | renderer → main | — | `McpStatusResponse` |

The MCP server itself runs in **main**, calling core commands directly (same path as the
`transaction:bulkUpdate` handler). All tool inputs validated with Zod at the MCP boundary.

## 8. Security Considerations

- **Exposure:** local IPC socket only, per-user ACL (Windows named pipe DACL = current user;
  Unix socket mode 0600). No network listener.
- **AuthN:** 256-bit random token, constant-time compare; regenerate invalidates sessions.
- **AuthZ:** writes limited to FR5 tools; approvals impossible via MCP; deletes only with the
  FR11 opt-in and only on `pending` transactions; SPEC-025 edit rules enforced by existing commands.
- **Prompt injection:** transaction descriptions are attacker-influenced (bank text). Worst case
  is a wrong classification left `pending`, or — with FR11 on — deletion of pending movements.
  Mitigated by FR6/FR11 (no approve, delete opt-in, pending-only, audited).
- **Audit entries:** every write → audit chain with `mcp` actor + client name (C10, R8).
- **Renderer isolation:** MCP code lives in `src/main/mcp/`; nothing imported into renderer (C6, R11).
- **PII in logs:** never log transaction descriptions/amounts from MCP calls; log tool name,
  counts, client name only (R15).
- **Data egress:** documented in Preferences — "data you share with an agent is sent to that
  agent's model provider".

## 9. Test Plan

### 9.1 Unit
- Tool input schemas reject malformed input; batch > 500 rejected.
- `classify_transactions` forces `pending`; approved tx → `TX_LOCKED`.

### 9.2 Integration
- Launcher ↔ server over socket with valid / invalid / revoked token.
- Tool call → `tx.updated` events → read model reflects change; audit entry has `mcp` actor.
- Locked app → `APP_LOCKED`.

### 9.3 E2E
- Enable in Preferences, run MCP inspector against launcher, classify 3 txs, see banner, bulk approve.

## 10. Acceptance Criteria

- [ ] AC1 — Server is off by default and opens no TCP port when on.
- [ ] AC2 — Invalid token is rejected.
- [ ] AC3 — Agent classification lands as `pending` with a shared `correlationId`.
- [ ] AC4 — Agent cannot approve or edit approved transactions; delete only with FR11 opt-in and only pending.
- [ ] AC5 — Audit screen shows the MCP client as the actor.
- [ ] AC6 — Read-only mode hides write tools.
- [ ] AC7 — Unknown category/subcategory/tag ids are rejected.

## 11. Traceability

- **Related:** SPEC-025 (edit rules), SPEC-028 (audit), PR #429 (bulk actions)
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md)
- **Supersedes / Superseded by:** —

## 12. Resolved Decisions

1. **Transport:** stdio launcher (+ local named pipe / Unix socket to the app). This follows the
   MCP spec's recommendation of stdio for local servers: universally supported by clients, no
   port, no DNS-rebinding/CORS surface. Streamable HTTP is out of scope for v1.
2. **Categories:** MVP uses existing categories/subcategories/tags only.
3. **Delete:** yes, behind a separate opt-in, pending-only (FR11).
4. **In-app "Suggest categories" (BYO API key):** deferred to a later, separate spec.

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-09-29 | Draft | Neo | Initial draft |
| 2026-09-29 | Draft | Neo | Open questions resolved (stdio, existing categories only, opt-in pending-only delete, in-app suggest deferred) |
