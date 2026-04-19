# Neo History Archive (2026-04-19)

**Archived from:** `neo/history.md` when it exceeded 12KB.  
**Archive date:** 2026-04-19T16:21:30Z  
**Reason:** File size ~30KB; summarized entries moved here to keep active history clean.

## Archived Key Decisions

### ADR-001 (Stack), ADR-002 (Repo Structure), ADR-003 (i18n)
- **ADR-001:** React+TS, append-only JSON event log, derived SQLite read model, `age` file-level crypto. **Accepted with C1–C15 security conditions.** Key insight: OneDrive conflicts solved by filename (UUID-named immutable files = zero conflicts by construction).
- **ADR-002:** Strict main/preload/renderer boundaries (ESLint, TS project refs), Electron-free core/crypto/storage. **Accepted.**
- **ADR-003:** react-i18next (shortest "add a string" path, best TS support via module augmentation). **Accepted.** App scaffold green.

### Prototype as v1 Authority
Prototype folder is the v1 north star. Design system is a translation layer. When they conflict, prototype wins and design system updates to match. Every frontend PR requires before/after screenshots vs prototype.

### Panel-First Unlock
Panel → Movements → Saldo (M1.25). Panel is simplest path to prove event-sourced core (no empty-state gate, no date-range complexity, no form validation). Movements command-side follows in M1+1.

---

## Summary
Core architecture locked: React+TS stack, event sourcing with OneDrive transport, prototype authority, Panel-first M1 sequence. All ADRs accepted with conditions. App scaffold green. Ready for first feature work.
