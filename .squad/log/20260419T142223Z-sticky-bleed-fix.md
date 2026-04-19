# Session: Sticky-bleed fix

**Date:** 2026-04-19  
**Branch:** fix/trinity-prototype-parity  

## Summary

Fixed visual regression: rows rendering above sticky table header during upward scroll.

**Root:** `.ot-shell__main` `padding-top` was part of scrollport; sticky anchored to padded top.  
**Fix:** Move padding to `.ot-page-header` (all screens' first child).  
**Impact:** Negligible; visual spacing unchanged.

**Status:** All gates green. Awaiting Pedro's runtime test.
