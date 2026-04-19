# Session: Mask-band side-border polish

**Date:** 2026-04-19
**Branch:** `fix/trinity-prototype-parity`
**Worker:** Trinity (Frontend)
**Scribe:** logged by Scribe

## Commits

- `1de5dc7` — fix(table): pin sticky thead at sidebar section-label baseline with masked offset band (introduces the 28px `--sticky-top-offset` and the `.ot-table thead th::before` mask band).
- `1350d95` — fix(table): mask band covers wrap side borders so no hairlines flank the sticky strip.

## Problem

After shipping the 28px mask band that aligns the sticky thead with the sidebar "PRINCIPAL" label, Pedro saw 1px vertical hairlines on each side of the band while scrolled. The band color was correct, only the edges looked un-seamless.

## Root cause

Trinity's diagnosis: the mask `::before` is anchored to the `<th>` (`left: 0; right: 0`), so it spans only the th's interior — **inside** `.ot-table-wrap`'s padding edge. The wrap has `border: 1px solid` + `overflow: clip`. Once the wrap's top has scrolled out of view, its left/right borders keep rendering full-height and sit across the 0..28px pin band, flanking the mask. Pseudos don't inherit borders from their host, so the hairlines weren't from the pseudo — they were the wrap's own card-frame borders showing through the sides of the mask.

## Fix (hybrid)

1. `:first-child::before { left: -1px }` and `:last-child::before { right: -1px }` on `.ot-table thead th` — the mask now covers the wrap's side borders.
2. `overflow-clip-margin: 1px` on `.ot-table-wrap` so `overflow: clip` permits that 1px bleed outside the padding edge.
3. Explicit `border: 0` on the mask pseudo as a defensive no-op (documents intent; guards against future global `::before` cascade leaks).

At scroll=0 the pseudo still sits above the wrap's padding box and is clipped away — no visibility toggles or JS needed.

## Files touched

- `app/src/renderer/components/Table/Table.css`
- `.squad/skills/css-sticky-patterns/SKILL.md` (§4 added: mask bands in bordered wrappers)
- `.squad/decisions/inbox/trinity-mask-band-borders.md` (merged by Scribe into `decisions.md` in this session)
- `.squad/agents/trinity/history.md`

## Gates

✅ typecheck · ✅ lint (0 warnings) · ✅ 39/39 tests · ✅ vite build.

## Status

Delivered on branch `fix/trinity-prototype-parity`. Not pushed. No PR opened.

## Related

- `.squad/log/20260419T140503Z-movements-sticky-scroll.md`
- `.squad/log/20260419T141446Z-table-header-clip.md`
- `.squad/log/20260419T142223Z-sticky-bleed-fix.md`
- `.squad/skills/css-sticky-patterns/SKILL.md` §4
