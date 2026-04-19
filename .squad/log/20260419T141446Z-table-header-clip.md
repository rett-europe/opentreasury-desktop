# Session: Table header capitalization + sticky-clip fix

**Timestamp:** 2026-04-19T14:14:46Z  
**Context:** Post Movements parity pass; two CSS tweaks to unblock table UX

**Fixes Applied**

1. Sort-button header capitalization: `.ot-table__sort-btn` inherits `text-transform` + `letter-spacing`
2. Sticky thead clipping: `.ot-table-wrap` switched `overflow: hidden` → `overflow: clip`

**Status:** Delivered ✅ (orchestration log + decision note at inbox)
