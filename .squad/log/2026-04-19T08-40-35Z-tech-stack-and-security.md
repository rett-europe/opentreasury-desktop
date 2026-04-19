# Session — Tech Stack ADR + Security Requirements v0.1

- **When:** 2026-04-19T08:40:35Z
- **Requested by:** Pedro (perocha)
- **Agents:** Neo, Switch, Link (parallel sync)

## Summary

- Neo drafted **ADR-001** (`docs/architecture/adr-001-tech-stack.md`, Proposed) — three options; recommends Option A (React+TS, append-only event-sourced JSON, `age` file-level encryption).
- Switch published **Security Requirements v0.1** (`docs/security/security-requirements-v0.1.md`) — 20 requirements, STRIDE model, 15 constraints on Neo's ADR, 8 accepted risks, 6 open questions for Pedro.
- Link updated **vision.md §14** to reflect Pedro's resolutions (Q1 resolved, Q2 deferred, Q3 resolved/renumbered); strengthened Principle 6 re PII.

## Gates

- ADR-001 cannot move to Accepted until Switch signs off on crypto choices against the 15 constraints in §5 of the security doc.
- Pedro must answer Switch's 6 open questions (escrow admin model, audit-log visibility, encryption scope, multi-device, incident response, EV cert).
- Pedro must answer Vision Q5 (target OS v1) before installer work starts.
